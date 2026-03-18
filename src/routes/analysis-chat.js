const { Router } = require('express');
const supabase = require('../db/supabase');
const llm = require('../services/llm');
const metrics = require('../services/metrics');
const knowledge = require('../services/knowledge');

const router = Router();

const ANALYSIS_SYSTEM_PROMPT = `Sos un experto en Google Ads que analiza campañas existentes y da recomendaciones de optimización.

Te van a pasar datos de métricas de campañas (spend, CPA, CTR, ROAS, conversiones, tendencias diarias) y vos tenés que:

1. Analizar el rendimiento actual
2. Identificar problemas y oportunidades
3. Dar recomendaciones concretas y accionables
4. Responder preguntas sobre las campañas

Podés sugerir acciones como:
- Pausar campañas/keywords que no rinden
- Ajustar budgets (subir en las que rinden, bajar en las que no)
- Cambiar bidding strategy
- Agregar keywords negativas
- Modificar ads (nuevos headlines, descriptions)
- Ajustar geo targeting
- Cambiar schedule de anuncios

Cuando el usuario te pida ejecutar una acción, respondé con un JSON de acción:
\`\`\`action
{
  "type": "pause_campaign|enable_campaign|adjust_budget|pause_keyword|alert",
  "campaign_id": "123456",
  "campaign_name": "Nombre",
  "params": { ... },
  "reason": "Explicación breve"
}
\`\`\`

Reglas:
- Hablá en español argentino
- Sé directo y conciso
- Basá todo en datos, no en suposiciones
- Si no hay data suficiente, decilo
- Siempre mencioná el impacto estimado de tus recomendaciones`;

/**
 * Arma el contexto de métricas para inyectar al system prompt
 */
async function buildMetricsContext(campaignId) {
  const micro = (v) => `$${(Number(v) / 1_000_000).toFixed(2)}`;
  let ctx = '';

  try {
    const summaries = await metrics.getSummaries();
    if (summaries.length > 0) {
      ctx = '\n\n## Métricas actuales de campañas\n';
      for (const s of summaries) {
        ctx += `\n### ${s.campaign_name} (${s.campaign_status}) [ID: ${s.campaign_id}]\n`;
        ctx += `- Spend 7d: ${micro(s.spend_7d_micros)} | 30d: ${micro(s.spend_30d_micros)}\n`;
        ctx += `- CPA 7d: ${micro(s.cpa_7d_micros)} | 30d: ${micro(s.cpa_30d_micros)}\n`;
        ctx += `- CTR 7d: ${(s.ctr_7d * 100).toFixed(2)}% | 30d: ${(s.ctr_30d * 100).toFixed(2)}%\n`;
        ctx += `- Conversiones 7d: ${s.conversions_7d} | 30d: ${s.conversions_30d}\n`;
        ctx += `- ROAS 7d: ${s.roas_7d?.toFixed(2) || 'N/A'} | 30d: ${s.roas_30d?.toFixed(2) || 'N/A'}\n`;
        if (s.alerts?.length) {
          ctx += `- ALERTAS: ${s.alerts.map(a => a.message).join('; ')}\n`;
        }
      }
    }

    if (campaignId) {
      const daily = await metrics.getDailyMetrics(campaignId, 14);
      if (daily.length > 0) {
        ctx += '\n### Tendencia diaria (últimos 14 días)\n';
        for (const d of daily) {
          ctx += `${d.date}: spend=${micro(d.cost_micros)}, clicks=${d.clicks}, conv=${d.conversions}, CPA=${micro(d.cpa_micros)}\n`;
        }
      }
    }
  } catch (e) {
    ctx = '\n\n(No se pudieron obtener métricas de Google Ads)';
  }

  return ctx;
}

/**
 * Chat de análisis — conversación sobre campañas existentes
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversation_id, campaign_id } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    // Obtener o crear conversación de análisis
    let conv;
    if (conversation_id) {
      const { data } = await supabase
        .from('adpilot_conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();
      conv = data;
    }

    if (!conv) {
      const { data } = await supabase
        .from('adpilot_conversations')
        .insert({ state: 'analysis', messages: [], draft: { type: 'analysis', campaign_id } })
        .select('*')
        .single();
      conv = data;
    }

    // Contexto de métricas
    const targetCampaign = campaign_id || conv.draft?.campaign_id;
    const metricsContext = await buildMetricsContext(targetCampaign);

    // RAG
    let ragBlock = '';
    try {
      const ragResults = await knowledge.search(message, { count: 3, category: 'optimization' });
      if (ragResults.length > 0) {
        ragBlock = '\n\n## Conocimiento previo de optimización\n' +
          ragResults.map(k => `- ${k.title}: ${k.content}`).join('\n');
      }
    } catch (e) {}

    // Historial + nuevo mensaje
    const messages = [...(conv.messages || []), { role: 'user', content: message.trim() }];
    const llmMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Llamar LLM con system prompt enriquecido
    const fullSystemPrompt = ANALYSIS_SYSTEM_PROMPT + metricsContext + ragBlock;
    const assistantMessage = await llm.chatWithSystem(fullSystemPrompt, llmMessages);

    // Detectar acciones en la respuesta
    const actionMatch = assistantMessage.match(/```action\s*([\s\S]*?)```/);
    let action = null;
    if (actionMatch) {
      try { action = JSON.parse(actionMatch[1]); } catch {}
    }

    // Guardar mensajes
    const updatedMessages = [...messages, { role: 'assistant', content: assistantMessage }];
    await supabase.from('adpilot_conversations')
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq('id', conv.id);

    res.json({
      conversation_id: conv.id,
      message: assistantMessage,
      action,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ejecutar acción sugerida por el LLM
router.post('/execute-action', async (req, res) => {
  try {
    const { action } = req.body;
    if (!action?.type) return res.status(400).json({ error: 'Action required' });

    const { data: log } = await supabase
      .from('adpilot_optimization_logs')
      .insert({
        campaign_id: action.campaign_id,
        campaign_name: action.campaign_name,
        action: action.type,
        status: 'pending',
        recommendation: action.reason,
        payload: { action },
      })
      .select('*')
      .single();

    const optimizer = require('../services/optimizer');
    const result = await optimizer.executeOptimization(log.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

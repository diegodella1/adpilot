const OpenAI = require('openai');
const config = require('../config');
const supabase = require('../db/supabase');

// Cache de settings para no hacer query en cada request
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minuto

async function getSettings() {
  if (settingsCache && Date.now() - settingsCacheTime < CACHE_TTL) return settingsCache;
  const { data } = await supabase.from('adpilot_settings').select('key, value');
  settingsCache = {};
  for (const row of data || []) settingsCache[row.key] = row.value;
  settingsCacheTime = Date.now();
  return settingsCache;
}

function getLLMClient(settings) {
  const provider = settings.llm_provider || 'openai';

  if (provider === 'openrouter') {
    return {
      client: new OpenAI({
        apiKey: settings.openrouter_api_key,
        baseURL: 'https://openrouter.ai/api/v1',
      }),
      model: settings.openrouter_model || 'openai/gpt-4o-mini',
    };
  }

  // Default: OpenAI directo
  return {
    client: new OpenAI({ apiKey: settings.llm_api_key || config.openaiKey }),
    model: settings.llm_model || 'gpt-4o-mini',
  };
}

const SYSTEM_PROMPT = `Sos un experto en Google Ads que ayuda a crear campañas de Search, Performance Max, Display y YouTube.

Tu rol es guiar al usuario paso a paso para armar una campaña completa. Seguí este flujo:

1. **Intake**: Recibí la descripción inicial de la campaña.
2. **Clarificación**: Preguntá todo lo que falte para armar la campaña:
   - Tipo de campaña (Search, PMax, Display, YouTube)
   - Objetivo (leads, ventas, tráfico, awareness)
   - Budget diario
   - Bidding strategy (Target CPA, Maximize Conversions, etc.)
   - Keywords (para Search)
   - Geo targeting (países/ciudades)
   - Idioma
   - Landing page URL
   - Audiencias (para PMax/Display)
   - Assets (headlines, descriptions, imágenes para PMax)
3. **Generación**: Cuando tengas toda la info, generá la estructura completa de campaña en JSON.
4. **Revisión**: Mostrá la estructura al usuario y preguntá si quiere cambios.
5. **Confirmación**: Cuando el usuario apruebe, indicá que está listo para ejecutar.

Reglas:
- Hablá en español argentino (vos, tuteo rioplatense).
- Sé conciso pero completo.
- Sugerí best practices de Google Ads cuando sea relevante.
- Agrupá keywords por intención en ad groups separados.
- Generá múltiples headlines y descriptions para A/B testing.
- Siempre validá que el budget y CPA target sean coherentes.

Cuando generes la estructura de campaña, usá EXACTAMENTE este formato JSON:

\`\`\`json
{
  "campaign": {
    "name": "Nombre de la campaña",
    "type": "SEARCH|PERFORMANCE_MAX|DISPLAY|VIDEO",
    "budget_micros": 50000000,
    "bidding_strategy": "TARGET_CPA|MAXIMIZE_CONVERSIONS|MAXIMIZE_CLICKS|TARGET_ROAS",
    "bidding_value_micros": 5000000,
    "geo_targets": ["AR"],
    "languages": ["es"],
    "start_date": "2026-03-20",
    "networks": { "search": true, "display": false, "partners": false }
  },
  "ad_groups": [
    {
      "name": "Nombre del ad group",
      "keywords": [
        { "text": "keyword", "match_type": "BROAD|PHRASE|EXACT" }
      ],
      "negative_keywords": ["keyword negativa"],
      "ads": [
        {
          "type": "RESPONSIVE_SEARCH_AD",
          "headlines": ["Headline 1", "Headline 2", "...hasta 15"],
          "descriptions": ["Desc 1", "Desc 2", "...hasta 4"],
          "final_url": "https://ejemplo.com",
          "path1": "ruta1",
          "path2": "ruta2"
        }
      ]
    }
  ]
}
\`\`\`

Budget y CPA van en micros (multiplicá por 1,000,000). Ej: $50 → 50000000.`;

/**
 * Determina el próximo estado basado en la respuesta del LLM
 */
function detectStateTransition(assistantMessage, currentState) {
  const lower = assistantMessage.toLowerCase();
  const hasJson = assistantMessage.includes('```json');

  if (currentState === 'intake' || currentState === 'clarifying') {
    if (hasJson) return 'reviewing';
    return 'clarifying';
  }
  if (currentState === 'reviewing') {
    if (hasJson) return 'reviewing'; // regenerated after changes
    return 'reviewing';
  }
  return currentState;
}

/**
 * Detecta si el usuario confirmó la campaña
 */
function detectUserConfirmation(userMessage) {
  const lower = userMessage.toLowerCase().trim();
  const confirmPhrases = [
    'dale', 'mandalo', 'ejecuta', 'ejecutalo', 'creala', 'aprobado',
    'confirmo', 'ok dale', 'si dale', 'listo', 'mandate', 'go',
    'approve', 'confirm', 'create it', 'send it',
  ];
  return confirmPhrases.some(p => lower.includes(p));
}

/**
 * Extrae JSON de campaña del mensaje del LLM
 */
function extractCampaignJson(message) {
  const match = message.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Chat con el LLM incluyendo historial de conversación.
 * Levanta provider/model/key desde la DB (con cache).
 * Inyecta contexto RAG relevante al system prompt.
 */
async function chat(messages, { ragContext = null } = {}) {
  const settings = await getSettings();
  const { client, model } = getLLMClient(settings);

  let systemContent = SYSTEM_PROMPT;
  if (ragContext?.length) {
    const contextBlock = ragContext
      .map(k => `[${k.category}] ${k.title}: ${k.content}`)
      .join('\n---\n');
    systemContent += `\n\n## Contexto de campañas anteriores y aprendizajes\nUsá esta información para mejorar tus recomendaciones:\n\n${contextBlock}`;
  }

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemContent }, ...messages],
    temperature: 0.3,
    max_tokens: 2000,
  });
  return response.choices[0].message.content;
}

/**
 * Chat genérico con system prompt custom (para analysis chat, etc.)
 */
async function chatWithSystem(systemPrompt, messages) {
  const settings = await getSettings();
  const { client, model } = getLLMClient(settings);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.3,
    max_tokens: 2000,
  });
  return response.choices[0].message.content;
}

/** Invalida cache de settings (llamar después de update) */
function invalidateCache() {
  settingsCache = null;
}

module.exports = { chat, chatWithSystem, detectStateTransition, detectUserConfirmation, extractCampaignJson, invalidateCache };

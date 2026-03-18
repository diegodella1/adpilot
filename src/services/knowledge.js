const OpenAI = require('openai');
const supabase = require('../db/supabase');
const config = require('../config');

/**
 * Genera embedding para un texto usando OpenAI
 */
async function embed(text) {
  const openai = new OpenAI({ apiKey: config.openaiKey });
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Agrega conocimiento a la base
 */
async function add({ category, title, content, metadata = {} }) {
  const embedding = await embed(`${title}\n${content}`);
  const { data, error } = await supabase
    .from('adpilot_knowledge')
    .insert({ category, title, content, metadata, embedding: JSON.stringify(embedding) })
    .select('id, category, title, created_at')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Busca conocimiento relevante por similitud semántica
 */
async function search(query, { count = 5, category = null } = {}) {
  const queryEmbedding = await embed(query);
  const { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: count,
    filter_category: category,
  });
  if (error) throw error;
  return data || [];
}

/**
 * Lista todo el conocimiento (sin embeddings)
 */
async function list({ category = null, limit = 50 } = {}) {
  let query = supabase
    .from('adpilot_knowledge')
    .select('id, category, title, content, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Elimina una entrada de conocimiento
 */
async function remove(id) {
  const { error } = await supabase.from('adpilot_knowledge').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Aprende de una conversación finalizada (extrae lecciones automáticamente)
 */
async function learnFromConversation(conv) {
  if (!conv.draft || !conv.messages?.length) return;

  // Extraer el resumen de la campaña creada
  const campaignName = conv.draft.campaign?.name || 'Sin nombre';
  const campaignType = conv.draft.campaign?.type || 'SEARCH';
  const budget = conv.draft.campaign?.budget_micros ? (conv.draft.campaign.budget_micros / 1_000_000) : 0;

  // Buscar correcciones del usuario (mensajes después de un JSON generado)
  const corrections = [];
  let sawJson = false;
  for (const msg of conv.messages) {
    if (msg.role === 'assistant' && msg.content.includes('```json')) sawJson = true;
    if (sawJson && msg.role === 'user') {
      corrections.push(msg.content);
    }
  }

  const content = [
    `Campaña: ${campaignName} (${campaignType})`,
    `Budget: $${budget}/día`,
    `Keywords: ${conv.draft.ad_groups?.flatMap(ag => ag.keywords?.map(k => k.text) || []).join(', ') || 'N/A'}`,
    corrections.length > 0 ? `Correcciones del usuario: ${corrections.join(' | ')}` : '',
    `Estructura final: ${JSON.stringify(conv.draft, null, 2).slice(0, 500)}`,
  ].filter(Boolean).join('\n');

  await add({
    category: 'campaign_result',
    title: `Campaña creada: ${campaignName}`,
    content,
    metadata: { conversation_id: conv.id, campaign_type: campaignType },
  });
}

module.exports = { add, search, list, remove, learnFromConversation, embed };

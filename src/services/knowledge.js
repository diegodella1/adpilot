const OpenAI = require('openai');
const supabase = require('../db/supabase');
const config = require('../config');

async function embed(text) {
  const openai = new OpenAI({ apiKey: config.openaiKey });
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function add({ category, title, content, metadata = {}, userId = null }) {
  const embedding = await embed(`${title}\n${content}`);
  const record = { category, title, content, metadata, embedding: JSON.stringify(embedding) };
  if (userId) record.user_id = userId;
  const { data, error } = await supabase
    .from('adpilot_knowledge')
    .insert(record)
    .select('id, category, title, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function search(query, { count = 5, category = null, userId = null } = {}) {
  const queryEmbedding = await embed(query);
  const { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: count,
    filter_category: category,
    filter_user_id: userId,
  });
  if (error) throw error;
  return data || [];
}

async function list({ category = null, limit = 50, userId = null } = {}) {
  let query = supabase
    .from('adpilot_knowledge')
    .select('id, category, title, content, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category) query = query.eq('category', category);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function remove(id, userId = null) {
  let query = supabase.from('adpilot_knowledge').delete().eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}

async function learnFromConversation(conv, userId = null) {
  if (!conv.draft || !conv.messages?.length) return;

  const campaignName = conv.draft.campaign?.name || 'Sin nombre';
  const campaignType = conv.draft.campaign?.type || 'SEARCH';
  const budget = conv.draft.campaign?.budget_micros ? (conv.draft.campaign.budget_micros / 1_000_000) : 0;

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
    userId,
  });
}

module.exports = { add, search, list, remove, learnFromConversation, embed };

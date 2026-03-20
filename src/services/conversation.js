const supabase = require('../db/supabase');
const llm = require('./llm');
const knowledge = require('./knowledge');

// Lock por conversación para evitar race conditions
const activeLocks = new Map();

async function withLock(conversationId, fn) {
  while (activeLocks.has(conversationId)) {
    await new Promise(r => setTimeout(r, 100));
  }
  activeLocks.set(conversationId, true);
  try {
    return await fn();
  } finally {
    activeLocks.delete(conversationId);
  }
}

async function create(userId) {
  const { data, error } = await supabase
    .from('adpilot_conversations')
    .insert({ state: 'intake', messages: [], user_id: userId })
    .select('id, state, messages, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function get(id, userId) {
  let query = supabase
    .from('adpilot_conversations')
    .select('*')
    .eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

async function list(userId, limit = 20) {
  const { data, error } = await supabase
    .from('adpilot_conversations')
    .select('id, state, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Procesa un mensaje del usuario — con lock por conversación
 */
async function processMessage(conversationId, userMessage, userId) {
  return withLock(conversationId, async () => {
    // Verificar que hay LLM configurado antes de intentar chatear
    const settings = await llm.getSettings(userId);
    const hasLlmKey = !!(settings.llm_api_key || require('../config').openaiKey);
    if (!hasLlmKey) {
      throw new Error('No hay API key de LLM configurada. Andá a Admin > Plataforma para configurar OpenAI o OpenRouter.');
    }

    const conv = await get(conversationId, userId);
    if (!conv) throw new Error('Conversation not found');

    const blockedStates = ['done', 'executing', 'error'];
    if (blockedStates.includes(conv.state)) {
      throw new Error(`Conversation is in "${conv.state}" state`);
    }

    const sanitized = llm.sanitizeInput(userMessage);
    if (!sanitized) throw new Error('Empty message');

    // Detectar si el usuario confirma ejecución
    if (conv.state === 'reviewing' && llm.detectUserConfirmation(sanitized)) {
      const messages = [...conv.messages, { role: 'user', content: sanitized }];
      await update(conversationId, { state: 'confirmed', messages });
      return {
        state: 'confirmed',
        message: 'Campaña confirmada! Ejecutando creación en Google Ads...',
        draft: conv.draft,
      };
    }

    const messages = [...conv.messages, { role: 'user', content: sanitized }];

    // RAG (opcional, no bloquea)
    let ragContext = [];
    try {
      ragContext = await knowledge.search(sanitized, { count: 3, userId });
    } catch (e) {
      console.warn('RAG search failed:', e.message);
    }

    // Llamar al LLM
    const llmMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const assistantResponse = await llm.chat(llmMessages, { ragContext, userId });

    const newState = llm.detectStateTransition(assistantResponse, conv.state);
    const campaignJson = llm.extractCampaignJson(assistantResponse);

    const updatedMessages = [...messages, { role: 'assistant', content: assistantResponse }];
    const updateData = { state: newState, messages: updatedMessages };
    if (campaignJson) updateData.draft = campaignJson;

    await update(conversationId, updateData);

    return {
      state: newState,
      message: assistantResponse,
      draft: campaignJson || conv.draft,
    };
  });
}

async function update(id, data) {
  const { error } = await supabase
    .from('adpilot_conversations')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function remove(id, userId) {
  const { error } = await supabase
    .from('adpilot_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

module.exports = { create, get, list, processMessage, update, remove };

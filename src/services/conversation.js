const supabase = require('../db/supabase');
const llm = require('./llm');
const knowledge = require('./knowledge');

const VALID_STATES = ['intake', 'clarifying', 'reviewing', 'confirmed', 'executing', 'done', 'error'];

/**
 * Crea una conversación nueva
 */
async function create() {
  const { data, error } = await supabase
    .from('adpilot_conversations')
    .insert({ state: 'intake', messages: [] })
    .select('id, state, messages, created_at')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Obtiene una conversación por ID
 */
async function get(id) {
  const { data, error } = await supabase
    .from('adpilot_conversations')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lista conversaciones (más recientes primero)
 */
async function list(limit = 20) {
  const { data, error } = await supabase
    .from('adpilot_conversations')
    .select('id, state, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Procesa un mensaje del usuario en una conversación
 */
async function processMessage(conversationId, userMessage) {
  const conv = await get(conversationId);
  if (!conv) throw new Error('Conversation not found');
  if (conv.state === 'done' || conv.state === 'executing') {
    throw new Error(`Conversation is in "${conv.state}" state and cannot accept messages`);
  }

  // Detectar si el usuario confirma ejecución
  if (conv.state === 'reviewing' && llm.detectUserConfirmation(userMessage)) {
    const messages = [...conv.messages, { role: 'user', content: userMessage }];
    await update(conversationId, { state: 'confirmed', messages });
    return {
      state: 'confirmed',
      message: '¡Campaña confirmada! Ejecutando creación en Google Ads...',
      draft: conv.draft,
    };
  }

  // Agregar mensaje del usuario al historial
  const messages = [...conv.messages, { role: 'user', content: userMessage }];

  // Buscar contexto relevante en la base de conocimiento (RAG)
  let ragContext = [];
  try {
    ragContext = await knowledge.search(userMessage, { count: 3 });
  } catch (e) {
    // RAG es opcional, no bloqueamos si falla
    console.warn('RAG search failed:', e.message);
  }

  // Llamar al LLM con el historial completo + contexto RAG
  const llmMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const assistantResponse = await llm.chat(llmMessages, { ragContext });

  // Detectar transición de estado
  const newState = llm.detectStateTransition(assistantResponse, conv.state);

  // Extraer draft si hay JSON
  const campaignJson = llm.extractCampaignJson(assistantResponse);

  // Actualizar conversación
  const updatedMessages = [...messages, { role: 'assistant', content: assistantResponse }];
  const updateData = {
    state: newState,
    messages: updatedMessages,
  };
  if (campaignJson) {
    updateData.draft = campaignJson;
  }

  await update(conversationId, updateData);

  return {
    state: newState,
    message: assistantResponse,
    draft: campaignJson || conv.draft,
  };
}

/**
 * Actualiza una conversación
 */
async function update(id, data) {
  const { error } = await supabase
    .from('adpilot_conversations')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

module.exports = { create, get, list, processMessage, update };

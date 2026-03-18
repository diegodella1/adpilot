const supabase = require('../db/supabase');
const googleAds = require('./google-ads');
const conversation = require('./conversation');
const knowledge = require('./knowledge');

/**
 * Valida el draft de campaña antes de ejecutar
 */
function validateDraft(draft) {
  const errors = [];

  if (!draft?.campaign) errors.push('Falta el objeto "campaign"');
  if (!draft?.campaign?.name) errors.push('Falta el nombre de campaña');
  if (!draft?.campaign?.type) errors.push('Falta el tipo de campaña');
  if (!draft?.campaign?.budget_micros || draft.campaign.budget_micros <= 0) {
    errors.push('Budget inválido');
  }
  if (!draft?.ad_groups?.length) errors.push('Falta al menos un ad group');

  for (const ag of draft?.ad_groups || []) {
    if (!ag.name) errors.push('Ad group sin nombre');
    if (!ag.ads?.length) errors.push(`Ad group "${ag.name}" sin ads`);
    for (const ad of ag.ads || []) {
      if (ad.type === 'RESPONSIVE_SEARCH_AD') {
        if (!ad.headlines?.length || ad.headlines.length < 3) {
          errors.push(`Ad en "${ag.name}" necesita al menos 3 headlines`);
        }
        if (!ad.descriptions?.length || ad.descriptions.length < 2) {
          errors.push(`Ad en "${ag.name}" necesita al menos 2 descriptions`);
        }
        if (!ad.final_url) errors.push(`Ad en "${ag.name}" sin final_url`);
        // Validar largo de headlines y descriptions
        for (const h of ad.headlines || []) {
          if (h.length > 30) errors.push(`Headline "${h.slice(0, 20)}..." excede 30 chars`);
        }
        for (const d of ad.descriptions || []) {
          if (d.length > 90) errors.push(`Description "${d.slice(0, 20)}..." excede 90 chars`);
        }
      }
    }
  }

  return errors;
}

/**
 * Ejecuta la creación de la campaña en Google Ads
 */
async function execute(conversationId) {
  const conv = await conversation.get(conversationId);
  if (!conv) throw new Error('Conversation not found');
  if (conv.state !== 'confirmed') throw new Error('Campaign not confirmed yet');
  if (!conv.draft) throw new Error('No campaign draft found');

  // Validar
  const validationErrors = validateDraft(conv.draft);
  if (validationErrors.length > 0) {
    await conversation.update(conversationId, { state: 'reviewing' });
    return { success: false, errors: validationErrors };
  }

  // Marcar como ejecutando
  await conversation.update(conversationId, { state: 'executing' });

  // Log de inicio
  await supabase.from('adpilot_campaign_logs').insert({
    conversation_id: conversationId,
    action: 'create_campaign',
    status: 'started',
    payload: conv.draft,
  });

  try {
    const result = await googleAds.createCampaignFromDraft(conv.draft);

    if (result.errors.length > 0 && !result.campaignId) {
      // Fallo total
      await conversation.update(conversationId, { state: 'error' });
      await supabase.from('adpilot_campaign_logs').insert({
        conversation_id: conversationId,
        action: 'create_campaign',
        status: 'failed',
        payload: { result },
      });
      return { success: false, errors: result.errors };
    }

    // Éxito (posiblemente parcial)
    await conversation.update(conversationId, { state: 'done' });
    await supabase.from('adpilot_campaign_logs').insert({
      conversation_id: conversationId,
      action: 'create_campaign',
      status: result.errors.length > 0 ? 'partial' : 'success',
      payload: { result },
    });

    // Auto-learn: guardar en knowledge base
    knowledge.learnFromConversation(conv).catch(e =>
      console.warn('Auto-learn failed:', e.message)
    );

    return {
      success: true,
      campaignId: result.campaignId,
      adGroupIds: result.adGroupIds,
      warnings: result.errors,
    };
  } catch (err) {
    await conversation.update(conversationId, { state: 'error' });
    await supabase.from('adpilot_campaign_logs').insert({
      conversation_id: conversationId,
      action: 'create_campaign',
      status: 'failed',
      payload: { error: err.message },
    });
    return { success: false, errors: [{ error: err.message }] };
  }
}

module.exports = { validateDraft, execute };

const supabase = require('../db/supabase');
const googleAds = require('./google-ads');
const conversation = require('./conversation');
const knowledge = require('./knowledge');
const campaignManager = require('./campaign-manager');

const MAX_BUDGET_MICROS = 500_000_000;
const MAX_KEYWORDS_PER_GROUP = 50;
const MAX_AD_GROUPS = 20;

function validateDraft(draft) {
  const errors = [];

  if (!draft?.campaign) errors.push('Falta el objeto "campaign"');
  if (!draft?.campaign?.name) errors.push('Falta el nombre de campaña');
  if (!draft?.campaign?.type) errors.push('Falta el tipo de campaña');

  const budget = draft?.campaign?.budget_micros;
  if (!budget || budget <= 0) {
    errors.push('Budget inválido');
  } else if (budget > MAX_BUDGET_MICROS) {
    errors.push(`Budget excede el máximo de $${MAX_BUDGET_MICROS / 1_000_000}/día`);
  }

  if (!draft?.ad_groups?.length) errors.push('Falta al menos un ad group');
  if (draft?.ad_groups?.length > MAX_AD_GROUPS) {
    errors.push(`Máximo ${MAX_AD_GROUPS} ad groups`);
  }

  // Validate geo_targets: accept strings (country codes) and numbers (location IDs)
  if (draft?.campaign?.geo_targets?.length) {
    for (const geo of draft.campaign.geo_targets) {
      if (typeof geo !== 'string' && typeof geo !== 'number') {
        errors.push(`geo_target inválido: "${geo}". Usar código de país (ej: "US") o location ID numérico`);
      }
    }
  }

  for (const ag of draft?.ad_groups || []) {
    if (!ag.name) errors.push('Ad group sin nombre');
    if (!ag.ads?.length) errors.push(`Ad group "${ag.name}" sin ads`);
    if (ag.keywords?.length > MAX_KEYWORDS_PER_GROUP) {
      errors.push(`Ad group "${ag.name}" excede ${MAX_KEYWORDS_PER_GROUP} keywords`);
    }
    for (const ad of ag.ads || []) {
      if (ad.type === 'RESPONSIVE_SEARCH_AD') {
        if (!ad.headlines?.length || ad.headlines.length < 3) {
          errors.push(`Ad en "${ag.name}" necesita al menos 3 headlines`);
        }
        if (!ad.descriptions?.length || ad.descriptions.length < 2) {
          errors.push(`Ad en "${ag.name}" necesita al menos 2 descriptions`);
        }
        if (!ad.final_url) {
          errors.push(`Ad en "${ag.name}" sin final_url`);
        } else {
          try { new URL(ad.final_url); } catch {
            errors.push(`Ad en "${ag.name}": URL inválida "${ad.final_url}"`);
          }
        }
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

async function execute(conversationId, userId) {
  const conv = await conversation.get(conversationId, userId);
  if (!conv) throw new Error('Conversation not found');
  if (conv.state !== 'confirmed') throw new Error('Campaign not confirmed yet');
  if (!conv.draft) throw new Error('No campaign draft found');

  const validationErrors = validateDraft(conv.draft);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  await conversation.update(conversationId, { state: 'executing' });

  await supabase.from('adpilot_campaign_logs').insert({
    conversation_id: conversationId,
    action: 'create_campaign',
    status: 'started',
    payload: conv.draft,
    user_id: userId,
  });

  try {
    const result = await googleAds.createCampaignFromDraft(conv.draft, userId);

    if (result.errors.length > 0 && !result.campaignId) {
      await conversation.update(conversationId, { state: 'error' });
      await supabase.from('adpilot_campaign_logs').insert({
        conversation_id: conversationId,
        action: 'create_campaign',
        status: 'failed',
        payload: { result },
        user_id: userId,
      });
      return { success: false, errors: result.errors };
    }

    if (result.errors.length > 0 && result.campaignId) {
      const criticalFailures = result.errors.filter(e => e.adGroup);
      if (criticalFailures.length === conv.draft.ad_groups.length) {
        try {
          await googleAds.removeCampaign(result.campaignId, userId);
          await conversation.update(conversationId, { state: 'error' });
          await supabase.from('adpilot_campaign_logs').insert({
            conversation_id: conversationId,
            action: 'create_campaign',
            status: 'rolled_back',
            payload: { result, reason: 'All ad groups failed' },
            user_id: userId,
          });
          return {
            success: false,
            errors: [{ error: 'Todos los ad groups fallaron. Campaña revertida.' }, ...result.errors],
          };
        } catch (rollbackErr) {
          console.error('Rollback failed:', rollbackErr.message);
        }
      }
    }

    await conversation.update(conversationId, { state: 'done' });
    await supabase.from('adpilot_campaign_logs').insert({
      conversation_id: conversationId,
      action: 'create_campaign',
      status: result.errors.length > 0 ? 'partial' : 'success',
      payload: { result },
      user_id: userId,
    });

    // Post-creation: apply audiences, device bids, UTMs if present in draft
    if (result.campaignId) {
      try {
        if (conv.draft.campaign.audiences?.length) {
          await campaignManager.addAudienceSegments(result.campaignId, conv.draft.campaign.audiences, userId);
        }
        if (conv.draft.campaign.device_bid_adjustments) {
          await campaignManager.updateDeviceBids(result.campaignId, conv.draft.campaign.device_bid_adjustments, userId);
        }
        if (conv.draft.campaign.utm_params) {
          await campaignManager.applyUtmToCampaign(result.campaignId, conv.draft.campaign.utm_params, userId);
        }
      } catch (postErr) {
        result.errors.push({ post_creation: postErr.message });
      }
    }

    knowledge.learnFromConversation(conv, userId).catch(e =>
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
      user_id: userId,
    });
    return { success: false, errors: [{ error: err.message }] };
  }
}

module.exports = { validateDraft, execute };

// Entry point — imports all modules and exposes functions to window for onclick handlers
import { initConfirmModal } from './modules/ui.js';
import { showView } from './modules/router.js';
import { validateToken, doLogin, doSetup, doLogout, toggleSetupMode, toggleLoginPanel, showLoginFromLead, submitLead, initAuthListeners } from './modules/auth.js';
import { newConversation, openConversation, deleteConversation, send, sendMessage, approveAndExecute } from './modules/chat.js';
import { loadDashboard, syncMetrics } from './modules/dashboard.js';
import { analyzeCampaign, sendAnalysis, executeAnalysisAction, dismissAnalysisAction } from './modules/analysis.js';
import { loadOptimizer, createRule, toggleRule, removeRule, resolveRec, evaluateRules } from './modules/optimizer.js';
import { loadKnowledge, addKnowledge, deleteKnowledge } from './modules/knowledge.js';
import { searchKeywords, toggleAllKeywords, copySelectedKeywords } from './modules/keywords.js';
import { loadCampaignsView, openCampaignDetail, backToCampaignsList, toggleCampaignStatus, saveCampaignBudget, saveCampaignBidding, searchGeoLocations, addGeoId, saveCampaignGeoTargets, applyCampaignUtm, saveDeviceBids, toggleAdGroupStatus, toggleAdGroupDetail, addKeywordToGroup, addNegKeyword, removeKeyword, toggleAdStatus } from './modules/campaigns.js';
import { saveGoogleAds, saveLLMSettings, saveBusinessContext, saveMasterPrompt, createUser, toggleUserEnabled, updateUserLimit } from './modules/admin.js';

// Expose showView for analysis module
window.__modules = { showView };

// Expose all functions used by onclick handlers in HTML
Object.assign(window, {
  showView,
  toggleLoginPanel, showLoginFromLead, submitLead,
  doLogin, doSetup, doLogout, toggleSetupMode,
  newConversation, openConversation, deleteConversation,
  send, sendMessage, approveAndExecute,
  loadDashboard, syncMetrics,
  analyzeCampaign, sendAnalysis, executeAnalysisAction, dismissAnalysisAction,
  loadOptimizer, createRule, toggleRule, removeRule, resolveRec, evaluateRules,
  loadKnowledge, addKnowledge, deleteKnowledge,
  searchKeywords, toggleAllKeywords, copySelectedKeywords,
  loadCampaignsView, openCampaignDetail, backToCampaignsList,
  toggleCampaignStatus, saveCampaignBudget, saveCampaignBidding,
  searchGeoLocations, addGeoId, saveCampaignGeoTargets,
  applyCampaignUtm, saveDeviceBids,
  toggleAdGroupStatus, toggleAdGroupDetail,
  addKeywordToGroup, addNegKeyword, removeKeyword, toggleAdStatus,
  saveGoogleAds, saveLLMSettings, saveBusinessContext, saveMasterPrompt,
  createUser, toggleUserEnabled, updateUserLimit,
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  initConfirmModal();
  initAuthListeners();
});
validateToken();

// Auto-resize textareas
for (const ta of document.querySelectorAll('textarea')) {
  ta.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}

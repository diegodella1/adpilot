import { API, sending, analysisConvId, pendingAction, setSending, setAnalysisConvId, setPendingAction } from './state.js';
import { headers } from './api.js';
import { addMessage, removeLastSystem } from './ui.js';

export function analyzeCampaign(campaignId) {
  setAnalysisConvId(null);
  setPendingAction(null);
  document.getElementById('analysis-messages').innerHTML = '<div class="empty-state">Cargando datos de la campana...</div>';
  document.getElementById('analysis-actions').style.display = 'none';
  const { showView } = window.__modules;
  showView('analyze');
  sendAnalysisMessage(`Analiza la campana ${campaignId} y dame recomendaciones`, campaignId);
}

export async function sendAnalysis() {
  const input = document.getElementById('analysis-input');
  const msg = input.value.trim();
  if (!msg || sending) return;
  input.value = '';
  input.style.height = 'auto';
  await sendAnalysisMessage(msg);
}

async function sendAnalysisMessage(msg, campaignId = null) {
  if (sending) return;
  setSending(true);

  addMessage('user', msg, 'analysis-messages');
  addMessage('system', 'Analizando...', 'analysis-messages');

  try {
    const body = { message: msg };
    if (analysisConvId) body.conversation_id = analysisConvId;
    if (campaignId) body.campaign_id = campaignId;

    const res = await fetch(`${API}/api/analysis/chat`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    removeLastSystem('analysis-messages');

    if (data.error) {
      addMessage('system', `Error: ${data.error}`, 'analysis-messages');
    } else {
      setAnalysisConvId(data.conversation_id);
      addMessage('assistant', data.message, 'analysis-messages');

      if (data.action) {
        setPendingAction(data.action);
        document.getElementById('analysis-actions').style.display = 'flex';
      } else {
        document.getElementById('analysis-actions').style.display = 'none';
      }
    }
  } catch (e) {
    removeLastSystem('analysis-messages');
    addMessage('system', `Error: ${e.message}`, 'analysis-messages');
  } finally {
    setSending(false);
  }
}

export async function executeAnalysisAction() {
  if (!pendingAction) return;
  addMessage('system', 'Ejecutando accion...', 'analysis-messages');
  try {
    const res = await fetch(`${API}/api/analysis/execute-action`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: pendingAction }),
    });
    const data = await res.json();
    removeLastSystem('analysis-messages');
    if (data.success) {
      addMessage('system', 'Accion ejecutada correctamente', 'analysis-messages');
    } else {
      addMessage('system', `Error: ${data.error}`, 'analysis-messages');
    }
  } catch (e) {
    removeLastSystem('analysis-messages');
    addMessage('system', `Error: ${e.message}`, 'analysis-messages');
  }
  setPendingAction(null);
  document.getElementById('analysis-actions').style.display = 'none';
}

export function dismissAnalysisAction() {
  setPendingAction(null);
  document.getElementById('analysis-actions').style.display = 'none';
}

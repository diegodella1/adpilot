/**
 * Errores seguros que se pueden mostrar al usuario.
 * Los demás se loguean pero se devuelve un mensaje genérico.
 */
const SAFE_ERRORS = [
  'Conversation not found',
  'Campaign not confirmed yet',
  'No campaign draft found',
  'Message required',
  'Empty message',
  'Google Ads credentials not configured',
  'Too many LLM requests',
  'No hay API key de LLM configurada',
  'Unknown action type',
  'requires keyword_id and ad_group_id',
];

function safeError(err) {
  const msg = err?.message || String(err);
  // Mostrar si es un error "esperado"
  if (SAFE_ERRORS.some(s => msg.includes(s))) return msg;
  if (msg.startsWith('Conversation is in')) return msg;
  if (msg.includes('not supported')) return msg;
  if (msg.includes('excede') || msg.includes('inválid')) return msg;
  // Errores de validación del campaign builder
  if (msg.startsWith('Falta') || msg.startsWith('Budget') || msg.startsWith('Ad group')) return msg;
  // El resto se oculta
  console.error(`[${new Date().toISOString()}] Internal error:`, msg);
  return 'Error interno. Intentá de nuevo.';
}

function errorResponse(res, err, status = 500) {
  res.status(status).json({ error: safeError(err) });
}

module.exports = { errorResponse };

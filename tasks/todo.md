# AdPilot — Estado

## Fase 1: Setup y conexión a Google Ads
- [ ] Crear proyecto en Google Cloud + OAuth2
- [ ] Configurar Google Ads API credentials
- [ ] Implementar auth flow (obtener refresh token)
- [ ] Test: listar campañas existentes

## Fase 2: Backend base (MVP)
- [x] Scaffold Node.js app (Express)
- [x] Modelo de datos en Supabase
- [x] LLM service multi-provider (OpenAI/OpenRouter)
- [x] State machine de conversación
- [x] Chat API + Admin API + Knowledge API
- [x] Campaign builder + validación + ejecución
- [x] RAG con pgvector (auto-learn + manual)

## Fase 3: Dashboard + métricas
- [x] Sync de métricas Google Ads → Supabase (cron cada hora)
- [x] API: summaries, daily metrics, global metrics
- [x] Frontend: KPI cards, chart (Chart.js), tabla de campañas
- [x] Alertas automáticas (CPA spike, CTR drop, sin conversiones, ROAS bajo)

## Fase 4: Chat de análisis de campañas
- [x] Endpoint /api/analysis/chat con métricas inyectadas al system prompt
- [x] RAG de conocimiento de optimización
- [x] Detección de acciones en respuesta del LLM (```action JSON```)
- [x] Ejecutar acciones directamente desde el chat
- [x] Frontend: vista Analizar con botones de ejecutar/ignorar acción

## Fase 5: Motor de optimización automática
- [x] CRUD de reglas (condición + acción)
- [x] Evaluación de reglas contra summaries
- [x] Ejecución manual o automática
- [x] Recomendaciones pendientes con aprobar/rechazar
- [x] Logging de optimizaciones
- [x] Frontend: vista Reglas con formulario + lista + recomendaciones

## Fase 6: Frontend completo
- [x] 7 tabs: Chat, Dashboard, Analizar, Reglas, Logs, Knowledge, Admin
- [x] Chart.js para gráficos de spend/conversiones
- [x] Sidebar de conversaciones (en modo Chat)
- [x] Responsive con grid layout

## Fase 7: Deploy
- [x] Dockerfile
- [ ] Deploy en Coolify
- [ ] Test end-to-end con Google Ads real

## Pendiente
- [ ] Configurar Google Ads API credentials (manual)
- [ ] Configurar LLM API key (desde Admin)

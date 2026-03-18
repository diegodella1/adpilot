# AdPilot — MVP

## Fase 1: Setup y conexión a Google Ads
- [ ] Crear proyecto en Google Cloud + OAuth2
- [ ] Configurar Google Ads API credentials
- [ ] Implementar auth flow (obtener refresh token)
- [ ] Test: listar campañas existentes

## Fase 2: Backend base
- [x] Scaffold Node.js app (Express)
- [x] Modelo de datos en Supabase (conversations, drafts, logs, settings)
- [x] LLM service con system prompt de Google Ads (multi-provider: OpenAI/OpenRouter)
- [x] State machine de conversación
- [x] Endpoint de chat (POST /api/chat)
- [x] Admin panel para configurar LLM provider/model/keys
- [x] Logs de ejecuciones

## Fase 3: Campaign builder
- [x] Parser de output LLM → estructura de campaña
- [x] Validación de estructura
- [x] Funciones de creación via Google Ads API
- [x] Logging de ejecuciones

## Fase 4: Frontend
- [x] Chat UI básica (HTML/CSS/JS)
- [x] Preview de campaña en formato legible
- [x] Botones de acción (aprobar/editar/cancelar)
- [x] Feedback visual de estado
- [x] Admin panel (LLM config)
- [x] Logs viewer

## Fase 5: Deploy
- [x] Dockerfile
- [ ] Deploy en Coolify
- [ ] Test end-to-end

## Pendiente (post-MVP)
- [ ] Dashboard de métricas + alertas
- [ ] Logs de modificaciones en dashboard
- [ ] Chat con LLM para preguntar sobre campañas y dar órdenes de optimización
- [ ] Motor de optimización automática

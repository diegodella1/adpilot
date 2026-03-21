# Red Team — AdPilot Pitch Deck

**Metodología**: Cada inversor ataca desde su framework mental. Al final, las respuestas que blindan el pitch.

---

## 🔴 ELON MUSK — First Principles

> "Volvé a los átomos del problema. ¿Es real o es una narrativa?"

### Ataque 1: "El mercado de USD 50B no es TU mercado"

USD 50B es el ad spend total de LATAM — o sea, la plata que los anunciantes le pagan a Google/Meta/TikTok. Vos no capturás nada de eso. Tu mercado es lo que las PyMEs pagan por **herramientas de gestión de ads**. Eso es 100x más chico.

**Impacto**: La slide 2 infla el TAM mezclando ad spend con SaaS tools spend. Un inversor serio te para acá.

**Fix**: Separar TAM (ad spend LATAM) / SAM (PyMEs que pagan por tools) / SOM (lo que podés capturar en 18 meses). Ser honesto: el SAM realista es ~USD 300–500M (2.5M advertisers × USD 10–20/mes promedio en tools). Tu SOM a 18 meses es USD 390K.

### Ataque 2: "¿2 minutos a campaña activa? Demostrálo"

Si es cierto, es impresionante. Si es un claim de marketing que en la realidad son 20 minutos con fricciones, perdés toda credibilidad. ¿Tenés un video de un usuario REAL (no vos) haciéndolo en 2 minutos?

**Fix**: Grabar un demo no-editado con cronómetro visible. Un usuario que nunca tocó Google Ads, desde cero hasta campaña activa. Si son 5 minutos, decí 5 minutos — sigue siendo 100x más rápido que una agencia.

### Ataque 3: "Estás corriendo esto en una Raspberry Pi. ¿Cómo escala?"

Tu infra actual es una RPi 5 con 8GB. Eso no es un "servidor de producción" — es un proyecto de hobby. ¿Cuál es el plan real de infra para 500 usuarios concurrentes haciendo llamadas a LLMs y Google Ads API?

**Fix**: No esconder la RPi — usarla como proof de eficiencia ("el MVP corre en hardware de USD 80"). Pero tener un plan claro: "Producción será un VPS de USD 15–30/mes que maneja 500+ usuarios". Docker + Coolify ya está preparado para migrar.

---

## 🔴 PETER THIEL — Zero to One

> "¿Qué verdad contrarian sabés vos que nadie más sabe?"

### Ataque 4: "No tenés moat. Esto se clona en un fin de semana"

Un wrapper de GPT-4 + Google Ads API no es un producto, es un proyecto de hackathon. ¿Qué impide que Optmyzr agregue un chat con IA mañana? ¿O que un dev de LATAM copie tu approach en 2 semanas? Tu "diferenciador" es español + chat. Eso no es un moat — es un feature.

**Impacto**: Este es el ataque más peligroso del pitch. Sin moat, no hay negocio defensible.

**Fix — Reconocer y construir el moat real:**
1. **Data moat**: Cada campaña creada alimenta el RAG. A los 1,000 campañas, tenés un dataset de "qué funciona en Google Ads para PyMEs LATAM" que nadie más tiene. Eso mejora la IA con cada uso.
2. **Integración vertical**: No es solo chat → campaña. Es chat → campaña → métricas → optimización → aprendizaje → mejor chat. El loop completo es lo difícil de replicar.
3. **Network effects via agencias**: Si 50 agencias usan AdPilot para sus clientes, cada una trae 10-50 cuentas. El switching cost sube.
4. **Expertise de dominio**: Los prompts están calibrados para Google Ads LATAM (pesos, regiones, estacionalidad). Eso es know-how, no solo código.

### Ataque 5: "¿Monopolio de qué exactamente?"

Thiel quiere que domines una categoría chica antes de expandir. ¿Cuál es tu micro-nicho de dominio absoluto? "PyMEs LATAM" es demasiado amplio.

**Fix**: Definir el beachhead: **"E-commerce chicos de Argentina que venden por Instagram y quieren su primer Google Ads"**. Dominá eso con 80% market share antes de expandir a otros países o verticales.

### Ataque 6: "Dependencia existencial de OpenAI y Google"

Tu producto entero depende de dos proveedores que pueden cambiar precios, terms of service, o cortarte el acceso. Google puede banear tu developer token. OpenAI puede 10x los precios. ¿Qué hacés?

**Fix**:
- OpenRouter ya está integrado (multi-provider). Agregar modelos open-source como fallback (Llama, Mistral vía Ollama)
- Google Ads API: no hay alternativa, pero el riesgo es bajo — Google beneficia de que más gente use su plataforma
- Ser transparente: "Sí, dependemos de Google Ads. También Optmyzr, WordStream, y toda la industria PPC. No es un riesgo específico nuestro"

---

## 🔴 JEFF BEZOS — Customer Obsession

> "Empezá por el cliente y trabajá para atrás. ¿Quién es y qué quiere realmente?"

### Ataque 7: "¿Tu cliente puede pagar USD 29/mes?"

Una PyME en LATAM que no puede pagar una agencia de USD 500... ¿va a pagar USD 29/mes por una herramienta? ¿Además del ad spend que Google le cobra? El emprendedor argentino promedio tiene márgenes de 10-15%. ¿USD 29 + USD 300 de ad spend le mueve la aguja?

**Impacto**: Si el cliente target no tiene presupuesto ni para probar, todo el modelo se cae.

**Fix**:
- Hacer la matemática explícita: "Con USD 300/mes de ad spend bien gestionado, una PyME genera 15-30 leads. Si convierte el 10%, son 2-3 ventas nuevas. Si el ticket promedio es USD 100, el ROI es 3-10x sobre la inversión total (ads + herramienta)"
- Plan freemium real: 1 campaña gratis para siempre, monetizar el upgrade
- Pricing en moneda local (ARS/CLP/MXN) con paridad de poder adquisitivo

### Ataque 8: "¿Qué pasa cuando la campaña falla?"

El 70% de las campañas de PyMEs en Google Ads pierden plata los primeros 30 días. Si AdPilot crea una campaña que quema USD 500 sin resultados, ¿el usuario culpa a Google o a AdPilot? Te van a odiar. El churn va a ser brutal.

**Impacto**: El churn de 8% mensual que proyectás puede ser 20%+ si los usuarios no ven ROI rápido.

**Fix**:
- **Guardrails de presupuesto**: Alertas automáticas cuando el spend supera un umbral sin conversiones. "Tu campaña lleva USD 100 gastados sin conversiones. ¿Querés pausarla?"
- **Expectation setting**: En el chat de creación, la IA explica que las campañas necesitan 2-4 semanas de aprendizaje
- **Quick wins**: Optimizaciones automáticas agresivas en los primeros 7 días (pausar keywords sin clicks, ajustar bids)
- **Money-back**: "Si en 30 días no generaste al menos 1 lead, te devolvemos la suscripción"

### Ataque 9: "El onboarding de Google Ads OAuth es un muro de fricción"

Para usar AdPilot, el usuario necesita: cuenta Google Ads activa + configurar OAuth2 + developer token + refresh token. Eso no es "2 minutos de setup" — es un proceso técnico que la mayoría de PyMEs no puede hacer sola.

**Fix**:
- Implementar OAuth2 flow completo (ya está en el roadmap como P0)
- El usuario hace click en "Conectar Google Ads" → login de Google → listo. Sin tokens manuales
- Ofrecer servicio de setup guiado como upsell (USD 99 one-time, ya está contemplado)

---

## 🔴 LARRY PAGE & SERGEY BRIN — Google kills you

> "¿Por qué Google no hace esto mañana y te aplasta?"

### Ataque 10: "Google ya está haciendo exactamente esto"

Google lanzó AI Max for Search en 2025. Performance Max ya automatiza campañas casi completamente. Google Ads está agregando IA nativa. En 2026, ¿por qué una PyME necesitaría AdPilot si Google mismo simplifica la interfaz?

**Impacto**: Este es el riesgo existencial #1. Si Google hace que crear campañas sea trivial, el value prop de AdPilot se evapora.

**Fix — Por qué Google NO resuelve esto (y no puede):**
1. **Conflicto de intereses**: Google quiere que gastes MÁS. AdPilot quiere que gastes MEJOR. Google nunca va a decir "pausá esta campaña, estás tirando plata". AdPilot sí.
2. **Idioma**: La IA de Google funciona en inglés. El soporte en español es superficial. AdPilot entiende "quiero vender empanadas en Palermo con mil mangos".
3. **Complejidad irreducible**: Google simplificó Performance Max, pero sigue teniendo 200+ settings. La simplificación de Google es para Google, no para la PyME.
4. **Multi-plataforma futuro**: AdPilot puede expandir a Meta Ads, TikTok Ads, ML Ads. Google solo te retiene en su ecosistema.

### Ataque 11: "Google puede revocar tu API access"

Si Google decide que AdPilot compite con sus herramientas nativas o viola ToS, te cortan. Ha pasado con otros servicios (ver: Google Maps API pricing changes 2018).

**Fix**:
- Cumplir escrupulosamente la Google Ads API Terms of Service
- No almacenar datos de Google Ads más allá de lo permitido (cache de 90 días, ya implementado)
- Aplicar al Google Ads API Partner Program para tener relación formal
- Diversificar: la capa de IA + optimización funciona con cualquier ad platform. Google Ads es el primer canal, no el único

### Ataque 12: "¿Y si Gemini reemplaza tu LLM?"

Google tiene Gemini integrado en Google Ads. Si Gemini puede hacer lo que GPT-4o-mini hace en AdPilot pero gratis y nativo... ¿para qué pagarte?

**Fix**: Gemini dentro de Google Ads optimiza dentro del framework de Google (que quiere que gastes más). AdPilot usa la IA como **abogado del anunciante**, no de Google. El alignment de incentivos es el diferenciador real — no el modelo de IA en sí.

---

## 🔴 ATAQUE TRANSVERSAL — Lo que todos preguntarían

### Ataque 13: "¿Dónde están tus usuarios?"

0 usuarios pagos. 0 revenue. 0 case studies reales. Todo el pitch es proyección. "El MVP funciona" no significa "alguien quiere pagar por esto". ¿Tenés al menos 5 PyMEs en lista de espera? ¿Cartas de intención? ¿Alguien que dijo "shut up and take my money"?

**Impacto**: Sin evidencia de demanda real, todo es especulación.

**Fix URGENTE (pre-pitch):**
- Conseguir 5-10 compromisos verbales de PyMEs (no necesitás que paguen, necesitás que digan "lo usaría")
- Armar una landing page con waitlist y medir sign-ups
- Ofrecer beta gratuita a 3 PyMEs conocidas, documentar resultados
- Un solo case study real vale más que todas las slides juntas

### Ataque 14: "LTV:CAC de 26:1 es fantasía"

Un CAC de USD 30-50 con content marketing asume que el contenido genera leads gratis. En la realidad, content marketing para SaaS B2B tiene CAC de USD 100-300. Y el churn de 5% mensual para una herramienta que toca la plata de la gente (ads) es optimista — la industria tiene 7-10%.

**Fix**:
- Usar CAC realista: USD 100-150
- Usar churn realista: 7-8%
- Recalcular: LTV = USD 65 × 14 meses = USD 910. LTV:CAC = 6:1 a 9:1
- Sigue siendo excelente — no necesitás inflar los números

### Ataque 15: "Sos solo, no hay equipo"

Un solo founder developer. ¿Quién hace ventas? ¿Soporte? ¿Marketing? ¿Qué pasa si te enfermás una semana? El bus factor es 1.

**Fix**:
- Ser honesto: "Soy un solo founder técnico. Eso significa que el producto se mueve rápido"
- Mostrar que el modelo de negocio no requiere equipo grande: SaaS self-service, soporte por chat/docs, marketing por contenido
- Plan de hiring: "Con 50 clientes contrato un community manager. Con 150, un developer part-time"

---

# RESUMEN: Los 5 fixes que más impactan el pitch

| # | Fix | Slide afectada | Prioridad |
|---|-----|---------------|-----------|
| 1 | **Separar TAM/SAM/SOM correctamente** | Slide 2 | CRÍTICO — sin esto, perdés credibilidad ante cualquier inversor |
| 2 | **Conseguir 3-5 usuarios beta con datos reales** | Slide 1 y 5 | CRÍTICO — un case study real > 100 slides |
| 3 | **Articular el moat como data flywheel** | Slide 3 | ALTO — el moat de datos es real, pero no está comunicado |
| 4 | **Usar unit economics realistas (CAC 120, churn 7%)** | Slide 4 | ALTO — números honestos dan más confianza que números inflados |
| 5 | **Respuesta clara a "¿por qué Google no te mata?"** | Slide 3 | ALTO — es la primera pregunta que te van a hacer |

---

# RESPUESTAS PREPARADAS (Cheat Sheet para Q&A)

### "¿Y si Google simplifica Google Ads?"
"Google quiere que gastes más. Nosotros queremos que gastes mejor. Ese conflicto de intereses no se resuelve por más IA que Google le ponga a su plataforma. Somos el abogado del anunciante, no de la plataforma."

### "¿Qué moat tenés?"
"Cada campaña creada alimenta nuestro knowledge base vectorial. A las 1,000 campañas, tenemos el dataset más completo de qué funciona en Google Ads para PyMEs LATAM. Eso no se replica con código — se replica con tiempo y datos."

### "¿Cómo conseguís los primeros 100 clientes?"
"Agencias boutique. Una agencia que maneja 20 clientes y adopta AdPilot nos trae 20 cuentas de golpe. Necesitamos 5 agencias, no 100 PyMEs individuales. El plan Agency está diseñado para eso."

### "¿Por qué LATAM y no USA?"
"En USA hay 50 herramientas compitiendo. En LATAM hay cero herramientas conversacionales en español con ejecución directa. Es un mercado de USD 50B sin tooling propio. Preferimos ser el #1 en un mercado desatendido que el #51 en uno saturado."

### "¿Cómo controlás que la IA no queme plata?"
"Tres capas: guardrails en la creación (la IA no permite campañas sin sentido), monitoreo automático (si el CPA se dispara, pausa sola), y límites de presupuesto que el usuario configura. Si algo sale mal, AdPilot frena antes que el usuario se dé cuenta."

### "¿Qué pasa cuando OpenAI suba precios?"
"Ya tenemos OpenRouter integrado con fallback a cualquier modelo. Mañana podríamos correr con Claude, Mistral, o Llama open-source. El LLM es un commodity — nuestro valor está en la lógica de negocio, no en el modelo."

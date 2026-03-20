export function renderDocs() {
  const docSection = (title, content) => `<div class="glass-card" style="margin-bottom:12px"><h3 style="margin-bottom:10px">${title}</h3>${content}</div>`;
  const p = (text) => `<p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin:0 0 8px">${text}</p>`;
  const ul = (items) => `<ul style="padding-left:20px;color:var(--text-secondary);font-size:13px;line-height:1.8;margin:0">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const code = (text) => `<code style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-size:12px;color:var(--accent)">${text}</code>`;

  document.getElementById('docs-content').innerHTML = `
    <div style="max-width:860px">
      <div class="panel-header">
        <div>
          <h2>Documentacion de AdPilot</h2>
          <p class="panel-subtitle">Guia completa de todas las funcionalidades de la plataforma</p>
        </div>
      </div>

      ${docSection('Setup inicial', `
        <ol style="padding-left:20px;line-height:2;color:var(--text-secondary);font-size:14px">
          <li>Hacer click en <strong style="color:var(--text)">"Primer uso? Crear admin"</strong> en la pantalla de login.</li>
          <li>Ir a <strong style="color:var(--text)">Admin</strong> y configurar el LLM provider (OpenAI o OpenRouter) con su API key y modelo.</li>
          <li>Configurar las credenciales de <strong style="color:var(--text)">Google Ads</strong> (Client ID, Secret, Developer Token, Refresh Token, Customer ID).</li>
          <li>Sin Google Ads, AdPilot funciona como copiloto: genera estructuras de campana que podes crear manualmente.</li>
        </ol>
      `)}

      <h2 style="font-size:16px;margin:24px 0 12px;color:var(--text)">Modulos de la plataforma</h2>

      <div style="display:grid;gap:12px;margin-bottom:16px">
        ${[
          ['Chat — Creacion de campanas', 'Describis tu campana en lenguaje natural. El agente IA guia paso a paso: pregunta lo que falta, sugiere best practices, genera la estructura completa en JSON y la ejecuta en Google Ads. Soporta campanas Search, Performance Max, Display y Video.'],
          ['Dashboard — Metricas en tiempo real', 'KPIs globales (spend, clicks, conversiones, CPA, CTR, ROAS), grafico de tendencia, tabla de campanas con alertas automaticas (CPA spike, CTR drop, sin conversiones, ROAS bajo 1.0). Sync on-demand desde Google Ads.'],
          ['Analizar — Chat de optimizacion', 'Chat con IA especializado en analisis de rendimiento. Accede a metricas de todas tus campanas, identifica problemas y sugiere acciones concretas que podes ejecutar directamente desde el chat.'],
          ['Reglas — Motor de automatizacion', 'Reglas condicionales que evaluan metricas de campana y ejecutan acciones automaticamente o con aprobacion. Soporta alertas, pausar/activar campanas y ad groups, ajustar budgets, cambiar bidding strategy, agregar negative keywords y mas.'],
          ['Keywords — Research', 'Ideas de keywords desde Google Ads Keyword Planner con volumen de busqueda, competencia, indice de competencia y CPC estimado (low/high). Seleccion multiple y copia masiva.'],
          ['Knowledge — Base de conocimiento (RAG)', 'Base vectorial con embeddings que alimenta al agente con contexto de tu negocio. Se auto-alimenta con cada campana creada y cada optimizacion ejecutada. Categorias: best practices, feedback, tips, resultados.'],
          ['Admin — Configuracion y usuarios', 'Credenciales Google Ads (encriptadas), LLM provider (OpenAI/OpenRouter), master prompt global, business context per-user, gestion de usuarios con limites de consumo LLM, dashboard de uso.'],
        ].map(([title, desc]) => `
          <div class="glass-card" style="margin-bottom:0">
            <h3 style="margin-bottom:6px;font-size:14px">${title}</h3>
            <p style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin:0">${desc}</p>
          </div>
        `).join('')}
      </div>

      <h2 style="font-size:16px;margin:24px 0 12px;color:var(--text)">Gestion de campanas activas (Campaign Lifecycle)</h2>

      ${docSection('Geo-targeting por ciudad', `
        ${p('AdPilot soporta targeting geografico granular: paises completos via codigo ISO (ej: "US", "AR") y ciudades/regiones especificas via Google Ads location IDs.')}
        ${p('<strong style="color:var(--text)">Buscar ciudades:</strong> ' + code('GET /api/locations/search?q=miami') + ' retorna el criterion ID (ej: 1015116 para Miami).')}
        ${p('<strong style="color:var(--text)">En creacion:</strong> El LLM puede generar ' + code('geo_targets: ["US", 1023191, 1016367]') + ' mezclando paises y ciudades.')}
        ${p('<strong style="color:var(--text)">En campana activa:</strong> ' + code('PUT /api/campaigns/:id/geo-targets') + ' con ' + code('{ targets: [1023191, 1016367] }') + ' reemplaza todos los geo targets.')}
      `)}

      ${docSection('Budget y Bidding', `
        ${p('Modificar budget y estrategia de bidding en campanas activas en cualquier momento.')}
        ${ul([
          code('PUT /api/campaigns/:id/budget') + ' — ' + code('{ budget_micros: 50000000 }') + ' ($50/dia)',
          code('PUT /api/campaigns/:id/bidding') + ' — ' + code('{ strategy: "TARGET_CPA", value_micros: 5000000 }'),
          'Strategies soportadas: TARGET_CPA, MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_ROAS',
        ])}
      `)}

      ${docSection('Status de campana, ad groups y ads', `
        ${p('Pausar o activar cualquier nivel de la jerarquia:')}
        ${ul([
          code('PUT /api/campaigns/:id/status') + ' — ' + code('{ status: "PAUSED" | "ENABLED" }'),
          code('PUT /api/campaigns/:id/ad-groups/:agId/status') + ' — Pausar/activar ad group',
          code('PUT /api/campaigns/:id/ad-groups/:agId/ads/:adId/status') + ' — Pausar/activar ad individual',
        ])}
      `)}

      ${docSection('Keywords y negative keywords', `
        ${p('Agregar, listar y eliminar keywords en ad groups activos:')}
        ${ul([
          code('GET /api/campaigns/:id/ad-groups/:agId/keywords') + ' — Listar keywords del ad group',
          code('POST /api/campaigns/:id/ad-groups/:agId/keywords') + ' — ' + code('{ keywords: [{ text: "...", match_type: "EXACT" }] }'),
          code('DELETE /api/campaigns/:id/ad-groups/:agId/keywords/:kwId') + ' — Eliminar keyword',
          code('POST /api/campaigns/:id/ad-groups/:agId/negative-keywords') + ' — ' + code('{ keywords: ["free", "gratis"] }'),
        ])}
      `)}

      ${docSection('UTM Tracking', `
        ${p('UTMs se pueden definir al crear la campana o aplicar/cambiar en campanas activas.')}
        ${p('<strong style="color:var(--text)">En creacion:</strong> Incluir ' + code('utm_params') + ' en el JSON de campana.')}
        ${p('<strong style="color:var(--text)">En campana activa:</strong> ' + code('PUT /api/campaigns/:id/utm') + ' actualiza las URLs de todos los ads.')}
        ${p('Soporta macros de Google Ads: ' + code('{keyword}') + ', ' + code('{campaignid}') + ', ' + code('{adgroupid}') + '.')}
      `)}

      ${docSection('Audience Segments (Observation Mode)', `
        ${p('Agregar audiencias a campanas para recopilar datos de rendimiento por segmento.')}
        ${ul([
          '<strong style="color:var(--text)">IN_MARKET</strong> — Usuarios activamente buscando',
          '<strong style="color:var(--text)">AFFINITY</strong> — Usuarios con intereses a largo plazo',
          '<strong style="color:var(--text)">CUSTOM_INTENT</strong> — Audiencia custom basada en URLs',
        ])}
      `)}

      ${docSection('Device Bid Adjustments', `
        ${p('Ajustar bids por tipo de dispositivo. Valores: 1.0 = sin cambio, 0.8 = -20%, 1.3 = +30%, 0.0 = excluir.')}
        ${ul([
          code('GET /api/campaigns/:id/devices') + ' — Ver ajustes actuales',
          code('PUT /api/campaigns/:id/devices') + ' — ' + code('{ adjustments: { desktop: 1.0, mobile: 0.8, tablet: 0.7 } }'),
        ])}
      `)}

      ${docSection('Remarketing Lists', `
        ${p('Agregar listas de remarketing existentes a campanas activas.')}
        ${ul([
          code('GET /api/remarketing-lists') + ' — Ver listas disponibles',
          code('POST /api/campaigns/:id/remarketing') + ' — ' + code('{ user_list_id: 123, bid_modifier: 1.5 }'),
          code('DELETE /api/campaigns/:id/remarketing/:criterionId') + ' — Quitar lista',
        ])}
      `)}

      <h2 style="font-size:16px;margin:24px 0 12px;color:var(--text)">Motor de optimizacion</h2>

      ${docSection('Reglas automaticas', `
        ${p('Las reglas evaluan metricas de campana contra umbrales y ejecutan acciones.')}
        ${p('<strong style="color:var(--text)">Metricas:</strong> CPA, CTR, ROAS, conversiones, spend (7d y 30d).')}
        ${p('<strong style="color:var(--text)">Acciones:</strong>')}
        ${ul([
          'pause_campaign / enable_campaign',
          'pause_ad_group / enable_ad_group',
          'pause_ad / enable_ad',
          'adjust_budget',
          'change_bidding_strategy',
          'pause_keyword / enable_keyword',
          'add_negative_keyword',
          'update_device_bids',
          'alert (solo notificacion)',
        ])}
      `)}

      ${docSection('Seguridad', `
        ${ul([
          'Credenciales encriptadas (AES-256-GCM)',
          'JWT con expiracion de 24 horas',
          'Rate limiting: 120 req/min global, 15 req/min LLM',
          'Multi-tenant con aislamiento por usuario',
          'Limites de consumo LLM por usuario',
          'Prompt injection guard',
        ])}
      `)}

      <div style="padding:16px 0;color:var(--text-dim);font-size:12px;line-height:1.8">
        <strong>Stack:</strong> Node.js + Express + Supabase + pgvector + Chart.js &nbsp;|&nbsp;
        <strong>LLM:</strong> OpenAI / OpenRouter &nbsp;|&nbsp;
        <strong>API:</strong> Google Ads API v18 &nbsp;|&nbsp;
        <strong>Auth:</strong> JWT + bcrypt
      </div>
    </div>
  `;
}

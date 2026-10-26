# AdPilot

### De una conversación a una campaña de Google Ads.

AdPilot es un copiloto de publicidad digital en español. Ayuda a transformar un objetivo comercial en una propuesta de campaña, revisarla y gestionarla a través de la API de Google Ads. Reúne creación conversacional, métricas, análisis con IA y reglas de optimización en una misma aplicación.

**Proyecto de [Diego Dell’Agostino](https://diegodella.ar)** · MVP en desarrollo · JavaScript / Node.js

[Producto](#qué-resuelve) · [Funciones](#funciones) · [Instalación](#instalación-local) · [Configuración](#configuración) · [Documentación](#documentación)

---

## Qué resuelve

Crear una campaña requiere convertir información del negocio en decisiones sobre presupuesto, palabras clave, anuncios y segmentación. Después hay que revisar resultados y decidir qué cambiar.

AdPilot propone una interfaz conversacional para ese recorrido: el usuario describe lo que quiere lograr, el sistema pide la información que falta, genera una estructura de campaña y permite revisarla antes de ejecutarla.

> **Ejemplo de entrada:** “Quiero conseguir consultas para mi negocio en Buenos Aires. Tengo un presupuesto diario definido y esta es mi página de destino”.

La propuesta combina criterio de producto y marketing con desarrollo asistido por IA. El foco inicial es Google Ads; las referencias a otros canales en el pitch corresponden a posibles expansiones.

## Funciones

| Área | Qué incluye el código |
| --- | --- |
| **Creación por chat** | Flujo de relevamiento, aclaración, generación de una estructura JSON, revisión y confirmación de campaña. |
| **Gestión de campañas** | Integración con Google Ads para crear y administrar campañas, grupos de anuncios, anuncios y palabras clave. |
| **Dashboard** | Sincronización de métricas a demanda, resúmenes de 7 y 30 días y gráficos de gasto y conversiones. |
| **Análisis con IA** | Conversaciones con contexto de métricas y propuestas de acciones para revisar y ejecutar. |
| **Reglas de optimización** | Condiciones sobre métricas, recomendaciones con aprobación o rechazo y opción de ejecución automática por regla. |
| **Alertas** | Detección de aumentos de CPA, caídas de CTR, gasto sin conversiones y ROAS bajo. |
| **Base de conocimiento** | Documentos y aprendizajes recuperados mediante búsqueda vectorial con pgvector. |
| **Administración** | Usuarios y roles, configuración global y por usuario, proveedores de IA y seguimiento estimado de uso de tokens. |

### Estado del proyecto

El repositorio contiene la implementación del MVP y pruebas unitarias. La configuración de credenciales, el despliegue y la prueba de punta a punta con una cuenta real de Google Ads figuran como pendientes en [el registro de tareas](tasks/todo.md).

Las funciones descritas son capacidades implementadas en el código; no representan resultados comerciales ni una certificación de funcionamiento en producción.

## Cómo funciona

1. **Describir el negocio y el objetivo.** El chat reúne presupuesto, destino, segmentación y otros datos necesarios.
2. **Revisar la propuesta.** El modelo genera una estructura de campaña que el usuario puede ajustar.
3. **Confirmar la ejecución.** El backend valida y envía las operaciones a Google Ads.
4. **Consultar resultados.** El dashboard sincroniza métricas para revisar el rendimiento.
5. **Analizar y ajustar.** El chat de análisis y el motor de reglas proponen cambios y registran su ejecución.

La sincronización y la evaluación de reglas se invocan mediante los endpoints correspondientes. El servidor actual no inicia un scheduler: para ejecución periódica hace falta un programador externo.

## Stack y estructura

| Capa | Tecnología |
| --- | --- |
| Backend | Node.js, Express, CommonJS |
| Interfaz | HTML, CSS y JavaScript con módulos ES |
| Datos | Supabase / PostgreSQL |
| Búsqueda semántica | pgvector |
| IA conversacional | OpenAI u OpenRouter, configurable |
| Publicidad | Google Ads API mediante `google-ads-api` |
| Autenticación | JWT y contraseñas con bcrypt |
| Pruebas | Jest |
| Contenedor | Docker, imagen base Node.js 20 |

| Directorio | Contenido |
| --- | --- |
| [src/routes/](src/routes/) | Endpoints de autenticación, chat, campañas, métricas y administración. |
| [src/services/](src/services/) | Lógica de conversación, IA, Google Ads, conocimiento y optimización. |
| [public/](public/) | Aplicación web, módulos del frontend, documentación y presentación. |
| [migrations/](migrations/) | Esquema y migraciones SQL. |
| [tests/](tests/) | Pruebas de servicios y utilidades. |
| [pitch/](pitch/) | Presentación del producto y documentos de trabajo. |

## Instalación local

### Requisitos

- Node.js 20, en línea con la imagen Docker del proyecto.
- Un proyecto Supabase con acceso al editor SQL y a sus credenciales de servidor.
- Una API key de OpenAI o una configuración de OpenRouter para el chat.
- Credenciales y acceso autorizado a Google Ads para operar campañas.

### 1. Clonar e instalar

```bash
git clone https://github.com/diegodella1/adpilot.git
cd adpilot
npm ci
```

### 2. Preparar las variables

Copiar [`.env.example`](.env.example) a `.env` y completar los valores propios.

En macOS / Linux:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Crear las tablas

Ejecutar los archivos de [migrations/](migrations/) en orden numérico, desde `001_initial.sql` hasta `006_leads.sql`, en el editor SQL de Supabase. La migración de conocimiento requiere la extensión `vector` (pgvector).

Las migraciones se aplican por separado: `npm start` no las ejecuta.

### 4. Iniciar

```bash
npm run dev
```

Abrir **http://localhost:3400**. Para iniciar sin modo de observación de archivos:

```bash
npm start
```

El backend incluye `POST /api/auth/setup` para crear el primer administrador cuando todavía no existen usuarios. Completar esa inicialización en un entorno controlado antes de publicar la instancia.

## Configuración

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP; por defecto, `3400`. |
| `SUPABASE_URL` | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_KEY` | Credencial de servidor para acceso a datos. El código admite `SUPABASE_ANON_KEY` como alternativa, sujeta a permisos. |
| `OPENAI_API_KEY` | Clave de OpenAI utilizada como configuración inicial del proveedor. |
| `JWT_SECRET` | Secreto propio para firmar los tokens de sesión. |
| `SETTINGS_ENCRYPTION_KEY` | Clave de 32 bytes en hexadecimal para cifrar ajustes sensibles con AES-256-GCM. |
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS, separados por comas. |

### Google Ads

Completar las variables del ejemplo o los ajustes correspondientes del panel de administración:

- `GOOGLE_ADS_CLIENT_ID` y `GOOGLE_ADS_CLIENT_SECRET`.
- `GOOGLE_ADS_DEVELOPER_TOKEN`.
- `GOOGLE_ADS_REFRESH_TOKEN`.
- `GOOGLE_ADS_CUSTOMER_ID`.
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, cuando corresponda a una cuenta administradora.

La obtención del refresh token y las autorizaciones de Google se configuran fuera de la aplicación. La compatibilidad con la API y el acceso a cada operación deben validarse con las credenciales y la cuenta elegidas.

### Proveedores de IA

El chat permite seleccionar **OpenAI** u **OpenRouter** mediante los ajustes del administrador. El proveedor, modelo y claves pueden tener valores globales y por usuario.

La base de conocimiento utiliza embeddings; revisar también su configuración antes de habilitar la búsqueda semántica. El costo estimado de tokens que muestra la aplicación se calcula con una tabla interna y puede diferir de la facturación del proveedor.

## Docker

```bash
docker build -t adpilot .
docker run --rm --env-file .env -p 3400:3400 adpilot
```

El contenedor ejecuta el servidor Express. Supabase y las APIs externas se configuran por separado. Si se cambia `PORT`, ajustar también el mapeo de puertos.

## Pruebas y diagnóstico

```bash
npm test
```

Las pruebas cubren componentes como el constructor y gestor de campañas, el servicio de IA, el optimizador, el cifrado de ajustes y los reintentos. No sustituyen una prueba de integración con Google Ads.

**`GET /health`** devuelve el estado de la conexión a Supabase y la presencia de configuración para IA y Google Ads. Los indicadores de IA y Google Ads no validan por sí solos una llamada real a esos proveedores.

## Operación

AdPilot puede modificar campañas y presupuestos en la cuenta conectada. Conviene validar primero el flujo con una cuenta de prueba y revisar las reglas antes de habilitar `auto_execute`.

Mantener las credenciales en el servidor, usar secretos propios, configurar el cifrado de ajustes y restringir los orígenes antes de exponer una instancia. El cifrado de ajustes sensibles depende de que `SETTINGS_ENCRYPTION_KEY` esté configurada.

## Documentación

- [Documentación de API en HTML](public/docs.html), disponible en `/docs` al ejecutar la aplicación.
- [Presentación en HTML](public/pitch.html), disponible en `/pitch`.
- [Pitch y documentos de producto](pitch/README.md).
- [Estado y tareas pendientes](tasks/todo.md).

---

Creado por **[Diego Dell’Agostino](https://diegodella.ar)**.

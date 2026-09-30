# ¿Cómo Pago en Venezuela? 🇻🇪 💵

[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-10b981.svg)](site.webmanifest)
[![Vanilla JS](https://img.shields.io/badge/JS-ES6%20Modules-f7df1e.svg)](js/app.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20CSS%2FJS)-6366f1.svg)](css/main.css)
[![API Status](https://img.shields.io/badge/API-api--dolar.leandrus.net-3b82f6.svg)](https://api-dolar.leandrus.net)

Una herramienta web moderna, rápida y progresiva (PWA) de código abierto diseñada para comparar al instante las alternativas de pago cotidianas en Venezuela: **Tasa Oficial (BCV)**, **Dólares Físicos en Efectivo (Tasa Promedio)** y transferencias en **Binance USDT**.

🌐 **Sitio Web Oficial:** [https://como-pago.leandrus.net](https://como-pago.leandrus.net)  
⚡ **API de Tasas:** [https://api-dolar.leandrus.net](https://api-dolar.leandrus.net)

---

## ✨ Características Principales

- **Conexión en Vivo con API Dólar:** Consulta automática y en segundo plano de las cotizaciones oficiales del BCV y paralelo/P2P desde `https://api-dolar.leandrus.net/v1/dolares`.
- **Análisis de Conveniencia:** Identifica con precisión qué método de pago representa el menor desembolso en Bolívares (VES), indicando el porcentaje y monto exacto de ahorro en Bolívares y Dólares equivalentes.
- **Equivalencia Instantánea en USDT:** Calcula el monto exacto necesario a transferir mediante Binance P2P / criptoactivos para cubrir la opción más económica.
- **PWA & Soporte Offline:** Funciona como una aplicación nativa instalable en Android, iOS y escritorio con caché mediante Service Worker (`sw.js`).
- **Gestor de Consentimiento (CMP):** Sistema de gestión de consentimiento respetuoso de la privacidad (cumplimiento GDPR / CCPA / normativas iberoamericanas), con banner informativo y modal granular de preferencias.
- **Privacidad por Diseño:** Cero recopilación de datos de identificación personal. Todos los estados y cotizaciones se conservan exclusivamente en el almacenamiento local del dispositivo (`LocalStorage`).
- **Andamiaje Legal Completo:** Páginas independientes y modales integrados para Términos de Uso, Política de Privacidad, Política de Cookies y Descargo de Responsabilidad.
- **Suite Integral de Indexación y LLMs:**
  - `sitemap.xml` y `robots.txt` para motores de búsqueda.
  - Marcado estructurado Schema.org (`WebApplication` y `FinancialApplication`).
  - Metadatos enriquecidos OpenGraph y Twitter Cards.
  - `llms.txt` y `llms-full.txt` optimizados para asistentes de Inteligencia Artificial (Perplexity, ChatGPT, Claude, Gemini).
  - RFC 9116 `.well-known/security.txt` para reporte responsable de seguridad.
- **100% Responsivo:** Diseño ergonómico mobile-first con escalado impecable a tablets y monitores ultra panorámicos, estética de modo oscuro elegante (Slate & Deep Navy), acentos semánticos y micro-animaciones fluidas.
- **Cero Dependencias Externas:** Construido con Vanilla CSS puro y JavaScript Modular nativo (sin frameworks pesados ni dependencias de CDN).

---

## 📐 Lógica Financiera y Fórmulas Matemáticas

1. **Tasa Promedio para Dólares Físicos (Efectivo):**
   ```math
   \text{Tasa Promedio} = \left(\frac{\text{BCV} + \text{USDT}}{2}\right) \times 1.10
   ```
   *(Representa el promedio simple entre la tasa oficial y la de mercado, con un 10% referencial por la prima de liquidez del efectivo. Puede ser editada libremente por el usuario).*

2. **Diferencial de Tasas:**
   ```math
   \Delta_{\text{Bs}} = \text{USDT} - \text{BCV} \qquad \Delta_{\%} = \left(\frac{\text{USDT} - \text{BCV}}{\text{BCV}}\right) \times 100
   ```

3. **Costo en Bolívares:**
   ```math
   \text{Costo}_{\text{Oficial}} = \text{Precio USD} \times \text{Tasa}_{\text{BCV}}
   ```
   ```math
   \text{Costo}_{\text{Efectivo}} = \text{Precio USD} \times \text{Tasa}_{\text{Promedio}}
   ```

4. **Equivalente USDT (Binance P2P):**
   ```math
   \text{Monto USDT} = \frac{\min(\text{Costo}_{\text{Oficial}}, \text{Costo}_{\text{Efectivo}})}{\text{Tasa}_{\text{USDT}}}
   ```

---

## 📁 Estructura del Proyecto

```text
Como-Pago/
├── .htaccess                 # Cabeceras de seguridad CSP, HSTS, compresión y caché
├── .gitignore                # Exclusiones de control de versiones
├── .well-known/
│   └── security.txt          # Política de divulgación de seguridad RFC 9116
├── css/
│   ├── main.css              # Sistema de diseño, tokens, layout y responsividad
│   ├── consent.css           # Estilos del Gestor de Consentimiento (CMP)
│   └── legal.css             # Estilos para páginas de lectura legal
├── icons/
│   ├── favicon.png           # Favicon estándar
│   ├── favico.svg            # Favicon vectorial SVG
│   ├── icon-192x192.png      # Icono PWA para pantalla de inicio
│   └── icon-512x512.png      # Icono PWA Splash Screen y OpenGraph
├── js/
│   ├── api.js                # Cliente REST con reintentos y caché offline
│   ├── calculator.js         # Lógica matemática pura y conversiones
│   ├── consent.js            # Sistema CMP de cookies y consentimiento
│   ├── pwa.js                # Registro de Service Worker y detector de red
│   └── app.js                # Controlador principal del DOM y persistencia
├── legal/
│   ├── terminos.html         # Términos y Condiciones de Uso
│   ├── privacidad.html       # Política de Privacidad y Cero Recolección
│   ├── cookies.html          # Política de Cookies y Almacenamiento Local
│   └── aviso-legal.html      # Aviso Legal y Descargo Financiero
├── index.html                # Interfaz principal SPA y marcado semántico
├── manifest.json             # Manifiesto de Aplicación Web (PWA)
├── site.webmanifest          # Alias estándar W3C para PWA
├── sw.js                     # Service Worker con caché offline
├── robots.txt                # Directivas para rastreadores web y bots de IA
├── sitemap.xml               # Mapa de sitio XML para SEO
├── llms.txt                  # Especificación resumida para asistentes de IA
├── llms-full.txt             # Documentación exhaustiva para LLMs
├── LICENSE                   # Licencia de código abierto MIT
├── SECURITY.md               # Política de seguridad en GitHub
└── README.md                 # Este documento
```

---

## 🚀 Despliegue y Ejecución Local

Dado que la aplicación está construida enteramente con tecnologías web estándar (HTML5, Vanilla CSS y ES6 Modules), **no requiere ningún paso de compilación ni instalación de paquetes pesados de npm**.

### Opción 1: Servidor Local Rápido (Python)
```bash
# Python 3
python -m http.server 8000
```
Luego abre tu navegador en `http://localhost:8000`.

### Opción 2: Node.js (npx serve o live-server)
```bash
npx -y serve .
```

### Opción 3: Servidor Web de Producción (Apache / Nginx / Caddy)
Simplemente coloca los archivos en el directorio raíz o virtual host (`/var/www/como-pago`). El archivo `.htaccess` incluido activará de manera automática las cabeceras de seguridad CSP, HSTS, tipos MIME y compresión Gzip.

---

## 🔒 Arquitectura de Seguridad

- **Content Security Policy (CSP):** Bloquea inyección de scripts externos maliciosos; restringe conexiones únicamente al origen y al endpoint de la API oficial `https://api-dolar.leandrus.net`.
- **Cabeceras HTTP Defensivas:**
  - `X-Frame-Options: DENY` (Mitigación total de Clickjacking).
  - `X-Content-Type-Options: nosniff` (Previene ataques de confusión de tipos MIME).
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy` (Bloqueo preventivo de cámara, micrófono y geolocalización).
- **Divulgación Responsable:** Archivo estandarizado `.well-known/security.txt` conforme a la especificación [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).

---

## ⚖️ Aviso Legal

Este proyecto es una iniciativa comunitaria de código abierto con fines meramente matemáticos, educativos y referenciales. No brinda asesoramiento financiero, tributario ni legal, ni realiza intermediación bancaria o cambiaria.

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

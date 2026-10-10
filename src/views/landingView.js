/**
 * Public Landing Page View for Hydra Torrents
 */

function renderLandingPage({ manifestUrl, addonName, version, description }) {
  const stremioProtocolUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  const stremioWebUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${addonName} - Stremio Addon Oficial</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #07090e;
      --card-bg: rgba(18, 24, 38, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --violet: #8b5cf6;
      --violet-glow: rgba(139, 92, 246, 0.25);
      --cyan: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(circle at 20% 15%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 80% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 45%),
        radial-gradient(circle at 50% 80%, rgba(6, 182, 212, 0.1) 0%, transparent 50%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      min-height: 100vh;
      line-height: 1.6;
      overflow-x: hidden;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-badge {
      display: flex;
      align-items: center;
      gap: 1rem;
      text-decoration: none;
      color: inherit;
    }

    .logo-img {
      width: 44px;
      height: 44px;
      filter: drop-shadow(0 0 12px var(--emerald-glow));
    }

    .logo-text h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #10b981 0%, #8b5cf6 50%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .logo-text span {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .header-nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .btn-admin {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 0.6rem 1.2rem;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-admin:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .hero {
      text-align: center;
      padding: 2.5rem 0 3.5rem;
    }

    .pill-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 1rem;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }

    .hero h2 {
      font-size: clamp(2.2rem, 5vw, 3.8rem);
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -1px;
      margin-bottom: 1.25rem;
      background: linear-gradient(180deg, #ffffff 30%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: clamp(1.05rem, 2vw, 1.25rem);
      color: var(--text-muted);
      max-width: 680px;
      margin: 0 auto 2.5rem;
      line-height: 1.6;
    }

    .cta-group {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 3rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      padding: 0.9rem 2rem;
      border-radius: 12px;
      font-size: 1.05rem;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 8px 24px var(--emerald-glow);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(16, 185, 129, 0.4);
    }

    .btn-secondary {
      background: rgba(139, 92, 246, 0.12);
      border: 1px solid rgba(139, 92, 246, 0.4);
      color: #c4b5fd;
      padding: 0.9rem 1.8rem;
      border-radius: 12px;
      font-size: 1.05rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
    }

    .btn-secondary:hover {
      background: rgba(139, 92, 246, 0.2);
      border-color: #8b5cf6;
      color: #fff;
    }

    .manifest-box {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1rem 1.25rem;
      max-width: 680px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      backdrop-filter: blur(10px);
    }

    .manifest-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      color: #38bdf8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-copy {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: #38bdf8;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .btn-copy:hover {
      background: rgba(56, 189, 248, 0.25);
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin: 4.5rem 0;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.75rem;
      backdrop-filter: blur(12px);
      transition: all 0.3s ease;
    }

    .card:hover {
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-3px);
    }

    .card-icon {
      font-size: 2rem;
      margin-bottom: 1rem;
      display: inline-block;
    }

    .card h3 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: #f1f5f9;
    }

    .card p {
      color: var(--text-muted);
      font-size: 0.92rem;
      line-height: 1.55;
    }

    .guide-section {
      background: rgba(18, 24, 38, 0.5);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 2.5rem;
      margin-top: 3rem;
    }

    .guide-section h3 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .steps-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
    }

    .step-item {
      position: relative;
    }

    .step-number {
      font-size: 1.8rem;
      font-weight: 800;
      color: #334155;
      margin-bottom: 0.5rem;
    }

    .step-item h4 {
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      color: #e2e8f0;
    }

    .step-item p {
      font-size: 0.875rem;
      color: var(--text-muted);
    }

    footer {
      margin-top: 5rem;
      padding-top: 2rem;
      border-top: 1px solid var(--card-border);
      text-align: center;
      color: #64748b;
      font-size: 0.85rem;
    }

    footer a {
      color: #94a3b8;
      text-decoration: none;
    }

    footer a:hover {
      color: #f8fafc;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #10b981;
      color: white;
      padding: 0.8rem 1.4rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.9rem;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      pointer-events: none;
      z-index: 1000;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="/" class="logo-badge">
        <img src="/favicon.svg" alt="Hydra Logo" class="logo-img">
        <div class="logo-text">
          <h1>HYDRA TORRENTS</h1>
          <span>VAULT & CURATED STREAMS</span>
        </div>
      </a>
      <div class="header-nav">
        <a href="/admin" class="btn-admin">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Panel de Administración
        </a>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="pill-tag">
          <span>✨</span> Contenido Exclusivo & Rarezas v${version}
        </div>
        <h2>Dramas Asiáticos, Animes & Rarezas Curadas</h2>
        <p>
          El Addon definitivo de Stremio especializado en producciones exclusivas de 
          <strong>Viki</strong>, <strong>iQiyi</strong>, gemas de Europa y América, y animes en la máxima calidad con subtítulos y doblaje latino.
        </p>

        <div class="cta-group">
          <a href="${stremioProtocolUrl}" class="btn-primary" id="btn-install">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            Instalar en Stremio
          </a>
          <a href="${stremioWebUrl}" target="_blank" rel="noopener" class="btn-secondary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
            Abrir en Stremio Web
          </a>
        </div>

        <div class="manifest-box">
          <span class="manifest-url" id="manifest-text">${manifestUrl}</span>
          <button class="btn-copy" onclick="copyManifest()">Copiar URL</button>
        </div>
      </section>

      <section class="features-grid">
        <div class="card">
          <span class="card-icon">🎎</span>
          <h3>Dramas Viki & iQiyi</h3>
          <p>K-Dramas, C-Dramas y series asiáticas exclusivas difícilmente indexadas en motores convencionales, curadas manualmente con audio dual y subtítulos fieles en español.</p>
        </div>

        <div class="card">
          <span class="card-icon">⚔️</span>
          <h3>Anime Vault</h3>
          <p>Episodios y películas BDRip en 1080p y 4K con opciones de audio Latino, Japonés original y multi-subtítulos limpios.</p>
        </div>

        <div class="card">
          <span class="card-icon">🎬</span>
          <h3>Cine Raro & Europeo</h3>
          <p>Obras maestras de autor, restauraciones Criterion en 4K UHD, clásicos europeos y películas de culto ausentes en las plataformas principales.</p>
        </div>

        <div class="card">
          <span class="card-icon">⚡</span>
          <h3>Infraestructura de Alto Rendimiento</h3>
          <p>Alojado en Vercel Serverless con backend en PostgreSQL Layerbase para resolver peticiones de streaming en milisegundos con alta disponibilidad.</p>
        </div>
      </section>

      <section class="guide-section">
        <h3>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          ¿Cómo agregar a Stremio en 3 pasos?
        </h3>
        <div class="steps-list">
          <div class="step-item">
            <div class="step-number">01</div>
            <h4>Haz clic en Instalar</h4>
            <p>Pulsa el botón "Instalar en Stremio" arriba o copia el enlace del manifiesto al portapapeles.</p>
          </div>
          <div class="step-item">
            <div class="step-number">02</div>
            <h4>Confirma en Stremio</h4>
            <p>Tu aplicación de Stremio (Desktop, Android o Web) se abrirá automáticamente pidiendo confirmación para activar <strong>Hydra Torrents</strong>.</p>
          </div>
          <div class="step-item">
            <div class="step-number">03</div>
            <h4>Disfruta del Catálogo</h4>
            <p>Busca tus títulos favoritos o navega por los nuevos catálogos exclusivos agregados a tu pantalla de inicio.</p>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <p>Hydra Torrents &copy; 2026 • Servidor Serverless para Stremio • Desarrollado con Node.js & PostgreSQL</p>
      <p style="margin-top: 0.5rem;"><a href="/admin">Acceso Administrativo (Secret Token)</a></p>
    </footer>
  </div>

  <div class="toast" id="toast">¡Enlace del Manifiesto copiado!</div>

  <script>
    function copyManifest() {
      const text = document.getElementById('manifest-text').innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToast('¡URL del Manifiesto copiada al portapapeles!');
      }).catch(() => {
        showToast('Error al copiar enlace.');
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderLandingPage
};

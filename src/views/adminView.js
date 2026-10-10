/**
 * Integrated Web Admin Panel View for Hydra Torrents
 * Single Page Application with Zero Build Dependencies
 */

function renderAdminPage({ manifestUrl, defaultSecret, isDefaultSecret }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hydra Torrents - Panel de Control & Vault Admin</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --surface: #0e131f;
      --surface-border: rgba(255, 255, 255, 0.08);
      --surface-hover: #151d30;
      --card-bg: rgba(18, 24, 38, 0.85);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.2);
      --violet: #8b5cf6;
      --violet-glow: rgba(139, 92, 246, 0.2);
      --cyan: #06b6d4;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
    }

    /* Top Navigation */
    nav.topbar {
      background: rgba(14, 19, 31, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--surface-border);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 0.75rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: inherit;
    }

    .brand img {
      width: 32px;
      height: 32px;
      filter: drop-shadow(0 0 8px var(--emerald-glow));
    }

    .brand-title {
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #10b981, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .db-status-pill {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid var(--surface-border);
      background: rgba(15, 23, 42, 0.6);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.green { background: #10b981; box-shadow: 0 0 8px #10b981; }
    .status-dot.amber { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
    .status-dot.red { background: #f43f5e; box-shadow: 0 0 8px #f43f5e; }

    .btn-sm {
      padding: 0.45rem 0.85rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--surface-border);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-sm:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-primary-sm {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      box-shadow: 0 4px 12px var(--emerald-glow);
    }
    .btn-primary-sm:hover {
      background: linear-gradient(135deg, #059669, #047857);
    }

    /* Main Container */
    main.admin-content {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 1.5rem;
    }

    /* Metrics Overview */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent, #3b82f6);
    }

    .metric-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: 0.4rem;
    }

    .metric-value {
      font-size: 1.8rem;
      font-weight: 800;
      color: #fff;
    }

    .metric-sub {
      font-size: 0.72rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
    }

    /* Controls Bar */
    .controls-bar {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 14px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.25rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
    }

    .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .search-input-wrapper {
      position: relative;
      min-width: 260px;
    }

    .search-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--surface-border);
      color: #fff;
      padding: 0.55rem 0.85rem 0.55rem 2.2rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-family: inherit;
    }
    .search-input:focus {
      outline: none;
      border-color: var(--emerald);
      box-shadow: 0 0 0 2px var(--emerald-glow);
    }

    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      pointer-events: none;
    }

    select.filter-select {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--surface-border);
      color: var(--text);
      padding: 0.55rem 0.85rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-family: inherit;
      cursor: pointer;
    }
    select.filter-select:focus {
      outline: none;
      border-color: var(--emerald);
    }

    .action-buttons {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    /* Table Container */
    .table-container {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }

    table.vault-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }

    table.vault-table th {
      background: rgba(15, 23, 42, 0.9);
      padding: 0.85rem 1rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--surface-border);
    }

    table.vault-table td {
      padding: 0.9rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }

    table.vault-table tr:hover td {
      background: var(--surface-hover);
    }

    .title-cell {
      max-width: 380px;
    }
    .item-title {
      font-weight: 600;
      color: #fff;
      margin-bottom: 0.2rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.3rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.5rem;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .badge-viki { background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); }
    .badge-iqiyi { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-torrent { background: rgba(6, 182, 212, 0.15); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.3); }
    .badge-direct { background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-other { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }

    .badge-4k { background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 700; }
    .badge-1080p { background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 700; }
    .badge-720p { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; }

    .badge-type {
      text-transform: uppercase;
      font-size: 0.65rem;
      letter-spacing: 0.5px;
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
    }

    .id-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      color: var(--cyan);
      background: rgba(6, 182, 212, 0.1);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      display: inline-block;
      margin: 0.1rem;
    }

    .action-icons {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .icon-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      border: 1px solid var(--surface-border);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .icon-btn.delete:hover {
      background: rgba(244, 63, 94, 0.2);
      border-color: var(--rose);
      color: var(--rose);
    }

    /* Modal Styling */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      padding: 1.5rem;
    }

    .modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modal-box {
      background: #0f1626;
      border: 1px solid var(--surface-border);
      border-radius: 18px;
      width: 100%;
      max-width: 680px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
      padding: 2rem;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--surface-border);
    }

    .modal-header h3 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #fff;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.5rem;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }

    /* Form Styling */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    .form-col-span-2 { grid-column: span 2; }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }

    .form-input, .form-textarea, .form-select {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      color: #fff;
      font-family: inherit;
      font-size: 0.85rem;
    }
    .form-input:focus, .form-textarea:focus, .form-select:focus {
      outline: none;
      border-color: var(--emerald);
      box-shadow: 0 0 0 2px var(--emerald-glow);
    }

    .form-helper {
      font-size: 0.72rem;
      color: var(--text-dim);
    }

    .btn-inspector {
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.35);
      color: #c4b5fd;
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      align-self: flex-start;
      margin-top: 0.25rem;
      transition: all 0.2s;
    }
    .btn-inspector:hover {
      background: rgba(139, 92, 246, 0.25);
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.75rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--surface-border);
    }

    /* Auth Screen Gate */
    #auth-screen {
      position: fixed;
      inset: 0;
      background: var(--bg);
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .auth-card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 20px;
      max-width: 440px;
      width: 100%;
      padding: 2.5rem 2rem;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    }

    .auth-logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.25rem;
      filter: drop-shadow(0 0 16px var(--emerald-glow));
    }

    .auth-card h2 {
      font-size: 1.6rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
    }

    .auth-card p {
      font-size: 0.88rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
    }

    /* Stremio Tester Output */
    .tester-output {
      background: #090d16;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #38bdf8;
      max-height: 280px;
      overflow-y: auto;
      white-space: pre-wrap;
      margin-top: 1rem;
    }

    /* Stream Card Preview */
    .stream-preview-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.85rem;
      margin-bottom: 0.6rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--emerald);
      color: white;
      padding: 0.8rem 1.4rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.875rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      pointer-events: none;
      z-index: 1000;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.error { background: var(--rose); }

    /* Responsive */
    @media (max-width: 768px) {
      .form-grid { grid-template-columns: 1fr; }
      .form-col-span-2 { grid-column: span 1; }
      .controls-bar { flex-direction: column; align-items: stretch; }
      .search-input-wrapper { min-width: 100%; }
      .table-container { overflow-x: auto; }
    }
  </style>
</head>
<body>

  <!-- AUTHENTICATION GATE SCREEN -->
  <div id="auth-screen">
    <div class="auth-card">
      <img src="/favicon.svg" alt="Hydra" class="auth-logo">
      <h2>HYDRA VAULT</h2>
      <p>Introduce tu token <code>ADMIN_SECRET</code> para gestionar el catálogo exclusivo y los torrents.</p>

      <form id="auth-form" onsubmit="handleLogin(event)">
        <div class="form-group" style="margin-bottom: 1.25rem; text-align: left;">
          <label class="form-label" for="secret-input">Token Secreto de Administrador</label>
          <input 
            type="password" 
            id="secret-input" 
            class="form-input" 
            placeholder="Introduce tu ADMIN_SECRET" 
            required 
            autocomplete="current-password"
            value="${isDefaultSecret ? defaultSecret : ''}"
          >
          ${isDefaultSecret ? `<span class="form-helper" style="color: #f59e0b;">⚡ Modo Local/Dev: Valor sugerido pre-cargado.</span>` : ''}
        </div>
        <button type="submit" class="btn-sm btn-primary-sm" style="width: 100%; justify-content: center; padding: 0.8rem; font-size: 0.95rem;">
          Acceder al Panel de Control
        </button>
      </form>
      <div id="auth-error" style="color: var(--rose); font-size: 0.8rem; margin-top: 1rem; display: none;"></div>
    </div>
  </div>

  <!-- MAIN TOPBAR -->
  <nav class="topbar">
    <div class="brand">
      <img src="/favicon.svg" alt="Hydra Logo">
      <span class="brand-title">HYDRA VAULT</span>
      <span class="brand-badge">Torrents Admin</span>
    </div>

    <div class="nav-actions">
      <div class="db-status-pill" id="db-status-badge">
        <span class="status-dot amber" id="db-status-dot"></span>
        <span id="db-status-text">Conectando...</span>
      </div>

      <a href="/" target="_blank" class="btn-sm" title="Página pública de Stremio">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        Ver Addon
      </a>

      <button class="btn-sm" onclick="openTesterModal()" title="Simulador de Stremio">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Probar Stremio
      </button>

      <button class="btn-sm" onclick="handleLogout()" title="Cerrar sesión">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        Salir
      </button>
    </div>
  </nav>

  <!-- ADMIN CONTENT -->
  <main class="admin-content">

    <!-- METRICS CARDS -->
    <section class="metrics-grid">
      <div class="metric-card" style="--accent: #10b981;">
        <span class="metric-label">Títulos Curados</span>
        <span class="metric-value" id="metric-total">0</span>
        <span class="metric-sub">Total en hydra_vault</span>
      </div>
      <div class="metric-card" style="--accent: #8b5cf6;">
        <span class="metric-label">Dramas Asiáticos</span>
        <span class="metric-value" id="metric-dramas">0</span>
        <span class="metric-sub">Viki & iQiyi Curados</span>
      </div>
      <div class="metric-card" style="--accent: #ec4899;">
        <span class="metric-label">Anime Vault</span>
        <span class="metric-value" id="metric-anime">0</span>
        <span class="metric-sub">Kitsu / Dual / BDRip</span>
      </div>
      <div class="metric-card" style="--accent: #06b6d4;">
        <span class="metric-label">Películas & Rarezas</span>
        <span class="metric-value" id="metric-movies">0</span>
        <span class="metric-sub">Cine Europeo / Criterion</span>
      </div>
      <div class="metric-card" style="--accent: #f59e0b;">
        <span class="metric-label">Promedio de Seeders</span>
        <span class="metric-value" id="metric-seeds">0</span>
        <span class="metric-sub">Salud de la red swarm</span>
      </div>
    </section>

    <!-- CONTROLS & FILTER BAR -->
    <section class="controls-bar">
      <div class="filter-group">
        <div class="search-input-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="filter-search" class="search-input" placeholder="Buscar por título, tt..., TMDb, Kitsu..." oninput="debounceSearch()">
        </div>

        <select id="filter-type" class="filter-select" onchange="loadEntries()">
          <option value="all">Todos los Tipos</option>
          <option value="drama">Dramas (Viki / iQiyi)</option>
          <option value="anime">Anime</option>
          <option value="movie">Películas / Rarezas</option>
          <option value="series">Series</option>
        </select>

        <select id="filter-platform" class="filter-select" onchange="loadEntries()">
          <option value="all">Todas las Plataformas</option>
          <option value="Viki">Viki</option>
          <option value="iQiyi">iQiyi</option>
          <option value="Torrent">Torrent</option>
          <option value="Direct">Direct Stream</option>
          <option value="Europa">Europa</option>
          <option value="América">América</option>
        </select>

        <select id="filter-sort" class="filter-select" onchange="loadEntries()">
          <option value="newest">Más recientes</option>
          <option value="oldest">Más antiguos</option>
          <option value="seeders">Mayor número de Seeds</option>
          <option value="title">Título A-Z</option>
        </select>
      </div>

      <div class="action-buttons">
        <button class="btn-sm btn-primary-sm" onclick="openCreateModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          + Nueva Entrada
        </button>
        <button class="btn-sm" onclick="openBulkModal()" title="Importar varios registros">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>
          Importar
        </button>
        <button class="btn-sm" onclick="seedSampleData()" title="Cargar catálogo inicial de ejemplo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Cargar Ejemplos
        </button>
      </div>
    </section>

    <!-- DATA TABLE -->
    <section class="table-container">
      <table class="vault-table">
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th>Título & Contenido</th>
            <th>Plataforma</th>
            <th>Identificadores</th>
            <th>Calidad & Audio</th>
            <th>Tamaño & Seeds</th>
            <th style="width: 130px; text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody id="vault-table-body">
          <tr>
            <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
              Cargando catálogo desde PostgreSQL Layerbase...
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- PAGINATION INFO -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted);">
      <span id="pagination-info">Mostrando 0 de 0 entradas</span>
      <div id="pagination-controls" style="display: flex; gap: 0.5rem;"></div>
    </div>
  </main>

  <!-- CREATE / EDIT MODAL -->
  <div class="modal-overlay" id="entry-modal">
    <div class="modal-box">
      <div class="modal-header">
        <h3 id="modal-title">Agregar Contenido al Vault</h3>
        <button class="modal-close" onclick="closeEntryModal()">&times;</button>
      </div>

      <form id="entry-form" onsubmit="saveEntry(event)">
        <input type="hidden" id="entry-id">

        <div class="form-grid">
          <!-- Title -->
          <div class="form-group form-col-span-2">
            <label class="form-label" for="entry-title">Título Descriptivo para Stremio *</label>
            <input type="text" id="entry-title" class="form-input" placeholder="Ej: The Glory S01 1080p Viki WebRip Dual Latino" required>
            <span class="form-helper">Se mostrará en la lista de streams y en el catálogo del addon.</span>
          </div>

          <!-- Magnet or URL -->
          <div class="form-group form-col-span-2">
            <label class="form-label" for="entry-magnet">Enlace Magnet o URL Directa *</label>
            <textarea id="entry-magnet" class="form-textarea" rows="3" placeholder="magnet:?xt=urn:btih:... o https://..." required></textarea>
            <button type="button" class="btn-inspector" onclick="inspectMagnet()">
              ⚡ Auto-Inspeccionar Magnet (Rellenar Datos)
            </button>
          </div>

          <!-- Type -->
          <div class="form-group">
            <label class="form-label" for="entry-type">Tipo de Contenido *</label>
            <select id="entry-type" class="form-select" required>
              <option value="drama">Drama Asiático (Viki / iQiyi)</option>
              <option value="anime">Anime</option>
              <option value="series">Serie General</option>
              <option value="movie">Película / Rareza</option>
            </select>
          </div>

          <!-- Platform -->
          <div class="form-group">
            <label class="form-label" for="entry-platform">Plataforma de Origen</label>
            <input type="text" id="entry-platform" class="form-input" list="platform-options" placeholder="Viki, iQiyi, Torrent, Direct...">
            <datalist id="platform-options">
              <option value="Viki">
              <option value="iQiyi">
              <option value="Torrent">
              <option value="Direct">
              <option value="Europa">
              <option value="América">
            </datalist>
          </div>

          <!-- Quality -->
          <div class="form-group">
            <label class="form-label" for="entry-quality">Calidad de Video</label>
            <select id="entry-quality" class="form-select">
              <option value="1080p">1080p Full HD</option>
              <option value="4K">4K UHD / 2160p</option>
              <option value="720p">720p HD</option>
              <option value="Remux">Remux / BluRay</option>
            </select>
          </div>

          <!-- Audio / Language -->
          <div class="form-group">
            <label class="form-label" for="entry-audio">Idioma / Subtítulos</label>
            <input type="text" id="entry-audio" class="form-input" placeholder="Latino, Sub Español, Jap/Sub, Multi..." value="Latino">
          </div>

          <!-- Size -->
          <div class="form-group">
            <label class="form-label" for="entry-size">Tamaño Estimado</label>
            <input type="text" id="entry-size" class="form-input" placeholder="Ej: 1.4 GB, 450 MB" value="N/D">
          </div>

          <!-- Seeders -->
          <div class="form-group">
            <label class="form-label" for="entry-seeders">Seeders Iniciales</label>
            <input type="number" id="entry-seeders" class="form-input" value="10" min="0">
          </div>

          <!-- IMDb ID -->
          <div class="form-group">
            <label class="form-label" for="entry-imdb">IMDb ID (tt...)</label>
            <input type="text" id="entry-imdb" class="form-input" placeholder="tt21344706 o tt21344706:1:1">
          </div>

          <!-- TMDb ID -->
          <div class="form-group">
            <label class="form-label" for="entry-tmdb">TMDb ID</label>
            <input type="text" id="entry-tmdb" class="form-input" placeholder="136283">
          </div>

          <!-- Kitsu ID -->
          <div class="form-group">
            <label class="form-label" for="entry-kitsu">Kitsu ID (Anime)</label>
            <input type="text" id="entry-kitsu" class="form-input" placeholder="41370">
          </div>

          <!-- AniList ID -->
          <div class="form-group">
            <label class="form-label" for="entry-anilist">AniList ID</label>
            <input type="text" id="entry-anilist" class="form-input" placeholder="101922">
          </div>

          <!-- Custom ID -->
          <div class="form-group form-col-span-2">
            <label class="form-label" for="entry-custom">ID Personalizado (Opcional)</label>
            <input type="text" id="entry-custom" class="form-input" placeholder="Ej: viki-the-glory-ep1">
            <span class="form-helper">Permite buscar o reproducir directamente por este identificador en Stremio.</span>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-sm" onclick="closeEntryModal()">Cancelar</button>
          <button type="submit" class="btn-sm btn-primary-sm" id="btn-save">Guardar en Base de Datos</button>
        </div>
      </form>
    </div>
  </div>

  <!-- STREMIO TESTER MODAL -->
  <div class="modal-overlay" id="tester-modal">
    <div class="modal-box" style="max-width: 720px;">
      <div class="modal-header">
        <h3>Simulador de Consultas Stremio</h3>
        <button class="modal-close" onclick="closeTesterModal()">&times;</button>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        Introduce cualquier identificador (IMDb, Kitsu, TMDb o Custom) para verificar exactamente qué stream responderá el Addon a Stremio.
      </p>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Tipo de Recurso</label>
          <select id="test-type" class="form-select">
            <option value="series">series</option>
            <option value="movie">movie</option>
            <option value="anime">anime</option>
            <option value="drama">drama</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Identificador Stremio (ID)</label>
          <input type="text" id="test-id" class="form-input" placeholder="Ej: tt21344706, kitsu:41370:1, hydra:1" value="tt21344706">
        </div>
      </div>

      <div style="margin-top: 1rem;">
        <button class="btn-sm btn-primary-sm" onclick="runStremioTest()">
          ⚡ Ejecutar Consulta de Streaming
        </button>
      </div>

      <div id="test-preview-container" style="margin-top: 1.25rem; display: none;">
        <div style="font-size: 0.8rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">
          Vista Previa de Tarjetas en Stremio:
        </div>
        <div id="test-cards-wrapper"></div>
      </div>

      <div style="margin-top: 1rem;">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">
          Respuesta JSON Oficial de Stremio:
        </div>
        <pre class="tester-output" id="test-json-output">Presiona "Ejecutar Consulta" para simular la petición de Stremio...</pre>
      </div>
    </div>
  </div>

  <!-- BULK IMPORT MODAL -->
  <div class="modal-overlay" id="bulk-modal">
    <div class="modal-box" style="max-width: 650px;">
      <div class="modal-header">
        <h3>Importación Masiva de Torrents</h3>
        <button class="modal-close" onclick="closeBulkModal()">&times;</button>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        Pega un arreglo en formato JSON con la lista de contenidos que deseas agregar a Layerbase PostgreSQL.
      </p>

      <textarea id="bulk-json" class="form-textarea" rows="10" placeholder='[
  {
    "title": "My KDrama 1080p Viki Latino",
    "magnet": "magnet:?xt=urn:btih:...",
    "type": "drama",
    "source_platform": "Viki",
    "imdb_id": "tt1234567",
    "quality": "1080p",
    "audio_lang": "Latino",
    "size": "1.4 GB",
    "seeders": 30
  }
]'></textarea>

      <div class="modal-actions">
        <button type="button" class="btn-sm" onclick="loadBulkTemplate()">Cargar Plantilla de Ejemplo</button>
        <button type="button" class="btn-sm btn-primary-sm" onclick="executeBulkImport()">Ejecutar Importación</button>
      </div>
    </div>
  </div>

  <!-- TOAST FEEDBACK -->
  <div class="toast" id="toast">Mensaje de notificación</div>

  <!-- JAVASCRIPT LOGIC -->
  <script>
    let authToken = localStorage.getItem('hydra_admin_secret') || '';
    let currentPage = 1;
    let searchTimeout = null;

    // Check Authentication on Page Load
    document.addEventListener('DOMContentLoaded', () => {
      if (authToken) {
        verifyAndLoad(authToken);
      } else {
        showAuthScreen();
      }
    });

    function showAuthScreen() {
      document.getElementById('auth-screen').style.display = 'flex';
    }

    function hideAuthScreen() {
      document.getElementById('auth-screen').style.display = 'none';
    }

    async function handleLogin(e) {
      e.preventDefault();
      const input = document.getElementById('secret-input').value.trim();
      if (!input) return;

      const errEl = document.getElementById('auth-error');
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: input })
        });
        const data = await res.json();

        if (data.valid) {
          authToken = input;
          localStorage.setItem('hydra_admin_secret', authToken);
          hideAuthScreen();
          initDashboard();
        } else {
          errEl.innerText = 'Token ADMIN_SECRET incorrecto. Verifica tus variables de entorno.';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.innerText = 'Error de conexión con el servidor: ' + err.message;
        errEl.style.display = 'block';
      }
    }

    async function verifyAndLoad(token) {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.valid) {
          hideAuthScreen();
          initDashboard();
        } else {
          localStorage.removeItem('hydra_admin_secret');
          showAuthScreen();
        }
      } catch (err) {
        // If offline or error, try loading dashboard
        hideAuthScreen();
        initDashboard();
      }
    }

    function handleLogout() {
      localStorage.removeItem('hydra_admin_secret');
      authToken = '';
      showAuthScreen();
    }

    function initDashboard() {
      checkDbHealth();
      loadStats();
      loadEntries();
      setInterval(checkDbHealth, 30000);
    }

    // Health & DB status
    async function checkDbHealth() {
      const dot = document.getElementById('db-status-dot');
      const text = document.getElementById('db-status-text');

      try {
        const res = await fetch('/api/health');
        const data = await res.json();

        if (data.mode === 'postgres' && data.connected) {
          dot.className = 'status-dot green';
          text.innerText = 'Layerbase PostgreSQL (' + (data.latencyMs || 0) + 'ms)';
        } else if (data.mode === 'memory' || data.mode === 'memory_fallback') {
          dot.className = 'status-dot amber';
          text.innerText = 'Modo Memoria / Mock (Configura LAYERBASE_DATABASE_URL)';
        } else {
          dot.className = 'status-dot red';
          text.innerText = 'Error en Base de Datos';
        }
      } catch (e) {
        dot.className = 'status-dot red';
        text.innerText = 'Servidor sin conexión';
      }
    }

    // Load Metrics
    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('metric-total').innerText = data.total || 0;
        document.getElementById('metric-dramas').innerText = (data.byType && data.byType.drama) || 0;
        document.getElementById('metric-anime').innerText = (data.byType && data.byType.anime) || 0;
        document.getElementById('metric-movies').innerText = ((data.byType && data.byType.movie) || 0) + ((data.byType && data.byType.series) || 0);
        document.getElementById('metric-seeds').innerText = data.avgSeeders || 0;
      } catch (err) {
        console.error('Error loading stats:', err);
      }
    }

    // Load Entries Table
    async function loadEntries(page = 1) {
      currentPage = page;
      const search = document.getElementById('filter-search').value.trim();
      const type = document.getElementById('filter-type').value;
      const platform = document.getElementById('filter-platform').value;
      const sort = document.getElementById('filter-sort').value;

      const params = new URLSearchParams({
        page,
        limit: 50,
        sort
      });
      if (search) params.append('search', search);
      if (type !== 'all') params.append('type', type);
      if (platform !== 'all') params.append('platform', platform);

      const tbody = document.getElementById('vault-table-body');
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Consultando hydra_vault...</td></tr>';

      try {
        const res = await fetch('/api/vault?' + params.toString());
        const data = await res.json();

        renderTable(data.entries || []);
        renderPagination(data.total || 0, data.page || 1, data.totalPages || 1);
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--rose); padding: 2rem;">Error al cargar datos: ' + err.message + '</td></tr>';
      }
    }

    function renderTable(entries) {
      const tbody = document.getElementById('vault-table-body');
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">No se encontraron contenidos con los filtros seleccionados.</td></tr>';
        return;
      }

      tbody.innerHTML = entries.map(item => {
        let platClass = 'badge-other';
        if (item.source_platform === 'Viki') platClass = 'badge-viki';
        else if (item.source_platform === 'iQiyi') platClass = 'badge-iqiyi';
        else if (item.source_platform === 'Torrent') platClass = 'badge-torrent';
        else if (item.source_platform === 'Direct') platClass = 'badge-direct';

        let qClass = 'badge-1080p';
        if (item.quality === '4K') qClass = 'badge-4k';
        else if (item.quality === '720p') qClass = 'badge-720p';

        const ids = [];
        if (item.imdb_id) ids.push('<span class="id-tag">imdb:' + escapeHtml(item.imdb_id) + '</span>');
        if (item.kitsu_id) ids.push('<span class="id-tag">kitsu:' + escapeHtml(item.kitsu_id) + '</span>');
        if (item.tmdb_id) ids.push('<span class="id-tag">tmdb:' + escapeHtml(item.tmdb_id) + '</span>');
        if (item.custom_id) ids.push('<span class="id-tag">' + escapeHtml(item.custom_id) + '</span>');

        return '<tr>' +
          '<td><span style="font-family: monospace; color: var(--text-dim);">' + item.id + '</span></td>' +
          '<td class="title-cell">' +
            '<div class="item-title" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '</div>' +
            '<div class="badges-row">' +
              '<span class="badge badge-type">' + escapeHtml(item.type) + '</span>' +
              (item.audio_lang ? '<span class="badge" style="background: rgba(255,255,255,0.05);">' + escapeHtml(item.audio_lang) + '</span>' : '') +
            '</div>' +
          '</td>' +
          '<td><span class="badge ' + platClass + '">' + escapeHtml(item.source_platform || 'Torrent') + '</span></td>' +
          '<td>' + (ids.length > 0 ? ids.join('') : '<span style="color: var(--text-dim);">-</span>') + '</td>' +
          '<td>' +
            '<span class="badge ' + qClass + '">' + escapeHtml(item.quality || '1080p') + '</span>' +
          '</td>' +
          '<td>' +
            '<div style="font-weight: 600;">⚡ ' + (item.seeders || 0) + ' seeds</div>' +
            '<div style="font-size: 0.72rem; color: var(--text-dim);">' + escapeHtml(item.size || 'N/D') + '</div>' +
          '</td>' +
          '<td>' +
            '<div class="action-icons">' +
              '<button class="icon-btn" title="Editar entrada" onclick="openEditModal(' + item.id + ')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
              '</button>' +
              '<button class="icon-btn" title="Simular stream en Stremio" onclick="quickTestStream(\\'' + (item.imdb_id || item.kitsu_id || item.custom_id || item.id) + '\\', \\'' + item.type + '\\')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' +
              '</button>' +
              '<button class="icon-btn" title="Copiar enlace magnet" onclick="copyText(\\'' + escapeHtml(item.magnet) + '\\', \\'Magnet copiado al portapapeles\\')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
              '</button>' +
              '<button class="icon-btn delete" title="Eliminar del Vault" onclick="deleteEntry(' + item.id + ', \\'' + escapeHtml(item.title.replace(/'/g, '')) + '\\')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
              '</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function renderPagination(total, page, totalPages) {
      document.getElementById('pagination-info').innerText = 'Total: ' + total + ' entradas | Página ' + page + ' de ' + (totalPages || 1);
      const ctrls = document.getElementById('pagination-controls');

      if (totalPages <= 1) {
        ctrls.innerHTML = '';
        return;
      }

      ctrls.innerHTML = 
        '<button class="btn-sm" ' + (page <= 1 ? 'disabled style="opacity:0.4;"' : '') + ' onclick="loadEntries(' + (page - 1) + ')">Anterior</button>' +
        '<button class="btn-sm" ' + (page >= totalPages ? 'disabled style="opacity:0.4;"' : '') + ' onclick="loadEntries(' + (page + 1) + ')">Siguiente</button>';
    }

    function debounceSearch() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadEntries(1), 300);
    }

    // Modal Create / Edit
    function openCreateModal() {
      document.getElementById('entry-form').reset();
      document.getElementById('entry-id').value = '';
      document.getElementById('modal-title').innerText = 'Agregar Contenido al Vault';
      document.getElementById('btn-save').innerText = 'Guardar en Base de Datos';
      document.getElementById('entry-modal').classList.add('active');
    }

    async function openEditModal(id) {
      try {
        const res = await fetch('/api/vault/' + id);
        const item = await res.json();

        document.getElementById('entry-id').value = item.id;
        document.getElementById('entry-title').value = item.title || '';
        document.getElementById('entry-magnet').value = item.magnet || '';
        document.getElementById('entry-type').value = item.type || 'drama';
        document.getElementById('entry-platform').value = item.source_platform || 'Torrent';
        document.getElementById('entry-quality').value = item.quality || '1080p';
        document.getElementById('entry-audio').value = item.audio_lang || 'Multi';
        document.getElementById('entry-size').value = item.size || 'N/D';
        document.getElementById('entry-seeders').value = item.seeders || 10;
        document.getElementById('entry-imdb').value = item.imdb_id || '';
        document.getElementById('entry-tmdb').value = item.tmdb_id || '';
        document.getElementById('entry-kitsu').value = item.kitsu_id || '';
        document.getElementById('entry-anilist').value = item.anilist_id || '';
        document.getElementById('entry-custom').value = item.custom_id || '';

        document.getElementById('modal-title').innerText = 'Editar Entrada #' + item.id;
        document.getElementById('btn-save').innerText = 'Actualizar Entrada';
        document.getElementById('entry-modal').classList.add('active');
      } catch (err) {
        showToast('Error cargando entrada: ' + err.message, true);
      }
    }

    function closeEntryModal() {
      document.getElementById('entry-modal').classList.remove('active');
    }

    async function saveEntry(e) {
      e.preventDefault();
      const id = document.getElementById('entry-id').value;
      const payload = {
        title: document.getElementById('entry-title').value.trim(),
        magnet: document.getElementById('entry-magnet').value.trim(),
        type: document.getElementById('entry-type').value,
        source_platform: document.getElementById('entry-platform').value.trim() || 'Torrent',
        quality: document.getElementById('entry-quality').value,
        audio_lang: document.getElementById('entry-audio').value.trim(),
        size: document.getElementById('entry-size').value.trim() || 'N/D',
        seeders: parseInt(document.getElementById('entry-seeders').value, 10) || 10,
        imdb_id: document.getElementById('entry-imdb').value.trim() || null,
        tmdb_id: document.getElementById('entry-tmdb').value.trim() || null,
        kitsu_id: document.getElementById('entry-kitsu').value.trim() || null,
        anilist_id: document.getElementById('entry-anilist').value.trim() || null,
        custom_id: document.getElementById('entry-custom').value.trim() || null
      };

      const url = id ? ('/api/vault/' + id) : '/api/vault';
      const method = id ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al guardar');

        closeEntryModal();
        showToast(id ? '¡Entrada actualizada con éxito!' : '¡Nueva entrada agregada al Vault!');
        loadEntries(currentPage);
        loadStats();
      } catch (err) {
        showToast('Error: ' + err.message, true);
      }
    }

    async function deleteEntry(id, title) {
      if (!confirm('¿Estás seguro de eliminar permanentemente "' + title + '" de Layerbase PostgreSQL?')) return;

      try {
        const res = await fetch('/api/vault/' + id, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        showToast('Entrada eliminada correctamente.');
        loadEntries(currentPage);
        loadStats();
      } catch (err) {
        showToast('Error al eliminar: ' + err.message, true);
      }
    }

    // Magnet Inspector Tool
    async function inspectMagnet() {
      const magnet = document.getElementById('entry-magnet').value.trim();
      if (!magnet) {
        alert('Por favor pega primero un enlace Magnet o URL en el campo.');
        return;
      }

      try {
        const res = await fetch('/api/vault/parse-magnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnet })
        });
        const data = await res.json();

        if (data.suggestions) {
          const s = data.suggestions;
          const titleField = document.getElementById('entry-title');
          if (!titleField.value && s.title) titleField.value = s.title;

          if (s.quality) document.getElementById('entry-quality').value = s.quality;
          if (s.audio_lang) document.getElementById('entry-audio').value = s.audio_lang;
          if (s.size && s.size !== 'N/D') document.getElementById('entry-size').value = s.size;

          showToast('¡Magnet analizado! Campos auto-completados.');
        }
      } catch (err) {
        showToast('No se pudo analizar el magnet automáticamente.', true);
      }
    }

    // Stremio Interactive Tester
    function openTesterModal() {
      document.getElementById('tester-modal').classList.add('active');
    }
    function closeTesterModal() {
      document.getElementById('tester-modal').classList.remove('active');
    }

    function quickTestStream(id, type = 'series') {
      document.getElementById('test-id').value = id;
      document.getElementById('test-type').value = (type === 'drama' ? 'series' : type);
      openTesterModal();
      runStremioTest();
    }

    async function runStremioTest() {
      const type = document.getElementById('test-type').value;
      const id = document.getElementById('test-id').value.trim();
      const output = document.getElementById('test-json-output');
      const previewWrapper = document.getElementById('test-cards-wrapper');
      const previewContainer = document.getElementById('test-preview-container');

      output.innerText = 'Consultando Stremio Stream Handler...';

      try {
        const res = await fetch('/stream/' + type + '/' + encodeURIComponent(id) + '.json');
        const data = await res.json();

        output.innerText = JSON.stringify(data, null, 2);

        if (data.streams && data.streams.length > 0) {
          previewContainer.style.display = 'block';
          previewWrapper.innerHTML = data.streams.map(s => {
            return '<div class="stream-preview-card">' +
              '<div>' +
                '<div style="font-weight: 700; color: #10b981; font-size: 0.85rem;">' + escapeHtml(s.name).replace(/\\n/g, ' • ') + '</div>' +
                '<div style="font-size: 0.8rem; color: #cbd5e1; white-space: pre-line; margin-top: 0.2rem;">' + escapeHtml(s.title) + '</div>' +
              '</div>' +
              '<div style="font-family: monospace; font-size: 0.7rem; color: var(--text-dim);">' +
                (s.infoHash ? 'BTIH: ' + s.infoHash.substring(0, 12) + '...' : 'Direct URL') +
              '</div>' +
            '</div>';
          }).join('');
        } else {
          previewContainer.style.display = 'block';
          previewWrapper.innerHTML = '<div style="color: var(--amber); font-size: 0.8rem;">⚠️ No se encontraron streams para este identificador en hydra_vault.</div>';
        }
      } catch (err) {
        output.innerText = 'Error al ejecutar prueba: ' + err.message;
        previewContainer.style.display = 'none';
      }
    }

    // Bulk Import Modal
    function openBulkModal() {
      document.getElementById('bulk-modal').classList.add('active');
    }
    function closeBulkModal() {
      document.getElementById('bulk-modal').classList.remove('active');
    }

    function loadBulkTemplate() {
      const sample = [
        {
          title: "My Demon (Mi Demonio) 1080p Viki Sub Español",
          magnet: "magnet:?xt=urn:btih:d624a91a92e105e45a20340b17163c4ff9841f84&dn=My+Demon+1080p+Viki&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce",
          type: "drama",
          source_platform: "Viki",
          imdb_id: "tt29272360",
          quality: "1080p",
          audio_lang: "Sub Español",
          size: "16.4 GB",
          seeders: 50
        },
        {
          title: "Hidden Love (Amor Oculto) 4K iQiyi Latino",
          magnet: "magnet:?xt=urn:btih:a1b2c3d4e5f60718293a4b5c6d7e8f9012345678&dn=Hidden+Love+4K+Latino&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce",
          type: "drama",
          source_platform: "iQiyi",
          imdb_id: "tt28087796",
          quality: "4K",
          audio_lang: "Latino",
          size: "24.0 GB",
          seeders: 65
        }
      ];
      document.getElementById('bulk-json').value = JSON.stringify(sample, null, 2);
    }

    async function executeBulkImport() {
      const text = document.getElementById('bulk-json').value.trim();
      if (!text) return;

      let entries;
      try {
        entries = JSON.parse(text);
        if (!Array.isArray(entries)) throw new Error('El JSON debe ser un arreglo [ {...}, {...} ]');
      } catch (e) {
        alert('JSON inválido: ' + e.message);
        return;
      }

      try {
        const res = await fetch('/api/vault/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ entries })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error en importación');

        closeBulkModal();
        showToast(data.message || 'Importación completada.');
        loadEntries(1);
        loadStats();
      } catch (err) {
        showToast('Error en importación: ' + err.message, true);
      }
    }

    async function seedSampleData() {
      if (!confirm('¿Deseas poblar la base de datos con los títulos curados iniciales de Viki, iQiyi, Anime y Rarezas?')) return;

      try {
        const res = await fetch('/api/vault/seed', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });
        const data = await res.json();
        showToast(data.message || 'Catálogo curado cargado.');
        loadEntries(1);
        loadStats();
      } catch (err) {
        showToast('Error al cargar datos curados: ' + err.message, true);
      }
    }

    // Helpers
    function copyText(text, msg) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(msg || 'Copiado al portapapeles');
      }).catch(() => {
        showToast('Error al copiar', true);
      });
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.className = 'toast show' + (isError ? ' error' : '');
      setTimeout(() => {
        toast.className = 'toast';
      }, 3000);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderAdminPage
};

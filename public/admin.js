'use strict';

// ---------------------------------------------------------------------------
// Almacenamiento local (clave, preferencias y guardados recientes)
// ---------------------------------------------------------------------------
const SECRET_KEY = 'hydra_admin_secret';
const PREFS_KEY = 'hydra_admin_prefs';
const RECENT_KEY = 'hydra_admin_recent';

const store = {
  get(key, fallback = null) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === '') window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  },
  getJSON(key, fallback) {
    try {
      return JSON.parse(this.get(key)) ?? fallback;
    } catch (error) {
      return fallback;
    }
  }
};

const $ = (id) => document.getElementById(id);
const form = $('add-form');
const secretInput = $('admin-secret');
const submitButton = $('submit-button');
const statusMessage = $('form-status');
const titleInput = $('title');
const magnetInput = $('magnet');
const seasonInput = $('season');
const episodeInput = $('episode');
const episodeFields = $('episode-fields');
const episodePreview = $('episode-preview');
const linkStatus = $('link-status');
const idsHint = $('ids-hint');

function valueOf(id) {
  return $(id).value.trim();
}

function getType() {
  const checked = form.querySelector('input[name="type"]:checked');
  return checked ? checked.value : 'drama';
}

function setType(type) {
  const radio = form.querySelector(`input[name="type"][value="${type}"]`);
  if (radio && !radio.checked) {
    radio.checked = true;
    applyTypeRules();
  }
}

function setSelect(id, value) {
  const select = $(id);
  if (value && [...select.options].some(option => option.value === value)) select.value = value;
}

// ---------------------------------------------------------------------------
// Idiomas: listas con presets y opción "Otro idioma…" con campo libre
// ---------------------------------------------------------------------------
const CUSTOM_LANG = '__otro__';
const LANG_FIELDS = { audio_lang: 'audio_lang_custom', subtitles: 'subtitles_custom' };

// Muestra u oculta el campo libre según la opción elegida en el <select>.
function syncLangField(id) {
  const select = $(id);
  const custom = $(LANG_FIELDS[id]);
  if (!select || !custom) return;
  const isCustom = select.value === CUSTOM_LANG;
  custom.hidden = !isCustom;
  if (!isCustom) custom.value = '';
}

// Acepta cualquier valor: si está en la lista lo selecciona y, si no, lo escribe en el campo libre.
function setLangField(id, value) {
  const select = $(id);
  const custom = $(LANG_FIELDS[id]);
  if (!select || !custom || !value) return;
  if ([...select.options].some(option => option.value === value)) {
    select.value = value;
    custom.value = '';
  } else {
    select.value = CUSTOM_LANG;
    custom.value = value;
  }
  syncLangField(id);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = isError ? 'error' : 'ok';
  statusMessage.hidden = false;
}

// ---------------------------------------------------------------------------
// Clave de administrador
// ---------------------------------------------------------------------------
function renderSecretState(editing = false) {
  const hasSecret = Boolean(secretInput.value);
  $('key-saved').hidden = !hasSecret || editing;
  $('key-edit').hidden = hasSecret && !editing;
}

function saveSecret() {
  const value = secretInput.value.trim();
  secretInput.value = value;
  if (!store.set(SECRET_KEY, value || null)) showStatus('No se pudo guardar la clave en este navegador.', true);
  renderSecretState(false);
}

secretInput.value = store.get(SECRET_KEY, '');
renderSecretState(false);
$('save-secret').addEventListener('click', saveSecret);
secretInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveSecret();
  }
});
$('change-secret').addEventListener('click', () => {
  renderSecretState(true);
  secretInput.focus();
  secretInput.select();
});
$('forget-secret').addEventListener('click', () => {
  secretInput.value = '';
  store.set(SECRET_KEY, null);
  renderSecretState(false);
  secretInput.focus();
});

// ---------------------------------------------------------------------------
// Reglas por tipo: película (sin episodios), serie/drama (temporada + episodio), anime (capítulo)
// ---------------------------------------------------------------------------
const TYPE_RULES = {
  movie: null,
  series: {
    legend: 'Temporada y episodio',
    seasonLabel: 'Temporada *',
    episodeLabel: 'Episodio *',
    episodeTitleLabel: 'Título del episodio',
    seasonRequired: true,
    help: 'Serie: temporada y número de episodio (temporada 1, episodio 3 → T1 · E03).'
  },
  drama: {
    legend: 'Temporada y episodio',
    seasonLabel: 'Temporada *',
    episodeLabel: 'Episodio *',
    episodeTitleLabel: 'Título del episodio',
    seasonRequired: true,
    help: 'Drama: temporada y número de episodio. Si solo tiene una temporada, usa 1.'
  },
  anime: {
    legend: 'Capítulo',
    seasonLabel: 'Temporada (opcional)',
    episodeLabel: 'Capítulo *',
    episodeTitleLabel: 'Título del capítulo',
    seasonRequired: false,
    help: 'Anime: número de capítulo. Deja la temporada vacía si usas numeración absoluta o Kitsu/AniList.'
  }
};

function episodeLabel(type, season, episode) {
  if (!episode) return '';
  if (type === 'anime') return season !== '' && season !== null ? `T${season} · Cap. ${pad2(episode)}` : `Cap. ${pad2(episode)}`;
  return season !== '' && season !== null ? `T${season} · E${pad2(episode)}` : '';
}

function updateEpisodePreview() {
  const label = TYPE_RULES[getType()] ? episodeLabel(getType(), seasonInput.value.trim(), episodeInput.value.trim()) : '';
  episodePreview.hidden = !label;
  episodePreview.textContent = label ? `En Stremio: ${label}` : '';
}

function applyTypeRules() {
  const rules = TYPE_RULES[getType()];
  episodeFields.hidden = !rules;
  episodeFields.disabled = !rules;
  if (rules) {
    $('episode-legend').textContent = rules.legend;
    $('season-label').textContent = rules.seasonLabel;
    $('episode-label').textContent = rules.episodeLabel;
    $('episode-title-label').textContent = rules.episodeTitleLabel;
    $('episode-help').textContent = rules.help;
    seasonInput.required = rules.seasonRequired;
    episodeInput.required = true;
  } else {
    seasonInput.required = false;
    episodeInput.required = false;
  }
  updateEpisodePreview();
  updateIdsHint();
}

form.querySelectorAll('input[name="type"]').forEach(radio => radio.addEventListener('change', () => {
  applyTypeRules();
  // La elección manual manda: solo rellena campos vacíos y nunca cambia el tipo.
  if (TYPE_RULES[getType()]) detectEpisode(titleInput.value, false, false);
}));
seasonInput.addEventListener('input', updateEpisodePreview);
episodeInput.addEventListener('input', updateEpisodePreview);

// Botones − / +
form.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const input = $(button.dataset.step);
  const min = Number(input.min || 0);
  const current = input.value === '' ? 0 : Number(input.value);
  input.value = Math.max(min, current + Number(button.dataset.delta));
  input.removeAttribute('aria-invalid');
  updateEpisodePreview();
}));

// ---------------------------------------------------------------------------
// Detección automática desde el enlace y el título
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  return `${parseFloat((num / 1024 ** i).toFixed(1))} ${units[i]}`;
}

function parseLink(text) {
  const value = text.trim();
  if (!value) return { empty: true };
  if (/^https?:\/\/\S+$/i.test(value)) {
    let name = '';
    try {
      name = decodeURIComponent(new URL(value).pathname.split('/').pop() || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    } catch (error) { /* URL inválida: se queda sin nombre */ }
    return { valid: true, kind: 'url', name };
  }
  if (/^[a-f0-9]{40}$/i.test(value)) return { valid: true, kind: 'hash', hash: value.toLowerCase(), name: '' };
  if (/^magnet:\?/i.test(value)) {
    const params = new URLSearchParams(value.slice(value.indexOf('?') + 1));
    const xt = params.getAll('xt').find(v => /urn:btih:/i.test(v)) || '';
    const hashMatch = xt.match(/urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i);
    return {
      valid: Boolean(hashMatch),
      kind: 'magnet',
      hash: hashMatch ? hashMatch[1] : '',
      name: (params.get('dn') || '').replace(/[._]+/g, ' ').trim(),
      size: formatBytes(params.get('xl')),
      trackers: params.getAll('tr').length
    };
  }
  return { valid: false };
}

function detectEpisode(text, overwrite, allowTypeSwitch = true) {
  if (!text) return;
  let season = null;
  let episode = null;

  const sxe = text.match(/\bS(\d{1,2})\s*[-._ ]?\s*E(\d{1,4})\b/i) || text.match(/\b(\d{1,2})x(\d{1,4})\b/i);
  if (sxe) {
    season = Number(sxe[1]);
    episode = Number(sxe[2]);
  } else {
    const seasonMatch = text.match(/\b(?:temporada|season|S)\s*(\d{1,2})\b/i);
    const episodeMatch = text.match(/\b(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?|E)\.?\s*(\d{1,4})\b/i);
    const animeMatch = text.match(/\s-\s(\d{1,4})(?:v\d)?\s*(?:[[(]|$)/);
    if (seasonMatch) season = Number(seasonMatch[1]);
    if (episodeMatch) episode = Number(episodeMatch[1]);
    else if (animeMatch) episode = Number(animeMatch[1]);
  }

  // Si el título trae episodio y está marcado "Película", pasa a serie (o anime si parece fansub).
  if (allowTypeSwitch && episode !== null && getType() === 'movie') setType(/^\s*\[[^\]]+\]/.test(text) ? 'anime' : 'series');
  if (!TYPE_RULES[getType()]) return;

  if (season !== null && (overwrite || !seasonInput.value)) seasonInput.value = season;
  if (episode !== null && episode > 0 && (overwrite || !episodeInput.value)) episodeInput.value = episode;
  if (episode !== null && getType() !== 'anime' && !seasonInput.value) seasonInput.value = 1;
  updateEpisodePreview();
}

function detectDetails(text) {
  const t = text.toLowerCase();
  if (/2160p|\b4k\b|\buhd\b/.test(t)) setSelect('quality', '4K');
  else if (/remux/.test(t)) setSelect('quality', 'Remux');
  else if (/1080p/.test(t)) setSelect('quality', '1080p');
  else if (/720p/.test(t)) setSelect('quality', '720p');
  else if (/480p/.test(t)) setSelect('quality', '480p');

  // Audio: primero se descartan las marcas de subtítulos ("Sub Eng", "Eng Sub", "Multi Sub (Esp/Eng/Chn)").
  const audioText = t
    .replace(/\bsubs?\s*\([^)]*\)/g, ' ')
    .replace(/\bsubs?\s*[a-z]{2,4}\b/g, ' ')
    .replace(/\b[a-z]{2,3}\s*subs?\b/g, ' ')
    .replace(/\bsubs?\b/g, ' ')
    .replace(/\s+/g, ' ');

  if (/dual/.test(t)) setLangField('audio_lang', 'Dual Audio');
  else if (/latino|\blat\b/.test(t)) setLangField('audio_lang', 'Latino');
  else if (/castellano|\bcast\b/.test(t)) setLangField('audio_lang', 'Castellano');
  else if (/sub\s*esp|vose|subespañol|spanish\s*sub/.test(t)) setLangField('audio_lang', 'Sub Español');
  else if (/multi/.test(audioText)) setLangField('audio_lang', 'Multi');
  else if (/\bjap|japanese|japon/.test(audioText)) setLangField('audio_lang', 'Jap/Sub');
  else if (/\bkor(ean)?\b|coreano/.test(audioText)) setLangField('audio_lang', 'Coreano/Sub');
  else if (/chino?|chinese|mandarin|mandar[ií]n|canton[eé]s|cantonese|\bchs\b|\bcht\b|\bchn\b/.test(audioText)) setLangField('audio_lang', 'Chino/Sub');
  else if (/\bthai\b|tailand[eé]s/.test(audioText)) setLangField('audio_lang', 'Tailandés/Sub');
  else if (/\bhindi\b/.test(audioText)) setLangField('audio_lang', 'Hindi');
  else if (/\bingl[eé]s\b|\benglish\b|\beng\b/.test(audioText)) setLangField('audio_lang', 'Inglés');
  else if (/portugu[eê]s|portuguese|dublado|\bpt[- ]?br\b/.test(audioText)) setLangField('audio_lang', 'Portugués');
  else if (/polish|polaco|lektor|\bpl\b/.test(audioText)) setLangField('audio_lang', 'Polaco');
  else if (/franc[eé]s|french|\btruefrench\b|\bvf\b/.test(audioText)) setLangField('audio_lang', 'Francés');
  else if (/alem[aá]n|german|deutsch/.test(audioText)) setLangField('audio_lang', 'Alemán');
  else if (/\bitalian(o)?\b|\bita\b/.test(audioText)) setLangField('audio_lang', 'Italiano');
  else if (/\bruso\b|russian/.test(audioText)) setLangField('audio_lang', 'Ruso');
  else if (/\bturco\b|turkish/.test(audioText)) setLangField('audio_lang', 'Turco');
  else if (/\b[aá]rabe\b|arabic/.test(audioText)) setLangField('audio_lang', 'Árabe');

  // Subtítulos: solo cuando el título lo indica de forma clara.
  if (/sub\s*esp|subespañol|vose|spanish\s*sub/.test(t)) setLangField('subtitles', 'Español');
  else if (/\b(eng|english)\s*sub|\bsubs?\s*(eng|english)\b/.test(t)) setLangField('subtitles', 'Inglés');
  else if (/\b(chs|cht|chinese)\s*sub|\bsubs?\s*(chs|cht|chinese)\b/.test(t)) setLangField('subtitles', 'Chino');
  else if (/\bpolish\s*sub|\bsubs?\s*pol(ish)?\b/.test(t)) setLangField('subtitles', 'Polaco');

  if (/\bviki\b/.test(t)) setSelect('source_platform', 'Viki');
  else if (/iqiyi/.test(t)) setSelect('source_platform', 'iQiyi');
}

function handleLinkInput() {
  const info = parseLink(magnetInput.value);
  magnetInput.removeAttribute('aria-invalid');
  if (info.empty) {
    linkStatus.textContent = '';
    delete linkStatus.dataset.kind;
    return;
  }
  if (!info.valid) {
    linkStatus.textContent = '✗ No parece un magnet válido (falta xt=urn:btih:…), un hash de 40 caracteres ni una URL http(s).';
    linkStatus.dataset.kind = 'error';
    return;
  }

  const parts = [];
  if (info.kind === 'magnet') parts.push(`✓ Magnet válido · ${info.hash.slice(0, 8)}…`);
  if (info.kind === 'hash') parts.push('✓ Hash válido');
  if (info.kind === 'url') parts.push('✓ Enlace directo');
  if (info.size) parts.push(info.size);
  if (info.kind === 'magnet') parts.push(`${info.trackers} tracker${info.trackers === 1 ? '' : 's'}`);
  linkStatus.textContent = parts.join(' · ');
  linkStatus.dataset.kind = 'ok';

  if (info.name && (!titleInput.value.trim() || titleInput.dataset.auto === '1')) {
    titleInput.value = info.name;
    titleInput.dataset.auto = '1';
    titleInput.removeAttribute('aria-invalid');
  }
  if (info.size && (!valueOf('size') || $('size').dataset.auto === '1')) {
    $('size').value = info.size;
    $('size').dataset.auto = '1';
  }
  const source = info.name || titleInput.value;
  detectDetails(source);
  detectEpisode(source, true);
}

magnetInput.addEventListener('input', handleLinkInput);
titleInput.addEventListener('input', () => {
  titleInput.dataset.auto = '0';
  titleInput.removeAttribute('aria-invalid');
});
titleInput.addEventListener('change', () => {
  detectDetails(titleInput.value);
  detectEpisode(titleInput.value, true);
});
$('size').addEventListener('input', () => { $('size').dataset.auto = '0'; });

// ---------------------------------------------------------------------------
// Identificadores: acepta el ID o la URL completa de la ficha
// ---------------------------------------------------------------------------
function normalizeId(field, raw) {
  const text = raw.trim();
  if (!text) return '';
  if (field === 'imdb_id') {
    const match = text.match(/tt\d{5,}/i);
    return match ? match[0].toLowerCase() : text;
  }
  if (field === 'custom_id') return text.replace(/:/g, '-');
  const urlMatch = text.match(/\/(?:anime|manga|tv|movie)\/(\d+)/i);
  return urlMatch ? urlMatch[1] : text;
}

const ID_FIELDS = ['imdb_id', 'kitsu_id', 'tmdb_id', 'anilist_id', 'custom_id'];

function updateIdsHint() {
  const hasId = ID_FIELDS.some(field => valueOf(field));
  if (!hasId) {
    idsHint.textContent = 'Sin ningún ID solo aparecerá en el catálogo Hydra y cada episodio saldrá por separado. Añade IMDb, Kitsu o un ID personalizado (en “Más opciones”).';
    idsHint.dataset.kind = 'warn';
  } else if (getType() === 'anime' && !valueOf('kitsu_id') && !valueOf('anilist_id')) {
    idsHint.textContent = 'Consejo: para anime añade también Kitsu; los add-ons de anime piden los capítulos por Kitsu (kitsu:ID:capítulo).';
    delete idsHint.dataset.kind;
  } else {
    idsHint.textContent = 'Listo: aparecerá en la ficha de Stremio de ese título.';
    delete idsHint.dataset.kind;
  }
}

ID_FIELDS.forEach(field => {
  const input = $(field);
  input.addEventListener('input', updateIdsHint);
  input.addEventListener('blur', () => {
    input.value = normalizeId(field, input.value);
    updateIdsHint();
  });
  input.addEventListener('paste', () => setTimeout(() => {
    input.value = normalizeId(field, input.value);
    updateIdsHint();
  }, 0));
});

// ---------------------------------------------------------------------------
// Preferencias (último tipo, calidad, audio…) y guardados recientes
// ---------------------------------------------------------------------------
const PREF_FIELDS = ['quality', 'audio_lang', 'subtitles', 'source_platform'];

function loadPrefs() {
  const prefs = store.getJSON(PREFS_KEY, {});
  if (prefs.type) {
    const radio = form.querySelector(`input[name="type"][value="${prefs.type}"]`);
    if (radio) radio.checked = true;
  }
  PREF_FIELDS.forEach(field => {
    if (LANG_FIELDS[field]) setLangField(field, prefs[field]);
    else setSelect(field, prefs[field]);
  });
}

function savePrefs(payload) {
  const prefs = { type: payload.type };
  PREF_FIELDS.forEach(field => { prefs[field] = payload[field]; });
  store.set(PREFS_KEY, JSON.stringify(prefs));
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.round(seconds / 3600)} h`;
  return new Date(timestamp).toLocaleDateString('es');
}

function renderRecent() {
  const items = store.getJSON(RECENT_KEY, []);
  $('recent').hidden = items.length === 0;
  const list = $('recent-list');
  list.replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = item.title;
    name.title = item.title;
    li.append(name);
    if (item.label) {
      const tag = document.createElement('span');
      tag.className = 'recent-tag';
      tag.textContent = item.label;
      li.append(tag);
    }
    const time = document.createElement('time');
    time.dateTime = new Date(item.at).toISOString();
    time.textContent = timeAgo(item.at);
    li.append(time);
    return li;
  }));
}

function addRecent(saved) {
  const items = store.getJSON(RECENT_KEY, []);
  const label = saved.episode ? episodeLabel(saved.type, saved.season ?? '', saved.episode) : (saved.type === 'movie' ? 'Película' : '');
  items.unshift({ title: saved.title, label: [label, saved.quality].filter(Boolean).join(' · '), at: Date.now() });
  store.set(RECENT_KEY, JSON.stringify(items.slice(0, 12)));
  renderRecent();
}

$('clear-recent').addEventListener('click', () => {
  store.set(RECENT_KEY, null);
  renderRecent();
});

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------
function invalid(input, message) {
  input.setAttribute('aria-invalid', 'true');
  input.focus();
  showStatus(message, true);
}

form.addEventListener('input', (event) => {
  if (event.target.hasAttribute && event.target.hasAttribute('aria-invalid')) event.target.removeAttribute('aria-invalid');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.hidden = true;

  const secret = secretInput.value.trim();
  if (!secret) {
    renderSecretState(true);
    invalid(secretInput, 'Introduce ADMIN_SECRET para guardar el contenido.');
    return;
  }

  const link = parseLink(magnetInput.value);
  if (link.empty || !link.valid) return invalid(magnetInput, 'Pega un enlace magnet, hash o URL válido.');
  if (!valueOf('title')) return invalid(titleInput, 'Escribe un título.');

  if (valueOf('audio_lang') === CUSTOM_LANG && !valueOf('audio_lang_custom')) {
    return invalid($('audio_lang_custom'), 'Escribe el idioma de audio o elige una opción de la lista.');
  }
  if (valueOf('subtitles') === CUSTOM_LANG && !valueOf('subtitles_custom')) {
    return invalid($('subtitles_custom'), 'Escribe los subtítulos o elige una opción de la lista.');
  }

  const type = getType();
  const rules = TYPE_RULES[type];
  const seasonText = rules ? valueOf('season') : '';
  const episodeText = rules ? valueOf('episode') : '';
  if (rules && episodeText === '') {
    return invalid(episodeInput, type === 'anime' ? 'Para anime indica el número de capítulo.' : 'Para series y dramas indica el número de episodio.');
  }
  if (rules && rules.seasonRequired && seasonText === '') {
    return invalid(seasonInput, 'Para series y dramas indica la temporada (usa 1 si solo tiene una).');
  }

  ID_FIELDS.forEach(field => { $(field).value = normalizeId(field, $(field).value); });
  const parsedSeeders = Number.parseInt(valueOf('seeders'), 10);
  const payload = {
    imdb_id: valueOf('imdb_id') || null,
    tmdb_id: valueOf('tmdb_id') || null,
    anilist_id: valueOf('anilist_id') || null,
    kitsu_id: valueOf('kitsu_id') || null,
    custom_id: valueOf('custom_id') || null,
    type,
    season: seasonText === '' ? null : Number(seasonText),
    episode: episodeText === '' ? null : Number(episodeText),
    episode_title: rules ? (valueOf('episode_title') || null) : null,
    source_platform: valueOf('source_platform'),
    title: valueOf('title'),
    magnet: valueOf('magnet'),
    quality: valueOf('quality'),
    audio_lang: valueOf('audio_lang') === CUSTOM_LANG ? (valueOf('audio_lang_custom') || 'Multi') : valueOf('audio_lang'),
    subtitles: valueOf('subtitles') === CUSTOM_LANG ? (valueOf('subtitles_custom') || 'Multi') : valueOf('subtitles'),
    size: valueOf('size') || 'N/D',
    seeders: Number.isFinite(parsedSeeders) ? parsedSeeders : 10
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Guardando…';

  try {
    const response = await fetch('/api/admin/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      renderSecretState(true);
      throw new Error('Clave incorrecta. Revisa ADMIN_SECRET.');
    }
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Error HTTP ${response.status}`);
    }

    const saved = result.data || payload;
    savePrefs(payload);
    addRecent(saved);

    // Listo para el siguiente capítulo: conserva tipo, temporada, IDs y detalles técnicos.
    titleInput.value = '';
    titleInput.dataset.auto = '1';
    magnetInput.value = '';
    $('episode_title').value = '';
    $('size').value = '';
    linkStatus.textContent = '';
    delete linkStatus.dataset.kind;

    let message = '✓ Guardado.';
    if (rules && saved.episode !== null && saved.episode !== undefined) {
      const nextEpisode = Number(saved.episode) + 1;
      episodeInput.value = nextEpisode;
      message += type === 'anime'
        ? ` Siguiente: capítulo ${nextEpisode}.`
        : ` Siguiente: T${seasonInput.value || 1} · E${pad2(nextEpisode)}.`;
    }
    updateEpisodePreview();
    showStatus(message);
    loadDataPage(); // Mantiene al día la lista de «Tus datos».
    magnetInput.focus();
  } catch (error) {
    showStatus(error.message || 'Error de conexión. Inténtalo de nuevo.', true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Guardar';
  }
});

// Ctrl/⌘ + Enter guarda desde cualquier campo.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (!submitButton.disabled) form.requestSubmit();
  }
});

// ---------------------------------------------------------------------------
// Tus datos: buscar, seleccionar y eliminar registros guardados
// ---------------------------------------------------------------------------
const dataList = $('data-list');
const dataStatus = $('data-status');
const dataSelectAll = $('data-select-all');
const deleteSelectedButton = $('data-delete-selected');
const dataState = { page: 1, pages: 1, limit: 20, total: 0, items: [] };

function dataShowStatus(message, isError = false) {
  dataStatus.textContent = message;
  dataStatus.dataset.kind = isError ? 'error' : 'ok';
  dataStatus.hidden = false;
}

function dataHideStatus() {
  dataStatus.hidden = true;
}

function dataSecret() {
  const secret = secretInput.value.trim();
  if (!secret) {
    renderSecretState(true);
    dataShowStatus('Introduce tu clave de administrador arriba para ver y eliminar tus datos.', true);
    secretInput.focus();
    return null;
  }
  return secret;
}

function dataCreated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es');
}

function dataRowLabel(item) {
  if (item.episode === null || item.episode === undefined) return item.type === 'movie' ? 'Película' : '';
  return episodeLabel(item.type, item.season ?? '', item.episode);
}

function updateDataSelection() {
  const boxes = [...dataList.querySelectorAll('input[data-id]')];
  const checked = boxes.filter(box => box.checked);
  dataSelectAll.checked = boxes.length > 0 && checked.length === boxes.length;
  dataSelectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
  deleteSelectedButton.disabled = checked.length === 0;
  deleteSelectedButton.textContent = checked.length > 0
    ? `Eliminar seleccionados (${checked.length})`
    : 'Eliminar seleccionados';
  $('data-count').textContent = dataState.total
    ? `${dataState.total} registro${dataState.total === 1 ? '' : 's'} · ${checked.length} seleccionado${checked.length === 1 ? '' : 's'}`
    : '';
}

function renderDataList() {
  dataList.replaceChildren(...dataState.items.map(item => {
    const li = document.createElement('li');
    li.className = 'data-item';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'data-check';
    check.dataset.id = String(item.id);
    check.setAttribute('aria-label', `Seleccionar ${item.title}`);
    check.addEventListener('change', updateDataSelection);

    const body = document.createElement('div');
    body.className = 'data-item-body';
    const name = document.createElement('span');
    name.className = 'data-name';
    name.textContent = item.title;
    name.title = item.title;
    const meta = document.createElement('span');
    meta.className = 'data-meta';
    meta.textContent = [
      dataRowLabel(item), item.quality, item.audio_lang, item.size,
      item.seeders !== null && item.seeders !== undefined ? `${item.seeders} seeds` : '',
      dataCreated(item.created_at)
    ].filter(Boolean).join(' · ');
    body.append(name, meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-button link-danger data-remove';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => deleteDataRows([item.id]));

    li.append(check, body, remove);
    return li;
  }));
  $('data-empty').hidden = dataState.items.length > 0;
  updateDataSelection();
}

async function loadDataPage() {
  const secret = dataSecret();
  if (!secret) return;
  dataHideStatus();
  const params = new URLSearchParams({
    search: $('data-search').value.trim(),
    type: $('data-type').value,
    page: String(dataState.page),
    limit: String(dataState.limit)
  });
  dataList.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`/api/admin/list?${params.toString()}`, {
      headers: { 'x-admin-secret': secret }
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      renderSecretState(true);
      throw new Error('Clave incorrecta. Revisa ADMIN_SECRET.');
    }
    if (!response.ok || !result.success) throw new Error(result.error || `Error HTTP ${response.status}`);

    dataState.page = result.data.page;
    dataState.pages = result.data.pages;
    dataState.total = result.data.total;
    dataState.items = result.data.items;
    renderDataList();
    $('data-pager').hidden = dataState.pages <= 1;
    $('data-page-info').textContent = `Página ${dataState.page} de ${dataState.pages}`;
    $('data-prev').disabled = dataState.page <= 1;
    $('data-next').disabled = dataState.page >= dataState.pages;
  } catch (error) {
    dataShowStatus(error.message || 'No se pudieron cargar tus datos.', true);
  } finally {
    dataList.removeAttribute('aria-busy');
  }
}

async function deleteDataRows(ids) {
  if (!ids.length) return;
  const secret = dataSecret();
  if (!secret) return;
  const question = ids.length === 1
    ? '¿Eliminar este registro? Esta acción no se puede deshacer.'
    : `¿Eliminar los ${ids.length} registros seleccionados? Esta acción no se puede deshacer.`;
  if (!window.confirm(question)) return;

  try {
    const response = await fetch('/api/admin/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ ids })
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      renderSecretState(true);
      throw new Error('Clave incorrecta. Revisa ADMIN_SECRET.');
    }
    if (!response.ok || !result.success) throw new Error(result.error || `Error HTTP ${response.status}`);

    const deleted = result.deleted ?? ids.length;
    dataShowStatus(`✓ ${deleted} registro${deleted === 1 ? '' : 's'} eliminado${deleted === 1 ? '' : 's'}.`);
    // Si la página queda vacía tras borrar, retrocede una para no mostrar páginas en blanco.
    if (dataState.items.length <= ids.length && dataState.page > 1) dataState.page -= 1;
    await loadDataPage();
  } catch (error) {
    dataShowStatus(error.message || 'No se pudieron eliminar los registros.', true);
  }
}

$('data-filters').addEventListener('submit', (event) => {
  event.preventDefault();
  dataState.page = 1;
  loadDataPage();
});
$('data-reload').addEventListener('click', () => loadDataPage());
dataSelectAll.addEventListener('change', () => {
  dataList.querySelectorAll('input[data-id]').forEach(box => { box.checked = dataSelectAll.checked; });
  updateDataSelection();
});
deleteSelectedButton.addEventListener('click', () => {
  const ids = [...dataList.querySelectorAll('input[data-id]:checked')].map(box => Number(box.dataset.id));
  deleteDataRows(ids);
});
$('data-prev').addEventListener('click', () => {
  if (dataState.page > 1) { dataState.page -= 1; loadDataPage(); }
});
$('data-next').addEventListener('click', () => {
  if (dataState.page < dataState.pages) { dataState.page += 1; loadDataPage(); }
});

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------
// Idiomas: muestra el campo libre al elegir «Otro idioma…» y lo oculta al volver a un preset.
Object.keys(LANG_FIELDS).forEach(id => {
  $(id).addEventListener('change', () => {
    syncLangField(id);
    if ($(id).value === CUSTOM_LANG) $(LANG_FIELDS[id]).focus();
  });
  syncLangField(id);
});

loadPrefs();
applyTypeRules();
renderRecent();
setInterval(renderRecent, 60000);
if (secretInput.value) {
  magnetInput.focus();
  loadDataPage();
}

// ---------------------------------------------------------------------------
// 🌐 Buscador de webs torrent (contenido de habla hispana)
// ---------------------------------------------------------------------------
const scraperPanel = $('scraper-panel');
const scraperForm = $('scraper-filters');
const scraperQuery = $('scraper-query');
const scraperType = $('scraper-type');
const scraperButton = $('scraper-search-button');
const scraperResults = $('scraper-results');
const scraperEmpty = $('scraper-empty');
const scraperStatus = $('scraper-status');

const SCRAPER_LABELS = {
  dontorrent: 'DonTorrent',
  mejortorrent: 'MejorTorrent',
  pelispanda: 'Pelispanda',
  elitetorrent: 'EliteTorrent',
  sinsitio: 'SinSitio',
  limetorrent: 'LimeTorrent'
};

function scraperShowStatus(message, isError = false) {
  scraperStatus.textContent = message;
  scraperStatus.dataset.kind = isError ? 'error' : 'ok';
  scraperStatus.hidden = false;
}

function scraperBadge(text) {
  const span = document.createElement('span');
  span.className = 'scraper-badge';
  span.textContent = text;
  return span;
}

function selectedScraperSites() {
  return [...scraperPanel.querySelectorAll('#scraper-sites input:checked')].map(box => box.value);
}

function renderScraperResults(payload) {
  const { results = [], sites = [] } = payload;
  scraperResults.replaceChildren();

  // Salud de cada sitio consultado.
  const health = document.createElement('div');
  health.className = 'scraper-health';
  for (const site of sites) {
    const chip = document.createElement('span');
    chip.className = `scraper-site-chip${site.ok === false ? ' scraper-site-down' : ''}`;
    chip.textContent = `${site.ok === false ? '●' : '●'} ${site.label}${site.latencyMs ? ` · ${site.latencyMs} ms` : ''}`;
    chip.title = site.lastError || 'Responde correctamente';
    health.appendChild(chip);
  }
  scraperResults.appendChild(health);

  if (!results.length) {
    scraperResults.hidden = true;
    scraperEmpty.hidden = false;
    return;
  }
  scraperEmpty.hidden = true;
  scraperResults.hidden = false;

  for (const result of results) {
    const card = document.createElement('article');
    card.className = 'scraper-item';

    const head = document.createElement('div');
    head.className = 'scraper-item-head';

    const title = document.createElement('p');
    title.className = 'scraper-item-title';
    title.textContent = result.title;
    head.appendChild(title);

    const badges = document.createElement('div');
    badges.className = 'scraper-item-badges';
    badges.appendChild(scraperBadge(`🏷️ ${result.siteLabel || SCRAPER_LABELS[result.site] || result.site}`));
    if (result.quality && result.quality !== 'N/D') badges.appendChild(scraperBadge(`📺 ${result.quality}`));
    if (result.audio) badges.appendChild(scraperBadge(`🌐 ${result.audio}`));
    if (result.size) badges.appendChild(scraperBadge(`💾 ${result.size}`));
    if (Number.isInteger(result.seeders) && result.seeders > 0) badges.appendChild(scraperBadge(`⚡ ${result.seeders} seeds`));
    if (result.magnet) badges.appendChild(scraperBadge('✅ Magnet listo'));
    head.appendChild(badges);
    card.appendChild(head);

    const actions = document.createElement('div');
    actions.className = 'scraper-item-actions';

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'button button-secondary';
    importButton.textContent = result.magnet ? '⬇️ Importar directo' : '⬇️ Importar (resuelve magnet)';
    importButton.addEventListener('click', () => importScraped(result, importButton));
    actions.appendChild(importButton);

    if (result.magnet) {
      const fillButton = document.createElement('button');
      fillButton.type = 'button';
      fillButton.className = 'link-button';
      fillButton.textContent = 'Rellenar formulario';
      fillButton.addEventListener('click', () => fillFormFromScraped(result));
      actions.appendChild(fillButton);
    }

    if (result.detailUrl) {
      const link = document.createElement('a');
      link.className = 'link-button';
      link.href = result.detailUrl;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Ver en la web ↗';
      actions.appendChild(link);
    }

    card.appendChild(actions);
    scraperResults.appendChild(card);
  }
}

async function importScraped(result, button) {
  const secret = secretInput.value.trim();
  if (!secret) {
    renderSecretState(true);
    scraperShowStatus('Introduce tu clave de administrador arriba para poder importar.', true);
    secretInput.focus();
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Importando…';
  scraperShowStatus(`Importando desde ${result.siteLabel || result.site}: ${result.title} …`);

  try {
    const body = { site: result.site, detailUrl: result.detailUrl };
    if (result.magnet) {
      body.magnet = result.magnet;
      body.title = result.title;
      if (result.quality && result.quality !== 'N/D') body.quality = result.quality;
      if (result.audio) body.audio_lang = result.audio;
      if (result.size) body.size = result.size;
      if (Number.isInteger(result.seeders)) body.seeders = result.seeders;
      if (result.season !== null && result.season !== undefined) body.season = result.season;
      if (result.episode !== null && result.episode !== undefined) body.episode = result.episode;
      if (result.type && ['movie', 'series', 'anime'].includes(result.type)) body.type = result.type;
    }

    const response = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      scraperShowStatus(payload.error || 'No se pudo importar el contenido.', true);
      return;
    }

    const parts = [`${payload.imported} versión(es) importadas a la bóveda`];
    if (payload.duplicated) parts.push(`${payload.duplicated} duplicadas omitidas`);
    scraperShowStatus(`✅ ${parts.join(' · ')}.`);
    renderRecent();
    loadDataPage();
  } catch (error) {
    scraperShowStatus(`Error de red al importar: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function fillFormFromScraped(result) {
  magnetInput.value = result.magnet || '';
  titleInput.value = result.title || '';
  if (result.type) setType(result.type);
  if (result.quality && result.quality !== 'N/D') {
    const select = $('quality');
    if ([...select.options].some(option => option.value === result.quality)) select.value = result.quality;
  }
  if (result.audio) {
    setLangField('audio_lang', result.audio);
  }
  if (result.size) {
    $('size').value = result.size;
    $('size').dataset.auto = '1';
  }
  if (Number.isInteger(result.seeders)) $('seeders').value = String(result.seeders);
  magnetInput.dispatchEvent(new Event('input', { bubbles: true }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  titleInput.focus();
  showStatus('Rellenado desde el buscador de webs. Revisa los datos y guarda.', false);
}

scraperForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const term = scraperQuery.value.trim();
  if (term.length < 2) {
    scraperShowStatus('Escribe al menos 2 caracteres para buscar.', true);
    return;
  }

  const sites = selectedScraperSites();
  if (!sites.length) {
    scraperShowStatus('Marca al menos un sitio donde buscar.', true);
    return;
  }

  scraperButton.disabled = true;
  scraperButton.textContent = '🔎 Buscando…';
  scraperShowStatus(`Buscando “${term}” en ${sites.length} sitio(s)… (puede tardar unos segundos)`);

  try {
    const params = new URLSearchParams({ q: term, sites: sites.join(',') });
    if (scraperType.value) params.set('type', scraperType.value);
    const response = await fetch(`/api/scrapers/search?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      scraperShowStatus(payload.error || 'La búsqueda falló.', true);
      return;
    }
    renderScraperResults(payload);
    scraperShowStatus(`${payload.total} resultado(s) en español para “${term}”.`, payload.total === 0);
  } catch (error) {
    scraperShowStatus(`Error de red: ${error.message}`, true);
  } finally {
    scraperButton.disabled = false;
    scraperButton.textContent = 'Buscar';
  }
});

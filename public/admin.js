const SECRET_KEY = 'hydra_admin_secret';
const form = document.getElementById('add-form');
const secretInput = document.getElementById('admin-secret');
const submitButton = document.getElementById('submit-button');
const statusMessage = document.getElementById('form-status');
const typeSelect = document.getElementById('type');
const titleInput = document.getElementById('title');
const seasonInput = document.getElementById('season');
const episodeInput = document.getElementById('episode');
const episodeFields = document.getElementById('episode-fields');
const episodePreview = document.getElementById('episode-preview');

// Reglas por tipo: película (sin episodios), serie/drama (temporada + episodio), anime (capítulo).
const TYPE_RULES = {
  movie: null,
  series: {
    legend: 'Temporada y episodio',
    seasonLabel: 'Temporada *',
    episodeLabel: 'Episodio *',
    episodeTitleLabel: 'Título del episodio',
    seasonRequired: true,
    help: 'Serie: indica la temporada y el número de episodio (ej. temporada 1, episodio 3 → T1 · E03).'
  },
  drama: {
    legend: 'Temporada y episodio',
    seasonLabel: 'Temporada *',
    episodeLabel: 'Episodio *',
    episodeTitleLabel: 'Título del episodio',
    seasonRequired: true,
    help: 'Drama: indica la temporada y el número de episodio. Si el drama tiene una sola temporada, usa 1.'
  },
  anime: {
    legend: 'Capítulo',
    seasonLabel: 'Temporada (opcional)',
    episodeLabel: 'Capítulo *',
    episodeTitleLabel: 'Título del capítulo',
    seasonRequired: false,
    help: 'Anime: indica el número de capítulo. Deja la temporada vacía si usas numeración absoluta o IDs de Kitsu/AniList (se tomará como temporada 1 en IMDb).'
  }
};

try {
  secretInput.value = window.localStorage.getItem(SECRET_KEY) || '';
} catch (error) {
  console.warn('El navegador no permitió leer localStorage.');
}

secretInput.addEventListener('input', () => {
  try {
    if (secretInput.value) window.localStorage.setItem(SECRET_KEY, secretInput.value);
    else window.localStorage.removeItem(SECRET_KEY);
  } catch (error) {
    showStatus('No se pudo guardar la clave en este navegador.', true);
  }
});

document.getElementById('forget-secret').addEventListener('click', () => {
  secretInput.value = '';
  try {
    window.localStorage.removeItem(SECRET_KEY);
  } catch (error) {
    // The field is still cleared for the current page session.
  }
});

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function updateEpisodePreview() {
  const rules = TYPE_RULES[typeSelect.value];
  const season = seasonInput.value.trim();
  const episode = episodeInput.value.trim();
  if (!rules || !episode) {
    episodePreview.classList.add('hidden');
    return;
  }
  let label;
  if (typeSelect.value === 'anime') label = season ? `T${season} · Cap. ${pad2(episode)}` : `Cap. ${pad2(episode)}`;
  else label = season ? `T${season} · E${pad2(episode)}` : '';
  if (!label) {
    episodePreview.classList.add('hidden');
    return;
  }
  episodePreview.textContent = `Se mostrará en Stremio como: ${label}`;
  episodePreview.classList.remove('hidden');
}

function applyTypeRules() {
  const rules = TYPE_RULES[typeSelect.value];
  if (!rules) {
    // Película: sin temporada ni episodio.
    episodeFields.classList.add('hidden');
    episodeFields.disabled = true;
    seasonInput.value = '';
    episodeInput.value = '';
    document.getElementById('episode_title').value = '';
    seasonInput.required = false;
    episodeInput.required = false;
    updateEpisodePreview();
    return;
  }
  episodeFields.classList.remove('hidden');
  episodeFields.disabled = false;
  document.getElementById('episode-legend').textContent = rules.legend;
  document.getElementById('season-label').textContent = rules.seasonLabel;
  document.getElementById('episode-label').textContent = rules.episodeLabel;
  document.getElementById('episode-title-label').textContent = rules.episodeTitleLabel;
  document.getElementById('episode-help').textContent = rules.help;
  seasonInput.required = rules.seasonRequired;
  episodeInput.required = true;
  updateEpisodePreview();
}

/**
 * Detecta temporada / episodio / capítulo en el título: S01E03, 1x03, Temporada 2, Cap 12, Episodio 5, E05…
 * Con overwrite = false solo rellena los campos vacíos.
 */
function detectFromTitle(overwrite = false) {
  if (!TYPE_RULES[typeSelect.value]) return;
  const title = titleInput.value;
  let season = null;
  let episode = null;

  const sxe = title.match(/\bS(\d{1,2})\s*[-._ ]?\s*E(\d{1,4})\b/i) || title.match(/\b(\d{1,2})x(\d{1,4})\b/i);
  if (sxe) {
    season = Number(sxe[1]);
    episode = Number(sxe[2]);
  } else {
    const seasonMatch = title.match(/\b(?:temporada|season|S)\s*(\d{1,2})\b/i);
    const episodeMatch = title.match(/\b(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?|E)\.?\s*(\d{1,4})\b/i);
    // Formato típico de anime: "[Grupo] Nombre - 12 (1080p)" o "Nombre - 12v2 [1080p]"
    const animeMatch = title.match(/\s-\s(\d{1,4})(?:v\d)?\s*(?:[\[(]|$)/);
    if (seasonMatch) season = Number(seasonMatch[1]);
    if (episodeMatch) episode = Number(episodeMatch[1]);
    else if (animeMatch) episode = Number(animeMatch[1]);
  }

  if (season !== null && (overwrite || !seasonInput.value)) seasonInput.value = season;
  if (episode !== null && episode > 0 && (overwrite || !episodeInput.value)) episodeInput.value = episode;
  if (episode !== null && typeSelect.value !== 'anime' && !seasonInput.value) seasonInput.value = 1;
  updateEpisodePreview();
}

typeSelect.addEventListener('change', () => {
  applyTypeRules();
  detectFromTitle(false);
});
titleInput.addEventListener('change', () => detectFromTitle(true));
seasonInput.addEventListener('input', updateEpisodePreview);
episodeInput.addEventListener('input', updateEpisodePreview);
applyTypeRules();

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = isError
    ? 'mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800'
    : 'mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.classList.add('hidden');

  const secret = secretInput.value;
  if (!secret) {
    showStatus('Introduce ADMIN_SECRET para guardar el contenido.', true);
    secretInput.focus();
    return;
  }

  const parsedSeeders = Number.parseInt(valueOf('seeders'), 10);
  const type = valueOf('type');
  const rules = TYPE_RULES[type];
  const seasonText = rules ? valueOf('season') : '';
  const episodeText = rules ? valueOf('episode') : '';

  if (rules && episodeText === '') {
    showStatus(type === 'anime' ? 'Para anime indica el número de capítulo.' : 'Para series y dramas indica el número de episodio.', true);
    episodeInput.focus();
    return;
  }
  if (rules && rules.seasonRequired && seasonText === '') {
    showStatus('Para series y dramas indica la temporada (usa 1 si solo tiene una).', true);
    seasonInput.focus();
    return;
  }

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
    audio_lang: valueOf('audio_lang'),
    subtitles: valueOf('subtitles'),
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
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Error HTTP ${response.status}`);
    }

    // Deja el formulario listo para el siguiente capítulo: conserva tipo, temporada, IDs y detalles técnicos.
    const saved = result.data || payload;
    titleInput.value = '';
    document.getElementById('magnet').value = '';
    document.getElementById('episode_title').value = '';
    document.getElementById('size').value = 'N/D';
    let message = 'Contenido guardado correctamente en Layerbase.';
    if (rules && saved.episode !== null && saved.episode !== undefined) {
      const nextEpisode = Number(saved.episode) + 1;
      episodeInput.value = nextEpisode;
      message += type === 'anime'
        ? ` Listo para el capítulo ${nextEpisode}.`
        : ` Listo para T${seasonInput.value || 1} · E${pad2(nextEpisode)}.`;
    }
    updateEpisodePreview();
    showStatus(message);
    titleInput.focus();
  } catch (error) {
    showStatus('No se pudo guardar la clave en este navegador.', true);
  }
});

document.getElementById('forget-secret').addEventListener('click', () => {
  secretInput.value = '';
  try {
    window.localStorage.removeItem(SECRET_KEY);
  } catch (error) {
    // The field is still cleared for the current page session.
  }
});

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function updateEpisodePreview() {
  const rules = TYPE_RULES[typeSelect.value];
  const season = seasonInput.value.trim();
  const episode = episodeInput.value.trim();
  if (!rules || !episode) {
    episodePreview.classList.add('hidden');
    return;
  }
  let label;
  if (typeSelect.value === 'anime') label = season ? `T${season} · Cap. ${pad2(episode)}` : `Cap. ${pad2(episode)}`;
  else label = season ? `T${season} · E${pad2(episode)}` : '';
  if (!label) {
    episodePreview.classList.add('hidden');
    return;
  }
  episodePreview.textContent = `Se mostrará en Stremio como: ${label}`;
  episodePreview.classList.remove('hidden');
}

function applyTypeRules() {
  const rules = TYPE_RULES[typeSelect.value];
  if (!rules) {
    // Película: sin temporada ni episodio.
    episodeFields.classList.add('hidden');
    episodeFields.disabled = true;
    seasonInput.value = '';
    episodeInput.value = '';
    document.getElementById('episode_title').value = '';
    seasonInput.required = false;
    episodeInput.required = false;
    updateEpisodePreview();
    return;
  }
  episodeFields.classList.remove('hidden');
  episodeFields.disabled = false;
  document.getElementById('episode-legend').textContent = rules.legend;
  document.getElementById('season-label').textContent = rules.seasonLabel;
  document.getElementById('episode-label').textContent = rules.episodeLabel;
  document.getElementById('episode-title-label').textContent = rules.episodeTitleLabel;
  document.getElementById('episode-help').textContent = rules.help;
  seasonInput.required = rules.seasonRequired;
  episodeInput.required = true;
  updateEpisodePreview();
}

/**
 * Detecta temporada / episodio / capítulo en el título: S01E03, 1x03, Temporada 2, Cap 12, Episodio 5, E05…
 * Con overwrite = false solo rellena los campos vacíos.
 */
function detectFromTitle(overwrite = false) {
  if (!TYPE_RULES[typeSelect.value]) return;
  const title = titleInput.value;
  let season = null;
  let episode = null;

  const sxe = title.match(/\bS(\d{1,2})\s*[-._ ]?\s*E(\d{1,4})\b/i) || title.match(/\b(\d{1,2})x(\d{1,4})\b/i);
  if (sxe) {
    season = Number(sxe[1]);
    episode = Number(sxe[2]);
  } else {
    const seasonMatch = title.match(/\b(?:temporada|season|S)\s*(\d{1,2})\b/i);
    const episodeMatch = title.match(/\b(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?|E)\.?\s*(\d{1,4})\b/i);
    // Formato típico de anime: "[Grupo] Nombre - 12 (1080p)" o "Nombre - 12v2 [1080p]"
    const animeMatch = title.match(/\s-\s(\d{1,4})(?:v\d)?\s*(?:[\[(]|$)/);
    if (seasonMatch) season = Number(seasonMatch[1]);
    if (episodeMatch) episode = Number(episodeMatch[1]);
    else if (animeMatch) episode = Number(animeMatch[1]);
  }

  if (season !== null && (overwrite || !seasonInput.value)) seasonInput.value = season;
  if (episode !== null && episode > 0 && (overwrite || !episodeInput.value)) episodeInput.value = episode;
  if (episode !== null && typeSelect.value !== 'anime' && !seasonInput.value) seasonInput.value = 1;
  updateEpisodePreview();
}

typeSelect.addEventListener('change', () => {
  applyTypeRules();
  detectFromTitle(false);
});
titleInput.addEventListener('change', () => detectFromTitle(true));
seasonInput.addEventListener('input', updateEpisodePreview);
episodeInput.addEventListener('input', updateEpisodePreview);
applyTypeRules();

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = isError
    ? 'mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800'
    : 'mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.classList.add('hidden');

  const secret = secretInput.value;
  if (!secret) {
    showStatus('Introduce ADMIN_SECRET para guardar el contenido.', true);
    secretInput.focus();
    return;
  }

  const parsedSeeders = Number.parseInt(valueOf('seeders'), 10);
  const type = valueOf('type');
  const rules = TYPE_RULES[type];
  const seasonText = rules ? valueOf('season') : '';
  const episodeText = rules ? valueOf('episode') : '';

  if (rules && episodeText === '') {
    showStatus(type === 'anime' ? 'Para anime indica el número de capítulo.' : 'Para series y dramas indica el número de episodio.', true);
    episodeInput.focus();
    return;
  }
  if (rules && rules.seasonRequired && seasonText === '') {
    showStatus('Para series y dramas indica la temporada (usa 1 si solo tiene una).', true);
    seasonInput.focus();
    return;
  }

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
    audio_lang: valueOf('audio_lang'),
    subtitles: valueOf('subtitles'),
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
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Error HTTP ${response.status}`);
    }

    const savedSecret = secretInput.value;
    form.reset();
    secretInput.value = savedSecret;
    showStatus('Contenido guardado correctamente en Layerbase.');
    document.getElementById('title').focus();
  } catch (error) {
    showStatus(error.message || 'Error de conexión. Inténtalo de nuevo.', true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Guardar en Layerbase';
  }
});

const SECRET_KEY = 'hydra_admin_secret';
const form = document.getElementById('add-form');
const secretInput = document.getElementById('admin-secret');
const submitButton = document.getElementById('submit-button');
const statusMessage = document.getElementById('form-status');

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
  const payload = {
    imdb_id: valueOf('imdb_id') || null,
    tmdb_id: valueOf('tmdb_id') || null,
    anilist_id: valueOf('anilist_id') || null,
    kitsu_id: valueOf('kitsu_id') || null,
    custom_id: valueOf('custom_id') || null,
    type: valueOf('type'),
    season: valueOf('season') === '' ? null : Number(valueOf('season')),
    episode: valueOf('episode') === '' ? null : Number(valueOf('episode')),
    episode_title: valueOf('episode_title') || null,
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

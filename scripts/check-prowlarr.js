#!/usr/bin/env node
/**
 * Comprobación rápida de la conexión con TU Prowlarr (por defecto, localhost).
 *
 *   npm run prowlarr:check              # ping + búsqueda de prueba "test"
 *   npm run prowlarr:check -- "glory"   # búsqueda de prueba con tu query
 *
 * Lee la configuración de .env (PROWLARR_URL / PROWLARR_API_KEY).
 * NUNCA imprime la API key.
 */
require('dotenv').config();
const prowlarr = require('../src/services/prowlarr');

async function main() {
  const query = process.argv[2] || 'test';

  console.log('🔎 Comprobando Prowlarr...');
  console.log(`   URL destino: ${process.env.PROWLARR_URL || '(sin PROWLARR_URL → se asume http://localhost:9696 si hay API key)'}`);

  if (!prowlarr.isConfigured()) {
    console.error('❌ Prowlarr no está configurado.');
    console.error('   Crea un archivo .env con:');
    console.error('     PROWLARR_API_KEY=<tu API key de Prowlarr>');
    console.error('     PROWLARR_URL=http://localhost:9696   # opcional, este es el valor por defecto');
    process.exit(1);
  }

  const health = await prowlarr.checkHealth({ timeoutMs: 4000 });
  if (!health.connected) {
    console.error(`❌ No se pudo conectar: ${health.error || 'sin respuesta'}`);
    console.error('   ¿Está Prowlarr corriendo? ¿La API key es correcta? ¿La URL incluye el puerto?');
    process.exit(1);
  }
  console.log(`✅ Conectado a ${health.instance} ${health.version || ''} (${health.latencyMs}ms)`);

  console.log(`🔎 Búsqueda de prueba: "${query}"...`);
  const results = await prowlarr.searchProwlarr(
    { query, searchType: 'search', categories: [prowlarr.CATEGORY.MOVIES, prowlarr.CATEGORY.TV] },
    { timeoutMs: 8000 }
  );
  console.log(`✅ ${results.length} resultados normalizados (con magnet/infohash, dedup aplicado)`);
  results.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.title}`);
    console.log(`      ${r.seeders} seeds · ${r.size} · indexer: ${r.indexer} · ${r.infoHash.slice(0, 12)}…`);
  });
  if (results.length === 0) {
    console.log('   (0 resultados puede ser normal: prueba con otro query, o revisa tus indexers en Prowlarr)');
  }
  console.log('\n🎉 Prowlarr listo para el auto-llenado de Hydra-Vault.');
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err.message);
  process.exit(1);
});

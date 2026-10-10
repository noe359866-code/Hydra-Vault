const app = require('./src/app');
const config = require('./src/config');

const PORT = config.port || 7000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`🚀 Hydra Torrents Addon & Admin Panel está en línea!`);
  console.log(`🌐 Servidor:         http://${HOST}:${PORT}`);
  console.log(`📜 Manifest Stremio: http://${HOST}:${PORT}/manifest.json`);
  console.log(`🛡️ Panel de Control: http://${HOST}:${PORT}/admin`);
  console.log(`🗄️ Base de Datos:    ${config.databaseUrl ? 'Layerbase PostgreSQL configurado' : 'Modo memoria de desarrollo'}`);
  const secretStatus = config.hasCustomSecret
    ? 'Configurado por entorno'
    : (config.nodeEnv === 'production' ? 'NO CONFIGURADO' : 'Valor dev por defecto activo');
  console.log(`🔑 ADMIN_SECRET:     ${secretStatus}`);
  console.log('====================================================');
});

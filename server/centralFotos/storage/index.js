const { LocalStorageProvider } = require("./LocalStorageProvider");
const { ORIGINAL_DIR, OPTIMIZED_DIR, THUMBNAILS_DIR } = require("../db");

// Só existe "local" por enquanto. Uma variável CENTRAL_FOTOS_STORAGE_PROVIDER
// (ainda não usada) poderia no futuro escolher "cloud" aqui e instanciar um
// CloudStorageProvider no lugar - ver docs/central-fotos-migracao-nuvem.md.
// O resto do módulo só conhece originalStorage/optimizedStorage/thumbnailStorage,
// nunca LocalStorageProvider diretamente.
const originalStorage = new LocalStorageProvider(ORIGINAL_DIR);
const optimizedStorage = new LocalStorageProvider(OPTIMIZED_DIR);
const thumbnailStorage = new LocalStorageProvider(THUMBNAILS_DIR);

module.exports = { originalStorage, optimizedStorage, thumbnailStorage };

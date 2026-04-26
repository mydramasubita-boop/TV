// scripts/cap-setup.mjs
// Questo script va eseguito UNA VOLTA dopo "npx cap add android"
// con il comando: npm run cap:setup
// Copia il MainActivity.kt corretto nella cartella Android generata da Capacitor

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src  = join(root, 'android-patches', 'MainActivity.kt');
const dest = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'mydramalife', 'tv', 'MainActivity.kt');
const destDir = dirname(dest);

if (!existsSync(join(root, 'android'))) {
  console.error('❌ Cartella android/ non trovata. Esegui prima: npx cap add android');
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

copyFileSync(src, dest);
console.log('✅ MainActivity.kt copiato correttamente in:', dest);
console.log('✅ Ora esegui: npx cap copy android  →  poi apri Android Studio');

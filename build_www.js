const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// Crear o limpiar www
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Elementos a incluir en la compilación web
const itemsToCopy = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons', 'components'];

itemsToCopy.forEach((item) => {
  const srcPath = path.join(srcDir, item);
  const destPath = path.join(destDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursiveSync(srcPath, destPath);
    console.log(`[Build WWW]: Copiado ${item}`);
  }
});

console.log('[Build WWW]: Compilación web completa en ./www');

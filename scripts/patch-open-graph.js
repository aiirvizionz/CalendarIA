const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const pngUrl = 'https://calendaria.onrender.com/assets/calendaria-og.png?v=2';

let html = fs.readFileSync(indexPath, 'utf8');

html = html
  .replaceAll('https://calendaria.onrender.com/assets/calendaria-og.svg?v=1', pngUrl)
  .replace('<meta property="og:image:type" content="image/svg+xml">', '<meta property="og:image:type" content="image/png">');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Open Graph preview configured with PNG image.');

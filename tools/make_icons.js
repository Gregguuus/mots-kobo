// Génère les icônes PNG de l'appli depuis tools/icon.svg (Playwright). Usage : node tools/make_icons.js
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg')); const b = await chromium.launch(); const p = await b.newPage();
  for (const s of [180, 192, 512]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent('<body style="margin:0"><img src="data:image/svg+xml;base64,' + svg.toString('base64') + '" width="' + s + '" height="' + s + '" style="display:block"></body>');
    await p.screenshot({ path: path.join(__dirname, '..', 'icon-app-' + s + '.png') });
  }
  await b.close();
})();

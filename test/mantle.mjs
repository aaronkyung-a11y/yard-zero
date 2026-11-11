import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 420, height: 200 } })).newPage();
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz);
const r = await page.evaluate(() => new Promise((res) => {
  const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; document.getElementById('btnStart').click(); y.game.between = 9999;
  const c = y.colliders.find((c) => c.m === 2 && c.y0 === 0 && c.y1 >= 1.19 && c.y1 <= 1.21 && !y.colliders.some((o) => o !== c && o.x0 < c.x1 + 0.2 && o.x1 > c.x0 - 0.2 && o.z0 < c.z1 + 2.2 && o.z1 > c.z1 && o.y1 > 0.3));
  y.player.pos.set((c.x0 + c.x1) / 2, 0, c.z1 + 1.2); y.player.vel.set(0, 0, 0); y.player.yaw = 0; y.input.keys.KeyW = true;
  const log = []; let n = 0, jumped = false, inside = 0, maxY = 0, stood = 0;
  const f = () => { n++; const p = y.player.pos; if (!jumped && p.z <= c.z1 + 0.33) { y.input.jump = true; jumped = true; }
    if (p.z > c.z0 && p.z < c.z1 && p.y < c.y1 - 0.01) inside++;
    if (p.z > c.z0 && p.z < c.z1 && Math.abs(p.y - c.y1) < 0.001 && y.player.grounded) stood++;
    maxY = Math.max(maxY, p.y);
    if (n < 90) requestAnimationFrame(f); else res({ jumped, insideFrames: inside, framesStandingOnTop: stood, maxY: +maxY.toFixed(3), endZ: +p.z.toFixed(2), endY: +p.y.toFixed(2) }); };
  f();
}));
console.log(JSON.stringify(r));
await browser.close();

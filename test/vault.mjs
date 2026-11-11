import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 420, height: 200 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz);
const run = (sel) => page.evaluate((sel) => new Promise((res) => {
  const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true;
  if (y.game.state !== 'playing') document.getElementById('btnStart').click();
  y.game.between = 9999;
  const free = (c) => !y.colliders.some((o) => o !== c && o.x0 < c.x1 + 0.3 && o.x1 > c.x0 - 0.3 && o.z0 < c.z1 + 2.4 && o.z1 > c.z0 - 2.4 && o.y1 > 0.3);
  const c = sel === 'barrier' ? y.colliders.find((c) => c.m === 0 && Math.abs(c.y1 - 0.85) < 0.01 && c.x1 - c.x0 > 2 && free(c))
    : sel === 'crate' ? y.colliders.find((c) => c.m === 2 && c.y0 === 0 && Math.abs(c.y1 - 1.2) < 0.01 && free(c))
    : y.colliders.find((c) => c.m === 1 && c.y1 > 2.5 && c.x1 - c.x0 > 5 && c.z0 > -20 && c.z1 < 10);
  if (!c) return res({ sel, found: false });
  y.player.pos.set((c.x0 + c.x1) / 2, 0, c.z1 + 1.5); y.player.vel.set(0, 0, 0); y.player.yaw = 0; y.player.pitch = 0;
  for (const k in y.input.keys) y.input.keys[k] = false;
  y.input.keys.KeyW = true;
  let n = 0, maxY = 0, inside = 0; const t0 = y.game.time;
  const f = () => { n++; const p = y.player.pos; maxY = Math.max(maxY, p.y);
    if (p.x > c.x0 && p.x < c.x1 && p.z > c.z0 + 0.05 && p.z < c.z1 - 0.05 && p.y < c.y1 - 0.02) inside++;
    if (y.game.time - t0 < 2.6) requestAnimationFrame(f); else { y.input.keys.KeyW = false; res({ sel, found: true, top: c.y1, maxY: +maxY.toFixed(2), passed: p.z < c.z0, endZ: +p.z.toFixed(2), z0: +c.z0.toFixed(2), z1: +c.z1.toFixed(2), insideFrames: inside }); } };
  f();
}), sel);
for (const s of ['barrier', 'crate', 'container']) console.log(JSON.stringify(await run(s)));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

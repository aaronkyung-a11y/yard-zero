import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 420, height: 200 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed));
const r = await page.evaluate(() => new Promise((res) => {
  const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.MOCAP.ready = false;
  document.getElementById('btnStart').click(); y.game.between = 9999; y.player.hp = 1e9;
  const e = y.spawnEnemy(-6, 12), t0 = y.game.time; let killed = false;
  const f = () => { const t = y.game.time - t0; if (t > 2 && !killed) { killed = true; e.damage(500, 2, { x: 0, y: 0, z: -1 }); }
    if (t < 4) requestAnimationFrame(f); else res({ puppet: !e.body.gun, dead: e.dead, state: e.state, kills: y.game.kills }); };
  f();
}));
console.log(JSON.stringify(r), errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(500);
// 폭발 지점 근처에 적 3명(얼림)을 세우고 직접 폭발시킨다. 화면은 폭발 직후 한 프레임에서 멈춰 찍는다.
const r = await ev(() => new Promise((res) => {
  const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; y.player.pos.set(-0.5, 0, 22); y.player.yaw = 0; y.player.pitch = -0.05;
  for (const [x, z, t] of [[-1.6, 13.2, 'rifle'], [0.9, 12.6, 'rusher'], [-0.3, 10.6, 'heavy']]) { const e = y.spawnEnemy(x, z, t); e.state = 'combat'; e.react = 1e9; e.tactic = 1e9; e.seeT = 1e9; e.canSee = true; }
  let n = 0; const f = () => { n++; if (n === 20) { y.explode(-0.4, 0.05, 12.4); } if (n === 23) { res({ dust: y.dust.n, sparks: y.sparks.n, kills: y.game.kills, hp: y.enemies.map((e) => Math.round(e.hp)), t: y.game.time }); y.game.state = 'paused'; return; } requestAnimationFrame(f); }; f();
}));
console.log(JSON.stringify(r));
await page.screenshot({ path: 'test/v-boomA.png' });
await ev(() => { window.__yz.game.state = 'playing'; });
await ev(() => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => { if (y.game.time - t0 >= 0.8) { y.game.state = 'paused'; res(); } else requestAnimationFrame(f); }; f(); }));
await page.screenshot({ path: 'test/v-boomB.png' });
await ev(() => { window.__yz.game.state = 'playing'; });
await ev(() => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => { if (y.game.time - t0 >= 2.5) { y.game.state = 'paused'; res(); } else requestAnimationFrame(f); }; f(); }));
await page.screenshot({ path: 'test/v-boomC.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

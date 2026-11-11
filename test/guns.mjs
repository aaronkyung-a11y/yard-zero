// 총기 4종 뷰모델 확인 (지향 / 정조준)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 360 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const gwait = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
await ev(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(500);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; y.player.pos.set(-0.5, 0, 19.5); y.player.yaw = 0.5; y.player.pitch = 0.03; document.getElementById('touch').style.display = 'none'; });
const only = process.argv[2];
for (const k of ['ar', 'shotgun', 'dmr', 'pistol']) {
  if (only && only !== k) continue;
  await ev((k) => { const y = window.__yz; y.input.ads = false; if (y.vm.cur !== k) y.switchWeapon(k); }, k);
  await gwait(0.9);
  await page.screenshot({ path: `test/g-${k}-hip.png` });
  await ev(() => { window.__yz.input.ads = true; });
  await gwait(0.5);
  await page.screenshot({ path: `test/g-${k}-ads.png` });
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();

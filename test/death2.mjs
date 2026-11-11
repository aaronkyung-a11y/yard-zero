// 고위력 사살 시 넉백 클립 사망 경로 확인
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 480, height: 230 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; document.getElementById('btnStart').click(); });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => new Promise((res) => {
  const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; y.player.pos.set(0, 0, 27);
  const kinds = {}; let n = 0;
  const one = () => {
    y.enemies.forEach((e) => e.remove()); y.enemies.length = 0;
    y.spawnEnemy(0, 21, 'rifle'); const e = y.enemies[0]; e.pos.x = 0; e.pos.z = 21; e.bodyYaw = 0; e.aimYaw = 0; e.crouch = 0; // 플레이어(+z)를 보고 선 적
    e.damage(9999, 1, { x: 0, y: 0, z: -1 }, n % 2 ? 6.5 : 3);                                                                // 플레이어 쪽에서 날아온 탄
    kinds[e.deathKind] = (kinds[e.deathKind] || 0) + 1;
    const t0 = y.game.time;
    const f = () => { if (y.game.time - t0 < 1.4) return requestAnimationFrame(f); const h = new y.scene.position.constructor(); e.body.b && e.body.b.head.getWorldPosition(h); kinds.lastHeadY = +h.y.toFixed(2); if (++n < 12) one(); else res(kinds); };
    f();
  };
  one();
}));
console.log(JSON.stringify(out));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// v0.10 지휘관(보스) 화면 확인용 캡처: 생김새, 체력 막대, 포격 예고 원, 작전 목록, 세로 화면
// 사용: node test/bossshots.mjs
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
async function open(w, h) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true })).newPage();
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
  await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const y = window.__yz;
    y.opt.quality = 'high'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false;
    window.T = {
      lane(dist, mg = 3) {
        for (let z = y.B.z0 + mg; z < y.B.z1 - mg; z += 1.5) for (let x = y.B.x0 + mg; x < y.B.x1 - dist - mg; x += 1.5) {
          let ok = true;
          for (let k = -1.5; k <= dist + 1.5; k += 0.5) if (y.blockedAt(x + k, z) || y.blockedAt(x + k, z + 1.5) || y.blockedAt(x + k, z - 1.5)) { ok = false; break; }
          if (ok && y.losClear(x, 0.4, z, x + dist, 0.4, z) && y.losClear(x, 1.6, z, x + dist, 1.6, z)) return { x, z };
        }
        return null;
      },
      clear() { for (const e of y.enemies) e.remove(); y.enemies.length = 0; y.barrageClear(); y.game.queue.length = 0; y.game.toSpawn = 0; },
      // 플레이어를 L에 세우고 +x를 보게 한 뒤, 지휘관을 d만큼 앞에 세운다. yaw: 지휘관이 보는 쪽
      pose(type, L, d, yaw, f) {
        const p = y.player;
        y.prog.maxHp = 1e7; p.hp = 1e7;
        p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0); p.yaw = -Math.PI / 2; p.pitch = 0;
        const e = y.spawnEnemy(L.x + d, L.z, type);
        for (let i = 0; i < 40; i++) { e.pos.set(L.x + d, 0, L.z); e.path = null; e.vx = e.vz = 0; e.aimYaw = e.bodyYaw = yaw; e.burst = 0; e.burstCd = 9; if (f) f(e); y.step(1, 1 / 60); p.pos.set(L.x, 0, L.z); p.yaw = -Math.PI / 2; p.pitch = 0; }
        y.player.hp = 100; y.prog.maxHp = 100; y.step(1, 1 / 600);
        return e;
      },
    };
  });
  return page;
}
const snap = async (page, name) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(350); await page.screenshot({ path: `test/${name}.png` }); console.log('shot', name); };

// ── 가로 화면
let page = await open(844, 390);
await page.evaluate(() => { const y = window.__yz; document.getElementById('btnStart').click(); y.game.between = 1e9; y.dbg.freeze = true; });
await page.evaluate(() => { const y = window.__yz, L = window.T.lane(12, 14) || window.T.lane(12); window.L = L; window.T.clear(); window.T.pose('jugg', L, 6.5, -Math.PI / 2); });
await snap(page, 'boss-jugg-front');
await page.evaluate(() => { const y = window.__yz; window.T.clear(); const n = y.spawnEnemy(window.L.x + 6.5, window.L.z - 1.6, 'rifle'); n.aimYaw = n.bodyYaw = -Math.PI / 2; window.T.pose('jugg', window.L, 6.5, -Math.PI / 2, () => { n.pos.set(window.L.x + 6.5, 0, window.L.z - 1.6); n.path = null; n.vx = n.vz = 0; n.burst = 0; n.burstCd = 9; n.aimYaw = n.bodyYaw = -Math.PI / 2; }); });
await snap(page, 'boss-jugg-vs-rifle'); // 보통 병사와의 크기 비교
await page.evaluate(() => { window.T.clear(); window.T.pose('jugg', window.L, 6.5, -Math.PI / 2, (e) => { e.state = 'combat'; e.reload = 3; e.mag = 0; }); });
await snap(page, 'boss-jugg-reload');
await page.evaluate(() => { window.T.clear(); window.T.pose('jugg', window.L, 6.5, Math.PI / 2); });
await snap(page, 'boss-jugg-back');
await page.evaluate(() => { window.T.clear(); window.T.pose('bomb', window.L, 9, -Math.PI / 2); });
await snap(page, 'boss-bomb-front');
await page.evaluate(() => {
  const y = window.__yz, L = window.L;
  window.T.clear();
  const e = window.T.pose('bomb', L, 16, -Math.PI / 2, (q) => { q.boss.shellT = 99; });
  y.barrageApply({ t: 'bt', y: 0, r: 4.2, d: 75, p: [[L.x + 7, L.z, 1.5], [L.x + 11, L.z + 4.5, 1.5], [L.x + 12, L.z - 4.2, 1.5]] });
  for (let i = 0; i < 40; i++) { e.pos.set(L.x + 16, 0, L.z); e.path = null; e.burst = 0; e.burstCd = 9; e.boss.shellT = 99; y.step(1, 1 / 60); y.player.pos.set(L.x, 0, L.z); y.player.yaw = -Math.PI / 2; y.player.pitch = -0.12; }
});
await snap(page, 'boss-rings-ahead'); // 앞쪽 바닥의 원(안쪽이 차오르는 중)
await page.evaluate(() => {
  const y = window.__yz, L = window.L;
  y.barrageClear();
  const e = y.bossOf();
  y.barrageApply({ t: 'bt', y: 0, r: 4.2, d: 75, p: [[L.x + 1, L.z, 1.5]] });
  for (let i = 0; i < 50; i++) { e.pos.set(L.x + 16, 0, L.z); e.path = null; e.burst = 0; e.burstCd = 9; e.boss.shellT = 99; y.step(1, 1 / 60); y.player.pos.set(L.x, 0, L.z); y.player.yaw = -Math.PI / 2; y.player.pitch = -0.25; }
});
await snap(page, 'boss-rings-inside'); // 원 안에 서 있을 때: 경고
await page.evaluate(() => { const y = window.__yz; y.dbg.freeze = false; y.quitToMenu(); localStorage.removeItem('yz.camp'); y.openEpisodes(); });
await snap(page, 'boss-eps-land');
await page.evaluate(() => { const y = window.__yz; y.dbg.freeze = true; document.getElementById('ep4').click(); for (let i = 0; i < 400 && !y.bossOf(); i++) y.step(1, 0.05); const b = y.bossOf(), p = y.player; y.prog.maxHp = 1e7; p.hp = 1e7; for (let i = 0; i < 60; i++) y.step(1, 0.05); p.yaw = Math.atan2(-(b.pos.x - p.pos.x), -(b.pos.z - p.pos.z)); p.pitch = 0; p.hp = 100; y.prog.maxHp = 100; y.step(1, 1 / 600); });
await snap(page, 'boss-ep5-dock-dawn'); // 작전 5: 부두·새벽, 목표 문구 아래의 체력 막대와 표식
await page.evaluate(() => { const y = window.__yz; y.dbg.freeze = false; y.quitToMenu(); y.loadMap('depot', 'dawn'); });
await page.waitForTimeout(600);
await snap(page, 'boss-depot-dawn-menu');
await page.close();

// ── 세로 화면
page = await open(390, 844);
await page.evaluate(() => { const y = window.__yz; document.getElementById('btnStart').click(); y.game.between = 1e9; y.dbg.freeze = true; const L = window.T.lane(12, 14) || window.T.lane(12); window.L = L; window.T.clear(); window.T.pose('jugg', L, 6.5, -Math.PI / 2); y.feed && 0; });
await snap(page, 'boss-port-hud');
await page.evaluate(() => { const y = window.__yz; y.dbg.freeze = false; y.quitToMenu(); localStorage.removeItem('yz.camp'); y.openEpisodes(); });
await snap(page, 'boss-eps-port');
await page.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

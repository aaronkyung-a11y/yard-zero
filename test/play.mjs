// 기능 검증: 실제 터치 이벤트 + 자동 조준 봇으로 웨이브 진행·피격·사망·재시작을 확인한다 (저해상도로 빠르게).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 560, height: 260 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });

await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; });
await page.waitForFunction(() => window.__yz.MOCAP.ready || window.__yz.MOCAP.failed);
await page.tap('#btnStart');
await wait(800);
const out = {};
out.started = await ev(() => window.__yz.game.state);

// 프레임 속도 측정
out.fps = await ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(+(n / 2).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));

// 1) 터치: 오른쪽 드래그 → 시점 회전
const s0 = await ev(() => ({ yaw: window.__yz.player.yaw, pitch: window.__yz.player.pitch, x: window.__yz.player.pos.x, z: window.__yz.player.pos.z }));
await touch('touchStart', [[1, 400, 100]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[1, 400 + i * 12, 100 + i * 3]]); await wait(40); }
await touch('touchEnd', []);
await wait(200);
const s1 = await ev(() => ({ yaw: window.__yz.player.yaw, pitch: window.__yz.player.pitch }));
out.look = { dyaw: +(s1.yaw - s0.yaw).toFixed(3), dpitch: +(s1.pitch - s0.pitch).toFixed(3) };
await ev(() => { window.__yz.player.yaw = 0; window.__yz.player.pitch = 0; });

// 2) 터치: 왼쪽 조이스틱 앞으로 + 동시에 사격 버튼 (멀티터치)
await touch('touchStart', [[1, 90, 190]]);
await touch('touchMove', [[1, 90, 150]]);
await wait(900);
const fire = await ev(() => { const r = document.getElementById('bFire').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await touch('touchStart', [[1, 90, 150], [2, fire[0], fire[1]]]);
await wait(700);
await touch('touchMove', [[1, 90, 150], [2, fire[0] - 20, fire[1]]]);
await wait(200);
await touch('touchEnd', [[1, 90, 150]]);
await wait(100);
await touch('touchEnd', []);
await wait(300);
const s2 = await ev(() => ({ x: window.__yz.player.pos.x, z: window.__yz.player.pos.z, ammo: window.__yz.W.ar.ammo, yaw: window.__yz.player.yaw, fire: window.__yz.input.fire, mz: window.__yz.input.mz }));
out.move = { dz: +(s2.z - s0.z).toFixed(2), ammoAfterFire: s2.ammo, yawAfterFireDrag: +s2.yaw.toFixed(3), fireReleased: !s2.fire, stickReleased: s2.mz === 0 };

// 3) 버튼: 재장전 / 정조준 / 앉기 / 무기 교체 / 일시정지
await page.tap('#bReload'); await wait(300);
out.reloading = await ev(() => window.__yz.vm.reloadT > 0);
await page.tap('#bAds'); await wait(400);
out.ads = await ev(() => window.__yz.input.ads);
await page.tap('#bAds'); await page.tap('#bCrouch'); await wait(300);
out.crouch = await ev(() => window.__yz.player.crouch);
await page.tap('#bCrouch');
await page.tap('#ammo'); await wait(900);
out.weapon = await ev(() => window.__yz.vm.cur);
await page.tap('#ammo'); await wait(900);
await page.tap('#bPause'); await wait(300);
out.paused = await ev(() => window.__yz.game.state);
await page.tap('#btnResume'); await wait(300);
out.resumed = await ev(() => window.__yz.game.state);

// 3b) 무기 교체 순환·산탄총 펌프와 한 발씩 장전·스코프·수류탄
const gw = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.game.toSpawn = 0; y.enemies.forEach((e) => e.remove()); y.enemies.length = 0; y.player.hp = 1e9; y.player.pos.set(0, 0, 27); y.player.yaw = 0; y.player.pitch = 0.2; y.prog.owned.shotgun = y.prog.owned.dmr = true; });
await ev(() => window.__yz.switchWeapon('shotgun')); await gw(0.7);
out.w1 = await ev(() => window.__yz.vm.cur);
const fireBtn = await ev(() => { const r = document.getElementById('bFire').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
for (let i = 0; i < 6; i++) { await touch('touchStart', [[1, fireBtn[0], fireBtn[1]]]); await gw(0.08); await touch('touchEnd', []); await gw(1.0); }
out.sgAfter6 = await ev(() => ({ ammo: window.__yz.W.shotgun.ammo, reserve: window.__yz.W.shotgun.reserve, shots: window.__yz.game.shots }));
await gw(5.0);
out.sgReloaded = await ev(() => ({ ammo: window.__yz.W.shotgun.ammo, reserve: window.__yz.W.shotgun.reserve, reloading: window.__yz.vm.reloadT > 0 }));
await ev(() => window.__yz.switchWeapon('dmr')); await gw(0.7);
out.w2 = await ev(() => window.__yz.vm.cur);
await page.tap('#bAds'); await gw(0.6);
out.scope = await ev(() => ({ overlay: !document.getElementById('scope').classList.contains('hidden'), rigHidden: !window.__yz.VM.rig.visible, fov: +window.__yz.camera.fov.toFixed(1) }));
await touch('touchStart', [[1, fireBtn[0], fireBtn[1]]]); await gw(0.08); await touch('touchEnd', []); await gw(0.5);
out.dmrAmmo = await ev(() => window.__yz.W.dmr.ammo);
await page.tap('#bAds'); await gw(0.3);
await ev(() => window.__yz.switchWeapon('ar')); await gw(0.7);
out.w4 = await ev(() => window.__yz.vm.cur);
await page.tap('#bGren'); await gw(0.3);
out.grenThrown = await ev(() => ({ n: window.__yz.gren.n, live: window.__yz.gren.list.length }));
await gw(3.0);
out.grenDone = await ev(() => ({ live: window.__yz.gren.list.length }));
await ev(() => { const y = window.__yz; y.player.hp = 100; y.game.wave = 0; y.game.between = 0.5; });

// 4) 자동 조준 봇으로 웨이브 진행 (게임 시간 기준)
await ev(() => {
  const y = window.__yz;
  y.player.pos.set(0, 0, 27);
  y.botLog = { maxEnemies: 0, combatSeen: 0, kneelSeen: 0, backSeen: 0, autoFrames: 0, body: '' };
  y.bot = setInterval(() => {
    if (y.game.state === 'supply') { y.botLog.supply = (y.botLog.supply || 0) + 1; y.pickSupply(0); return; }
    if (y.game.state !== 'playing') return;
    for (const e of y.enemies) { if (e.dead && !e._c) { e._c = 1; y.botLog.deaths = y.botLog.deaths || {}; y.botLog.deaths[e.deathKind] = (y.botLog.deaths[e.deathKind] || 0) + 1; } if (e.rollT > 0 && !e._r) { e._r = 1; y.botLog.rolls = (y.botLog.rolls || 0) + 1; } if (!(e.rollT > 0)) e._r = 0; if (e.body.ovl && !e.body.ovl.full && !e._h) { e._h = 1; y.botLog.hitClips = (y.botLog.hitClips || 0) + 1; } if (!e.body.ovl) e._h = 0; if (e.pos.x > 43) y.botLog.inWarehouse = (y.botLog.inWarehouse || 0) + 1; }
    y.botLog.maxEnemies = Math.max(y.botLog.maxEnemies, y.enemies.filter((e) => !e.dead).length); if (y.enemies[0]) y.botLog.body = y.enemies[0].body.gun ? 'mocap' : 'puppet';
    let best = null, bd = 1e9;
    for (const e of y.enemies) { if (e.dead || !e.canSee) continue; const d = e.pos.distanceTo(y.player.pos); if (d < bd) { bd = d; best = e; } if (e.state === 'combat') y.botLog.combatSeen++; }
    if (best) {
      const c = y.camera.position, dx = best.pos.x - c.x, dy = 1.35 - c.y, dz = best.pos.z - c.z;
      // 봇은 대충(약 1.5° 오차) 겨누기만 한다: 조준 보조가 끌어당기고 자동 사격이 쏜다
      if (y.aa.e !== best || y.aa.ang > 0.06) { y.player.yaw = Math.atan2(-dx, -dz) + 0.026; y.player.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - 0.01; }
      if (best.crouch > 0.5) y.botLog.kneelSeen++; if (best.back) y.botLog.backSeen++;
      if (y.vm.autoFiring) y.botLog.autoFrames++;
    }
  }, 30);
});
const t0 = Date.now();
let last = null;
while (Date.now() - t0 < 185000) {
  await wait(5000);
  last = await ev(() => { const y = window.__yz; return { state: y.game.state, t: +y.game.time.toFixed(1), wave: y.game.wave, kills: y.game.kills, hs: y.game.headshots, score: y.game.score, hp: Math.round(y.player.hp), alive: y.enemies.filter((e) => !e.dead).length, toSpawn: y.game.toSpawn, ammo: y.W.ar.ammo + '/' + y.W.ar.reserve, types: y.enemies.filter((e) => !e.dead).map((e) => e.T.key[0]).join(''), pickups: y.pickups.length, log: y.botLog }; });
  console.log(JSON.stringify(last));
  if (last.state !== 'playing' || last.wave >= 4) break;
}
out.bot = last;
await page.screenshot({ path: 'test/20-bot.png' });

// 5) 사망 → 결과 화면 → 재시작
await ev(() => { const y = window.__yz; clearInterval(y.bot); y.input.fire = false; y.input.ads = false; if (y.player.alive) y.hurtPlayer(999, { x: 0, z: 0 }); });
await page.waitForFunction(() => window.__yz.game.state === 'over', null, { timeout: 60000 });
await page.screenshot({ path: 'test/21-over.png' });
out.over = await ev(() => ({ wave: document.getElementById('oWave').textContent, score: document.getElementById('oScore').textContent, acc: document.getElementById('oAcc').textContent, eyebrow: document.getElementById('overEyebrow').textContent }));
await page.tap('#btnAgain');
await wait(600);
out.restart = await ev(() => { const y = window.__yz; return { state: y.game.state, hp: y.player.hp, enemies: y.enemies.length, score: y.game.score, ammo: y.W.ar.ammo }; });

console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? 'CONSOLE:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'no console errors');
await browser.close();

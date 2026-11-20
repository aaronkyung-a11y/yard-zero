// v0.10 지휘관(보스) 검증(혼자): 방탄 배율, 비틀거림, 단계 전환, 철갑의 사격·장전 주기, 유탄, 화약고의 포격 무늬와 피해, 체력 막대, 피격 판정 크기, 자동 사격 보류
// 사용: node test/boss.mjs [shots]   (shots: 화면 캡처도 남긴다)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const shots = process.argv[2] === 'shots';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text()); }); // 외부 요청은 일부러 막아 둔다
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
const out = {}, fails = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' → ' + JSON.stringify(info) : '')); };
const ev = (fn, arg) => page.evaluate(fn, arg);

// 공통 도구: 탁 트인 직선 자리 찾기, 적 비우기
await ev(() => {
  const y = window.__yz;
  y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false;
  window.T = {
    lane(dist, mg = 3) { // x축으로 dist만큼 막힘 없는 자리. mg: 맵 가장자리에서 떨어질 거리
      for (let z = y.B.z0 + mg; z < y.B.z1 - mg; z += 1.5) for (let x = y.B.x0 + mg; x < y.B.x1 - dist - mg; x += 1.5) {
        let ok = true;
        for (let k = -1.5; k <= dist + 1.5; k += 0.5) if (y.blockedAt(x + k, z) || y.blockedAt(x + k, z + 1) || y.blockedAt(x + k, z - 1)) { ok = false; break; }
        if (ok && y.losClear(x, 0.4, z, x + dist, 0.4, z) && y.losClear(x, 1.6, z, x + dist, 1.6, z)) return { x, z };
      }
      return null;
    },
    clear() { for (const e of y.enemies) e.remove(); y.enemies.length = 0; y.barrageClear(); for (const q of y.pickups) y.scene.remove(q.mesh); y.pickups.length = 0; y.game.queue.length = 0; y.game.toSpawn = 0; },
    god() { y.prog.maxHp = 1e7; y.player.hp = 1e7; },
    face(e, yaw) { e.aimYaw = e.bodyYaw = yaw; },
  };
  document.getElementById('btnStart').click();
  y.game.between = 1e9; // 웨이브는 멈춰 둔다
  window.T.god();
});

// ── A·B·L: 종류, 방탄 배율, 피격 판정 크기
out.armor = await ev(() => {
  const y = window.__yz, p = y.player, L = window.T.lane(12);
  p.pos.set(L.x, 0, L.z);
  const e = y.spawnEnemy(L.x + 12, L.z, 'jugg');
  window.T.face(e, -Math.PI / 2); // 플레이어(−x 쪽)를 마주 본다
  const d = (x, z) => ({ x, y: 0, z }), front = d(1, 0), back = d(-1, 0), side = d(0, 1);
  const r = { hpMax: e.hpMax, hs: e.hs, boss: !!e.boss, key: e.T.key, keys: Object.keys(y.TYPES), kFront: y.bossArmor(e, front, null), kSide: y.bossArmor(e, side, null), kBack: y.bossArmor(e, back, null), kBlast: y.bossArmor(e, front, { x: 0, y: 0, z: 0, power: 3 }) };
  const hit = (dir, part = 1) => { const h0 = e.hp; e.damage(100, part, dir, 3); return +(h0 - e.hp).toFixed(1); };
  r.dFront = hit(front); r.dSide = hit(side); r.dBack = hit(back);
  e.reload = 2; e.boss.expose = true; r.dFrontReload = hit(front);
  e.reload = 0; e.boss.expose = false;
  // 피격 판정: 2.15m 높이의 수평선은 철갑의 머리에 맞고(머리 중심 2.24m), 보통 병사 위로는 지나간다
  const o = { x: L.x, y: 2.15, z: L.z }, dir = { x: 1, y: 0, z: 0 };
  r.rayBoss = +y.rayEnemy(e, o, dir, 100).toFixed(2); r.partBoss = y.rayEnemy.part;
  const n = y.spawnEnemy(L.x + 6, L.z, 'rifle');
  r.rayRifle = y.rayEnemy(n, o, dir, 100);
  n.remove(); y.enemies.splice(y.enemies.indexOf(n), 1);
  r.chest = +y.chestY(e).toFixed(2);
  e.hp = e.hpMax;
  return r;
}).catch((err) => ({ err: String(err) }));
console.log('armor', JSON.stringify(out.armor));
{ const a = out.armor;
  check('종류 추가(끝에 붙어야 기존 번호가 안 바뀐다)', a.keys && a.keys.join() === 'rifle,rusher,heavy,sniper,jugg,bomb', a.keys);
  check('철갑 체력·크기', a.hpMax === 3600 && a.hs === 1.3 && a.boss, a);
  check('방탄 배율 정면 0.2 / 옆 0.6 / 뒤 1 / 폭발 1', a.kFront === 0.2 && a.kSide === 0.6 && a.kBack === 1 && a.kBlast === 1, a);
  check('피해 100 → 정면 20 / 옆 60 / 뒤 100 / 장전 중 125', a.dFront === 20 && a.dSide === 60 && a.dBack === 100 && a.dFrontReload === 125, a);
  check('피격 판정 크기: 2.15m 높이가 철갑 머리에 맞고 보통 병사는 빗나간다', a.rayBoss > 11 && a.partBoss === 2 && a.rayRifle === -1, a); }

// ── C: 수류탄 → 비틀거림(2.6초, 11초에 한 번), 폭발은 방탄 무시
out.stagger = await ev(() => {
  const y = window.__yz, e = y.bossOf(), r = {};
  const h0 = e.hp;
  y.explode(e.pos.x + 1.5, 0.5, e.pos.z); // 1.5m 옆에서 폭발
  r.blastDmg = Math.round(h0 - e.hp); r.stagT = e.boss.stagT; r.stagCd = e.boss.stagCd; r.expose = e.boss.expose;
  const yaw0 = e.aimYaw;
  y.player.pos.z += 9; // 옆으로 돌아가도 비틀거리는 동안에는 돌아서지 못한다
  y.step(20, 0.05);
  r.after1s = { stagT: +e.boss.stagT.toFixed(2), turned: +Math.abs(e.aimYaw - yaw0).toFixed(3), speed: +e.speed.toFixed(2), burst: e.burst, crouch: +e.crouch.toFixed(2) };
  r.frontWhileStag = (() => { const h = e.hp; e.damage(100, 1, { x: 1, y: 0, z: 0 }, 3); return Math.round(h - e.hp); })();
  y.explode(e.pos.x + 1.5, 0.5, e.pos.z); // 쿨다운 중: 다시 비틀거리지 않는다
  r.stag2 = +e.boss.stagT.toFixed(2);
  y.step(40, 0.05);
  r.after3s = { stagT: +Math.max(0, e.boss.stagT).toFixed(2), expose: e.boss.expose, cd: +e.boss.stagCd.toFixed(1) };
  y.player.pos.z -= 9;
  return r;
});
console.log('stagger', JSON.stringify(out.stagger));
{ const a = out.stagger;
  check('폭발 피해가 방탄 없이 들어간다(1.5m 거리 160 안팎)', a.blastDmg > 120 && a.blastDmg <= 200, a.blastDmg);
  check('비틀거림 시작', a.stagT === 2.6 && a.stagCd === 11 && a.expose === true, a);
  check('비틀거리는 동안 멈춰 서고 돌아서지 못한다', a.after1s.stagT > 1.4 && a.after1s.turned < 0.01 && a.after1s.speed < 0.3 && a.after1s.burst === 0, a.after1s);
  check('비틀거리는 동안 정면도 1.25배로 들어간다', a.frontWhileStag === 125, a.frontWhileStag);
  check('쿨다운 중에는 다시 비틀거리지 않는다', a.stag2 < 2.6 && a.after3s.stagT === 0 && a.after3s.cd > 7, a); }

// ── D·E: 단계 전환(66% · 33%) → 증원·보급품, 체력 막대
out.phase = await ev(() => {
  const y = window.__yz, e = y.bossOf(), r = {};
  y.game.queue.length = 0; y.game.toSpawn = 0;
  const pk0 = y.pickups.length;
  e.hp = e.hpMax * 0.9; y.step(2, 0.05);
  const hud = () => { const b = document.getElementById('boss'), f = document.getElementById('bossFill').style.transform; return { shown: !b.classList.contains('hidden'), n: document.getElementById('bossN').textContent, s: document.getElementById('bossS').textContent, fill: +(/scaleX\(([\d.]+)\)/.exec(f) || [0, -1])[1], open: b.classList.contains('open'), low: b.classList.contains('low'), body: document.body.classList.contains('bossOn') }; };
  r.hud90 = hud(); r.ph90 = e.boss.phase;
  e.hp = e.hpMax * 0.65; y.step(2, 0.05);
  r.ph65 = e.boss.phase; r.q65 = [...y.game.queue]; r.toSpawn65 = y.game.toSpawn; r.pk65 = y.pickups.slice(pk0).map((q) => q.type);
  e.hp = e.hpMax * 0.3; y.step(2, 0.05);
  r.ph30 = e.boss.phase; r.q30 = [...y.game.queue]; r.toSpawn30 = y.game.toSpawn; r.pk30 = y.pickups.slice(pk0).map((q) => q.type);
  r.hud30 = hud();
  r.feed = [...document.getElementById('feed').children].map((q) => q.textContent);
  y.game.queue.length = 0; y.game.toSpawn = 0;
  return r;
});
console.log('phase', JSON.stringify(out.phase));
{ const a = out.phase;
  check('체력 막대 표시', a.hud90.shown && a.hud90.n === '지휘관 철갑' && Math.abs(a.hud90.fill - 0.9) < 0.01 && a.hud90.body, a.hud90);
  check('66%에서 2단계: 증원 2명, 보급품 3개(의무 1 · 탄약 2)', a.ph90 === 0 && a.ph65 === 1 && a.q65.length === 2 && a.toSpawn65 === 2 && a.pk65.sort().join() === 'ammo,ammo,med', a);
  check('33%에서 3단계(격노): 증원 3명 더, 보급품 3개 더', a.ph30 === 2 && a.q30.length === 5 && a.toSpawn30 === 5 && a.pk30.length === 6, a);
  check('격노 표시', /격노/.test(a.hud30.s) && Math.abs(a.hud30.fill - 0.3) < 0.01, a.hud30); }

// ── F: 철갑의 주기 — 40발을 쏟아붓고(약 2.8초) 그 자리에 앉아 3.6초 장전. 장전 중에는 방탄이 풀린다
out.cycle = await ev(() => {
  const y = window.__yz, p = y.player, L = window.T.lane(14);
  window.T.clear(); window.T.god();
  p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0);
  const e = y.spawnEnemy(L.x + 14, L.z, 'jugg');
  window.T.face(e, -Math.PI / 2);
  const log = [], bursts = [], gaps = [];
  let st = 'idle', t0 = 0, hp0 = p.hp, mag0 = e.mag, cur = null, rlEnd = 0, seenFire = false, seenReload = false, lineMax = 0, lineMin = 9;
  for (let i = 0; i < 700; i++) {
    y.step(1, 0.05);
    const t = y.game.time, ns = e.reload > 0 ? 'reload' : e.burst > 0 ? 'burst' : 'idle';
    const hudS = document.getElementById('bossS').textContent, line = +(/scaleX\(([\d.]+)\)/.exec(document.getElementById('bossT').style.transform) || [0, 0])[1];
    if (ns === 'burst' && /제압 사격/.test(hudS)) seenFire = true;
    if (ns === 'reload') { lineMax = Math.max(lineMax, line); lineMin = Math.min(lineMin, line); if (/장전 중/.test(hudS)) seenReload = true; }
    if (ns !== st) {
      if (st === 'reload') rlEnd = t;
      if (ns === 'burst' && rlEnd > 0) { gaps.push(+(t - rlEnd).toFixed(2)); rlEnd = 0; }
      if (ns === 'burst' && st !== 'burst') cur = { t0: t, d: +Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z).toFixed(1), hp: p.hp, mag: e.mag };
      if (st === 'burst' && cur) { cur.dur = +(t - cur.t0).toFixed(2); cur.shots = cur.mag - e.mag; cur.dmg = Math.round(cur.hp - p.hp); delete cur.hp; delete cur.mag; delete cur.t0; if (ns === 'reload') cur.rl0 = t; bursts.push(cur); }
      if (st === 'reload') { const b = bursts[bursts.length - 1]; if (b && b.rl0) { b.reload = +(t - b.rl0).toFixed(2); delete b.rl0; b.magAfter = e.mag; } }
      st = ns;
    }
    if (ns === 'reload') { const b = bursts[bursts.length - 1]; if (b) { b.expose = e.boss.expose; b.crouch = Math.max(b.crouch || 0, +e.crouch.toFixed(2)); b.spd = Math.max(b.spd || 0, +e.speed.toFixed(2)); b.kFront = y.bossArmor(e, { x: 1, y: 0, z: 0 }, null); } }
    if (bursts.length >= 4 && st !== 'reload') break;
  }
  // 총구는 몸이 향한 쪽을 따라간다: 옆(90도)에 선 표적에게는 돌아서기 전까지 탄이 닿지 않는다
  const L2 = window.T.lane(10);
  window.T.clear(); window.T.god();
  p.pos.set(L2.x, 0, L2.z); p.vel.set(0, 0, 0);
  const s = y.spawnEnemy(L2.x + 8, L2.z, 'jugg');
  const shoot = (yaw) => { s.aimYaw = s.bodyYaw = yaw; s.tg = p; s.canSee = true; s.seenFor = 5; const h = p.hp; for (let i = 0; i < 200; i++) s.fire(); return Math.round(h - p.hp); };
  const sweep = { side: shoot(0), away: shoot(Math.PI / 2), facing: shoot(-Math.PI / 2) };
  window.T.clear();
  return { bursts, gaps, hud: { seenFire, seenReload, lineMax, lineMin }, sweep, t: +y.game.time.toFixed(1), tokens: e.token };
});
console.log('cycle', JSON.stringify(out.cycle));
{ const b = out.cycle.bursts.filter((q) => q.reload);
  check('철갑: 탄창을 비울 때까지 쏜 뒤 장전한다', b.length >= 3 && out.cycle.bursts.reduce((a, q) => a + q.shots, 0) >= 120, out.cycle.bursts);
  check('철갑: 장전 3.6초, 그동안 앉아서 멈추고 방탄이 풀린다(피해 1.25배)', b.every((q) => Math.abs(q.reload - 3.6) < 0.11 && q.expose && q.crouch > 0.9 && q.kFront === 1.25 && q.magAfter === 40), b);
  check('철갑: 40발 연사는 2.8초 안팎', out.cycle.bursts.filter((q) => q.shots === 40).every((q) => Math.abs(q.dur - 2.8) < 0.25), out.cycle.bursts);
  check('철갑: 장전을 마친 뒤 0.9초 뜸을 들인다', out.cycle.gaps.length >= 2 && out.cycle.gaps.every((g) => g >= 0.85 && g <= 1.0), out.cycle.gaps);
  check('막대 문구(제압 사격 / 장전 중)와 틈이 닫히는 선(1 → 0)', out.cycle.hud.seenFire && out.cycle.hud.seenReload && out.cycle.hud.lineMax > 0.95 && out.cycle.hud.lineMin < 0.1, out.cycle.hud);
  check('철갑: 탄은 몸이 향한 쪽으로만 나간다(옆·뒤에 선 표적은 맞지 않는다)', out.cycle.sweep.side === 0 && out.cycle.sweep.away === 0 && out.cycle.sweep.facing > 100, out.cycle.sweep); }

// ── G: 철갑의 유탄 — 2단계부터, 숨은 표적의 자리에 붉은 원 하나(반경 3.4m). 그대로 있으면 맞고 벗어나면 안 맞는다
out.flush = await ev(() => {
  const y = window.__yz, p = y.player, r = {}, L = window.T.lane(14);
  window.T.clear(); window.T.god();
  p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0);
  const e = y.spawnEnemy(L.x + 14, L.z, 'jugg');
  y.step(4, 0.05);
  y.game.queue.length = 0; y.game.toSpawn = 0;
  e.hp = e.hpMax * 0.6; e.reload = 0; e.mag = 40;
  // 지휘관에게서 12~30m 떨어지고 시야가 막힌 자리(선 높이·앉은 높이 모두에서). 지휘관은 제자리에 세워 둔다
  const ex = e.pos.x, ez = e.pos.z, hidden = (c) => [1.7, 2.25].every((h) => !y.losClear(ex, h, ez, c.x, 1.62, c.z) && !y.losClear(ex, h, ez, c.x, 1.0, c.z));
  let spot = null;
  for (let k = 0; k < 4000 && !spot; k++) { const c = y.cellNear(ex, ez, 30); if (!c) continue; const d = Math.hypot(c.x - ex, c.z - ez); if (d > 12 && hidden(c)) spot = c; }
  if (!spot) return { err: 'no hidden spot' };
  p.pos.set(spot.x, 0, spot.z); p.vel.set(0, 0, 0);
  r.dist = +Math.hypot(spot.x - ex, spot.z - ez).toFixed(1);
  e.unseenFor = 0; e.canSee = false;
  let ring = null, t0 = y.game.time;
  for (let i = 0; i < 400 && !ring; i++) { e.pos.set(ex, 0, ez); e.path = null; e.vx = e.vz = 0; y.step(1, 0.05); if (y.barrage.list.length) ring = y.barrage.list[0]; if (e.canSee) { r.sawAt = +(y.game.time - t0).toFixed(1); } }
  if (!ring) return { ...r, err: 'no shell', phase: e.boss.phase, shellT: e.boss.shellT, unseen: e.unseenFor, canSee: e.canSee };
  r.phase = e.boss.phase; r.wait = +(y.game.time - t0).toFixed(1); r.n = y.barrage.list.length;
  r.ring = { off: +Math.hypot(ring.x - p.pos.x, ring.z - p.pos.z).toFixed(2), r: ring.r, dmg: ring.dmg, fuse: +ring.dur.toFixed(2) };
  r.meshes = y.scene.children.includes(ring.m.ring) && y.scene.children.includes(ring.m.disc);
  const hp0 = p.hp;
  for (let i = 0; i < 40 && y.barrage.list.includes(ring); i++) y.step(1, 0.05);
  r.hitStay = Math.round(hp0 - p.hp);
  r.meshGone = !y.scene.children.includes(ring.m.ring);
  return r;
});
console.log('flush', JSON.stringify(out.flush));
{ const a = out.flush;
  check('철갑 유탄: 숨은 표적의 자리에 원 하나', !a.err && a.n === 1 && a.ring.off < 1.2 && a.ring.r === 3.4 && a.ring.dmg === 60 && a.meshes, a);
  check('철갑 유탄: 그대로 있으면 맞는다(중심 60, 조금 움직였으면 그보다 적게)', a.hitStay >= 40 && a.hitStay <= 60 && a.meshGone, a); }

// ── H: 포격의 피해 — 원 한가운데 75, 절반 거리 61, 가장자리 바로 안 21, 원 밖 0. 위층에 있으면 맞지 않는다
out.shell = await ev(() => {
  const y = window.__yz, p = y.player, L = window.T.lane(12), r = {};
  window.T.clear(); window.T.god();
  const at = (dx, dy = 0) => { p.pos.set(L.x + 6 + dx, dy, L.z); p.vel.set(0, 0, 0); const h = p.hp; y.barrageApply({ t: 'bt', y: 0, r: 4.2, d: 75, p: [[L.x + 6, L.z, 0.5]] }); const n = y.barrage.list.length; for (let i = 0; i < 14; i++) y.step(1, 0.05); p.pos.y = 0; return [n, +(h - p.hp).toFixed(1), y.barrage.list.length]; };
  r.c = at(0); r.half = at(2.1); r.edge = at(4.1); r.outside = at(4.3);
  y.prog.lv.armor = 2; r.armor2 = at(0); y.prog.lv.armor = 0;
  y.barrageApply({ t: 'bt', y: 0, r: 99, d: 999, p: [[0, 0, 9]] }); r.clamp = { r: y.barrage.list[0].r, dmg: y.barrage.list[0].dmg, fuse: y.barrage.list[0].dur }; y.barrageClear();
  y.barrageApply({ t: 'bt', y: 0, r: 4, d: 50, p: Array.from({ length: 30 }, (_, i) => [i, 0, 1]) }); r.cap = y.barrage.list.length; y.barrageClear();
  return r;
});
console.log('shell', JSON.stringify(out.shell));
{ const a = out.shell;
  check('포격 피해: 중심 75 / 절반 60.9 / 가장자리 안 21.4 / 밖 0', a.c[1] === 75 && Math.abs(a.half[1] - 60.9) < 0.2 && Math.abs(a.edge[1] - 21.4) < 0.3 && a.outside[1] === 0 && a.c[2] === 0, a);
  check('방탄판 2단계면 30% 덜 받는다', Math.abs(a.armor2[1] - 52.5) < 0.1, a.armor2);
  check('받은 값은 범위 안으로 자른다(반경 8, 피해 120, 4초, 한 번에 16곳)', a.clamp.r === 8 && a.clamp.dmg === 120 && a.clamp.fuse === 4 && a.cap === 16, a); }

// ── H2: 화약고 — 멈춰 서서 무전(1.3초, 방탄 풀림) 뒤 포격. 무늬: 셋(3) / 줄(5) / 둘레(6, 마지막 단계는 +가운데) / 뒤쫓기(한 발씩 4번)
out.bomb = await ev(() => {
  const y = window.__yz, p = y.player, L = window.T.lane(20, 14) || window.T.lane(16, 14), r = { calls: [], pats: {} }; // 포격 지점이 맵 밖으로 잘리지 않게 안쪽에서
  if (!L) return { err: 'no lane' };
  r.L = L;
  window.T.clear(); window.T.god();
  p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0);
  const e = y.spawnEnemy(L.x + 16, L.z, 'bomb');
  window.T.face(e, -Math.PI / 2);
  r.hpMax = e.hpMax; r.hs = e.hs; r.kFront = y.bossArmor(e, { x: 1, y: 0, z: 0 }, null); r.kBack = y.bossArmor(e, { x: -1, y: 0, z: 0 }, null);
  const dmg0 = y.TYPES.bomb.dmg; y.TYPES.bomb.dmg = [0, 0]; // 포격 피해만 재려고 총탄 피해는 잠시 0으로
  let calling = false, c = null, seen = 0;
  const run = (secs, phase) => {
    for (let i = 0; i < secs * 20; i++) {
      const n0 = y.barrage.list.length, hp0 = p.hp;
      y.step(1, 0.05);
      p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0); // 제자리에 서 있는 표적
      if (e.boss.callT > 0 && !calling) { calling = true; c = { t: y.game.time, ph: e.boss.phase, expose: false, spd: 0, kFront: 0, crouch: 0 }; }
      if (calling && e.boss.callT > 0) { c.expose = e.boss.expose; c.spd = +e.speed.toFixed(2); c.kFront = y.bossArmor(e, { x: 1, y: 0, z: 0 }, null); c.crouch = +e.crouch.toFixed(2); } // spd: 무전이 끝날 무렵의 속도
      if (calling && e.boss.callT <= 0) { calling = false; c.dur = +(y.game.time - c.t).toFixed(2); delete c.t; }
      const added = y.barrage.list.length - n0;
      if (added > 0) {
        // 무늬 알아보기: 한 번에 깔린 원의 수로. 한 발짜리는 뒤쫓기(무전 직후부터 4번) 또는 둘레 뒤의 한 발(follow)
        const pts = y.barrage.list.slice(-added), one = added === 1, kind = added >= 6 ? 'ring' : added === 5 ? 'line' : added === 3 ? 'triple' : !one ? 'other' + added : c && c.kind === 'ring' ? 'follow' : 'chase';
        if (kind === 'chase' && c && c.kind === 'chase') c.n++;
        else {
          c = { ...(kind === 'follow' ? {} : c || {}), kind, n: 1, ph: e.boss.phase, cnt: added, fuse: +Math.min(...pts.map((q) => q.dur)).toFixed(2), rr: pts[0].r, dmg: pts[0].dmg, dist: pts.map((q) => +Math.hypot(q.x - p.pos.x, q.z - p.pos.z).toFixed(1)).sort((a, b) => a - b) };
          r.calls.push(c);
          r.pats[kind + '@' + e.boss.phase] = (r.pats[kind + '@' + e.boss.phase] || 0) + 1;
        }
      }
      if (p.hp < hp0 && c) c.hit = Math.round((c.hit || 0) + hp0 - p.hp);
      if (y.game.queue.length) { y.game.queue.length = 0; y.game.toSpawn = 0; } // 증원은 이 검사에서 빼 둔다
      if (e.dead) break;
    }
  };
  run(45, 0);
  e.hp = e.hpMax * 0.6; run(45, 1);
  e.hp = e.hpMax * 0.3; run(45, 2);
  for (let k = 0; k < 6; k++) { e.boss.shellT = 99; run(1, 2); } // 새 포격은 막고, 이미 부른 것(둘레 뒤의 한 발 포함)이 다 떨어질 때까지
  y.TYPES.bomb.dmg = dmg0;
  r.calls = r.calls.map((q) => ({ k: q.kind, ph: q.ph, cnt: q.cnt, n: q.n, fuse: q.fuse, call: q.dur, exp: q.expose, kF: q.kFront, spd: q.spd, cr: q.crouch, dist: q.dist, hit: q.hit || 0 }));
  return r;
});
console.log('bomb', JSON.stringify({ ...out.bomb, calls: undefined }), '\n  calls', out.bomb.calls.length, JSON.stringify(out.bomb.calls.slice(0, 4)), '…');
{ const a = out.bomb, cs = a.calls, of = (k, ph) => cs.filter((q) => q.k === k && (ph === undefined || q.ph === ph));
  check('화약고 체력·크기·방탄', a.hpMax === 2800 && a.hs === 1.18 && a.kFront === 0.55 && a.kBack === 1, a);
  check('1단계 무늬: 셋 / 줄만', of('triple', 0).length > 0 && of('line', 0).length > 0 && !cs.some((q) => q.ph === 0 && q.k !== 'triple' && q.k !== 'line'), a.pats);
  check('2단계 무늬: 셋 / 줄 / 둘레', of('ring', 1).length > 0 && !cs.some((q) => q.ph === 1 && !['triple', 'line', 'ring'].includes(q.k)), a.pats);
  check('3단계 무늬: 둘레(뒤이어 한 발) / 줄 / 뒤쫓기', of('ring', 2).length > 0 && of('chase', 2).length > 0 && of('ring', 2).every((q) => q.cnt === 6) && !cs.some((q) => q.ph === 2 && !['ring', 'line', 'chase', 'follow'].includes(q.k)), a.pats);
  { const main = cs.filter((q) => q.k !== 'follow'); check('같은 무늬를 연달아 쓰지 않는다', main.every((q, i) => i === 0 || q.ph !== main[i - 1].ph || q.k !== main[i - 1].k), main.map((q) => q.k + q.ph).join(' ')); }
  check('무전 1.3초 동안 멈춰 서고 방탄이 풀린다', cs.filter((q) => q.call).length > 5 && cs.filter((q) => q.call).every((q) => Math.abs(q.call - 1.3) < 0.11 && q.exp && q.kF === 1.25 && q.spd < 0.6), cs.filter((q) => q.call).slice(0, 3));
  check('떨어지기까지: 1.5초, 단계마다 0.12초씩 짧아진다', of('triple', 0).every((q) => q.fuse === 1.5) && of('ring', 1).every((q) => q.fuse === 1.38) && of('ring', 2).every((q) => q.fuse === 1.26), cs.map((q) => q.fuse));
  check('셋·줄: 제자리에 서 있으면 한가운데 한 발만 맞는다(75)', [...of('triple'), ...of('line')].every((q) => q.hit === 75), [...of('triple'), ...of('line')].map((q) => q.hit));
  check('둘레(2단계): 가운데에 그대로 있으면 안 맞는다', of('ring', 1).every((q) => q.hit === 0 && q.dist[0] > 6), of('ring', 1).map((q) => [q.hit, q.dist[0]]));
  check('둘레(3단계): 둘레가 터진 뒤 서 있는 자리에 한 발 더(피해 53)', of('ring', 2).every((q) => { const nx = cs[cs.indexOf(q) + 1]; return q.hit === 0 && nx && nx.k === 'follow' && nx.hit === 53; }), cs.filter((q) => q.ph === 2).map((q) => [q.k, q.n, q.hit]));
  check('뒤쫓기: 한 발씩 4번(서 있으면 53씩 네 번)', of('chase').length > 0 && of('chase').every((q) => q.n === 4 && q.hit === 212), of('chase').map((q) => [q.n, q.hit])); }

// ── 원 안에 서 있을 때의 경고
out.warn = await ev(() => {
  const y = window.__yz, p = y.player, w = document.getElementById('shellWarn'), r = {};
  window.T.clear(); window.T.god();
  r.before = !w.classList.contains('hidden');
  y.barrageApply({ t: 'bt', y: 0, r: 4.2, d: 75, p: [[p.pos.x + 2, p.pos.z, 1.5]] });
  y.step(2, 0.05); r.inside = !w.classList.contains('hidden'); r.text = w.textContent;
  p.pos.x -= 5; y.step(2, 0.05); r.outside = !w.classList.contains('hidden');
  p.pos.x += 5; y.step(2, 0.05); r.back = !w.classList.contains('hidden');
  y.barrageClear(); r.cleared = !w.classList.contains('hidden');
  return r;
});
check('원 안에 서 있으면 경고가 뜨고 벗어나면 사라진다', !out.warn.before && out.warn.inside && !out.warn.outside && out.warn.back && !out.warn.cleared && /붉은 원/.test(out.warn.text), out.warn);

// ── M: 자동 사격은 방탄판 정면에는 쏘지 않고, 장전 틈에는 쏜다. 조준선 색이 바뀐다
out.auto = await ev(() => {
  const y = window.__yz, p = y.player, L = window.T.lane(12), r = {};
  window.T.clear(); window.T.god();
  y.opt.autoFire = true;
  p.pos.set(L.x, 0, L.z); p.vel.set(0, 0, 0); p.yaw = -Math.PI / 2; p.pitch = 0;
  const e = y.spawnEnemy(L.x + 12, L.z, 'jugg');
  const hold = () => { e.pos.set(L.x + 12, 0, L.z); e.path = null; e.vx = e.vz = 0; window.T.face(e, -Math.PI / 2); e.burst = 0; e.burstCd = 9; };
  const ch = document.getElementById('ch');
  y.W.ar.ammo = 30;
  let s0 = y.game.shots;
  for (let i = 0; i < 30; i++) { hold(); y.step(1, 1 / 60); }
  r.front = { target: y.aa.e === e, arm: y.aa.arm, held: +y.aa.held.toFixed(2), auto: y.vm.autoFiring, shots: y.game.shots - s0, lock: ch.classList.contains('lock'), armor: ch.classList.contains('armor') };
  e.reload = 3; s0 = y.game.shots; const h0 = e.hp;
  for (let i = 0; i < 30; i++) { hold(); e.state = 'combat'; y.step(1, 1 / 60); }
  r.reload = { arm: y.aa.arm, auto: y.vm.autoFiring, shots: y.game.shots - s0, dmg: Math.round(h0 - e.hp), armor: ch.classList.contains('armor') };
  // 사격 버튼으로는 정면에도 쏠 수 있다(피해는 20%)
  e.reload = 0; e.boss.expose = false; hold(); y.step(1, 1 / 60);
  s0 = y.game.shots; const h1 = e.hp; y.input.fire = true;
  for (let i = 0; i < 12; i++) { hold(); y.step(1, 1 / 60); }
  y.input.fire = false;
  r.manual = { shots: y.game.shots - s0, dmg: +(h1 - e.hp).toFixed(1), feed: [...document.getElementById('feed').children].map((q) => q.textContent) };
  y.opt.autoFire = false;
  return r;
});
console.log('auto', JSON.stringify(out.auto));
{ const a = out.auto;
  check('자동 사격: 방탄판 정면에는 쏘지 않는다, 조준선이 방탄 색으로', a.front.target && a.front.arm === 0.2 && a.front.held > 0.2 && !a.front.auto && a.front.shots === 0 && a.front.armor, a.front);
  check('자동 사격: 장전 틈에는 쏜다', a.reload.arm === 1.25 && a.reload.shots >= 2 && a.reload.dmg >= 26 * 2 && !a.reload.armor, a.reload);
  check('사격 버튼으로는 정면에도 쏠 수 있다(피해 20%) + 방탄 안내', a.manual.shots >= 2 && a.manual.dmg > 0 && Math.abs(a.manual.dmg / a.manual.shots - 26 * 0.2) < 2.7 && a.manual.feed.some((t) => /방탄/.test(t)), a.manual); }

// ── I·J: 생존 5웨이브 = 지휘관 웨이브. 웨이브 표, 단계(15웨이브부터 단단해짐)
out.wave = await ev(() => {
  const y = window.__yz, p = y.player, r = {};
  window.T.clear(); window.T.god();
  p.pos.set(y.START.x, 0, y.START.z);
  r.table = [1, 4, 5, 10, 15, 20, 25, 30].map((n) => [n, y.bossWave(n)]);
  y.game.wave = 4; y.game.toSpawn = 0; y.game.between = 0.05; y.game.supplyT = 0;
  const sc0 = y.game.score;
  y.step(2, 0.05);
  r.start = { wave: y.game.wave, q: [...y.game.queue], toSpawn: y.game.toSpawn, msgT: document.getElementById('msgT').textContent, msgS: document.getElementById('msgS').textContent, wtxt: document.getElementById('waveTxt').textContent };
  let b = null;
  for (let i = 0; i < 60 && !b; i++) { y.step(1, 0.05); b = y.bossOf(); }
  if (!b) return { ...r, err: 'boss did not spawn' };
  const d0 = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
  r.spawn = { type: b.T.key, dist: +d0.toFixed(1), seen: y.losClear(b.pos.x, 2.2, b.pos.z, p.pos.x, 1.6, p.pos.z), hpMax: b.hpMax };
  // 멀리서는 뛰어온다(28m 안으로 들어오면 걷는다)
  let far = 0, near = 0, tIn = -1;
  for (let i = 0; i < 600; i++) {
    y.step(1, 0.05);
    const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    if (b.state === 'hunt' && d > 30) far = Math.max(far, b.speed); else if (b.state === 'hunt' && d < 26) near = Math.max(near, b.speed);
    if (d < 20 || b.state === 'combat') { tIn = +(i * 0.05).toFixed(1); break; }
  }
  r.approach = { far: +far.toFixed(2), near: +near.toFixed(2), contactAfter: tIn, dist: +Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z).toFixed(1), alive: y.enemies.filter((e) => !e.dead).length };
  // 전부 쓰러뜨린다
  const killAll = () => { for (const e of y.enemies) if (!e.dead) e.damage(1e6, 1, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, 3); };
  const pk0 = y.pickups.length;
  b.damage(1e6, 1, { x: Math.sin(b.aimYaw), y: 0, z: Math.cos(b.aimYaw) }, 3);
  r.kill = { msgT: document.getElementById('msgT').textContent, drops: y.pickups.slice(pk0).map((q) => q.type).sort(), score: y.game.score - sc0, barBody: document.body.classList.contains('bossOn') };
  killAll();
  for (let i = 0; i < 400 && !(y.game.toSpawn === 0 && y.enemies.every((e) => e.dead)); i++) { y.step(1, 0.05); killAll(); }
  r.heldBanner = document.getElementById('msgT').textContent; // 마지막 적이 쓰러져도 지휘관 제거 알림이 2.4초 동안은 남는다
  for (let i = 0; i < 80 && document.getElementById('msgT').textContent !== '구역 확보'; i++) y.step(1, 0.05);
  r.clear = { msgT: document.getElementById('msgT').textContent, msgS: document.getElementById('msgS').textContent, between: +y.game.between.toFixed(1), supplyT: +y.game.supplyT.toFixed(1), bar: !document.getElementById('boss').classList.contains('hidden') };
  for (let i = 0; i < 80 && y.game.state !== 'supply'; i++) y.step(1, 0.05);
  r.supply = y.game.state;
  if (y.game.state === 'supply') y.pickSupply(0);
  y.game.between = 1e9;
  // 단계: 15웨이브의 철갑은 체력 1.4배, 25웨이브는 1.8배
  window.T.clear();
  y.game.wave = 15; r.tier15 = [y.bossTier(), y.spawnEnemy(p.pos.x + 30, p.pos.z, 'jugg').hpMax];
  y.game.wave = 25; r.tier25 = [y.bossTier(), y.spawnEnemy(p.pos.x + 30, p.pos.z, 'bomb').hpMax];
  window.T.clear(); y.game.wave = 5;
  return r;
});
console.log('wave', JSON.stringify(out.wave));
{ const a = out.wave;
  check('웨이브 표: 5 철갑 / 10 화약고 / 15 철갑 / 20 화약고 / 25부터 둘 다', JSON.stringify(a.table) === JSON.stringify([[1, null], [4, null], [5, ['jugg']], [10, ['bomb']], [15, ['jugg']], [20, ['bomb']], [25, ['jugg', 'bomb']], [30, ['jugg', 'bomb']]]), a.table);
  check('5웨이브 시작: 지휘관 먼저 + 호위 3', !a.err && a.start.wave === 5 && a.start.q[0] === 'jugg' && a.start.q.length === 4 && a.start.toSpawn === 4 && a.start.msgT === '지휘관 철갑' && /중장갑 지휘관/.test(a.start.msgS), a.start);
  check('지휘관은 24m 넘게 떨어져 나타난다', a.spawn && a.spawn.type === 'jugg' && a.spawn.dist >= 24 && a.spawn.dist < 60 && a.spawn.hpMax === 3600, a.spawn);
  check('멀리서는 뛰어온다(약 4m/s), 가까이서는 걷는다', a.approach.far > 3.2 && (a.approach.near === 0 || a.approach.near < 2.9) && a.approach.contactAfter > 0 && a.approach.contactAfter < 25, a.approach);
  check('지휘관 제거: 알림, 보급품 4개, 점수 2000', a.kill.msgT === '철갑 제거' && a.kill.drops.join() === 'ammo,ammo,med,med' && a.kill.score === 2000, a.kill);
  check('웨이브 격퇴: 보너스 두 배(2500), 막대 사라짐, 보급 선택', a.clear.msgT === '구역 확보' && /\+2500/.test(a.clear.msgS) && !a.clear.bar && a.supply === 'supply', a.clear);
  check('15웨이브 1.4배(5040) / 25웨이브 1.8배(화약고 5040)', a.tier15[0] === 1 && a.tier15[1] === 5040 && a.tier25[0] === 2 && a.tier25[1] === 5040, [a.tier15, a.tier25]); }

// ── K: 작전 5 "지휘관 사냥" — 처음부터 열려 있다. 철갑 → 보급 → 화약고 → 완료. 다른 작전의 진행은 건드리지 않는다
out.ep = await ev(async () => {
  const y = window.__yz, p = y.player, r = {};
  y.quitToMenu();
  localStorage.removeItem('yz.camp'); localStorage.removeItem('yz.done_ep5');
  y.openEpisodes();
  const cards = () => [...document.querySelectorAll('#epList .card')].map((b) => ({ t: b.querySelector('.st').textContent, l: b.querySelector('.sl').textContent, dis: b.disabled, boss: b.classList.contains('bossEp') }));
  r.cards = cards();
  document.getElementById('ep4').click();
  window.T.god();
  r.begin = { state: y.game.state, on: y.camp.on, idx: y.camp.idx, map: y.WORLD.id, env: y.envOf(), owned: Object.keys(y.prog.owned).filter((k) => y.prog.owned[k]).join(), wave: y.game.wave };
  const killAll = () => { for (const e of y.enemies) if (!e.dead) e.damage(1e6, 1, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, 3); };
  const waitBoss = () => { for (let i = 0; i < 200 && !y.bossOf(); i++) y.step(1, 0.05); return y.bossOf(); };
  let b = waitBoss();
  if (!b) return { ...r, err: 'no boss in stage 0', si: y.camp.si };
  y.step(6, 0.05);
  r.s0 = { si: y.camp.si, type: y.camp.s.type, boss: b.T.key, dist: +Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z).toFixed(1), obj: document.getElementById('objT').textContent, sub: document.getElementById('objS').textContent, mark: y.camp.mark === b.pos, low: document.getElementById('boss').classList.contains('low'), allies: y.allies.map((a) => a.def.id), escorts: y.enemies.filter((e) => !e.dead && !e.boss).length + y.camp.st.queue.length, mk: !document.getElementById('mk').classList.contains('hidden') };
  // 단계 재도전: 쓰러진 뒤 "이 단계부터 다시"
  y.prog.maxHp = 100; p.hp = 1; y.hurtPlayer(50, { x: 0, z: 0 });
  for (let i = 0; i < 60 && y.game.state !== 'over'; i++) y.step(1, 0.05);
  r.over = { state: y.game.state, again: document.getElementById('btnAgain').textContent, eyebrow: document.getElementById('overEyebrow').textContent };
  document.getElementById('btnAgain').click();
  window.T.god();
  b = waitBoss();
  r.retry = { state: y.game.state, si: y.camp.si, boss: b && b.T.key, hp: b && b.hp === b.hpMax, enemies: y.enemies.filter((e) => !e.dead).length };
  // 철갑 제거 → 보급 → 화약고
  killAll();
  for (let i = 0; i < 200 && y.game.state !== 'supply'; i++) { y.step(1, 0.05); }
  r.afterBoss1 = { state: y.game.state, mark: y.camp.mark };
  if (y.game.state === 'supply') y.pickSupply(0);
  y.step(4, 0.05);
  for (const e of y.enemies) if (!e.dead && !e.boss) e.damage(1e6, 1, null, 3); // 남은 호위 정리
  b = waitBoss();
  if (!b) return { ...r, err: 'no boss in stage 1', si: y.camp.si, state: y.game.state };
  y.step(6, 0.05);
  r.s1 = { si: y.camp.si, boss: b.T.key, obj: document.getElementById('objT').textContent, sub: document.getElementById('objS').textContent, name: document.getElementById('bossN').textContent };
  killAll();
  for (let i = 0; i < 200 && y.game.state !== 'epdone'; i++) { y.step(1, 0.05); }
  r.done = { state: y.game.state, title: document.getElementById('edTitle').textContent, note: document.getElementById('edNote').textContent, next: !document.getElementById('btnNextEp').classList.contains('hidden'), camp: localStorage.getItem('yz.camp'), flag: localStorage.getItem('yz.done_ep5') };
  y.openEpisodes();
  r.cards2 = cards();
  y.quitToMenu();
  return r;
});
console.log('ep', JSON.stringify(out.ep));
{ const a = out.ep;
  check('작전 목록: 5개, 작전 5는 처음부터 열림(지휘관전), 2~4는 잠김', !a.err && a.cards.length === 5 && a.cards[4].t === '지휘관 사냥' && !a.cards[4].dis && a.cards[4].boss && /지휘관전/.test(a.cards[4].l) && !a.cards[0].dis && a.cards[1].dis && a.cards[3].dis, a.cards);
  check('작전 5 시작: 부두·새벽, 무기 4종', a.begin.state === 'playing' && a.begin.on && a.begin.idx === 4 && a.begin.map === 'dock' && a.begin.env === 'dawn' && a.begin.owned === 'ar,shotgun,dmr,pistol' && a.begin.wave === 5, a.begin);
  check('1단계: 철갑 등장, 목표 문구·체력, 표식, 팀원 합류, 막대는 목표 문구 아래', a.s0 && a.s0.si === 0 && a.s0.type === 'boss' && a.s0.boss === 'jugg' && /철갑/.test(a.s0.obj) && /체력 100%/.test(a.s0.sub) && a.s0.mark && a.s0.low && a.s0.allies.includes('han') && a.s0.escorts >= 1 && a.s0.mk, a.s0);
  check('쓰러진 뒤 이 단계부터 다시: 지휘관이 새로 나온다', a.over.state === 'over' && /이 단계부터/.test(a.over.again) && a.retry.state === 'playing' && a.retry.si === 0 && a.retry.boss === 'jugg' && a.retry.hp, [a.over, a.retry]);
  check('철갑 제거 뒤 보급 선택', a.afterBoss1.state === 'supply', a.afterBoss1);
  check('2단계: 화약고', a.s1 && a.s1.si === 1 && a.s1.boss === 'bomb' && /화약고/.test(a.s1.obj) && a.s1.name === '지휘관 화약고', a.s1);
  check('작전 완료: 완료 표시는 따로 기록, 다른 작전의 잠금은 그대로', a.done.state === 'epdone' && /작전 5 · 지휘관 사냥/.test(a.done.title) && !a.done.next && a.done.camp === null && a.done.flag === '1' && /완료/.test(a.cards2[4].l) && a.cards2[1].dis, [a.done, a.cards2]); }

console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// v0.10 지휘관(보스) 협동 검증: 브라우저 두 개(방장 A, 참가자 B)를 로컬 중개 서버로 잇는다.
//   node test/bosscoop.mjs
// 확인하는 것: 협동 생존 5웨이브의 지휘관(체력은 사람 수만큼 늘어난다), 참가자 화면의 체력 막대·상태(방탄·장전·비틀거림·단계) 동기화,
//   참가자의 탄에 방탄이 적용되는가(정면 20% / 등 뒤 100%), 참가자의 수류탄으로 비틀거리는가, 포격 예고 원의 동기화와 "각자 자기 피해",
//   지휘관 제거 알림과 보급품, 도중 입장, 협동 임무 4(지휘부 타격: 철갑 → 보급 → 화약고 → 완료), 화약고가 다른 사람에게도 한 발 쏘는가
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); localStorage.setItem('yz.auto', 'false'); } catch (e) { /* 무시 */ } window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 120000 });
  // 알림 줄(feed)은 2.3초 뒤 사라지므로, 뜬 문구를 모두 적어 둔다
  await page.evaluate(() => { window.__feed = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) window.__feed.push(n.textContent); }).observe(document.getElementById('feed'), { childList: true }); });
  return page;
};
const A = await mk('A'), B = await mk('B');
const out = {}, fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
const run = async (sec, fn) => {
  for (let t = 0; t < sec; t += 0.25) {
    await Promise.all([A.evaluate(() => window.__yz.step(15, 1 / 60)), B.evaluate(() => window.__yz.step(15, 1 / 60))]);
    await sleep(60);
    if (fn && (await fn())) return true;
  }
  return false;
};
const god = (p) => p.evaluate(() => { const y = window.__yz; y.prog.maxHp = 1e7; y.player.hp = 1e7; });
const tp = (p, x, z) => p.evaluate(([x, z]) => { const y = window.__yz; y.player.pos.set(x, 0, z); y.player.vel.set(0, 0, 0); }, [x, z]);
// 지휘관의 상태(각 화면에서)
const boss = (p) => p.evaluate(() => {
  const y = window.__yz, e = y.bossOf();
  if (!e) return null;
  const b = e.boss, el = document.getElementById('boss'), f = /scaleX\(([\d.]+)\)/.exec(document.getElementById('bossFill').style.transform);
  return { key: e.T.key, puppet: e.puppet, nid: e.nid, hpMax: e.hpMax, hp: Math.round(e.hp), hpK: +b.hpK.toFixed(3), phase: b.phase, expose: b.expose, stag: b.stagT > 0, call: b.callT > 0, reload: e.reload > 0, pos: [+e.pos.x.toFixed(1), +e.pos.z.toFixed(1)], yaw: +e.aimYaw.toFixed(2),
    kFront: y.bossArmor(e, { x: -Math.sin(e.aimYaw), y: 0, z: -Math.cos(e.aimYaw) }, null), kBack: y.bossArmor(e, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, null),
    hud: { shown: !el.classList.contains('hidden'), n: document.getElementById('bossN').textContent, s: document.getElementById('bossS').textContent, fill: f ? +f[1] : -1, open: el.classList.contains('open'), low: el.classList.contains('low') } };
});
const hud = (p) => p.evaluate(() => ({ state: window.__yz.game.state, msgT: document.getElementById('msgT').textContent, msgS: document.getElementById('msgS').textContent, wave: document.getElementById('waveTxt').textContent, enemy: document.getElementById('enemyTxt').textContent,
  obj: document.getElementById('obj').classList.contains('hidden') ? '' : document.getElementById('objT').textContent, sub: document.getElementById('objS').textContent, feed: window.__feed.slice(-12), pickups: window.__yz.pickups.map((q) => q.type).sort(),
  mk: !document.getElementById('mk').classList.contains('hidden'), rings: window.__yz.barrage.list.map((q) => [+q.x.toFixed(1), +q.z.toFixed(1), q.r, q.dmg]), map: window.__yz.WORLD.id, env: window.__yz.envOf(), si: window.__yz.camp.si, type: window.__yz.camp.s ? window.__yz.camp.s.type : null }));
// 방장: 지휘관을 한자리에 세워 둔다(검사하는 동안 움직이지 않게)
const pin = () => A.evaluate(() => { const y = window.__yz, e = y.bossOf(); if (!e) return; if (!e.pin) e.pin = { x: e.pos.x, z: e.pos.z, yaw: e.aimYaw }; e.pos.set(e.pin.x, 0, e.pin.z); e.path = null; e.vx = e.vz = 0; e.aimYaw = e.bodyYaw = e.pin.yaw; e.burst = 0; e.burstCd = 9; e.boss.shellT = 99; e.tactic = 9; });
const runPinned = async (sec, fn) => { for (let t = 0; t < sec; t += 0.25) { await pin(); await Promise.all([A.evaluate(() => window.__yz.step(15, 1 / 60)), B.evaluate(() => window.__yz.step(15, 1 / 60))]); await pin(); await sleep(60); if (fn && (await fn())) return true; } return false; };
const join = async (code) => {
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => window.__yz.coop.pid === 1, null, { timeout: 30000 });
};
const pickBoth = async () => {
  await run(6, async () => (await A.evaluate(() => window.__yz.game.state)) === 'supply' && (await B.evaluate(() => window.__yz.game.state)) === 'supply');
  const s = [await A.evaluate(() => window.__yz.game.state), await B.evaluate(() => window.__yz.game.state)];
  await A.evaluate(() => { if (window.__yz.game.state === 'supply') window.__yz.pickSupply(0); });
  await B.evaluate(() => { if (window.__yz.game.state === 'supply') window.__yz.pickSupply(0); });
  return s;
};

try {
  await A.tap('#btnCoop');
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  await join(code);

  // ── 1. 협동 생존: 5웨이브의 지휘관
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  await god(A); await god(B);
  await A.evaluate(() => { const y = window.__yz; y.game.wave = 4; y.game.toSpawn = 0; y.game.queue.length = 0; y.game.between = 0.05; y.game.supplyT = 0; });
  await run(6, async () => !!(await boss(A)) && !!(await boss(B)));
  await pin();
  await runPinned(1);
  let a = await boss(A), b = await boss(B), ha = await hud(A), hb = await hud(B);
  out.wave5 = { A: a, B: b, hudA: { msgT: ha.msgT, wave: ha.wave, enemy: ha.enemy }, hudB: { msgT: hb.msgT, msgS: hb.msgS, wave: hb.wave, enemy: hb.enemy, feed: hb.feed } };
  check('wave 5 boss on both', a && b && a.key === 'jugg' && b.key === 'jugg' && !a.puppet && b.puppet && a.nid === b.nid, out.wave5);
  check('boss hp scales with players (3600 × 1.9)', a && a.hpMax === 6840, a && a.hpMax);
  check('guest banner + bar', hb.msgT === '지휘관 철갑' && /중장갑 지휘관/.test(hb.msgS) && b.hud.shown && b.hud.n === '지휘관 철갑' && b.hud.fill > 0.99 && hb.wave === 'WAVE 5' && hb.feed.some((t) => /등장/.test(t)), out.wave5.hudB);
  check('guest sees boss position and facing', a && b && Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) < 1 && Math.abs(a.yaw - b.yaw) < 0.2 && b.kFront === 0.2 && b.kBack === 1, { a: a && a.pos, b: b && b.pos, ya: a && a.yaw, yb: b && b.yaw });

  // 체력 동기화
  await A.evaluate(() => { const e = window.__yz.bossOf(); e.hp = e.hpMax * 0.8; });
  await runPinned(1);
  b = await boss(B);
  out.hpSync = { hpK: b.hpK, fill: b.hud.fill };
  check('guest hp bar follows host', Math.abs(b.hpK - 0.8) < 0.005 && Math.abs(b.hud.fill - 0.8) < 0.01, out.hpSync);

  // 참가자의 탄: 정면은 20%, 등 뒤는 100% (방장이 판정한다)
  const guestHit = async (front) => {
    const h0 = (await boss(A)).hp;
    await B.evaluate((front) => { const y = window.__yz, e = y.bossOf(), s = front ? -1 : 1; e.damage(100, 1, { x: Math.sin(e.aimYaw) * s, y: 0, z: Math.cos(e.aimYaw) * s }, 3); }, front);
    await runPinned(0.75);
    return h0 - (await boss(A)).hp;
  };
  out.guestHit = { front: await guestHit(true), back: await guestHit(false) };
  check('guest bullets: front 20 / back 100', out.guestHit.front === 20 && out.guestHit.back === 100, out.guestHit);

  // 표적 고정: 방장을 붙든 지휘관은 참가자가 쏴도 4초 동안은 돌아서지 않는다(둘이 번갈아 쏴서 제자리에서 돌게 만들 수 없다). 그 뒤에는 쏜 쪽으로 바꿀 수 있다
  out.lock = await A.evaluate(() => {
    const y = window.__yz, e = y.bossOf(), r = [...y.coop.players.values()][0], res = {};
    e.tg = y.player; e.boss.lockAt = y.game.time + 4;
    for (let i = 0; i < 30; i++) e.damage(1, 1, { x: 1, y: 0, z: 0 }, 3, null, r);
    res.locked = e.tg === y.player;
    e.boss.lockAt = y.game.time - 1;
    for (let i = 0; i < 30 && e.tg === y.player; i++) e.damage(1, 1, { x: 1, y: 0, z: 0 }, 3, null, r);
    res.switched = e.tg === r; res.relock = +(e.boss.lockAt - y.game.time).toFixed(1);
    for (let i = 0; i < 30; i++) e.damage(1, 1, { x: 1, y: 0, z: 0 }, 3); // 방장이 쏴도 4초는 참가자를 붙든다
    res.held = e.tg === r;
    e.hp = e.hpMax * 0.8; e.tg = y.player; e.boss.lockAt = 0;
    return res;
  });
  check('boss keeps its target for 4 s', out.lock.locked && out.lock.switched && out.lock.relock === 4 && out.lock.held, out.lock);
  await runPinned(0.5);

  // 장전 중: 참가자 화면에서도 방탄이 풀린 것으로 보인다
  await A.evaluate(() => { const e = window.__yz.bossOf(); e.state = 'combat'; e.reload = 3; e.mag = 0; });
  await runPinned(0.75);
  b = await boss(B);
  out.reloadSync = { expose: b.expose, reload: b.reload, kFront: b.kFront, s: b.hud.s, open: b.hud.open, line: await B.evaluate(() => +(/scaleX\(([\d.]+)\)/.exec(document.getElementById('bossT').style.transform) || [0, 0])[1]) };
  check('guest sees reload window + countdown line', b.expose && b.reload && b.kFront === 1.25 && /장전 중/.test(b.hud.s) && b.hud.open && out.reloadSync.line > 0.3 && out.reloadSync.line <= 1, out.reloadSync);
  out.guestHitReload = await guestHit(true);
  check('guest bullets during reload: front 125', out.guestHitReload === 125, out.guestHitReload);
  await A.evaluate(() => { const e = window.__yz.bossOf(); e.reload = 0; e.mag = 40; });
  await runPinned(0.75);

  // 참가자의 수류탄 → 비틀거림
  const hBefore = (await boss(A)).hp;
  await B.evaluate(() => { const y = window.__yz, e = y.bossOf(); y.explode(e.pos.x + 1.5, 0.5, e.pos.z); });
  await runPinned(0.75);
  a = await boss(A); b = await boss(B); hb = await hud(B);
  out.stagger = { dmg: hBefore - a.hp, A: a.stag, B: b.stag, s: b.hud.s, kFrontB: b.kFront, feed: hb.feed };
  check('guest grenade staggers boss', a.stag && b.stag && out.stagger.dmg > 100 && /비틀거림/.test(b.hud.s) && b.kFront === 1.25 && hb.feed.some((t) => /비틀거림/.test(t)), out.stagger);
  await runPinned(3.2);

  // 단계 전환: 66% → 증원(두 사람이면 2명이 3명으로), 보급품이 참가자 화면에도
  const pkB0 = (await hud(B)).pickups.length, ts0 = await A.evaluate(() => window.__yz.game.toSpawn);
  await A.evaluate(() => { const e = window.__yz.bossOf(); e.hp = e.hpMax * 0.6; });
  await runPinned(1);
  a = await boss(A); b = await boss(B); hb = await hud(B);
  out.phase = { A: a.phase, B: b.phase, toSpawn: [ts0, await A.evaluate(() => window.__yz.game.toSpawn + window.__yz.enemies.filter((e) => !e.dead && !e.boss).length)], pkB: hb.pickups.length - pkB0, feed: hb.feed };
  check('phase 2 synced + drops on guest', a.phase === 1 && b.phase === 1 && out.phase.pkB === 3 && hb.feed.some((t) => /증원 호출/.test(t)), out.phase);

  // 포격 예고 원: 두 화면에 같은 자리. 피해는 각자 자기 위치로
  await A.evaluate(() => window.__yz.barrageClear()); await B.evaluate(() => window.__yz.barrageClear());
  await A.evaluate(() => { const y = window.__yz; y.game.queue.length = 0; y.game.toSpawn = 0; for (const e of y.enemies) if (!e.dead && !e.boss) e.damage(9999, 1, null, 0); }); // 호위를 치워 포격 피해만 잰다
  await run(1);
  await god(A); await god(B);
  const base = await A.evaluate(() => { const y = window.__yz, c = y.cellNear(y.START.x, y.START.z, 6) || { x: y.START.x, z: y.START.z }; return c; });
  await tp(A, base.x, base.z); await tp(B, base.x + 30, base.z); // 방장은 원 한가운데, 참가자는 멀리
  const hpA0 = await A.evaluate(() => window.__yz.player.hp), hpB0 = await B.evaluate(() => window.__yz.player.hp);
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(); e.tg = y.player; e.boss.phase = 2; y.bossBarrage(e); e.boss.phase = 1; }); // 철갑 3단계의 유탄: 지금 자리 + 달아날 자리
  await sleep(250);
  ha = await hud(A); hb = await hud(B);
  out.rings = { A: ha.rings, B: hb.rings };
  check('rings synced', ha.rings.length === 2 && JSON.stringify(ha.rings) === JSON.stringify(hb.rings) && Math.hypot(ha.rings[0][0] - base.x, ha.rings[0][1] - base.z) < 0.2 && ha.rings[0][2] === 3.4 && ha.rings[0][3] === 60, out.rings);
  await runPinned(2.2);
  out.ringDmg = { A: Math.round(hpA0 - (await A.evaluate(() => window.__yz.player.hp))), B: Math.round(hpB0 - (await B.evaluate(() => window.__yz.player.hp))), left: [(await hud(A)).rings.length, (await hud(B)).rings.length] };
  check('shell hurts only the one standing in it (host)', out.ringDmg.A === 60 && out.ringDmg.B === 0 && out.ringDmg.left.join() === '0,0', out.ringDmg);
  // 반대로: 참가자가 원 안, 방장은 밖
  await god(A); await god(B);
  await tp(A, base.x + 30, base.z); await tp(B, base.x, base.z);
  await run(0.5);
  const hpA1 = await A.evaluate(() => window.__yz.player.hp), hpB1 = await B.evaluate(() => window.__yz.player.hp);
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(), r = [...y.coop.players.values()][0]; e.tg = r; y.bossBarrage(e); });
  await sleep(250);
  hb = await hud(B);
  out.rings2 = { B: hb.rings, warn: await B.evaluate(() => !document.getElementById('shellWarn').classList.contains('hidden')) };
  await runPinned(2.4);
  out.ringDmg2 = { A: Math.round(hpA1 - (await A.evaluate(() => window.__yz.player.hp))), B: Math.round(hpB1 - (await B.evaluate(() => window.__yz.player.hp))) };
  check('shell at guest: guest computes own damage + warning', out.rings2.B.length === 1 && Math.hypot(out.rings2.B[0][0] - base.x, out.rings2.B[0][1] - base.z) < 1.5 && out.ringDmg2.B >= 40 && out.ringDmg2.B <= 60 && out.ringDmg2.A === 0 && out.rings2.warn, { ...out.rings2, ...out.ringDmg2 });
  await A.screenshot({ path: 'test/bosscoop-host.png' });
  await B.screenshot({ path: 'test/bosscoop-guest.png' });

  // 도중 입장: 참가자가 나갔다 다시 들어와도 지휘관의 체력·단계를 그대로 본다
  await B.tap('#bPause');
  await B.tap('#btnQuit');
  await run(1.5);
  await join(code);
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  await god(B);
  await runPinned(4, async () => !!(await boss(B)));
  await runPinned(1);
  b = await boss(B); a = await boss(A); hb = await hud(B);
  out.rejoin = { B: b && { hpK: b.hpK, phase: b.phase, hud: b.hud }, A: a && { hpK: a.hpK, phase: a.phase, hpMax: a.hpMax }, feed: hb.feed };
  check('rejoin sees boss state (no replayed phase alert)', b && a && Math.abs(b.hpK - a.hpK) < 0.01 && b.phase === 1 && b.hud.shown && hb.feed.filter((t) => /증원 호출/.test(t)).length === 1, out.rejoin);

  // 지휘관 제거: 참가자 화면의 알림·보급품·막대
  const pkB1 = (await hud(B)).pickups.length;
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(); e.damage(1e6, 1, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, 3); });
  await run(1);
  hb = await hud(B); ha = await hud(A);
  out.down = { msgB: hb.msgT, pkB: hb.pickups.length - pkB1, barB: await B.evaluate(() => !document.getElementById('boss').classList.contains('hidden')), bossB: !!(await boss(B)), feedB: hb.feed, msgA: ha.msgT };
  check('boss down on guest', hb.msgT === '철갑 제거' && out.down.pkB === 4 && !out.down.barB && !out.down.bossB && ha.msgT === '철갑 제거', out.down);
  // 남은 적을 정리하면 웨이브가 끝나고 두 화면에 보급 선택
  for (let i = 0; i < 40; i++) { await A.evaluate(() => { const y = window.__yz; for (const e of y.enemies) if (!e.dead) e.damage(9999, 1, null, 0); }); await run(0.5); if (await A.evaluate(() => window.__yz.game.toSpawn === 0 && window.__yz.enemies.every((e) => e.dead))) break; }
  await run(4, async () => /격퇴/.test((await hud(A)).msgS) && /격퇴/.test((await hud(B)).msgS)); // 지휘관 제거 알림(2.4초)이 지나간 뒤 웨이브가 끝난다
  out.clear = { msgA: (await hud(A)).msgS, msgB: (await hud(B)).msgS, sup: await pickBoth() };
  check('boss wave clear: double bonus + supply on both', /\+2500/.test(out.clear.msgA) && /\+2500/.test(out.clear.msgB) && out.clear.sup.join() === 'supply,supply', out.clear);

  // ── 2. 협동 임무 4: 지휘부 타격 (차량기지, 새벽)
  await A.evaluate(() => window.__yz.coopToLobby());
  await B.waitForFunction(() => window.__yz.game.state === 'coop', null, { timeout: 10000 });
  await A.tap('#btnCoMode');
  await B.waitForFunction(() => document.querySelector('#btnCoMode b').textContent === '협동 임무', null, { timeout: 8000 });
  for (let i = 0; i < 3; i++) await A.tap('#btnCoMis');
  await B.waitForFunction(() => /^4 · 지휘부 타격/.test(document.querySelector('#btnCoMis b').textContent), null, { timeout: 8000 });
  out.lobby = await B.evaluate(() => ({ mis: document.querySelector('#btnCoMis b').textContent, brief: document.getElementById('coHelpMB').textContent }));
  check('mission 4 in lobby', /지휘부 타격/.test(out.lobby.mis) && /지휘관/.test(out.lobby.brief), out.lobby);
  await A.screenshot({ path: 'test/bosscoop-lobby.png' });
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  await god(A); await god(B);
  await run(8, async () => (await hud(A)).type === 'boss' && (await hud(B)).type === 'boss');
  hb = await hud(B);
  out.m4banner = { msgT: hb.msgT, msgS: hb.msgS };
  await run(8, async () => !!(await boss(A)) && !!(await boss(B)));
  await pin(); await runPinned(1);
  a = await boss(A); b = await boss(B); ha = await hud(A); hb = await hud(B);
  out.m4s0 = { A: { map: ha.map, env: ha.env, wave: ha.wave, obj: ha.obj, sub: ha.sub, hpMax: a && a.hpMax, low: a && a.hud.low }, B: { map: hb.map, env: hb.env, wave: hb.wave, obj: hb.obj, sub: hb.sub, key: b && b.key, mk: hb.mk, low: b && b.hud.low }, banner: out.m4banner };
  check('m4 stage 1: jugg on both', ha.map === 'depot' && hb.map === 'depot' && ha.env === 'dawn' && hb.env === 'dawn' && ha.wave === '임무 4 · 1/2' && hb.wave === '임무 4 · 1/2' && /철갑/.test(hb.obj) && /체력 100%/.test(hb.sub) && a && a.hpMax === 6840 && b && b.key === 'jugg' && hb.mk && b.hud.low && out.m4banner.msgT === '지휘관 철갑', out.m4s0);
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(); e.damage(1e6, 1, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, 3); });
  out.m4sup = await pickBoth();
  check('m4: supply after first boss', out.m4sup.join() === 'supply,supply', out.m4sup);
  await run(14, async () => { const x = await boss(A), z = await boss(B); return !!x && !!z && x.key === 'bomb' && z.key === 'bomb'; });
  await pin(); await runPinned(1);
  a = await boss(A); b = await boss(B); hb = await hud(B);
  out.m4s1 = { A: a && { key: a.key, hpMax: a.hpMax }, B: b && { key: b.key, n: b.hud.n, kFront: b.kFront }, hudB: { wave: hb.wave, obj: hb.obj, si: hb.si } };
  check('m4 stage 2: bomb on both (2800 × 1.9)', a && a.key === 'bomb' && a.hpMax === 5320 && b && b.hud.n === '지휘관 화약고' && b.kFront === 0.55 && hb.wave === '임무 4 · 2/2' && /화약고/.test(hb.obj), out.m4s1);
  // 화약고 2단계: 표적 말고 다른 한 사람에게도 한 발
  await god(A); await god(B);
  const pa = await A.evaluate(() => { const p = window.__yz.player.pos; return [p.x, p.z]; }), pb = await B.evaluate(() => { const p = window.__yz.player.pos; return [p.x, p.z]; });
  await run(0.5);
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(); e.hp = e.hpMax * 0.6; e.boss.phase = 1; e.tg = y.player; y.barrageClear(); y.bossBarrage(e); });
  await sleep(250);
  hb = await hud(B);
  const nearB = hb.rings.filter((q) => Math.hypot(q[0] - pb[0], q[1] - pb[1]) < 1.5).length, aroundA = hb.rings.filter((q) => Math.hypot(q[0] - pa[0], q[1] - pa[1]) < 12).length; // 방장 둘레의 무늬(둘레 무늬는 한가운데가 비어 있다)
  out.m4extra = { rings: hb.rings.length, aroundA, nearB };
  check('bomb phase 2: one extra shell on the other player', hb.rings.length >= 4 && nearB >= 1 && aroundA >= 3, out.m4extra);
  await A.evaluate(() => { const y = window.__yz, e = y.bossOf(); e.damage(1e6, 1, { x: Math.sin(e.aimYaw), y: 0, z: Math.cos(e.aimYaw) }, 3); });
  await run(8, async () => (await hud(A)).state === 'epdone' && (await hud(B)).state === 'epdone');
  out.m4done = { A: await A.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('edTitle').textContent, note: document.getElementById('edNote').textContent, nextH: document.getElementById('btnNextEp').classList.contains('hidden') })), B: await B.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('edTitle').textContent })) };
  check('m4 complete on both', out.m4done.A.state === 'epdone' && out.m4done.B.state === 'epdone' && /협동 임무 4 · 지휘부 타격/.test(out.m4done.A.title) && /협동 임무 4 · 지휘부 타격/.test(out.m4done.B.title) && /모든 임무를 마쳤습니다/.test(out.m4done.A.note) && out.m4done.A.nextH, out.m4done);
} catch (e) { fail.push('exception ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
server.kill();

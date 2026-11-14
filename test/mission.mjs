// 협동 임무: 브라우저 두 개(방장 A, 참가자 B)를 로컬 중개 서버로 이어 임무 3개를 처음부터 끝까지 진행한다.
//   node test/mission.mjs
// 진행을 빠르게 하려고 플레이어를 목표 지점으로 옮기고(순간 이동), 체력을 크게 잡고, 남은 시간을 줄인다. 판정과 동기화는 게임 코드 그대로다.
// 확인하는 것: 로비의 임무 선택, 단계 시작·완료와 지점의 동기화, 동시 설치, 폭약 해제·재설치, 폭파, 전원 도착, 화물 집기·떨어뜨리기·넘겨받기,
//   조종사 부축, 잠금 해제 문구, 보급, 도중 입장, 임무 완료 화면과 다음 임무, 전원 쓰러짐(임무 실패)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 120000 });
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
const r1 = (v) => Math.round(v * 10) / 10;
const st = (p) => p.evaluate(() => {
  const y = window.__yz, c = y.camp, s = c.s, t = c.st, r1 = (v) => Math.round(v * 10) / 10;
  return { state: y.game.state, map: y.WORLD.id, env: y.envOf(), mi: y.coop.cfg.mi, si: c.si, type: s ? s.type : null, hp: Math.round(y.player.hp), alive: y.player.alive, pos: [r1(y.player.pos.x), r1(y.player.pos.z)],
    sites: t && t.sites ? t.sites.map((p) => [r1(p.x), r1(p.z), p.done ? 1 : 0, r1(p.t)]) : null, planted: t ? t.planted : -1, holdT: t ? Math.ceil(t.holdT) : -1, boom: c.boom ? Math.ceil(c.boom.t) : -1,
    item: t && t.item ? [t.item.by, r1(t.item.x), r1(t.item.z), t.item.n] : null, enemies: y.enemies.filter((e) => !e.dead).length, owned: Object.keys(y.prog.owned).filter((k) => y.prog.owned[k]).join(','),
    hud: [document.getElementById('waveTxt').textContent, document.getElementById('obj').classList.contains('hidden') ? '' : document.getElementById('objT').textContent, document.getElementById('objS').textContent],
    hint: +document.getElementById('hint').style.opacity > 0 ? document.getElementById('hint').textContent : '', radio: document.getElementById('radio').classList.contains('hidden') ? '' : document.getElementById('radioT').textContent,
    mk: !document.getElementById('mk').classList.contains('hidden'), crate: y.mis.crate ? [r1(y.mis.crate.position.x), r1(y.mis.crate.position.z), y.mis.crate.visible] : null,
    pilot: y.mis.pilot && !y.mis.pilot.gone ? [r1(y.mis.pilot.pos.x), r1(y.mis.pilot.pos.z), y.mis.pilot.up, y.mis.pilot.def.name] : null };
});
const tp = (p, x, z) => p.evaluate(([x, z]) => { const y = window.__yz; y.player.pos.set(x, 0, z); y.player.vel.set(0, 0, 0); }, [x, z]);
const god = (p) => p.evaluate(() => { const y = window.__yz; y.prog.maxHp = 1e7; y.player.hp = 1e7; });
// 방장 화면의 적을 모두 쓰러뜨린다(참가자 화면에도 사살로 전해진다)
const wipe = () => A.evaluate(() => { const y = window.__yz; for (const e of y.enemies) if (!e.dead) e.damage(9999, 1, null, 0); });
const lobby = (p) => p.evaluate(() => ({ state: window.__yz.game.state, mode: document.querySelector('#btnCoMode b').textContent, mis: document.querySelector('#btnCoMis b').textContent, misHidden: document.getElementById('btnCoMis').classList.contains('hidden'),
  mapHidden: document.getElementById('btnCoMap').classList.contains('hidden'), brief: document.getElementById('coHelpMB').textContent, helpM: !document.getElementById('coHelpM').classList.contains('hidden') }));
const done = (p) => p.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('edTitle').textContent, note: document.getElementById('edNote').textContent, next: document.getElementById('btnNextEp').textContent, nextHidden: document.getElementById('btnNextEp').classList.contains('hidden'), list: document.getElementById('btnEpList').textContent }));
const pickBoth = async () => {
  await run(4, async () => (await A.evaluate(() => window.__yz.game.state)) === 'supply' && (await B.evaluate(() => window.__yz.game.state)) === 'supply');
  const s = [await A.evaluate(() => window.__yz.game.state), await B.evaluate(() => window.__yz.game.state)];
  await A.evaluate(() => window.__yz.pickSupply(0));
  await B.evaluate(() => window.__yz.pickSupply(0));
  return s;
};
const waitStage = async (k, type) => { const ok = await run(14, async () => { const a = await st(A), b = await st(B); return a.si === k && b.si === k && a.type === type && b.type === type; }); await run(0.5); return ok; };
const join = async (code) => {
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => window.__yz.coop.pid === 1, null, { timeout: 30000 });
};

try {
  await A.tap('#btnCoop');
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  await join(code);
  // 1. 로비: 모드를 협동 임무로. 임무 버튼으로 임무를 고른다
  await A.tap('#btnCoMode');
  await B.waitForFunction(() => document.querySelector('#btnCoMode b').textContent === '협동 임무', null, { timeout: 8000 });
  await A.tap('#btnCoMis');
  await B.waitForFunction(() => /^2 · 화물 회수/.test(document.querySelector('#btnCoMis b').textContent), null, { timeout: 8000 });
  out.lobbyPick = await lobby(B);
  await A.tap('#btnCoMis'); await A.tap('#btnCoMis'); // 3 → 1
  await B.waitForFunction(() => /^1 · 폭파조/.test(document.querySelector('#btnCoMis b').textContent), null, { timeout: 8000 });
  out.lobby = { A: await lobby(A), B: await lobby(B) };
  check('mission lobby', out.lobby.B.mode === '협동 임무' && !out.lobby.B.misHidden && out.lobby.B.mapHidden && out.lobby.B.helpM && /폭약/.test(out.lobby.B.brief) && /화물 상자/.test(out.lobbyPick.brief), out.lobby);
  await A.screenshot({ path: 'test/mis-lobby-host.png' });

  // ── 임무 1: 폭파조 (야드, 새벽)
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  await god(A); await god(B);
  await waitStage(0, 'plant');
  let a = await st(A), b = await st(B);
  out.m1start = { A: { map: a.map, env: a.env, hud: a.hud, sites: a.sites, owned: a.owned, enemies: a.enemies }, B: { map: b.map, env: b.env, hud: b.hud, sites: b.sites, owned: b.owned, enemies: b.enemies, radio: b.radio } };
  check('m1 start synced', a.map === 'yard' && b.map === 'yard' && a.env === 'dawn' && b.env === 'dawn' && a.hud[0] === '임무 1 · 1/3' && b.hud[0] === '임무 1 · 1/3' && b.hud[1] === '표시된 지점에 폭약 설치' && JSON.stringify(a.sites.map((q) => q.slice(0, 2))) === JSON.stringify(b.sites.map((q) => q.slice(0, 2))) && a.sites.length === 3 && a.owned === 'ar,shotgun,pistol' && b.owned === a.owned && a.enemies >= 5, out.m1start);
  // 도중 입장: 참가자가 나갔다 다시 들어오면 지금 단계를 받는다
  await B.tap('#bPause');
  await B.tap('#btnQuit');
  await run(1.5);
  await join(code);
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.camp.s && window.__yz.camp.s.type === 'plant', null, { timeout: 20000 });
  await god(B);
  await run(1);
  b = await st(B);
  out.rejoin = { si: b.si, type: b.type, sites: b.sites, hud: b.hud };
  check('rejoin gets stage', b.si === 0 && b.type === 'plant' && JSON.stringify(b.sites.map((q) => q.slice(0, 2))) === JSON.stringify(a.sites.map((q) => q.slice(0, 2))), out.rejoin);
  // 동시 설치: 방장은 1번, 참가자는 2번 지점
  await tp(A, a.sites[0][0], a.sites[0][1]);
  await tp(B, a.sites[1][0], a.sites[1][1]);
  await run(1.2);
  const mid = await st(B);
  await B.screenshot({ path: 'test/mis-plant-guest.png' });
  await run(2.4, async () => (await st(A)).planted >= 2);
  await run(0.5);
  a = await st(A); b = await st(B);
  out.plant = { midT: mid.sites.map((q) => q[3]), midHint: mid.hint, A: a.sites.map((q) => q[2]), B: b.sites.map((q) => q[2]), plantedB: b.planted, subB: b.hud[2] };
  check('parallel plant', mid.sites[1][3] > 0.3 && mid.hint === '폭약 설치 중' && a.sites[0][2] === 1 && a.sites[1][2] === 1 && b.sites[0][2] === 1 && b.sites[1][2] === 1 && b.planted === 2 && b.hud[2] === '2/3', out.plant);
  await tp(A, a.sites[2][0], a.sites[2][1]);
  await run(4, async () => (await st(A)).si === 0 && (await st(A)).type === null);
  out.supply1 = await pickBoth();
  check('supply after stage', out.supply1.join() === 'supply,supply', out.supply1);
  await waitStage(1, 'guard');
  a = await st(A); b = await st(B);
  out.guard0 = { A: { sites: a.sites, holdT: a.holdT }, B: { sites: b.sites, holdT: b.holdT, hud: b.hud } };
  check('guard stage', a.sites.length === 3 && a.sites.every((q) => q[2] === 1) && b.sites.every((q) => q[2] === 1) && a.holdT <= 40 && a.holdT >= 35 && b.hud[1] === '폭파까지 폭약 지키기', out.guard0);
  // 폭약 해제: 두 사람이 2번·3번 지점에 있고, 1번 지점 곁에 적이 머문다
  await wipe();
  await tp(A, a.sites[1][0], a.sites[1][1]);
  await tp(B, a.sites[2][0], a.sites[2][1]);
  await A.evaluate(([x, z]) => { const y = window.__yz; y.camp.st.queue.length = 0; y.camp.st.respawn = 99; const e = y.spawnEnemy(x + 2, z + 1, 'rifle'); e.obj = y.camp.st.sites[0]; }, [a.sites[0][0], a.sites[0][1]]);
  const t0 = (await st(A)).holdT;
  const dis = await run(14, async () => (await st(A)).sites[0][2] === 0 && (await st(B)).sites[0][2] === 0);
  await run(1.5);
  a = await st(A); b = await st(B);
  out.disarm = { ok: dis, A: a.sites.map((q) => q[2]), B: b.sites.map((q) => q[2]), holdBefore: t0, holdAfter: a.holdT, subB: b.hud[2], mkB: b.mk };
  check('disarm synced', dis && a.sites[0][2] === 0 && b.sites[0][2] === 0 && /해제된 폭약 1곳/.test(b.hud[2]) && b.mk, out.disarm);
  const hold1 = a.holdT;
  await run(2);
  check('timer paused while disarmed', (await st(A)).holdT === hold1, [hold1, (await st(A)).holdT]);
  await wipe();
  await tp(B, a.sites[0][0], a.sites[0][1]); // 참가자가 다시 설치
  const re = await run(5, async () => (await st(A)).sites[0][2] === 1);
  await A.evaluate(() => { window.__yz.camp.st.holdT = 1.5; window.__yz.camp.st.respawn = 99; });
  await wipe();
  await run(4, async () => (await st(A)).type === null && (await st(A)).boom > 0);
  a = await st(A);
  await run(0.6);
  b = await st(B);
  out.rearm = { ok: re, boomA: a.boom, boomB: b.boom };
  check('rearm → fuse', re && a.boom > 20 && a.boom <= 30 && b.boom > 20, out.rearm);
  await waitStage(2, 'reach');
  await wipe();
  await run(0.5);
  b = await st(B);
  out.reach = { hudB: b.hud };
  check('reach hud', /전원 도착해야 함/.test(b.hud[2]) && /폭파까지 \d+초/.test(b.hud[2]), b.hud);
  // 한 명만 도착하면 끝나지 않는다
  await tp(A, 0, 27);
  await run(1.5);
  check('reach needs everyone', (await st(A)).type === 'reach', (await st(A)).type);
  await tp(B, 1.5, 27.5);
  await run(8, async () => (await A.evaluate(() => window.__yz.game.state)) === 'epdone' && (await B.evaluate(() => window.__yz.game.state)) === 'epdone');
  out.m1done = { A: await done(A), B: await done(B) };
  check('m1 complete', out.m1done.A.state === 'epdone' && out.m1done.B.state === 'epdone' && out.m1done.A.title === '협동 임무 1 · 폭파조' && !out.m1done.A.nextHidden && out.m1done.A.next === '다음 임무' && out.m1done.B.nextHidden && /방장이 다음 임무/.test(out.m1done.B.note) && out.m1done.B.list === '방 나가기' && /로비로/.test(out.m1done.A.list), out.m1done);
  await A.screenshot({ path: 'test/mis-done-host.png' });

  // ── 임무 2: 화물 회수 (부두, 흐림·비)
  await A.tap('#btnNextEp');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started && window.__yz.WORLD.id === 'dock', null, { timeout: 25000 });
  await god(A); await god(B);
  await waitStage(0, 'reach');
  a = await st(A); b = await st(B);
  out.m2start = { A: [a.map, a.env, a.hud[0], a.owned], B: [b.map, b.env, b.hud[0], b.owned, b.mi] };
  check('m2 start', a.map === 'dock' && b.map === 'dock' && a.env === 'overcast' && b.env === 'overcast' && b.hud[0] === '임무 2 · 1/3' && b.owned === 'ar,dmr,pistol' && b.mi === 1, out.m2start);
  await wipe();
  await tp(A, 0, -15); await tp(B, 1.5, -14);
  await run(4, async () => (await st(A)).type === null);
  await pickBoth();
  await waitStage(1, 'carry');
  await wipe();
  a = await st(A); b = await st(B);
  out.carry0 = { A: a.item, B: b.item, crateB: b.crate, hudB: b.hud };
  check('carry stage', a.item[0] === -1 && b.item[0] === -1 && Math.abs(a.item[1] - b.item[1]) < 0.2 && b.crate && b.crate[2] === true && /화물에 다가가면/.test(b.hud[2]), out.carry0);
  // 참가자가 집는다 → 느려지고 달릴 수 없다
  await tp(B, a.item[1], a.item[2]);
  await run(2, async () => (await st(A)).item[0] === 1 && (await st(B)).item[0] === 1);
  await B.evaluate(() => { const y = window.__yz; y.input.keys.KeyW = true; y.input.keys.ShiftLeft = true; });
  let spd = 0;
  await run(2, async () => { spd = Math.max(spd, await B.evaluate(() => window.__yz.player.hspeed)); return false; });
  await B.evaluate(() => { const y = window.__yz; y.input.keys.KeyW = false; y.input.keys.ShiftLeft = false; });
  spd = Math.round(spd * 100) / 100;
  a = await st(A); b = await st(B);
  out.carry1 = { A: a.item, B: b.item, speedB: spd, hudB: b.hud[2], hudA: a.hud[2], crateOnA: a.crate, bPos: b.pos };
  check('guest carries', a.item[0] === 1 && b.item[0] === 1 && spd > 3.2 && spd < 3.6 && /달릴 수 없음/.test(b.hud[2]) && /브라보 엄호/.test(a.hud[2]) && a.crate && a.crate[2] === true && Math.hypot(a.crate[0] - b.pos[0], a.crate[1] - b.pos[1]) < 3, out.carry1);
  await A.screenshot({ path: 'test/mis-carry-host.png' });
  // 든 사람이 쓰러지면 그 자리에 놓인다. 쓰러진 사람은 10초 뒤 팀원 근처에서 복귀한다
  await tp(A, 0, -15);
  await B.evaluate(() => { const y = window.__yz; y.prog.maxHp = 100; y.player.hp = 100; y.hurtPlayer(999, { x: 0, z: 0 }); });
  await run(2, async () => (await st(A)).item[0] === -1);
  await run(0.5);
  a = await st(A); b = await st(B);
  out.drop = { A: a.item, B: b.item, radioB: b.radio, bState: b.state };
  check('drop on down', a.item[0] === -1 && b.item[0] === -1 && b.state === 'dying', out.drop);
  await run(11.5, async () => (await B.evaluate(() => window.__yz.player.alive)));
  a = await st(A); b = await st(B);
  out.respawn = { bAlive: b.alive, dist: r1(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1])) };
  check('respawn near teammate', b.alive && out.respawn.dist < 10, out.respawn);
  await god(B);
  // 방장이 넘겨받아 목적지로
  a = await st(A);
  await tp(A, a.item[1], a.item[2]);
  await run(2, async () => (await st(A)).item[0] === 0);
  await tp(A, -54, 20);
  await run(3, async () => (await st(A)).item[3] === 1);
  await run(0.5);
  a = await st(A); b = await st(B);
  out.deliver1 = { A: a.item, B: b.item, hudB: b.hud[2] };
  check('first crate delivered, second appears', a.item[3] === 1 && a.item[0] === -1 && b.item[3] === 1 && Math.abs(a.item[1] - 6) < 2.5 && /1\/2/.test(b.hud[2]), out.deliver1);
  await tp(B, a.item[1], a.item[2]);
  await run(2, async () => (await st(A)).item[0] === 1);
  await tp(B, -53, 21);
  await run(4, async () => (await st(A)).type === null);
  await waitStage(2, 'hold');
  await wipe();
  await A.evaluate(() => { window.__yz.camp.st.holdT = 1.5; window.__yz.camp.st.respawn = 99; });
  await tp(A, -54, 20);
  await run(8, async () => (await A.evaluate(() => window.__yz.game.state)) === 'epdone' && (await B.evaluate(() => window.__yz.game.state)) === 'epdone');
  out.m2done = { A: await done(A), B: await done(B) };
  check('m2 complete', out.m2done.A.title === '협동 임무 2 · 화물 회수' && out.m2done.B.state === 'epdone' && !out.m2done.A.nextHidden, out.m2done);

  // ── 임무 3: 구출 (차량기지, 밤)
  await A.tap('#btnNextEp');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started && window.__yz.WORLD.id === 'depot', null, { timeout: 25000 });
  await god(A); await god(B);
  await waitStage(0, 'reach');
  await wipe();
  await tp(A, -33.5, 23.5); await tp(B, -32, 24.5);
  await waitStage(1, 'plant');
  await wipe();
  await A.evaluate(() => { window.__yz.camp.st.queue.length = 0; });
  a = await st(A);
  await tp(A, a.sites[0][0], a.sites[0][1]);
  await tp(B, a.sites[0][0] + 5, a.sites[0][1]);
  await run(2);
  const un = await st(A), unB = await st(B);
  await A.screenshot({ path: 'test/mis-unlock-host.png' });
  out.unlock = { hintA: un.hint, tA: un.sites[0][3], hintB: unB.hint, env: un.env };
  check('unlock label', un.hint === '잠금 해제 중' && un.sites[0][3] > 1 && un.sites[0][3] < 6 && unB.hint !== '잠금 해제 중' && un.env === 'night', out.unlock);
  await run(6, async () => (await st(A)).type === null);
  await pickBoth();
  await tp(A, -24, 20); await tp(B, -22, 21); // 조종사 곁에 서 있으면 단계가 시작되자마자 부축하게 된다: 잠깐 떨어져 있는다
  await waitStage(2, 'carry');
  await wipe();
  a = await st(A); b = await st(B);
  out.pilot0 = { A: a.pilot, B: b.pilot, hudB: b.hud };
  check('pilot waiting', a.pilot && b.pilot && a.pilot[3] === '조종사' && a.pilot[2] === false && /조종사에 다가가면 부축/.test(b.hud[2]), out.pilot0);
  await tp(A, a.item[1], a.item[2]);
  await run(2, async () => (await st(A)).item[0] === 0 && (await st(B)).item[0] === 0);
  await tp(A, -10, 0);
  await run(1.5);
  a = await st(A); b = await st(B);
  out.pilot1 = { A: a.pilot, B: b.pilot, aPos: a.pos, hudA: a.hud[2], hudB: b.hud[2] };
  check('pilot follows carrier on both screens', a.pilot[2] === true && b.pilot[2] === true && Math.hypot(a.pilot[0] - a.pos[0], a.pilot[1] - a.pos[1]) < 2.5 && Math.hypot(b.pilot[0] - a.pos[0], b.pilot[1] - a.pos[1]) < 2.5 && /알파 엄호/.test(b.hud[2]), out.pilot1);
  await B.screenshot({ path: 'test/mis-pilot-guest.png' });
  await tp(A, 0, -22);
  await run(4, async () => (await st(A)).type === null);
  await waitStage(3, 'hold');
  await wipe();
  b = await st(B);
  check('pilot gone after delivery', b.pilot === null && b.hud[0] === '임무 3 · 4/4', [b.pilot, b.hud]);
  await A.evaluate(() => { window.__yz.camp.st.holdT = 1.5; window.__yz.camp.st.respawn = 99; });
  await run(8, async () => (await A.evaluate(() => window.__yz.game.state)) === 'epdone' && (await B.evaluate(() => window.__yz.game.state)) === 'epdone');
  out.m3done = { A: await done(A), B: await done(B) };
  check('m3 complete (last)', out.m3done.A.title === '협동 임무 3 · 구출' && out.m3done.A.nextHidden && /모든 임무를 마쳤습니다/.test(out.m3done.A.note), out.m3done);
  // 로비로 → 임무 1을 다시 시작 → 전원 쓰러짐 = 임무 실패
  await A.tap('#btnEpList');
  await B.waitForFunction(() => window.__yz.game.state === 'coop' && window.__yz.lob.step === 'room', null, { timeout: 8000 });
  await A.tap('#btnCoMis'); // 3 → 1
  await B.waitForFunction(() => /^1 · /.test(document.querySelector('#btnCoMis b').textContent), null, { timeout: 8000 });
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started && window.__yz.WORLD.id === 'yard', null, { timeout: 25000 });
  await waitStage(0, 'plant');
  await A.evaluate(() => window.__yz.hurtPlayer(999, { x: 0, z: 0 }));
  await B.evaluate(() => window.__yz.hurtPlayer(999, { x: 0, z: 0 }));
  await run(5, async () => (await A.evaluate(() => window.__yz.game.state)) === 'over' && (await B.evaluate(() => window.__yz.game.state)) === 'over');
  const ov = (p) => p.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('overTitle').textContent, l: document.getElementById('oWaveL').textContent, v: document.getElementById('oWave').textContent, again: document.getElementById('btnAgain').textContent, againHidden: document.getElementById('btnAgain').classList.contains('hidden') }));
  out.failed = { A: await ov(A), B: await ov(B) };
  check('mission failed screen', out.failed.A.state === 'over' && out.failed.B.state === 'over' && out.failed.A.title === '임무 실패' && out.failed.B.title === '임무 실패' && out.failed.A.l === '단계' && out.failed.A.v === '1' && !out.failed.A.againHidden && out.failed.B.againHidden, out.failed);
  // 방장이 다시 시작하면 같은 임무가 처음부터
  await A.tap('#btnAgain');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  await waitStage(0, 'plant');
  out.restart = { A: (await st(A)).hud, B: (await st(B)).hud };
  check('restart mission', out.restart.B[0] === '임무 1 · 1/3', out.restart);
  // 혼자 하면 폭약 지점이 2곳으로 준다
  await B.tap('#bPause');
  await B.tap('#btnQuit');
  await run(1.5, async () => (await A.evaluate(() => window.__yz.coop.players.size)) === 0);
  await A.tap('#bPause');
  await A.tap('#btnRestart');
  await A.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.camp.si === -1, null, { timeout: 15000 });
  for (let t = 0; t < 6 && (await st(A)).type !== 'plant'; t += 0.25) { await A.evaluate(() => window.__yz.step(15, 1 / 60)); await sleep(40); }
  await A.evaluate(() => window.__yz.step(30, 1 / 60));
  const solo = await st(A);
  out.solo = { sites: solo.sites ? solo.sites.length : -1, hud: solo.hud };
  check('solo has two sites', out.solo.sites === 2 && solo.hud[2] === '0/2', out.solo);
} catch (e) { fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e)); }
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
server.kill();
process.exit(fail.length || errors.length ? 1 : 0);

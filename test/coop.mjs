// 협동 생존: 브라우저 두 개(방장 A, 참가자 B)를 로컬 중개 서버로 이어 처음부터 끝까지 확인한다.
//   node test/coop.mjs          로컬 중개 서버(자동으로 띄움)
//   node test/coop.mjs cloud    PeerJS 공개 중개 서버(0.peerjs.com)로 방 만들기·참가만 확인
//   node test/coop.mjs cloud <주소>   배포된 판(예: GitHub Pages 주소)을 열어 같은 확인
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const cloud = process.argv[2] === 'cloud';
const pageUrl = process.argv[3] || 'file:///home/claude/yard-zero/dist/index.html', liveOrigin = process.argv[3] ? new URL(process.argv[3]).origin : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null;
if (!cloud) {
  server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
  await sleep(1500);
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((local) => {
    try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ }
    if (local) window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false };
  }, !cloud);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') || /^https:\/\/0\.peerjs\.com\//.test(u) || (liveOrigin && u.startsWith(liveOrigin)) ? r.continue() : r.abort(); });
  await page.goto(pageUrl);
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 90000 });
  return page;
};
const A = await mk('A'), B = await mk('B');
const out = {};
const fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
// 두 화면의 게임 시간을 조금씩 번갈아 진행한다(네트워크가 오갈 실제 시간을 사이에 둔다)
const run = async (sec, fn) => {
  for (let t = 0; t < sec; t += 0.25) {
    await Promise.all([A.evaluate(() => window.__yz.step(15, 1 / 60)), B.evaluate(() => window.__yz.step(15, 1 / 60))]);
    await sleep(60);
    if (fn && (await fn())) return true;
  }
  return false;
};
const st = (p) => p.evaluate(() => { const y = window.__yz, c = y.coop; return { state: y.game.state, pid: c.pid, host: c.host, started: c.started, n: 1 + c.players.size, wave: y.game.wave, score: y.game.score, kills: y.game.kills, hp: Math.round(y.player.hp), alive: y.player.alive, enemies: y.enemies.filter((e) => !e.dead).length, allies: y.allies.filter((a) => !a.gone).map((a) => ({ name: a.def.name, up: a.up, hp: a.hp, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1), kills: a.kills })), pos: [+y.player.pos.x.toFixed(1), +y.player.pos.z.toFixed(1)] }; });

try {
  // 1. 방 만들기
  await A.tap('#btnCoop');
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => /^\d{5}$/.test(document.getElementById('coCode').textContent) && window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  out.code = code;
  // 2. 없는 방 코드
  if (!cloud) {
    await B.tap('#btnCoop');
    await B.tap('#btnCoJoin');
    const wrong = code === '11111' ? '22222' : '11111';
    for (const ch of wrong) await B.tap(`#coKeys [data-k="${ch}"]`);
    await B.tap('#btnCoGo');
    await B.waitForFunction(() => document.getElementById('coErr').textContent.length > 0, null, { timeout: 25000 });
    out.wrongCode = await B.evaluate(() => ({ err: document.getElementById('coErr').textContent, state: window.__yz.game.state, on: window.__yz.coop.on }));
    check('wrong code message', /찾지 못했습니다/.test(out.wrongCode.err), out.wrongCode);
    await B.tap('#btnCoPadBack');
    await B.tap('#btnCoBack');
  }
  // 3. 코드로 참가 (화면 숫자판)
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  out.entry = await B.evaluate(() => document.getElementById('coEntry').textContent);
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => window.__yz.coop.pid === 1 && document.querySelectorAll('#coList .corow').length === 2, null, { timeout: 25000 });
  await A.waitForFunction(() => document.querySelectorAll('#coList .corow').length === 2, null, { timeout: 10000 });
  await sleep(2600); // 핑·경로 측정
  out.lobbyA = await A.evaluate(() => ({ rows: [...document.querySelectorAll('#coList .corow')].map((r) => r.textContent), start: document.getElementById('btnCoStart').textContent, status: document.getElementById('coStatus').textContent }));
  out.lobbyB = await B.evaluate(() => ({ rows: [...document.querySelectorAll('#coList .corow')].map((r) => r.textContent), startHidden: document.getElementById('btnCoStart').classList.contains('hidden'), status: document.getElementById('coStatus').textContent, u: !!(window.__yz.NET.links[0] && window.__yz.NET.links[0].u) }));
  check('lobby rows', out.lobbyA.rows.length === 2 && /브라보/.test(out.lobbyA.rows[1]) && /ms/.test(out.lobbyA.rows[1]), out.lobbyA);
  check('guest has no start button', out.lobbyB.startHidden);
  check('state channel open', out.lobbyB.u);
  await A.screenshot({ path: 'test/coop-lobby-host.png' });
  await B.screenshot({ path: 'test/coop-lobby-guest.png' });
  if (cloud) { console.log(JSON.stringify(out)); console.log(fail.length ? 'FAIL ' + fail.join(' | ') : 'PASS'); throw new Error('done'); }

  // 4. 시작
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 30000 });
  await run(1.5);
  out.start = { A: await st(A), B: await st(B) };
  check('both playing', out.start.A.state === 'playing' && out.start.B.state === 'playing' && out.start.A.n === 2 && out.start.B.n === 2, out.start);

  // 5. 위치 동기화: B가 움직이면 A 화면의 브라보가 따라온다 (반대도)
  await B.evaluate(() => { const y = window.__yz; y.player.pos.x += 3; y.player.pos.z -= 4; y.player.yaw = 1.2; });
  await A.evaluate(() => { const y = window.__yz; y.player.pos.x -= 2.5; y.player.pos.z -= 3; });
  await run(1.5);
  const a1 = await st(A), b1 = await st(B);
  out.sync = { bPos: b1.pos, bSeenByA: [a1.allies[0].x, a1.allies[0].z], aPos: a1.pos, aSeenByB: [b1.allies[0].x, b1.allies[0].z] };
  check('B seen by A', Math.hypot(a1.allies[0].x - b1.pos[0], a1.allies[0].z - b1.pos[1]) < 0.6, out.sync);
  check('A seen by B', Math.hypot(b1.allies[0].x - a1.pos[0], b1.allies[0].z - a1.pos[1]) < 0.6, out.sync);

  // 6. 적 동기화: 방장이 만든 적이 참가자 화면에도 같은 자리에
  await run(12, async () => (await A.evaluate(() => window.__yz.enemies.filter((e) => !e.dead).length)) >= 3);
  await run(1);
  const enA = await A.evaluate(() => window.__yz.enemies.filter((e) => !e.dead).map((e) => [e.nid, e.T.key, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1)]));
  const enB = await B.evaluate(() => window.__yz.enemies.filter((e) => !e.dead).map((e) => [e.nid, e.T.key, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), e.puppet]));
  let maxErr = 0;
  for (const a of enA) { const b = enB.find((q) => q[0] === a[0]); maxErr = Math.max(maxErr, b ? Math.hypot(a[2] - b[2], a[3] - b[3]) : 99); }
  out.enemies = { host: enA.length, guest: enB.length, maxPosErr: +maxErr.toFixed(2), wave: (await st(B)).wave, puppets: enB.every((q) => q[4]) };
  check('enemy count', enA.length >= 3 && enA.length === enB.length, out.enemies);
  check('enemy positions', maxErr < 2.5, out.enemies);

  // 7. 참가자의 명중 → 방장이 피해 적용 → 사살이 양쪽에 반영
  const victim = enB[0][0];
  const scoreBefore = (await st(A)).score;
  await B.evaluate((nid) => { const y = window.__yz, e = y.enemies.find((q) => q.nid === nid); e.damage(40, 1, { x: 0, y: 0, z: 1 }, 3); e.damage(900, 1, { x: 0, y: 0, z: 1 }, 3); }, victim);
  await run(2);
  const a2 = await st(A), b2 = await st(B);
  out.kill = { hostEnemyDead: await A.evaluate((nid) => !window.__yz.enemies.some((e) => e.nid === nid && !e.dead), victim), guestEnemyDead: await B.evaluate((nid) => !window.__yz.enemies.some((e) => e.nid === nid && !e.dead), victim), guestKills: b2.kills, bravoKillsOnHost: a2.allies[0].kills, scoreGain: a2.score - scoreBefore, guestScore: b2.score };
  check('guest kill applied', out.kill.hostEnemyDead && out.kill.guestEnemyDead && out.kill.guestKills === 1 && out.kill.bravoKillsOnHost === 1 && out.kill.scoreGain >= 100 && out.kill.guestScore === a2.score, out.kill);

  // 8. 적의 사격 피해가 참가자에게 전달된다 (방장 쪽에서 브라보가 맞은 것으로 처리)
  await B.evaluate(() => { window.__yz.coop.safeT = 0; });
  const hp0 = (await st(B)).hp;
  await A.evaluate(() => { const y = window.__yz; y.allies[0].hurt(30, y.enemies.find((e) => !e.dead)); });
  await run(1);
  const hp1 = (await st(B)).hp;
  out.hurt = { before: hp0, after: hp1 };
  check('hurt relayed', hp0 - hp1 >= 29 && hp0 - hp1 <= 31, out.hurt);

  // 9. 적이 스스로 참가자를 공격한다: B를 적 가까이 세워 두고 방장 AI에 맡긴다
  const tgt = await A.evaluate(() => { const e = window.__yz.enemies.find((q) => !q.dead); return [e.pos.x, e.pos.z]; });
  await A.evaluate(() => { const y = window.__yz; y.player.pos.set(y.START.x, 0, y.START.z); });
  let fired = 0;
  await B.evaluate(([x, z]) => { const y = window.__yz, c = [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5], [-5, -5]].map(([dx, dz]) => [x + dx, z + dz]).find(([px, pz]) => !y.blockedAt(px, pz) && y.losClear(px, 1.5, pz, x, 1.4, z)) || [x + 6, z]; y.player.pos.set(c[0], 0, c[1]); y.player.hp = 100; y.coop.safeT = 0; window.__shots = 0; const f = y.RemotePlayer; }, tgt);
  await run(14, async () => { const s = await st(B); return s.hp < 70 || !s.alive; });
  const b3 = await st(B);
  out.aiAttack = { guestHp: b3.hp, alive: b3.alive };
  check('AI damages guest', b3.hp < 100 || !b3.alive, out.aiAttack);

  // 10. 쓰러짐 → 10초 뒤 복귀
  await B.evaluate(() => { const y = window.__yz; y.coop.safeT = 0; if (y.player.alive) y.hurtPlayer(999, { x: 0, z: 0 }); });
  await run(2.5);
  const a4 = await st(A), b4 = await st(B);
  out.down = { guestState: b4.state, guestAlive: b4.alive, bravoUpOnHost: a4.allies[0].up, msg: await B.evaluate(() => document.getElementById('msgT').textContent + ' / ' + document.getElementById('msgS').textContent) };
  check('down', b4.state === 'dying' && !b4.alive && a4.allies[0].up === false && /쓰러짐/.test(out.down.msg), out.down);
  await A.evaluate(() => { const y = window.__yz; y.player.hp = 100; y.coop.safeT = 99; }); // 방장은 살려 둔다
  await run(11, async () => (await st(B)).alive);
  await run(1);
  const a5 = await st(A), b5 = await st(B);
  out.respawn = { guestState: b5.state, guestHp: b5.hp, guestPos: b5.pos, bravoUpOnHost: a5.allies[0].up };
  check('respawn', b5.state === 'playing' && b5.alive && b5.hp === 100 && a5.allies[0].up === true, out.respawn);
  await B.screenshot({ path: 'test/coop-game-guest.png' });
  await A.screenshot({ path: 'test/coop-game-host.png' });

  // 11. 웨이브 격퇴 → 각자 보급 선택 → 모두 고르면 다음 웨이브
  await A.evaluate(() => { const y = window.__yz; y.game.toSpawn = 0; y.game.queue.length = 0; for (const e of y.enemies) if (!e.dead) e.damage(9999, 1, { x: 0, y: 0, z: 1 }, 3); });
  await run(6, async () => (await st(A)).state === 'supply' && (await st(B)).state === 'supply');
  const a6 = await st(A), b6 = await st(B);
  out.supply = { A: a6.state, B: b6.state, wave: a6.wave, sub: await B.evaluate(() => document.getElementById('supplySub').textContent) };
  check('supply open on both', a6.state === 'supply' && b6.state === 'supply', out.supply);
  await B.screenshot({ path: 'test/coop-supply-guest.png' });
  await B.tap('#sup1');
  await A.tap('#sup0');
  await run(1);
  out.supply.afterPick = { A: (await st(A)).state, B: (await st(B)).state, between: await A.evaluate(() => +window.__yz.game.between.toFixed(1)) };
  check('picked', out.supply.afterPick.A === 'playing' && out.supply.afterPick.B === 'playing' && out.supply.afterPick.between <= 3, out.supply);
  await run(6, async () => (await st(B)).wave === a6.wave + 1);
  out.supply.nextWave = { A: (await st(A)).wave, B: (await st(B)).wave };
  check('next wave', out.supply.nextWave.A === a6.wave + 1 && out.supply.nextWave.B === a6.wave + 1, out.supply);

  // 12. 일시정지 화면을 띄워도 세계는 흐른다
  await B.tap('#bPause');
  const t0 = await B.evaluate(() => window.__yz.game.time);
  await run(1);
  out.pause = { state: (await st(B)).state, timeAdvanced: +((await B.evaluate(() => window.__yz.game.time)) - t0).toFixed(2), brief: await B.evaluate(() => document.getElementById('pauseBrief').textContent), restartHidden: await B.evaluate(() => document.getElementById('btnRestart').classList.contains('hidden')), quit: await B.evaluate(() => document.getElementById('btnQuit').textContent) };
  check('pause keeps running', out.pause.state === 'paused' && out.pause.timeAdvanced > 0.5 && out.pause.restartHidden && out.pause.quit === '방 나가기', out.pause);
  await B.tap('#btnResume');

  // 13. 전원 쓰러짐 → 종료 화면 → 방장이 다시 시작
  await A.evaluate(() => { const y = window.__yz; y.coop.safeT = 0; y.hurtPlayer(999, { x: 0, z: 0 }); });
  await B.evaluate(() => { const y = window.__yz; y.coop.safeT = 0; y.hurtPlayer(999, { x: 0, z: 0 }); });
  await run(6, async () => (await st(A)).state === 'over' && (await st(B)).state === 'over');
  out.over = { A: (await st(A)).state, B: (await st(B)).state, eyebrow: await B.evaluate(() => document.getElementById('overEyebrow').textContent), againHiddenOnGuest: await B.evaluate(() => document.getElementById('btnAgain').classList.contains('hidden')), againOnHost: await A.evaluate(() => document.getElementById('btnAgain').textContent), kills: await B.evaluate(() => document.getElementById('oKills').textContent) };
  check('over', out.over.A === 'over' && out.over.B === 'over' && /전원 쓰러짐/.test(out.over.eyebrow) && out.over.againHiddenOnGuest && out.over.againOnHost === '다시 시작', out.over);
  await B.screenshot({ path: 'test/coop-over-guest.png' });
  await A.tap('#btnAgain');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 30000 });
  await run(4);
  const a7 = await st(A), b7 = await st(B);
  out.restart = { A: a7.state, B: b7.state, wave: [a7.wave, b7.wave], score: [a7.score, b7.score], guestEnemies: b7.enemies, hostEnemies: a7.enemies };
  check('restart', a7.state === 'playing' && b7.state === 'playing' && a7.score === 0 && b7.kills === 0 && a7.n === 2 && b7.n === 2, out.restart);

  // 14. 참가자가 나가면 방장 화면에서 사라진다
  await B.tap('#bPause');
  await B.tap('#btnQuit');
  await run(2, async () => (await st(A)).n === 1);
  out.leave = { hostPlayers: (await st(A)).n, guestState: (await st(B)).state, guestCoop: await B.evaluate(() => window.__yz.coop.on) };
  check('guest left', out.leave.hostPlayers === 1 && out.leave.guestState === 'menu' && out.leave.guestCoop === false, out.leave);

  // 15. 게임 중 다시 참가(늦은 입장) → 바로 판에 들어온다
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 30000 });
  await run(3);
  const a8 = await st(A), b8 = await st(B);
  out.lateJoin = { hostPlayers: a8.n, guestPlayers: b8.n, guestPid: b8.pid, guestEnemies: b8.enemies, hostEnemies: a8.enemies, wave: [a8.wave, b8.wave] };
  check('late join', a8.n === 2 && b8.n === 2 && b8.wave === a8.wave && b8.enemies === a8.enemies, out.lateJoin);

  // 16. 방장이 나가면 참가자는 끊김 화면 → 다시 참가 버튼
  await A.evaluate(() => window.__yz.quitToMenu());
  await run(0.5);
  await B.waitForFunction(() => window.__yz.game.state === 'over', null, { timeout: 20000 });
  out.hostLeft = { eyebrow: await B.evaluate(() => document.getElementById('overEyebrow').textContent), again: await B.evaluate(() => document.getElementById('btnAgain').textContent), againHidden: await B.evaluate(() => document.getElementById('btnAgain').classList.contains('hidden')) };
  check('host left', /끊겼습니다/.test(out.hostLeft.eyebrow) && out.hostLeft.again === '다시 참가' && !out.hostLeft.againHidden, out.hostLeft);
  await B.tap('#btnOverList');
  out.afterLeave = { guestState: (await st(B)).state, hostState: (await st(A)).state };
  check('back to menu', out.afterLeave.guestState === 'menu' && out.afterLeave.hostState === 'menu', out.afterLeave);

  console.log(JSON.stringify(out));
  console.log(fail.length ? 'FAIL ' + fail.join(' | ') : 'PASS');
} catch (e) {
  if (e.message !== 'done') { console.log(JSON.stringify(out)); console.log('ERROR', e.message.slice(0, 400)); }
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  if (server) server.kill();
}

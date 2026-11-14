// 대결 팀전: 브라우저 세 개(방장 A 청팀, 참가자 B 홍팀, 참가자 C 청팀)를 로컬 중개 서버로 이어 확인한다.
//   node test/tdm.mjs
// 확인하는 것: 로비의 팀 표시와 "내 팀" 바꾸기, 한 팀에 몰리면 시작 불가, 팀별 시작 자리, 같은 팀끼리 피해 없음, 상대 팀 피해·사살, 팀 점수, 팀원만 목록에 표시, 팀 합산 목표 → 종료 화면
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 300 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 120000 });
  return page;
};
const A = await mk('A'), B = await mk('B'), C = await mk('C');
const P = [A, B, C];
const out = {}, fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
const run = async (sec, fn) => {
  for (let t = 0; t < sec; t += 0.25) {
    await Promise.all(P.map((p) => p.evaluate(() => window.__yz.step(15, 1 / 60))));
    await sleep(60);
    if (fn && (await fn())) return true;
  }
  return false;
};
const r1 = (v) => Math.round(v * 10) / 10;
const st = (p) => p.evaluate(() => {
  const y = window.__yz, c = y.coop, r1 = (v) => Math.round(v * 10) / 10;
  return { state: y.game.state, pid: c.pid, mode: c.cfg.mode, tm: c.cfg.tm, hp: Math.round(y.player.hp), alive: y.player.alive, pos: [r1(y.player.pos.x), r1(y.player.pos.z)], sc: y.pvpTable(), hits: y.game.hits, kills: y.game.kills,
    others: [...c.players.values()].map((r) => ({ pid: r.pid, up: r.up, mat: r.def.mat, mate: y.mate(r.pid) })),
    hud: [document.getElementById('waveTxt').textContent, document.getElementById('enemyTxt').textContent],
    squad: [...document.querySelectorAll('#squad .sq')].filter((e) => !e.classList.contains('hidden') && e.id !== 'sqOw').map((e) => e.firstChild.textContent), squadHidden: document.getElementById('squad').classList.contains('hidden') };
});
const lobby = (p) => p.evaluate(() => ({ mode: document.querySelector('#btnCoMode b').textContent, team: document.querySelector('#btnCoTeam b').textContent, teamHidden: document.getElementById('btnCoTeam').classList.contains('hidden'),
  rows: [...document.querySelectorAll('#coList .corow b')].map((b) => b.textContent), start: document.getElementById('btnCoStart').textContent, startDisabled: document.getElementById('btnCoStart').disabled, helpT: !document.getElementById('coHelpT').classList.contains('hidden') }));
const place = (p, x, z, yaw) => p.evaluate(([x, z, yaw]) => { const y = window.__yz; y.player.pos.set(x, 0, z); y.player.vel.set(0, 0, 0); y.player.yaw = yaw; y.player.pitch = 0; y.coop.safeT = 0; }, [x, z, yaw]);
const fire = (p, on) => p.evaluate((on) => { window.__yz.input.fire = on; }, on);
const join = async (p, code, pid) => {
  await p.tap('#btnCoop');
  await p.tap('#btnCoJoin');
  for (const ch of code) await p.tap(`#coKeys [data-k="${ch}"]`);
  await p.tap('#btnCoGo');
  await p.waitForFunction((pid) => window.__yz.coop.pid === pid, pid, { timeout: 30000 });
};
// 쏘는 사람은 (-3, 26)에서 +x를, 맞는 사람은 (3, 26)에서 -x를 본다. 나머지 한 명은 멀리 둔다
const duel = async (shooter, victim, other) => {
  await place(shooter, -3, 26, -Math.PI / 2);
  await place(victim, 3, 26, Math.PI / 2);
  await place(other, 40, -22, 0);
  await run(0.75);
};
const killBy = async (shooter, victim, other) => {
  await duel(shooter, victim, other);
  await fire(shooter, true);
  const ok = await run(6, async () => !(await victim.evaluate(() => window.__yz.player.alive)));
  await fire(shooter, false);
  return ok;
};

try {
  await A.tap('#btnCoop');
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  await join(B, code, 1);
  await join(C, code, 2);
  await A.waitForFunction(() => document.querySelectorAll('#coList .corow').length === 3, null, { timeout: 15000 });
  // 1. 로비: 모드를 팀전으로 (협동 생존 → 협동 임무 → 개인전 → 팀전)
  for (let i = 0; i < 3; i++) await A.tap('#btnCoMode');
  for (let i = 0; i < 3; i++) await A.tap('#btnCoKt'); // 5킬
  await C.waitForFunction(() => document.querySelector('#btnCoMode b').textContent === '대결 (팀전)' && document.querySelector('#btnCoKt b').textContent === '5킬', null, { timeout: 8000 });
  out.lobby0 = { A: await lobby(A), B: await lobby(B), C: await lobby(C) };
  check('team lobby', out.lobby0.A.rows.join('|') === '알파 (나) · 청팀|브라보 · 홍팀|찰리 · 청팀' && out.lobby0.B.team === '홍팀' && out.lobby0.C.team === '청팀' && !out.lobby0.C.teamHidden && out.lobby0.C.helpT, out.lobby0);
  // 참가자가 자기 팀을 바꾼다 → 모두의 명단에 반영
  await B.tap('#btnCoTeam');
  await A.waitForFunction(() => /브라보 · 청팀/.test(document.getElementById('coList').textContent), null, { timeout: 8000 });
  out.lobby1 = { A: await lobby(A), B: await lobby(B) };
  check('one-sided blocks start', out.lobby1.A.startDisabled && out.lobby1.A.start === '팀을 나눠 주세요' && out.lobby1.B.team === '청팀', out.lobby1);
  await B.tap('#btnCoTeam');
  await A.waitForFunction(() => /브라보 · 홍팀/.test(document.getElementById('coList').textContent) && !document.getElementById('btnCoStart').disabled, null, { timeout: 8000 });
  await A.screenshot({ path: 'test/tdm-lobby-host.png' });
  // 2. 시작: 팀마다 한곳에
  await A.tap('#btnCoStart');
  for (const p of [B, C]) await p.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 20000 });
  for (const p of P) await p.evaluate(() => { window.__yz.opt.autoFire = false; });
  await run(1.5);
  const sA = await st(A), sB = await st(B), sC = await st(C), dist = (a, b) => r1(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]));
  out.start = { A: sA, B: sB, C: sC, dAC: dist(sA, sC), dAB: dist(sA, sB) };
  check('team spawns', out.start.dAC < 12 && out.start.dAB > 25, [out.start.dAC, out.start.dAB]);
  check('uniforms', sA.others.find((o) => o.pid === 2).mat === 'ally' && sA.others.find((o) => o.pid === 1).mat !== 'ally' && sB.others.every((o) => o.mat !== 'ally') && sC.others.find((o) => o.pid === 0).mat === 'ally', [sA.others, sB.others, sC.others]);
  check('hud team', sA.hud[0] === '팀전 0 : 0' && sA.hud[1] === '목표 5' && !sA.squadHidden && sA.squad.join() === '찰리' && sB.squad.length === 0, [sA.hud, sA.squad, sB.squad]);
  // 3. 같은 팀끼리는 피해 없음
  await duel(A, C, B);
  const h0 = sA.hits;
  await fire(A, true);
  await run(1.5);
  await fire(A, false);
  await run(0.5);
  const fC = await st(C), fA = await st(A);
  out.friendly = { cHp: fC.hp, aHits: fA.hits - h0, shots: await A.evaluate(() => window.__yz.game.shots) };
  check('no friendly fire', fC.hp === 100 && out.friendly.aHits === 0 && out.friendly.shots > 3, out.friendly);
  await A.screenshot({ path: 'test/tdm-mate-host.png' });
  // 4. 상대 팀은 맞는다 → 사살 → 팀 점수
  const k1 = await killBy(A, B, C);
  await run(0.6);
  const kA = await st(A), kB = await st(B), kC = await st(C);
  out.kill1 = { ok: k1, A: kA.hud, B: kB.hud, C: kC.hud, sc: kA.sc };
  check('team score', k1 && kA.hud[0] === '팀전 1 : 0' && kC.hud[0] === '팀전 1 : 0' && kB.hud[0] === '팀전 0 : 1', out.kill1);
  await run(5, async () => (await B.evaluate(() => window.__yz.game.state)) === 'playing' && (await B.evaluate(() => window.__yz.player.alive)));
  // 5. 팀 합산으로 목표(5킬): C가 2번, A가 2번 더
  for (const [shooter, other] of [[C, A], [C, A], [A, C], [A, C]]) {
    if ((await st(A)).state === 'over') break;
    await killBy(shooter, B, other);
    await run(5.5, async () => { const a = await A.evaluate(() => window.__yz.game.state); return a === 'over' || ((await B.evaluate(() => window.__yz.game.state)) === 'playing' && (await B.evaluate(() => window.__yz.player.alive))); });
  }
  await run(3, async () => (await A.evaluate(() => window.__yz.game.state)) === 'over' && (await B.evaluate(() => window.__yz.game.state)) === 'over' && (await C.evaluate(() => window.__yz.game.state)) === 'over');
  const ov = (p) => p.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('overTitle').textContent, eyebrow: document.getElementById('overEyebrow').textContent, a: document.getElementById('oWave').textContent, al: document.getElementById('oWaveL').textContent, kills: document.getElementById('oKills').textContent }));
  out.over = { A: await ov(A), B: await ov(B), C: await ov(C) };
  check('team over', out.over.A.title === '승리' && out.over.C.title === '승리' && out.over.B.title === '패배' && out.over.A.a === '5 : 0' && out.over.B.a === '0 : 5' && out.over.A.al === '팀 점수' && /^팀전 종료 · 청팀 5 : 0 홍팀/.test(out.over.A.eyebrow) && +out.over.A.kills + +out.over.C.kills === 5, out.over);
  await B.screenshot({ path: 'test/tdm-over-guest.png' });
} catch (e) { fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e)); }
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
server.kill();
process.exit(fail.length || errors.length ? 1 : 0);

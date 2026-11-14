// 대결 모드: 브라우저 두 개(방장 A, 참가자 B)를 로컬 중개 서버로 이어 처음부터 끝까지 확인한다.
//   node test/pvp.mjs
// 확인하는 것: 로비의 모드·맵·목표 선택과 동기화, 시작 자리, 서로의 위치, 피해(방장→참가자, 참가자→방장, 수류탄),
//   사살·점수·복귀, 쓰러진 동안의 메뉴, 자동 체력 회복 없음, 목표 킬 → 종료 화면, 로비로 돌아가 모드 바꾸기, 다른 맵
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ }
    window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`); });
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 90000 });
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
  const y = window.__yz, c = y.coop, r1 = (v) => Math.round(v * 10) / 10;
  return { state: y.game.state, pid: c.pid, started: c.started, mode: c.cfg.mode, cmap: c.cfg.map, kt: c.cfg.kt, map: y.WORLD.id, hp: Math.round(y.player.hp), alive: y.player.alive, pos: [r1(y.player.pos.x), r1(y.player.pos.z)],
    sc: y.pvpTable(), kills: y.game.kills, enemies: y.enemies.filter((e) => !e.dead).length, owned: Object.keys(y.prog.owned).filter((k) => y.prog.owned[k]).length, gren: y.gren.n,
    others: [...c.players.values()].map((r) => ({ pid: r.pid, up: r.up, lying: r.lying, x: r1(r.pos.x), z: r1(r.pos.z), mat: r.def.mat })),
    hud: [document.getElementById('waveTxt').textContent, document.getElementById('enemyTxt').textContent, document.getElementById('scoreTxt').textContent],
    tags: [...document.querySelectorAll('#tags span')].filter((t) => !t.classList.contains('hidden')).length, squadHidden: document.getElementById('squad').classList.contains('hidden'),
    menuBtn: !document.getElementById('bPause').classList.contains('hidden') };
});
const lobby = (p) => p.evaluate(() => ({ state: window.__yz.game.state, step: window.__yz.lob.step, mode: document.querySelector('#btnCoMode b').textContent, map: document.querySelector('#btnCoMap b').textContent, kt: document.querySelector('#btnCoKt b').textContent,
  mapHidden: document.getElementById('btnCoMap').classList.contains('hidden'), disabled: document.getElementById('btnCoMode').disabled, helpP: !document.getElementById('coHelpP').classList.contains('hidden'),
  start: document.getElementById('btnCoStart').textContent, startHidden: document.getElementById('btnCoStart').classList.contains('hidden'), status: document.getElementById('coStatus').textContent, rows: document.querySelectorAll('#coList .corow').length }));
// 서로 6m 떨어져 마주 본다 (야드 출발 지점 앞의 빈터). 복귀 직후의 보호는 끈다
const faceOff = async () => {
  await A.evaluate(() => { const y = window.__yz; y.player.pos.set(-3, 0, 26); y.player.vel.set(0, 0, 0); y.player.yaw = -Math.PI / 2; y.player.pitch = 0; y.coop.safeT = 0; });
  await B.evaluate(() => { const y = window.__yz; y.player.pos.set(3, 0, 26); y.player.vel.set(0, 0, 0); y.player.yaw = Math.PI / 2; y.player.pitch = 0; y.coop.safeT = 0; });
  await run(0.75); // 서로의 화면에 새 위치가 반영될 시간
};
const fire = (p, on) => p.evaluate((on) => { window.__yz.input.fire = on; }, on);
// p가 q를 쓰러뜨릴 때까지 쏜다
const killBy = async (p, q) => {
  await faceOff();
  await fire(p, true);
  const ok = await run(6, async () => !(await q.evaluate(() => window.__yz.player.alive)));
  await fire(p, false);
  return ok;
};

try {
  // 1. 방 만들기 → 참가
  await A.tap('#btnCoop');
  out.menuLabel = await A.evaluate(() => document.getElementById('btnCoop').textContent);
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => /^\d{5}$/.test(document.getElementById('coCode').textContent) && window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => window.__yz.coop.pid === 1 && document.querySelectorAll('#coList .corow').length === 2, null, { timeout: 25000 });
  await A.waitForFunction(() => document.querySelectorAll('#coList .corow').length === 2, null, { timeout: 10000 });

  // 2. 로비: 모드·맵·목표 킬. 방장이 바꾸면 참가자 화면에도 반영, 참가자는 바꿀 수 없다
  out.lobby0 = { A: await lobby(A), B: await lobby(B) };
  check('default mode surv', out.lobby0.A.mode === '협동 생존' && out.lobby0.B.mode === '협동 생존' && out.lobby0.A.mapHidden && !out.lobby0.A.disabled && out.lobby0.B.disabled, out.lobby0);
  await A.tap('#btnCoMode'); await A.tap('#btnCoMode'); // 협동 생존 → 협동 임무 → 대결 (개인전)
  await A.tap('#btnCoMap'); // 야드 → 부두
  for (let i = 0; i < 3; i++) await A.tap('#btnCoKt'); // 10 → 15 → 20 → 5
  await B.waitForFunction(() => document.querySelector('#btnCoKt b').textContent === '5킬', null, { timeout: 8000 });
  await B.evaluate(() => document.getElementById('btnCoMode').click()); // 참가자가 눌러도 바뀌지 않는다
  await sleep(300);
  out.lobby1 = { A: await lobby(A), B: await lobby(B) };
  check('pvp cfg synced', out.lobby1.B.mode === '대결 (개인전)' && out.lobby1.B.map === '부두' && out.lobby1.B.kt === '5킬' && !out.lobby1.B.mapHidden && out.lobby1.B.helpP && out.lobby1.A.mode === '대결 (개인전)', out.lobby1);
  await A.tap('#btnCoMap'); await A.tap('#btnCoMap'); // 부두 → 차량기지 → 야드
  await B.waitForFunction(() => document.querySelector('#btnCoMap b').textContent === '컨테이너 야드', null, { timeout: 8000 });
  await A.screenshot({ path: 'test/pvp-lobby-host.png' });
  await B.screenshot({ path: 'test/pvp-lobby-guest.png' });

  // 3. 시작: 같은 맵, 서로 떨어진 자리, 네 무기, 적 AI 없음
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 15000 });
  await A.evaluate(() => { window.__yz.opt.autoFire = false; });
  await B.evaluate(() => { window.__yz.opt.autoFire = false; });
  await run(1.5);
  const sA = await st(A), sB = await st(B);
  out.start = { A: sA, B: sB, dist: r1(Math.hypot(sA.pos[0] - sB.pos[0], sA.pos[1] - sB.pos[1])) };
  check('both playing pvp', sA.state === 'playing' && sB.state === 'playing' && sA.mode === 'pvp' && sB.mode === 'pvp' && sA.map === 'yard' && sB.map === 'yard', out.start);
  check('spawn apart', out.start.dist > 20 && out.start.dist < 75, out.start.dist);
  check('loadout', sA.owned === 4 && sB.owned === 4 && sA.gren === 1 && sA.enemies === 0 && sB.enemies === 0, [sA.owned, sB.owned, sA.gren, sA.enemies]);
  check('hud pvp', /^대결 0\/5$/.test(sA.hud[0]) && /^대결 0\/5$/.test(sB.hud[0]) && sA.tags === 0 && sA.squadHidden, [sA.hud, sB.hud, sA.tags, sA.squadHidden]);
  check('enemy uniforms', sA.others[0].mat === 'rusher' && sB.others[0].mat === 'rifle', [sA.others, sB.others]); // 대결에서는 파란(아군) 군복을 쓰지 않는다: 번호 0 rifle, 번호 1 rusher
  check('initial remote pos = spawn', Math.hypot(sA.others[0].x - sB.pos[0], sA.others[0].z - sB.pos[1]) < 1.5 && Math.hypot(sB.others[0].x - sA.pos[0], sB.others[0].z - sA.pos[1]) < 1.5, [sA.others, sB.pos, sB.others, sA.pos]);

  // 3-1. 15초 동안 교전이 없으면 가장 가까운 상대의 위치 표식이 뜬다
  const mk0 = await A.evaluate(() => !document.getElementById('mk').classList.contains('hidden'));
  await run(15.5);
  const mkOf = (p) => p.evaluate(() => ({ shown: !document.getElementById('mk').classList.contains('hidden'), dist: document.getElementById('mkD').textContent, quiet: Math.round(window.__yz.coop.quietT) }));
  out.marker = { before: mk0, A: await mkOf(A), B: await mkOf(B) };
  check('quiet marker', !mk0 && out.marker.A.shown && out.marker.B.shown && /^\d+m$/.test(out.marker.A.dist), out.marker);
  await A.screenshot({ path: 'test/pvp-marker-host.png' });

  // 4. 방장 A가 참가자 B를 쏜다: 피해 전달, 자동 회복 없음
  await faceOff();
  out.los = await A.evaluate(() => window.__yz.losClear(-3, 1.5, 26, 3, 1.3, 26));
  await A.evaluate(() => window.__yz.step(2, 1 / 60));
  await sleep(700); // 화면에 그려질 시간
  await A.screenshot({ path: 'test/pvp-face-host.png' });
  await B.screenshot({ path: 'test/pvp-face-guest.png' });
  await fire(A, true);
  await run(3, async () => (await B.evaluate(() => window.__yz.player.hp)) < 100);
  await fire(A, false);
  await run(0.5);
  const hp1 = await B.evaluate(() => window.__yz.player.hp);
  await run(8); // 예전에는 4.5초 뒤부터 초당 10씩 찼다
  const hp2 = await B.evaluate(() => window.__yz.player.hp);
  out.hit = { los: out.los, hpAfterHit: r1(hp1), hpAfter8s: r1(hp2), aHits: await A.evaluate(() => window.__yz.game.hits), bAlive: await B.evaluate(() => window.__yz.player.alive) };
  check('host→guest damage', hp1 < 100 && out.hit.aHits > 0, out.hit);
  check('no regen', hp2 === hp1 || !out.hit.bAlive, out.hit);

  // 5. 사살 → 점수·알림 → 4초 뒤 다른 자리에서 복귀. 쓰러진 동안에도 메뉴를 부를 수 있다
  const k1 = await killBy(A, B);
  await run(0.5);
  const dA = await st(A), dB = await st(B);
  out.kill1 = { ok: k1, A: { sc: dA.sc, kills: dA.kills, hud: dA.hud, bravo: dA.others[0] }, B: { state: dB.state, alive: dB.alive, sc: dB.sc, menuBtn: dB.menuBtn, msg: await B.evaluate(() => document.getElementById('msgT').textContent + ' / ' + document.getElementById('msgS').textContent) } };
  check('kill registered', k1 && dA.kills === 1 && JSON.stringify(dA.sc) === '[[0,1,0],[1,0,1]]' && JSON.stringify(dB.sc) === '[[0,1,0],[1,0,1]]', out.kill1);
  check('victim dying + menu button', dB.state === 'dying' && !dB.alive && dB.menuBtn, out.kill1.B);
  check('ragdoll on shooter screen', dA.others[0].lying === true && dA.others[0].up === false, dA.others[0]);
  check('death message names killer', /알파에게 당함/.test(out.kill1.B.msg), out.kill1.B.msg);
  await A.screenshot({ path: 'test/pvp-kill-host.png' });
  await B.tap('#bPause'); // 쓰러진 채 메뉴
  const m1 = await B.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('pauseTitle').textContent, brief: document.getElementById('pauseBrief').textContent, lobbyHidden: document.getElementById('btnLobby').classList.contains('hidden'), restartHidden: document.getElementById('btnRestart').classList.contains('hidden'), quit: document.getElementById('btnQuit').textContent }));
  await B.screenshot({ path: 'test/pvp-menu-guest.png' });
  await run(5); // 메뉴를 띄운 채 복귀 시간이 지난다
  const m2 = await B.evaluate(() => ({ state: window.__yz.game.state, alive: window.__yz.player.alive, hp: window.__yz.player.hp }));
  await B.tap('#btnResume');
  const m3 = await st(B);
  out.menuWhileDown = { m1, m2, after: { state: m3.state, alive: m3.alive, pos: m3.pos }, distFromA: r1(Math.hypot(m3.pos[0] - (await st(A)).pos[0], m3.pos[1] - (await st(A)).pos[1])) };
  check('menu while down', m1.state === 'paused' && m1.title === '메뉴' && /대결 \(개인전\) · 방 \d{5} · 알파 1 \/ 브라보 0 · 목표 5킬/.test(m1.brief) && m1.lobbyHidden && m1.restartHidden && m1.quit === '방 나가기', m1);
  check('respawn keeps menu, resume → playing', m2.state === 'paused' && m2.alive && m2.hp === 100 && m3.state === 'playing', out.menuWhileDown);
  check('respawn away from opponent', out.menuWhileDown.distFromA > 12, out.menuWhileDown.distFromA);
  await run(1);
  const upA = await st(A);
  check('revived on shooter screen', upA.others[0].up === true && upA.others[0].lying === false, upA.others[0]);

  // 6. 참가자 B가 방장 A를 쏜다 (참가자 → 방장 경로), 방장도 쓰러진 채 메뉴에서 '로비로'가 보인다
  const k2 = await killBy(B, A);
  await run(0.5);
  const eA = await st(A), eB = await st(B);
  out.kill2 = { ok: k2, A: { state: eA.state, sc: eA.sc }, B: { kills: eB.kills, sc: eB.sc, alpha: eB.others[0] } };
  check('guest kills host', k2 && eA.state === 'dying' && eB.kills === 1 && JSON.stringify(eA.sc) === JSON.stringify(eB.sc) && eB.sc.find((q) => q[0] === 1)[1] === 1 && eB.others[0].lying, out.kill2);
  await run(5, async () => (await A.evaluate(() => window.__yz.game.state)) === 'playing');

  // 7. 수류탄: 방장의 폭발이 참가자에게 피해
  await faceOff();
  const gb = await B.evaluate(() => window.__yz.player.hp);
  await A.evaluate(() => { const y = window.__yz; y.explode(3, 0.1, 24); }); // B(3, 26)에서 2m
  await run(1);
  const ga = await B.evaluate(() => window.__yz.player.hp);
  out.grenade = { before: gb, after: r1(ga) };
  check('grenade hurts opponent', ga < gb, out.grenade);

  // 8. 자동 사격이 상대 플레이어에게도 듣는다
  await faceOff();
  await A.evaluate(() => { window.__yz.opt.autoFire = true; });
  const shots0 = await A.evaluate(() => window.__yz.game.shots);
  await run(1.5);
  out.auto = { shots: (await A.evaluate(() => window.__yz.game.shots)) - shots0, target: await A.evaluate(() => (window.__yz.aa.e && window.__yz.aa.e.pid !== undefined ? window.__yz.aa.e.pid : -1)) };
  await A.evaluate(() => { window.__yz.opt.autoFire = false; });
  check('auto fire on player', out.auto.shots > 0, out.auto);
  await run(5, async () => (await B.evaluate(() => window.__yz.game.state)) === 'playing' && (await B.evaluate(() => window.__yz.player.alive)));

  // 9. A가 목표(5킬)에 닿을 때까지 → 종료 화면
  for (let i = 0; i < 8; i++) {
    const s = await st(A);
    if (s.state === 'over' || (s.sc.find((q) => q[0] === 0) || [0, 0])[1] >= 5) break;
    await killBy(A, B);
    await run(5.5, async () => { const a = await A.evaluate(() => window.__yz.game.state); return a === 'over' || ((await B.evaluate(() => window.__yz.game.state)) === 'playing' && (await B.evaluate(() => window.__yz.player.alive))); });
  }
  await run(3, async () => (await A.evaluate(() => window.__yz.game.state)) === 'over' && (await B.evaluate(() => window.__yz.game.state)) === 'over');
  const ov = (p) => p.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('overTitle').textContent, eyebrow: document.getElementById('overEyebrow').textContent, rank: document.getElementById('oWave').textContent, rankL: document.getElementById('oWaveL').textContent,
    deaths: document.getElementById('oScore').textContent, deathsL: document.getElementById('oScoreL').textContent, kills: document.getElementById('oKills').textContent, again: document.getElementById('btnAgain').textContent, againHidden: document.getElementById('btnAgain').classList.contains('hidden'),
    lobbyHidden: document.getElementById('btnOverLobby').classList.contains('hidden'), note: document.getElementById('overNote').textContent }));
  out.over = { A: await ov(A), B: await ov(B) };
  check('over screens', out.over.A.state === 'over' && out.over.B.state === 'over' && out.over.A.title === '승리' && out.over.B.title === '패배' && out.over.A.kills === '5' && out.over.A.rank === '1/2' && out.over.B.rank === '2/2' && out.over.A.rankL === '순위' && out.over.A.deathsL === '데스', out.over);
  check('over buttons', !out.over.A.againHidden && out.over.A.again === '다시 대결' && !out.over.A.lobbyHidden && out.over.B.againHidden && out.over.B.lobbyHidden && /방장/.test(out.over.B.note), out.over);
  await A.screenshot({ path: 'test/pvp-over-host.png' });
  await B.screenshot({ path: 'test/pvp-over-guest.png' });

  // 10. 로비로 돌아가 모드를 협동 생존으로 바꿔 시작 → 적이 양쪽에 나온다
  await A.tap('#btnOverLobby');
  await B.waitForFunction(() => window.__yz.game.state === 'coop' && window.__yz.lob.step === 'room', null, { timeout: 8000 });
  await A.tap('#btnCoMode'); await A.tap('#btnCoMode'); // 개인전 → 팀전 → 협동 생존
  await B.waitForFunction(() => document.querySelector('#btnCoMode b').textContent === '협동 생존', null, { timeout: 8000 });
  out.lobby2 = { A: await lobby(A), B: await lobby(B) };
  check('back to lobby', out.lobby2.A.state === 'coop' && out.lobby2.B.state === 'coop' && out.lobby2.A.rows === 2 && out.lobby2.B.rows === 2 && out.lobby2.B.mapHidden && !out.lobby2.B.helpP, out.lobby2);
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started, null, { timeout: 15000 });
  await run(9, async () => (await st(A)).enemies > 0 && (await st(B)).enemies > 0);
  const vA = await st(A), vB = await st(B);
  out.survival = { A: { mode: vA.mode, enemies: vA.enemies, hud: vA.hud, mat: vA.others[0].mat, tags: vA.tags >= 0, squadHidden: vA.squadHidden, owned: vA.owned }, B: { mode: vB.mode, enemies: vB.enemies, hud: vB.hud, mat: vB.others[0].mat } };
  check('survival after pvp', vA.mode === 'surv' && vB.mode === 'surv' && vA.enemies > 0 && vB.enemies > 0 && /^WAVE 1$/.test(vA.hud[0]) && vA.others[0].mat === 'ally' && vB.others[0].mat === 'ally' && !vA.squadHidden && vA.owned === 2, out.survival);

  // 11. 게임 중 메뉴 → 로비로 (방장) → 대결·부두로 다시 시작
  await A.tap('#bPause');
  const hm = await A.evaluate(() => ({ state: window.__yz.game.state, title: document.getElementById('pauseTitle').textContent, lobbyHidden: document.getElementById('btnLobby').classList.contains('hidden') }));
  await A.screenshot({ path: 'test/pvp-menu-host.png' });
  await A.tap('#btnLobby');
  await B.waitForFunction(() => window.__yz.game.state === 'coop' && window.__yz.lob.step === 'room', null, { timeout: 8000 });
  out.hostMenu = { hm, A: (await lobby(A)).state, B: await lobby(B), enemiesB: await B.evaluate(() => window.__yz.enemies.length) };
  check('host menu → lobby', hm.state === 'paused' && hm.title === '메뉴' && !hm.lobbyHidden && out.hostMenu.A === 'coop' && out.hostMenu.B.state === 'coop' && out.hostMenu.enemiesB === 0 && /로비로 돌아왔습니다/.test(out.hostMenu.B.status), out.hostMenu);
  await A.tap('#btnCoMode'); await A.tap('#btnCoMode');
  await A.tap('#btnCoMap');
  await B.waitForFunction(() => document.querySelector('#btnCoMap b').textContent === '부두' && document.querySelector('#btnCoMode b').textContent === '대결 (개인전)', null, { timeout: 8000 });
  await A.tap('#btnCoStart');
  await B.waitForFunction(() => window.__yz.game.state === 'playing' && window.__yz.coop.started && window.__yz.WORLD.id === 'dock', null, { timeout: 20000 });
  await run(1.5);
  const wA = await st(A), wB = await st(B);
  out.dock = { A: { map: wA.map, pos: wA.pos, sc: wA.sc, hud: wA.hud }, B: { map: wB.map, pos: wB.pos, sc: wB.sc }, dist: r1(Math.hypot(wA.pos[0] - wB.pos[0], wA.pos[1] - wB.pos[1])), blocked: [await A.evaluate(() => window.__yz.blockedAt(window.__yz.player.pos.x, window.__yz.player.pos.z)), await B.evaluate(() => window.__yz.blockedAt(window.__yz.player.pos.x, window.__yz.player.pos.z))] };
  check('pvp on dock', wA.map === 'dock' && wB.map === 'dock' && out.dock.dist > 20 && out.dock.dist < 75 && JSON.stringify(wA.sc) === '[[0,0,0],[1,0,0]]' && !out.dock.blocked[0] && !out.dock.blocked[1], out.dock);
  await A.screenshot({ path: 'test/pvp-dock-host.png' });

  // 12. 참가자가 나가면 방장 화면의 명단에서 빠진다
  await B.tap('#bPause');
  await B.tap('#btnQuit');
  await run(2, async () => (await st(A)).others.length === 0);
  out.leave = { hostOthers: (await st(A)).others.length, guestState: await B.evaluate(() => window.__yz.game.state), hud: (await st(A)).hud };
  check('guest leave', out.leave.hostOthers === 0 && out.leave.guestState === 'menu', out.leave);
} catch (e) {
  fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e));
}
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
server.kill();
process.exit(fail.length || errors.length ? 1 : 0);

// v0.8 혼자 하는 모드 확인: 자동 체력 회복 없음, 다쳤을 때 보급에 '구급 상자', 의무 보급품 회복, 게임 중 메뉴(☰ 버튼·뒤로 동작), 쓰러질 때 상태 전환
//   node test/menu.mjs
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
const html = fs.readFileSync('/home/claude/yard-zero/dist/index.html');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8124, '127.0.0.1');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('http://127.0.0.1:8124') ? r.continue() : r.abort()));
await page.goto('http://127.0.0.1:8124/');
await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 90000 });
const out = {}, fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
const ev = (f, a) => page.evaluate(f, a);
try {
  await page.tap('#btnStart');
  await ev(() => { const y = window.__yz; y.game.between = 9999; }); // 적 없이
  // 1. 자동 회복 없음 (예전: 4.5초 뒤부터 초당 10)
  out.regen = await ev(() => { const y = window.__yz; y.hurtPlayer(30, { x: 0, z: 0 }); const a = y.player.hp; y.step(600, 1 / 60); return { after: a, later: y.player.hp, state: y.game.state }; });
  check('no regen', out.regen.after === 70 && out.regen.later === 70, out.regen);
  // 2. 의무 보급품은 +50
  out.med = await ev(() => { const y = window.__yz; y.player.hp = 40; y.addPickup('med', y.player.pos.x, y.player.pos.z); y.step(5, 1 / 60); return { hp: y.player.hp, left: y.pickups.length }; });
  check('medkit +50', out.med.hp === 90 && out.med.left === 0, out.med);
  // 3. 보급 선택: 많이 다쳤으면 한 칸은 '구급 상자', 고르면 체력 전부 회복. 멀쩡하면 나오지 않는다
  out.supply = await ev(() => {
    const y = window.__yz, names = () => [0, 1, 2].map((i) => document.querySelector('#sup' + i + ' .st').textContent);
    y.player.hp = 30; y.openSupply(); const hurt = names(); const idx = hurt.indexOf('구급 상자');
    y.pickSupply(idx); const hpAfter = y.player.hp, st = y.game.state;
    let seen = 0; for (let i = 0; i < 12; i++) { y.player.hp = y.prog.maxHp; y.openSupply(); if (names().includes('구급 상자')) seen++; }
    y.pickSupply(names().findIndex((n) => n && n !== '의무 장비')); // 화면을 정상 경로로 닫는다(최대 체력은 건드리지 않게)
    return { hurt, idx, hpAfter, st, seenWhenFull: seen, closed: y.game.state };
  });
  check('heal offered when hurt', out.supply.idx >= 0 && out.supply.hpAfter === 100 && out.supply.st === 'playing' && out.supply.seenWhenFull === 0, out.supply);
  await ev(() => { const y = window.__yz; y.game.between = 9999; y.game.supplyT = 0; });
  // 4. 게임 중 메뉴: ☰ 버튼
  await page.tap('#bPause');
  out.menu1 = await ev(() => ({ state: window.__yz.game.state, title: document.getElementById('pauseTitle').textContent, tag: document.getElementById('pauseTag').textContent, lobbyHidden: document.getElementById('btnLobby').classList.contains('hidden'), label: document.getElementById('bPause').getAttribute('aria-label') }));
  await page.screenshot({ path: 'test/menu-solo.png' });
  await page.tap('#btnResume');
  check('menu button', out.menu1.state === 'paused' && out.menu1.title === '일시정지' && out.menu1.tag === '작전 보류' && out.menu1.lobbyHidden && out.menu1.label === '메뉴', out.menu1);
  // 5. 뒤로 동작 → 메뉴가 열리고 페이지는 그대로
  const url0 = page.url();
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await page.waitForTimeout(400);
  out.back = await ev(() => ({ state: window.__yz ? window.__yz.game.state : 'gone', armed: !!(history.state && history.state.yz) }));
  out.back.sameUrl = page.url() === url0;
  check('back opens menu', out.back.state === 'paused' && out.back.sameUrl, out.back);
  await page.tap('#btnResume');
  out.back.rearmed = await ev(() => !!(history.state && history.state.yz) && window.__yz.game.state === 'playing');
  check('back re-armed after resume', out.back.rearmed, out.back);
  // 6. 쓰러짐: 혼자 할 때는 메뉴 버튼이 사라지고 종료 화면으로
  out.die = await ev(() => { const y = window.__yz; y.hurtPlayer(999, { x: 0, z: 0 }); const a = { state: y.game.state, menuBtn: !document.getElementById('bPause').classList.contains('hidden'), touchHidden: document.getElementById('touch').classList.contains('hidden') }; y.step(150, 1 / 60); a.after = y.game.state; a.title = document.getElementById('overTitle').textContent; a.l1 = document.getElementById('oWaveL').textContent; a.lobbyHidden = document.getElementById('btnOverLobby').classList.contains('hidden'); return a; });
  check('solo death flow', out.die.state === 'dying' && !out.die.menuBtn && out.die.touchHidden && out.die.after === 'over' && out.die.title === '작전 종료' && out.die.l1 === '웨이브' && out.die.lobbyHidden, out.die);
  // 7. 의무 보급품 드롭 확률: 체력이 낮을수록 높다 (적 400명을 쓰러뜨려 센다)
  out.drops = await ev(() => {
    const y = window.__yz, run = (hp) => { let med = 0, ammo = 0; for (let i = 0; i < 400; i++) { y.player.hp = hp; y.player.alive = true; y.pickups.length = 0; const e = y.spawnEnemy(40, 0, 'rifle'); e.damage(999, 1, null, 0); for (const p of y.pickups) { if (p.type === 'med') med++; else ammo++; y.scene.remove(p.mesh); } y.pickups.length = 0; e.remove(); } y.enemies.length = 0; return [med, ammo]; };
    y.game.state = 'playing';
    return { full: run(100), mid: run(60), low: run(30) };
  });
  check('med drops scale with need', out.drops.low[0] > out.drops.mid[0] && out.drops.mid[0] > out.drops.full[0], out.drops);
} catch (e) { fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e)); }
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close(); srv.close();
process.exit(fail.length || errors.length ? 1 : 0);

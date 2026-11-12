// 작전 화면 점검: 작전 선택, 인게임 HUD(목표·분대·이름표·무전), 감시탑 지원, 사망 후 재도전, 작전 완료 화면
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const [vw, vh] = process.argv[2] === 'port' ? [390, 844] : [844, 390];
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
const ev = (fn, arg) => page.evaluate(fn, arg);
const tag = process.argv[2] === 'port' ? 'p' : 'l';
await ev(() => { const y = window.__yz; y.opt.quality = 'mid'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; y.store.set('camp', 2); });
const out = {};
// 1. 메뉴 → 작전 선택
await page.screenshot({ path: `test/cu-${tag}-menu.png` });
await page.tap('#btnCamp');
await page.waitForTimeout(400);
out.eps = await ev(() => ({ state: window.__yz.game.state, cards: [...document.querySelectorAll('#epList .card')].map((b) => ({ t: b.querySelector('.st').textContent, l: b.querySelector('.sl').textContent, dis: b.disabled, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), y: Math.round(b.getBoundingClientRect().y) })), over: document.getElementById('eps').scrollHeight > document.getElementById('eps').clientHeight + 1 }));
await page.screenshot({ path: `test/cu-${tag}-eps.png` });
// 2. 작전 2 시작 (부두, 팀원 2명)
await page.tap('#ep1');
await page.waitForTimeout(300);
await ev(() => { const y = window.__yz; y.prog.maxHp = 1e7; y.player.hp = 1e7; y.step(80, 0.05); });
await ev(() => { const y = window.__yz, a = y.allies[0], p = y.player; if (a) { p.yaw = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z)); p.pitch = -0.05; } });
await page.waitForTimeout(1200);
out.ep2 = await ev(() => { const y = window.__yz; return { state: y.game.state, map: y.WORLD.id, si: y.camp.si, squad: y.allies.map((a) => a.def.name + ':' + a.state), obj: document.getElementById('objT').textContent + ' | ' + document.getElementById('objS').textContent, wave: document.getElementById('waveTxt').textContent, tagsShown: [...document.querySelectorAll('#tags span')].filter((t) => !t.classList.contains('hidden')).length, squadRows: [...document.querySelectorAll('#squad .sq')].filter((t) => !t.classList.contains('hidden')).map((r) => r.textContent), radio: document.getElementById('radio').classList.contains('hidden') ? null : document.getElementById('radio').textContent, mk: !document.getElementById('mk').classList.contains('hidden') }; });
await page.screenshot({ path: `test/cu-${tag}-ep2.png` });
// 3. 교전 장면: 적 쪽을 보게 하고 잠깐 진행
await ev(() => { const y = window.__yz, p = y.player; y.step(120, 0.05); const e = y.enemies.find((q) => !q.dead); if (e) { p.yaw = Math.atan2(-(e.pos.x - p.pos.x), -(e.pos.z - p.pos.z)); p.pitch = 0; } });
await page.waitForTimeout(1500);
await page.screenshot({ path: `test/cu-${tag}-fight.png` });
// 4. 사망 → 이 단계부터 다시
await ev(() => { const y = window.__yz; y.prog.maxHp = 100; y.player.hp = 5; y.hurtPlayer(80, { x: 0, z: 0 }); y.step(60, 0.05); });
await page.waitForTimeout(500);
out.over = await ev(() => ({ state: window.__yz.game.state, eyebrow: document.getElementById('overEyebrow').textContent, again: document.getElementById('btnAgain').textContent, listShown: !document.getElementById('btnOverList').classList.contains('hidden') }));
await page.screenshot({ path: `test/cu-${tag}-over.png` });
await page.tap('#btnAgain');
await page.waitForTimeout(400);
await ev(() => window.__yz.step(60, 0.05));
out.retry = await ev(() => { const y = window.__yz; return { state: y.game.state, si: y.camp.si, hp: Math.round(y.player.hp), squad: y.allies.map((a) => a.def.short + ':' + a.state), owned: Object.keys(y.prog.owned).filter((k) => y.prog.owned[k]) }; });
// 5. 작전 3: 감시탑 지원 모습
await ev(() => { const y = window.__yz; y.startEpisode(2); y.prog.maxHp = 1e7; y.player.hp = 1e7; y.step(70, 0.05); y.player.pos.set(-33.5, 0, 23.5); y.step(90, 0.05); const t = y.WORLD.points.tower, p = y.player; p.pos.set(-30, 0, -6); p.yaw = Math.atan2(-(t.x - p.pos.x), -(t.z - p.pos.z)); p.pitch = 0.42; y.step(3, 0.05); });
await page.waitForTimeout(1500);
out.ep3 = await ev(() => { const y = window.__yz; return { si: y.camp.si, ow: y.overwatch.on, owBody: !!y.overwatch.body, owRow: !document.getElementById('sqOw').classList.contains('hidden'), env: y.WORLD.id }; });
await page.screenshot({ path: `test/cu-${tag}-tower.png` });
// 6. 작전 완료 화면 → 다음 작전
await ev(() => { const y = window.__yz; y.camp.s = null; y.camp.next = { k: 99, t: 0 }; y.step(2, 0.05); });
await page.waitForTimeout(300);
out.done = await ev(() => ({ state: window.__yz.game.state, title: document.getElementById('edTitle').textContent, time: document.getElementById('edTime').textContent, note: document.getElementById('edNote').textContent, saved: window.__yz.store.get('camp', 0) }));
await page.screenshot({ path: `test/cu-${tag}-done.png` });
await page.tap('#btnNextEp');
await page.waitForTimeout(500);
out.next = await ev(() => { const y = window.__yz; return { state: y.game.state, idx: y.camp.idx, map: y.WORLD.id, pos: [Math.round(y.player.pos.x), Math.round(y.player.pos.z)] }; });
// 7. 일시정지 → 메뉴로 → 생존 모드
await ev(() => window.__yz.step(20, 0.05));
await page.tap('#bPause'); await page.waitForTimeout(200);
await page.tap('#btnQuit'); await page.waitForTimeout(300);
out.menu = await ev(() => window.__yz.game.state);
await page.tap('#btnStart'); await page.waitForTimeout(500);
out.survival = await ev(() => { const y = window.__yz; return { state: y.game.state, camp: y.camp.on, map: y.WORLD.id, allies: y.allies.length, objHidden: document.getElementById('obj').classList.contains('hidden'), squadHidden: document.getElementById('squad').classList.contains('hidden'), wave: document.getElementById('waveTxt').textContent }; });
console.log(JSON.stringify(out));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// 세로 화면 / 90° 회전 모드 확인
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
await wait(1000);
await page.screenshot({ path: 'test/30-portrait-menu.png' });
await ev(() => { window.__yz.dbg.noDyn = true; document.getElementById('btnStart').click(); });
await wait(1500);
await ev(() => { window.__yz.game.between = 999; });
await page.screenshot({ path: 'test/31-portrait-play.png' });
// 일시정지 → 회전 켜기 → 계속
await ev(() => { document.getElementById('bPause').click(); });
await wait(400);
await ev(() => { document.getElementById('btnRot2').click(); });
await wait(600);
await page.screenshot({ path: 'test/32-rot-pause.png' });
await ev(() => { document.getElementById('btnResume').click(); });
await wait(1200);
await page.screenshot({ path: 'test/33-rot-play.png' });
// 회전 모드 터치 매핑: 논리적 오른쪽 영역(뷰포트 아래쪽)에서 논리적 +x(뷰포트 +y) 방향으로 드래그 → 오른쪽으로 회전(yaw 감소)
const y0 = await ev(() => window.__yz.player.yaw);
await touch('touchStart', [[1, 200, 520]]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[1, 200, 520 + i * 12]]); await wait(40); }
await touch('touchEnd', []);
await wait(300);
const y1 = await ev(() => window.__yz.player.yaw);
// 논리적 왼쪽 아래(뷰포트 왼쪽 위 부근)에서 조이스틱 앞으로: 논리적 위 = 뷰포트 +x
const z0 = await ev(() => window.__yz.player.pos.z);
await touch('touchStart', [[1, 80, 110]]);
await touch('touchMove', [[1, 130, 110]]);
await wait(1200);
const st = await ev(() => ({ mz: window.__yz.input.mz, mx: window.__yz.input.mx }));
await touch('touchEnd', []);
await wait(200);
const z1 = await ev(() => window.__yz.player.pos.z);
// 사격 버튼 탭 (DOM 좌표는 브라우저가 변환)
const fire = await ev(() => { const r = document.getElementById('bFire').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; });
await touch('touchStart', [[1, fire[0], fire[1]]]);
await wait(500);
await touch('touchEnd', []);
const ammo = await ev(() => window.__yz.W.ar.ammo);
console.log(JSON.stringify({ rotYawDelta: +(y1 - y0).toFixed(3), stick: st, dz: +(z1 - z0).toFixed(2), fireRect: fire.map((v) => Math.round(v)), ammo }));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();

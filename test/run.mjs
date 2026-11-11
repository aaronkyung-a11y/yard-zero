// 헤드리스 크롬(모바일 뷰포트)으로 실제 구동해 스크린샷과 콘솔 오류를 확인한다.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const snap = async (name) => page.screenshot({ path: `test/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);

await wait(1200);
await snap('01-menu');
await ev(() => { window.__yz.dbg.noDyn = true; document.getElementById('btnStart').click(); });
await wait(1200);
await ev(() => { window.__yz.game.between = 999; });
await snap('02-start');

// 적 근접 확인: 조준 자세 / 이동 자세
await ev(() => {
  const y = window.__yz;
  y.player.pos.set(-6, 0, 20); y.player.yaw = 0.35; y.player.pitch = -0.04;
  const e = y.spawnEnemy(-7.2, 16.6);
  e.state = 'combat'; e.react = 99; e.tactic = 99; e.canSee = true; e.seeT = 99; e.lastKnown.copy(y.player.pos);
  const f = y.spawnEnemy(-8.6, 15.2);
  f.seeT = 99; f.repath = 99; f.yaw = 1.2;
});
await wait(1500);
await snap('03-enemy-close');
await ev(() => { const y = window.__yz; y.player.pos.set(-6, 0, 24); });
await wait(700);
await snap('03b-enemy-mid');
await ev(() => { const y = window.__yz; y.input.ads = true; });
await wait(700);
await snap('04-ads');
await ev(() => { const y = window.__yz; y.input.fire = true; });
await wait(300);
await snap('05-firing');
await wait(900);
await ev(() => { const y = window.__yz; y.input.fire = false; y.input.ads = false; });
await wait(1200);
await snap('06-after');
await ev(() => { const y = window.__yz; y.player.pos.set(16, 0, 6); y.player.yaw = 2.3; y.player.pitch = 0.1; y.switchWeapon(); });
await wait(1500);
await snap('07-pistol');
await ev(() => { const y = window.__yz; y.input.ads = true; });
await wait(700);
await snap('07b-pistol-ads');
await ev(() => { const y = window.__yz; y.input.ads = false; y.switchWeapon(); y.player.pos.set(0, 0, 27); y.player.yaw = 0; y.player.pitch = 0; });
await wait(1500);
await snap('08-start-view');
await page.setViewportSize({ width: 390, height: 844 });
await wait(1200);
await snap('09-portrait');
console.log(errors.length ? 'CONSOLE:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'no console errors');
await browser.close();

// 자동 사격 켬/끔에 따른 사격 버튼 크기, 버튼 겹침, 버전 표시 확인 (가로·세로)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
async function run(name, vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' ' + e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
  await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; });
  const out = { menuVer: await page.evaluate(() => document.getElementById('verTop').textContent + ' / ' + document.getElementById('verTxt').textContent), autoDefault: await page.evaluate(() => window.__yz.opt.autoFire) };
  if (name === 'land') await page.screenshot({ path: 'test/fb-menu.png' });
  await page.tap('#btnStart');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const y = window.__yz; y.player.hp = 1e9; y.game.between = 9999; });
  const measure = () => page.evaluate(([vw, vh]) => {
    const ids = ['joy', 'bFire', 'bAds', 'bJump', 'bReload', 'bGren', 'bCrouch', 'ammo', 'bPause'];
    const boxes = ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(a.id + '×' + b.id); }
    const f = boxes[1];
    return { auto: document.body.classList.contains('auto'), fire: { size: Math.round(f.w), cx: Math.round(f.x + f.w / 2), cy: Math.round(f.y + f.h / 2), opacity: getComputedStyle(document.getElementById('bFire')).opacity }, overlaps, off: boxes.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > vw || b.y + b.h > vh).map((b) => b.id), hudVer: document.getElementById('hudVer').textContent };
  }, [vw, vh]);
  out.on = await measure();
  await page.screenshot({ path: `test/fb-${name}-auto.png` });
  // 일시정지 화면에서 자동 사격을 끈다 (실제 버튼)
  await page.tap('#bPause'); await page.waitForTimeout(300);
  out.pauseVer = await page.evaluate(() => document.getElementById('pauseVer').textContent);
  await page.tap('#btnAuto2'); await page.waitForTimeout(200);
  await page.tap('#btnResume'); await page.waitForTimeout(700);
  out.off = await measure();
  await page.screenshot({ path: `test/fb-${name}-manual.png` });
  // 작은 버튼으로도 쏠 수 있는지: 자동 사격을 다시 켜고 버튼을 눌러 한 발
  await page.evaluate(() => { const y = window.__yz; y.opt.autoFire = true; document.body.classList.add('auto'); });
  await page.waitForTimeout(200);
  const a0 = await page.evaluate(() => window.__yz.W.ar.ammo);
  await page.tap('#bFire'); await page.waitForTimeout(600);
  out.tapFire = { before: a0, after: await page.evaluate(() => window.__yz.W.ar.ammo) };
  console.log(name, JSON.stringify(out));
  await ctx.close();
}
await run('land', 844, 390);
await run('port', 390, 844);
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close();

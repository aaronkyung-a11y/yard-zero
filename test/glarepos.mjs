// 사용: node test/glarepos.mjs
// 해 눈부심 그림이 해가 있는 자리에 놓이는가(가로, 세로, 세로로 들고 돌린 화면), 메뉴 화면이 빛 번짐을 켠 채 멀쩡한가
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const dist = resolve(process.argv[2] || 'dist/index.html');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const out = {}, errors = [];
for (const [tag, vw, vh, rot] of [['land', 844, 390, false], ['port', 390, 844, false], ['rot', 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag}] ` + e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(dist).href);
  await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
  if (tag === 'land') { await page.waitForTimeout(600); await page.screenshot({ path: 'test/gfx-menu.png' }); }
  await page.evaluate((rot) => { const y = window.__yz; y.opt.quality = 'high'; y.applyQuality(); y.dbg.noDyn = true; if (rot && !y.opt.rot) y.toggleRot(); document.getElementById('btnStart').click(); }, rot);
  await page.waitForTimeout(400);
  out[tag] = await page.evaluate(() => {
    const y = window.__yz, p = y.player, s = y.sunDir;
    y.game.between = 9999; p.pos.set(-0.5, 0, 19.5);
    // 해를 화면 가운데에서 조금 비껴 본다: 눈부심 그림의 가운데가 해의 화면 자리와 같아야 한다
    p.yaw = Math.atan2(-s.x, -s.z) + 0.12; p.pitch = Math.asin(s.y) - 0.08; y.step(90, 1 / 60);
    const g = document.getElementById('glare').getBoundingClientRect(), c = document.getElementById('c').getBoundingClientRect();
    const v = s.clone().multiplyScalar(400).add(y.camera.position).project(y.camera);
    // 캔버스가 돌아가 있으면(세로로 들고 돌린 화면) 화면 좌표도 같이 돈다
    const rotated = y.opt.rot && innerHeight > innerWidth;
    const nx = v.x * 0.5 + 0.5, ny = -v.y * 0.5 + 0.5;
    const want = rotated ? { x: c.left + (1 - ny) * c.width, y: c.top + nx * c.height } : { x: c.left + nx * c.width, y: c.top + ny * c.height };
    return { opacity: +document.getElementById('glare').style.opacity, glare: [Math.round(g.left + g.width / 2), Math.round(g.top + g.height / 2)], sun: [Math.round(want.x), Math.round(want.y)], rotated, canvas: [Math.round(c.width), Math.round(c.height)] };
  });
  await page.evaluate(() => { window.__yz.dbg.freeze = true; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test/gfx-glare-${tag}.png` });
  await ctx.close();
}
console.log(JSON.stringify(out));
const bad = Object.entries(out).filter(([, r]) => !(r.opacity > 0.3 && Math.abs(r.glare[0] - r.sun[0]) <= 2 && Math.abs(r.glare[1] - r.sun[1]) <= 2));
console.log(bad.length ? 'FAIL ' + bad.map(([k]) => k).join(',') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();

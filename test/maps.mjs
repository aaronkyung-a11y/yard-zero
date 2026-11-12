// 맵·환경 점검: 맵을 바꿔 가며 스크린샷, 내비게이션 수치, 시작 지점 확인
// 사용: node test/maps.mjs <맵:환경:이름:x,y,z,yaw,pitch> ...   예) dock:overcast:a:-55,0,21,-1.57,0
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text().slice(0, 300)); });
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'mid'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; });
await ev(() => document.getElementById('btnStart').click());
await page.waitForTimeout(500);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; });
let cur = '';
for (const spec of process.argv.slice(2)) {
  const [map, env, name, pose] = spec.split(':');
  const [x, y0, z, yaw, pitch] = pose.split(',').map(Number);
  if (cur !== map + env) {
    cur = map + env;
    const info = await ev(([map, env]) => {
      const y = window.__yz; y.loadMap(map, env);
      const N = y.NAV; return { map, env, B: { ...y.B }, START: { ...y.START }, nav: [N.W, N.H], free: N.free.length, colliders: y.colliders.length, meshes: y.WORLD.meshes.length, tris: y.WORLD.meshes.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0), startBlocked: y.blockedAt(y.START.x, y.START.z), points: Object.keys(y.WORLD.points) };
    }, [map, env]);
    console.log(JSON.stringify(info));
  }
  await ev(([x, y0, z, yaw, pitch]) => { const g = window.__yz; g.game.state = 'playing'; g.player.pos.set(x, y0, z); g.player.vel.set(0, 0, 0); g.player.yaw = yaw; g.player.pitch = pitch; }, [x, y0, z, yaw, pitch]);
  await page.waitForTimeout(900);
  await ev(() => { window.__yz.game.state = 'paused'; });
  await page.waitForTimeout(150);
  await ev(() => { document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = 'hidden')); });
  await page.screenshot({ path: `test/map-${map}-${name}.png` });
  await ev(() => { document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = '')); });
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

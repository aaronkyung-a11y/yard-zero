// 계단 오르내리기, 2층 난간, 창고 출입 (키 입력으로 실제 이동)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 230 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; });
await ev(() => document.getElementById('btnStart').click());
await page.waitForTimeout(500);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; });
// 주어진 위치·방향에서 앞으로 걷게 하고 궤적 요약을 돌려준다
const walk = (x, y0, z, yaw, sec) => ev(([x, y0, z, yaw, sec]) => new Promise((res) => {
  const y = window.__yz, p = y.player;
  p.pos.set(x, y0, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = 0; y.input.keys.KeyW = true;
  const t0 = y.game.time; let maxY = y0, minY = y0, air = 0, n = 0, maxStepJump = 0, lastY = y0;
  const f = () => {
    n++; maxY = Math.max(maxY, p.pos.y); minY = Math.min(minY, p.pos.y); if (!p.grounded) air++;
    maxStepJump = Math.max(maxStepJump, Math.abs(p.pos.y - lastY)); lastY = p.pos.y;
    if (y.game.time - t0 >= sec) { y.input.keys.KeyW = false; res({ x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), maxY: +maxY.toFixed(2), minY: +minY.toFixed(2), airFrames: air, frames: n, maxStepJump: +maxStepJump.toFixed(2), gm: p.col.gm }); }
    else requestAnimationFrame(f);
  };
  f();
}), [x, y0, z, yaw, sec]);
const out = {};
// yaw: 앞 방향이 (-sin(yaw), -cos(yaw)) → 서쪽(-x)으로 가려면 yaw = PI/2
out.up = await walk(56.2, 0, -12.3, Math.PI / 2, 2.6);           // 북쪽 계단을 올라 2층으로
out.rail = await walk(46, 3.5, 0, -Math.PI / 2, 1.5);            // 2층에서 난간 쪽(동쪽)으로: 난간에 막혀야 함
out.down = await walk(47.5, 3.5, 12.3, -Math.PI / 2, 2.6);       // 남쪽 계단으로 내려가기
out.door = await walk(38, 0, -8, -Math.PI / 2, 2.4);             // 야드에서 트럭 출입구로 진입
out.side = await walk(40, 0, 3, -Math.PI / 2, 1.6);              // 쪽문으로 진입
out.wall = await walk(40, 0, 0, -Math.PI / 2, 1.6);              // 벽: 막혀야 함
console.log(JSON.stringify(out, null, 0));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

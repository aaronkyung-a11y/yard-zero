// 충돌·점프·경계 검증 (키 입력 시뮬레이션)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; document.getElementById('btnStart').click(); });
await wait(500);
await ev(() => { window.__yz.game.between = 9999; });
const out = {};
// 게임 시간 기준 대기
const gwait = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);

// 1) 나무 상자(높이 1.0~1.2) 앞에서 전진 → 막힘, 점프 → 위에 올라섬
const crate = await ev(() => { const y = window.__yz; const c = y.colliders.find((c) => c.m === 2 && c.y0 === 0 && c.y1 >= 0.99 && c.y1 <= 1.21 && !y.colliders.some((o) => o !== c && o.x0 < c.x1 + 0.2 && o.x1 > c.x0 - 0.2 && o.z0 < c.z1 + 2.2 && o.z1 > c.z1 && o.y1 > 0.3)); return c; });
out.crate = crate;
await ev((c) => { const y = window.__yz; y.player.pos.set((c.x0 + c.x1) / 2, 0, c.z1 + 1.6); y.player.vel.set(0, 0, 0); y.player.yaw = 0; y.input.keys.KeyW = true; }, crate);
await gwait(1.2);
out.blocked = await ev((c) => { const p = window.__yz.player.pos; return { z: +p.z.toFixed(3), expect: +(c.z1 + 0.32).toFixed(3), y: p.y }; }, crate);
await ev(() => { window.__yz.input.jump = true; });
await gwait(1.2);
out.onCrate = await ev((c) => { const p = window.__yz.player.pos; return { y: +p.y.toFixed(3), top: c.y1, z: +p.z.toFixed(2), grounded: window.__yz.player.grounded }; }, crate);
// 2) 계속 전진해 상자에서 내려옴
await gwait(1.5);
out.afterWalkOff = await ev(() => { const p = window.__yz.player.pos; return { y: +p.y.toFixed(3), z: +p.z.toFixed(2) }; });
// 3) 북쪽 외벽으로 질주 → 벽에서 정지
await ev(() => { const y = window.__yz; y.player.pos.set(-39.5, 0, -27); y.player.vel.set(0, 0, 0); y.player.yaw = 0; y.input.keys.ShiftLeft = true; });
await gwait(2.5);
out.wall = await ev(() => { const p = window.__yz.player.pos; return { z: +p.z.toFixed(3), x: +p.x.toFixed(2) }; });
// 4) 모서리로 대각 질주 (북서)
await ev(() => { const y = window.__yz; y.player.yaw = Math.PI / 4; });
await gwait(2.5);
out.corner = await ev(() => { const p = window.__yz.player.pos; return { z: +p.z.toFixed(3), x: +p.x.toFixed(3) }; });
// 5) 컨테이너에 대각으로 비비기: 관통 여부
await ev(() => { const y = window.__yz; y.input.keys.ShiftLeft = false; y.player.pos.set(0, 0, 27); y.player.vel.set(0, 0, 0); y.player.yaw = -0.9; });
await gwait(4);
out.container = await ev(() => { const y = window.__yz, p = y.player.pos; const inside = y.colliders.some((c) => p.x > c.x0 + 0.05 && p.x < c.x1 - 0.05 && p.z > c.z0 + 0.05 && p.z < c.z1 - 0.05 && p.y < c.y1 - 0.05 && p.y + 1.7 > c.y0); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), inside }; });
// 6) 무작위 방향 30초 주행 중 충돌체 내부 진입 여부
out.fuzz = await ev(() => new Promise((res) => { const y = window.__yz; let bad = 0, n = 0; const t0 = y.game.time; y.input.keys.ShiftLeft = true; const f = () => { n++; if (n % 20 === 0) { y.player.yaw = Math.random() * 6.28; if (Math.random() < 0.3) y.input.jump = true; } const p = y.player.pos; if (y.colliders.some((c) => p.x > c.x0 + 0.1 && p.x < c.x1 - 0.1 && p.z > c.z0 + 0.1 && p.z < c.z1 - 0.1 && p.y < c.y1 - 0.1 && p.y + 1.7 > c.y0 + 0.1)) bad++; if (y.game.time - t0 > 30) res({ frames: n, insideFrames: bad, x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(2) }); else requestAnimationFrame(f); }; f(); }));
console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

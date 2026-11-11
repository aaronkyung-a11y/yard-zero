// 창고 확인: 스크린샷 + 계단 오르내리기 + 내비게이션
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text()); });
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const q = process.argv[2] || 'medium';
await ev((q) => { const y = window.__yz; y.opt.quality = q; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; }, q);
await ev(() => document.getElementById('btnStart').click());
await page.waitForTimeout(600);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; });
const shot = async (name, x, y, z, yaw, pitch) => {
  await ev(([x, y, z, yaw, pitch]) => { const g = window.__yz; g.game.state = 'playing'; g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0); g.player.yaw = yaw; g.player.pitch = pitch; }, [x, y, z, yaw, pitch]);
  await page.waitForTimeout(700);
  await ev(() => { window.__yz.game.state = 'paused'; });
  await page.waitForTimeout(200);
  await ev(() => { document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = 'hidden')); });
  await page.screenshot({ path: `test/wh-${name}.png` });
  await ev(() => { document.querySelectorAll('.overlay').forEach((o) => (o.style.visibility = '')); });
};
const only = process.argv[3];
const shots = { out: [30, 0, 2, -Math.PI / 2 - 0.25, 0.08], in1: [47.5, 0, -8, -Math.PI / 2 - 0.5, 0.05], in2: [64.5, 0, 11.5, Math.PI / 2 + 0.7, 0.1], deck: [45.5, 3.5, 0, Math.PI / 2, -0.25], win: [43.4, 3.5, -3, Math.PI / 2 + 0.2, -0.12], stair: [56.5, 0, -10.6, Math.PI / 2 - 0.45, 0.2] };
for (const k in shots) if (!only || only.split(',').includes(k)) await shot(k, ...shots[k]);
// 내비: 창고 안 칸이 열려 있는지
const nav = await ev(() => { const y = window.__yz, N = y.NAV; let inside = 0; for (const c of N.free) { const x = -42 + (c % N.W) + 0.5; if (x > 43) inside++; } return { W: N.W, free: N.free.length, inside }; });
console.log(JSON.stringify({ nav }));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

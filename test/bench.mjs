// 소프트웨어 렌더러(SwiftShader)에서 한 장면을 그리는 시간의 중앙값. 폰의 그래픽 칩과는 다르다: 판 사이의 상대 비교용
// 사용: node test/bench.mjs versions/yard-zero-v0.11.html
//   ONLY=day-mid,night-low  일부만 / HIDEVM=1 총을 숨김 / NOBUMP=1 총의 요철 질감 끔 / NOMAP=1 총의 질감 끔 / NOBLOOM=1 빛 번짐 끔 / NOTORCH=1 밤의 전등을 장면에서 뺌
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const file = resolve(process.argv[2] || 'dist/index.html');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 360 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'high'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(400);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.prog.maxHp = 1e9; y.player.hp = 1e9; document.getElementById('touch').style.display = 'none'; y.step(30, 1 / 60); });
const out = {};
if (process.env.HIDEVM) await ev(() => { window.__hidevm = true; });
if (process.env.NOBUMP) await ev(() => { for (const m of Object.values(window.__yz.VM.mats)) if (m.bumpMap) { m.bumpMap = null; m.needsUpdate = true; } });
if (process.env.NOMAP) await ev(() => { for (const m of Object.values(window.__yz.VM.mats)) if (m.isMeshStandardMaterial && (m.map || m.roughnessMap)) { m.map = null; m.roughnessMap = null; m.needsUpdate = true; } });
if (process.env.NOBLOOM) await ev(() => { window.__nobloom = true; });
if (process.env.NOTORCH) await ev(() => { window.__notorch = true; });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const env of ['day', 'night']) for (const q of ['high', 'mid', 'low']) {
  if (only && !only.includes(env + '-' + q)) continue;
  await ev(([env, q]) => { const y = window.__yz, p = y.player; y.dbg.freeze = false; y.loadMap('yard', env); y.opt.quality = q; y.applyQuality(); p.pos.set(-0.5, 0, 19.5); p.yaw = 0.5; p.pitch = 0.0; y.step(40, 1 / 60); y.dbg.freeze = true; if (window.__nobloom && y.bloom) y.bloom.on = false; if (window.__notorch && y.torch && y.torch.parent) { y.scene.remove(y.torch.target); y.scene.remove(y.torch); } if (window.__hidevm) y.VM.rig.visible = false; }, [env, q]);
  await page.waitForTimeout(1500); // 셰이더를 다시 짓는 시간을 재지 않도록
  const r = await ev(() => new Promise((res) => { const t = []; let last = performance.now(), n = 0; const f = (now) => { t.push(now - last); last = now; if (++n < 26) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b); res({ med: +t[t.length >> 1].toFixed(1), min: +t[0].toFixed(1), max: +t[t.length - 1].toFixed(1) }); } }; requestAnimationFrame((now) => { last = now; requestAnimationFrame(f); }); }));
  out[env + '-' + q] = r;
  console.log(env, q, JSON.stringify(r));
}
console.log(JSON.stringify(out));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();

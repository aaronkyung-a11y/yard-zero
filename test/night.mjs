// 밤 교전 가시성 확인: 작전 3의 소탕 단계에서 가장 가까운 적을 바라본 화면
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ep = +(process.argv[2] || 2), fwd = +(process.argv[3] || 420);
const info = await page.evaluate(([ep, fwd]) => {
  const y = window.__yz, p = y.player;
  y.opt.quality = 'mid'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false;
  y.startEpisode(ep); y.prog.maxHp = 1e7; p.hp = 1e7;
  y.step(70, 0.05);
  const s = y.camp.s; if (s && s.type === 'reach') { p.pos.set(s.at.x, 0, s.at.z); }
  y.step(fwd, 0.05);
  let best = null, bd = 1e9;
  for (const e of y.enemies) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd && y.losClear(p.pos.x, 1.6, p.pos.z, e.pos.x, 1.2, e.pos.z)) { bd = d; best = e; } }
  if (best) { p.yaw = Math.atan2(-(best.pos.x - p.pos.x), -(best.pos.z - p.pos.z)); p.pitch = 0; }
  y.step(2, 0.05);
  return { si: y.camp.si, enemies: y.enemies.filter((e) => !e.dead).length, dist: best ? +bd.toFixed(1) : null, type: best ? best.T.key : null, allies: y.allies.map((a) => a.def.short + ':' + a.state) };
}, [ep, fwd]);
console.log(JSON.stringify(info));
await page.waitForTimeout(1500);
await page.screenshot({ path: `test/night-${ep}.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

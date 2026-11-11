// 메뉴·HUD 배치 확인 (가로, 세로, 회전 모드)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
async function run(name, vw, vh, rot) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' ' + e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
  await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; });
  if (rot) await page.evaluate(() => window.__yz.toggleRot());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test/ui-${name}-menu.png` });
  const ov = await page.evaluate(() => { const m = document.querySelector('#menu .wrap'), r = m.getBoundingClientRect(), o = document.getElementById('menu'); return { wrapH: Math.round(r.height), scrollH: o.scrollHeight, clientH: o.clientHeight }; });
  await page.evaluate(() => document.getElementById('btnStart').click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const y = window.__yz; y.player.hp = 1e9; y.game.state = 'paused'; });
  // 버튼끼리 겹치는지 계산
  const boxes = await page.evaluate(() => ['joy', 'bFire', 'bAds', 'bJump', 'bReload', 'bGren', 'bCrouch', 'ammo', 'bPause'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(a.id + '×' + b.id); }
  const off = boxes.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > vw || b.y + b.h > vh).map((b) => b.id);
  await page.screenshot({ path: `test/ui-${name}-hud.png` });
  console.log(name, JSON.stringify({ ov, overlaps, off }));
  await ctx.close();
}
await run('land', 844, 390, false);
await run('port', 390, 844, false);
await run('rot', 390, 844, true);
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close();

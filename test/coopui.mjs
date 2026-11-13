// 협동 로비 화면 배치: 가로(844×390)와 세로(390×844)에서 버튼·숫자판이 겹치거나 화면 밖으로 나가지 않는지
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
for (const [name, w, h] of [['land', 844, 390], ['port', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } window.__yzPeer = { host: '127.0.0.1', port: 9, path: '/', secure: false }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name} pageerror] ${e.message}`));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz, null, { timeout: 90000 });
  const measure = (sel) => page.evaluate(([sel, W, H]) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.closest('.hidden'));
    const rs = els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.dataset.k || e.textContent.slice(0, 6), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
    const overlaps = [], off = [];
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.x < 0 || a.y < 0 || a.x + a.w > W || a.y + a.h > H) off.push(a.id);
      for (let j = i + 1; j < rs.length; j++) { const b = rs[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(a.id + '×' + b.id); }
    }
    const ov = document.getElementById('coop');
    return { n: rs.length, minH: Math.min(...rs.map((r) => r.h)), overlaps, off, scroll: ov.scrollHeight > ov.clientHeight + 1 };
  }, [sel, w, h]);
  const out = {};
  out.menuRow = await page.evaluate(() => { const r = document.getElementById('btnCoop').getBoundingClientRect(), s = document.getElementById('btnStart').getBoundingClientRect(), m = document.getElementById('menu'); return { coop: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], sameRowAsSurvival: Math.abs(r.top - s.top) < 2, menuScroll: m.scrollHeight > m.clientHeight + 1 }; });
  await page.tap('#btnCoop');
  out.choose = await measure('#coop button');
  await page.screenshot({ path: `test/coopui-${name}-choose.png` });
  await page.tap('#btnCoJoin');
  for (const ch of '4071') await page.tap(`#coKeys [data-k="${ch}"]`);
  out.pad = await measure('#coop button');
  out.pad.entry = await page.evaluate(() => document.getElementById('coEntry').textContent);
  out.pad.goDisabled = await page.evaluate(() => document.getElementById('btnCoGo').disabled);
  await page.tap('#coKeys [data-k="del"]');
  await page.tap('#coKeys [data-k="7"]');
  await page.tap('#coKeys [data-k="9"]');
  await page.tap('#coKeys [data-k="3"]'); // 다섯 자리를 넘는 입력은 무시된다
  out.pad.entry2 = await page.evaluate(() => document.getElementById('coEntry').textContent);
  out.pad.goEnabled = await page.evaluate(() => !document.getElementById('btnCoGo').disabled);
  await page.screenshot({ path: `test/coopui-${name}-pad.png` });
  // 중개 서버에 닿지 못할 때의 안내 (닿지 않는 주소를 가리켜 둠)
  await page.tap('#btnCoGo');
  await page.waitForFunction(() => document.getElementById('coErr').textContent.length > 0, null, { timeout: 30000 });
  out.brokerDown = await page.evaluate(() => ({ err: document.getElementById('coErr').textContent, step: window.__yz.lob.step, on: window.__yz.coop.on, entry: document.getElementById('coEntry').textContent }));
  await page.screenshot({ path: `test/coopui-${name}-error.png` });
  console.log(name, JSON.stringify(out));
  await ctx.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// 방(로비) 화면이 화면 안에 들어오는가: 방을 만든 뒤 모드를 바꿔 가며(협동 생존·협동 임무·대결) 버튼이 겹치거나 화면 밖으로 나가는지, 스크롤이 생기는지
// 사용: node test/lobbyfit.mjs [파일, 기본 dist/index.html]   (로컬 중개 서버를 자동으로 띄운다)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const url = pathToFileURL(resolve(process.argv[2] || 'dist/index.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const errors = [], out = {}, bad = [];
try {
  for (const [name, w, h] of [['land844', 844, 390], ['land667', 667, 375], ['land568', 568, 320], ['port390', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false }; });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${name} pageerror] ${e.message}`));
    await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
    await page.goto(url, { timeout: 120000 });
    await page.waitForFunction(() => window.__yz, null, { timeout: 90000 });
    await page.tap('#btnCoop');
    await page.tap('#btnCoHost');
    await page.waitForFunction(() => window.__yz.lob.step === 'room' && document.getElementById('coCode').textContent.trim().length >= 4, null, { timeout: 60000 });
    const measure = () => page.evaluate(([W, H]) => {
      const vis = (e) => e.offsetParent !== null && !e.closest('.hidden');
      const els = [...document.querySelectorAll('#coop button')].filter(vis);
      const rs = els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.slice(0, 6), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
      const overlaps = [], off = [];
      for (let i = 0; i < rs.length; i++) {
        const a = rs[i];
        if (a.x < 0 || a.y < 0 || a.x + a.w > W || a.y + a.h > H) off.push(a.id);
        for (let j = i + 1; j < rs.length; j++) { const b = rs[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(a.id + '×' + b.id); }
      }
      const ov = document.getElementById('coop'), help = [...document.querySelectorAll('#coHelp > *')].filter(vis);
      const helpOff = help.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > H + 1 || r.right > W + 1; }).length;
      return { mode: document.getElementById('btnCoMode').textContent.trim().slice(0, 14), n: rs.length, minH: Math.min(...rs.map((r) => r.h)), overlaps, off, scroll: ov.scrollHeight > ov.clientHeight + 1, sh: [ov.scrollHeight, ov.clientHeight], helpRows: help.length, helpOff };
    }, [w, h]);
    out[name] = [];
    for (let i = 0; i < 4; i++) { // 모드를 한 바퀴 돌린다
      const m = await measure();
      out[name].push(m);
      if (m.overlaps.length || m.off.length || m.helpOff) bad.push(`${name} ${m.mode}: ` + JSON.stringify({ overlaps: m.overlaps, off: m.off, helpOff: m.helpOff, scroll: m.scroll }));
      await page.screenshot({ path: `test/lobbyfit-${name}-${i}.png` });
      await page.tap('#btnCoMode');
      await sleep(250);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log(bad.length ? 'FAIL\n - ' + bad.join('\n - ') : 'PASS');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');

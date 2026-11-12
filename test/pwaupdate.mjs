// PWA 업데이트 흐름
//  A. 화면이 옛 판인 채로 새 서비스 워커가 넘겨받으면 메뉴에 "새 버전 적용" 버튼이 나타나고, 누르면 새 판으로 다시 열린다
//  B. 온라인으로 열어 이미 새 판이 떠 있으면(서비스 워커만 뒤따라 바뀜) 버튼이 나타나지 않는다
// 사전 준비: 저장소 루트 파일의 복사본을 /yard-zero/ 경로로 서비스하는 로컬 서버와 그 폴더 경로
//   예) node test/pwaupdate.mjs http://127.0.0.1:8765/yard-zero/ /tmp/pwa-serve/yard-zero
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const base = process.argv[2], dir = process.argv[3];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const origin = new URL(base).origin;
await page.route('**/*', (r) => (r.request().url().startsWith(origin) ? r.continue() : r.abort()));

const html0 = readFileSync(dir + '/index.html', 'utf8'), sw0 = readFileSync(dir + '/sw.js', 'utf8');
const cur = /const VERSION = '([^']*)'/.exec(sw0)[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 서버에 "새 릴리스"를 올린다: 페이지와 서비스 워커의 버전 문자열을 함께 바꾼다
const release = async (v) => {
  await sleep(1200); // 로컬 서버의 수정 시각이 초 단위라, 조건부 요청이 304로 잘못 떨어지지 않게 간격을 둔다
  writeFileSync(dir + '/index.html', html0.split(cur).join(v));
  writeFileSync(dir + '/sw.js', sw0.split(cur).join(v));
};
const ready = () => page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const swVer = () => page.evaluate(() => new Promise((res) => {
  const c = navigator.serviceWorker.controller;
  if (!c) return res(null);
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => res(e.data && e.data.v);
  c.postMessage({ type: 'yz-ver' }, [ch.port2]);
  setTimeout(() => res('no-reply'), 3000);
}));
const waitSw = async (v, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await swVer()) === v) return true; await sleep(250); } return false; };
const state = async () => ({ ...(await page.evaluate(async () => ({ page: document.getElementById('verTop').textContent, updateHidden: document.getElementById('btnUpdate').classList.contains('hidden'), caches: await caches.keys() }))), sw: await swVer() });

const out = { cur };
try {
  await page.goto(base);
  await ready();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((s) => setTimeout(s, 100)); });
  out.first = await state();

  // A. 열려 있는 화면(옛 판)에서 업데이트 확인 → 새 서비스 워커가 넘겨받는다
  await release('v9.9.9');
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  out.A_swSwitched = await waitSw('v9.9.9', 15000);
  await sleep(800);
  out.A_stale = await state();
  await page.screenshot({ path: 'test/pwa-update.png' });
  await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.tap('#btnUpdate')]);
  await ready();
  await sleep(800);
  out.A_applied = await state();

  // B. 새 릴리스가 올라온 뒤 앱을 다시 연다 → 페이지는 네트워크에서 새 판으로 뜨고, 서비스 워커는 뒤따라 바뀐다
  await release('v8.8.8');
  await page.reload();
  await ready();
  out.B_swSwitched = await waitSw('v8.8.8', 20000); // 탐색 뒤 브라우저가 스스로 하는 업데이트 확인
  if (!out.B_swSwitched) { // 스스로 확인하지 않았으면 직접 확인시킨다(이 경우 결과에 표시)
    out.B_manualUpdate = true;
    await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
    out.B_swSwitched = await waitSw('v8.8.8', 15000);
  }
  await sleep(1500);
  out.B_fresh = await state();
} finally {
  writeFileSync(dir + '/index.html', html0);
  writeFileSync(dir + '/sw.js', sw0);
}
console.log(JSON.stringify(out));
const ok = out.first.page === cur && out.first.updateHidden && out.first.sw === cur
  && out.A_stale.page === cur && out.A_stale.sw === 'v9.9.9' && !out.A_stale.updateHidden
  && out.A_applied.page === 'v9.9.9' && out.A_applied.updateHidden && out.A_applied.caches.join() === 'yard-zero-v9.9.9'
  && out.B_fresh.page === 'v8.8.8' && out.B_fresh.sw === 'v8.8.8' && out.B_fresh.updateHidden && out.B_fresh.caches.join() === 'yard-zero-v8.8.8';
console.log(ok ? 'PASS' : 'FAIL');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

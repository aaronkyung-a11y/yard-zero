// PWA 점검: 서비스 워커 등록·캐시, 매니페스트·아이콘, 오프라인 재실행, 설치 버튼
// 사전 준비: /yard-zero/ 경로로 저장소 루트를 서비스하는 로컬 서버 (예: http://127.0.0.1:8765/yard-zero/)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8765/yard-zero/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
await page.goto(base);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const out = {};
out.head = await page.evaluate(() => ({ manifest: !!document.querySelector('link[rel=manifest]'), theme: document.querySelector('meta[name=theme-color]')?.content, apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), installHidden: document.getElementById('btnInstall').classList.contains('hidden'), iosHintHidden: document.getElementById('iosHint').classList.contains('hidden'), ver: document.getElementById('verTxt').textContent }));
out.sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((s) => setTimeout(s, 100)); return { state: r.active && r.active.state, scope: r.scope, controlled: !!navigator.serviceWorker.controller }; });
out.cache = await page.evaluate(async () => { const keys = await caches.keys(), c = await caches.open(keys[0]), reqs = await c.keys(); return { keys, entries: reqs.map((r) => r.url.replace(location.origin, '')) }; });
out.manifest = await page.evaluate(async () => {
  const m = await (await fetch('manifest.webmanifest')).json(), icons = [];
  for (const ic of m.icons) { const res = await fetch(ic.src), bmp = await createImageBitmap(await res.blob()); icons.push({ src: ic.src, status: res.status, size: bmp.width + 'x' + bmp.height, declared: ic.sizes, purpose: ic.purpose }); }
  const a = await fetch('icons/apple-touch-icon.png'), ab = await createImageBitmap(await a.blob());
  return { name: m.name, short: m.short_name, start: m.start_url, scope: m.scope, display: m.display, orientation: m.orientation, icons, apple: ab.width + 'x' + ab.height };
});
// 설치 버튼: beforeinstallprompt가 오면 나타난다
out.installShown = await page.evaluate(() => { window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })); return !document.getElementById('btnInstall').classList.contains('hidden'); });
// 오프라인으로 다시 열기
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; });
await page.tap('#btnStart');
await page.waitForTimeout(1200);
out.offline = await page.evaluate(() => ({ state: window.__yz.game.state, clips: Object.keys(window.__yz.MOCAP.clips).length, samples: window.__yz.SFX.sampleState, controlled: !!navigator.serviceWorker.controller }));
console.log(JSON.stringify(out));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

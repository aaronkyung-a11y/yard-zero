// 설치한 앱의 업데이트 경로를 일반 Chrome에 가까운 조건에서 확인한다.
// Playwright를 쓰지 않는다(요청 가로채기·서비스 워커 자동 연결 없음, HTTP 캐시 켜짐). 브라우저는 DevTools 프로토콜로 탭을 열고 닫고 값만 읽는다.
// 서버는 GitHub Pages처럼 Cache-Control: max-age, ETag, 조건부 요청(304)을 흉내 낸다.
//
//   node test/pwaraw.mjs upgrade   설치된 v0.5(커밋 5b9f65a) → 지금 빌드. 캐시 신선 기간이 지난 뒤 다시 여는 경우(max-age=0)
//                                  기대: 화면이 바로 새 판, 서비스 워커가 뒤따라 바뀜, "새 버전 적용" 버튼은 안 나옴, 옛 캐시 삭제
//   node test/pwaraw.mjs stale     바로 전 판(지금 코드에 버전 문자열만 바꾼 것) → 지금 빌드. 신선 기간 안에 다시 여는 경우(max-age=600)
//                                  기대: 화면은 옛 판(HTTP 캐시), 서비스 워커가 바뀌면 버튼이 나옴, 누르면 새 판으로 열림
//
// 참고: 화면이 계속 렌더링 중이면 Chrome은 서비스 워커 업데이트 확인을 페이지를 연 뒤 약 60초까지 미룬다. 그래서 최대 110초를 기다린다.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const scenario = process.argv[2] || 'upgrade';
if (!['upgrade', 'stale'].includes(scenario)) { console.log('사용: node test/pwaraw.mjs upgrade|stale'); process.exit(1); }
const maxAge = scenario === 'stale' ? 600 : 0;
const PORT = 8767, DBG = 9333, PREV = 'v0.0.0-prev';
const cur = /const VERSION = '([^']*)'/.exec(readFileSync('sw.js', 'utf8'))[1];
const tmp = mkdtempSync(join(tmpdir(), 'yz-pwa-')), dir = join(tmp, 'yard-zero'), prof = join(tmp, 'profile');
mkdirSync(dir);
let oldVer;
if (scenario === 'upgrade') {
  execFileSync('tar', ['-x', '-C', dir], { input: execFileSync('git', ['archive', '5b9f65a', 'index.html', 'sw.js', 'manifest.webmanifest', 'icons'], { maxBuffer: 64 << 20 }) });
  oldVer = 'v0.5';
} else {
  cpSync('icons', join(dir, 'icons'), { recursive: true });
  copyFileSync('manifest.webmanifest', join(dir, 'manifest.webmanifest'));
  for (const f of ['index.html', 'sw.js']) writeFileSync(join(dir, f), readFileSync(f, 'utf8').split(cur).join(PREV));
  oldVer = PREV;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const log = [];
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice('/yard-zero/'.length) || 'index.html';
  let st, body;
  try { st = statSync(join(dir, p)); body = readFileSync(join(dir, p)); } catch (e) { res.writeHead(404); res.end(); return; }
  const etag = '"' + st.size + '-' + Math.round(st.mtimeMs) + '"';
  const h = { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=' + maxAge, ETag: etag, 'Last-Modified': st.mtime.toUTCString() };
  const code = req.headers['if-none-match'] === etag ? 304 : 200;
  log.push([Date.now(), code, p]);
  if (code === 304) { res.writeHead(304, h); res.end(); } else { res.writeHead(200, { ...h, 'Content-Length': body.length }); res.end(body); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}/yard-zero/`;

// 외부 호스트(글꼴 등)는 이름 풀이 단계에서 막는다
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--no-sandbox', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1', '--window-size=844,390', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json()).webSocketDebuggerUrl; } catch (e) { await sleep(250); } }
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const ev = async (sid, expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
const open = async () => { const { targetId } = await send('Target.createTarget', { url: base }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); return { targetId, sid: sessionId }; };
const ready = async (t) => { for (let i = 0; i < 240; i++) { try { if (await ev(t.sid, 'typeof window.__yz !== "undefined"')) return; } catch (e) { /* 탐색 중 */ } await sleep(250); } throw new Error('게임이 준비되지 않음'); };
const ST = `(async () => { const top = document.getElementById('verTop'), up = document.getElementById('btnUpdate'); return JSON.stringify({ page: top ? top.textContent : document.getElementById('verTxt').textContent.replace('YARD ZERO ', ''), update: up ? (up.classList.contains('hidden') ? 'hidden' : 'shown') : 'none', controlled: !!navigator.serviceWorker.controller, caches: (await caches.keys()).join() }); })()`;
const st = async (t) => JSON.parse(await ev(t.sid, ST));

const out = { scenario, from: oldVer, to: cur, maxAge };
let ok = false;
try {
  let tab = await open();
  await ready(tab);
  await ev(tab.sid, `(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((s) => setTimeout(s, 100)); })()`);
  await sleep(3000);
  out.installed = await st(tab);
  await send('Target.closeTarget', { targetId: tab.targetId }); // 앱을 닫는다
  await sleep(1500);
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) copyFileSync(f, join(dir, f)); // 새 판 배포
  const tDeploy = Date.now();
  tab = await open(); // 앱을 다시 연다
  await ready(tab);
  out.reopened = await st(tab);
  let s = out.reopened;
  const t0 = Date.now();
  while (Date.now() - t0 < 110000 && s.caches !== 'yard-zero-' + cur) { await sleep(2500); s = await st(tab); }
  const swReq = log.find((l) => l[0] >= tDeploy && l[2] === 'sw.js');
  out.updateCheckReachedServerAfterSec = swReq ? +((swReq[0] - tDeploy) / 1000).toFixed(1) : null;
  await sleep(2500);
  out.afterSwSwitch = await st(tab);
  if (scenario === 'stale' && out.afterSwSwitch.update === 'shown') {
    await ev(tab.sid, `document.getElementById('btnUpdate').click()`); // "새 버전 적용"
    await sleep(1500);
    await ready(tab);
    await sleep(2500);
    out.applied = await st(tab);
  }
  const a = out.afterSwSwitch, only = 'yard-zero-' + cur;
  ok = scenario === 'upgrade'
    ? out.installed.page === oldVer && out.reopened.page === cur && a.page === cur && a.update === 'hidden' && a.caches === only
    : out.installed.page === oldVer && out.reopened.page === oldVer && a.update === 'shown' && a.caches === only && !!out.applied && out.applied.page === cur && out.applied.update === 'hidden' && out.applied.caches === only;
} catch (e) { out.error = e.message; }
finally {
  try { await send('Browser.close'); } catch (e) { /* 이미 닫힘 */ }
  chrome.kill();
  server.close();
  await sleep(500);
  try { rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 남아도 임시 폴더 */ }
}
console.log(JSON.stringify(out));
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

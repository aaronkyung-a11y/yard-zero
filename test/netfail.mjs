// 연결 실패 안내: 참가자 쪽을 '중계만 허용'(중계 서버는 없음)으로 두어 직접 연결이 안 되는 상황을 만들고, 안내문과 진단 표시를 확인한다.
//   node test/netfail.mjs
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const base = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const bA = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: [...base, '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const bB = bA;
const errors = [];
const mk = async (browser, tag, relayOnly) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((relayOnly) => {
    try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ }
    window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false };
    if (relayOnly) window.__yzPeer.config = { iceServers: [], iceTransportPolicy: 'relay' }; // 쓸 수 있는 주소 후보가 하나도 없다
  }, !!relayOnly);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${tag} pageerror] ${e.message}`));
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto('file:///home/claude/yard-zero/dist/index.html');
  await page.waitForFunction(() => window.__yz && window.__yz.MOCAP.ready, null, { timeout: 90000 });
  return page;
};
const A = await mk(bA, 'A', false), B = await mk(bB, 'B', true);
const out = {}, fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
try {
  await A.tap('#btnCoop');
  await A.tap('#btnCoHost');
  await A.waitForFunction(() => window.__yz.NET.code, null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__yz.NET.code);
  await B.tap('#btnCoop');
  await B.tap('#btnCoJoin');
  for (const ch of code) await B.tap(`#coKeys [data-k="${ch}"]`);
  const t0 = Date.now();
  await B.tap('#btnCoGo');
  await B.waitForFunction(() => document.getElementById('coErr').textContent.length > 0, null, { timeout: 45000 });
  out.guest = await B.evaluate(() => ({ err: document.getElementById('coErr').textContent, state: window.__yz.game.state, step: window.__yz.lob.step, on: window.__yz.coop.on, entry: document.getElementById('coEntry').textContent, diag: window.__yz.NET.lastDiag }));
  out.guest.sec = Math.round((Date.now() - t0) / 100) / 10;
  await A.waitForFunction(() => /연결되지 않았습니다/.test(document.getElementById('coStatus').textContent), null, { timeout: 30000 }).catch(() => {});
  out.host = await A.evaluate(() => ({ status: document.getElementById('coStatus').textContent, rows: document.querySelectorAll('#coList .corow').length, state: window.__yz.game.state, code: window.__yz.NET.code }));
  check('guest sees failure with diag', /연결하지 못했습니다/.test(out.guest.err) && /\[진단: /.test(out.guest.err) && out.guest.state === 'coop' && out.guest.step === 'pad' && !out.guest.on && out.guest.entry === code, out.guest);
  check('guest old wrong advice gone', !/같은 와이파이에서 다시 시도/.test(out.guest.err), out.guest.err);
  check('host told about failed join', /들어오려던 폰과 연결되지 않았습니다/.test(out.host.status) && /\[진단: /.test(out.host.status) && out.host.rows === 1 && out.host.code === code, out.host);
  await B.screenshot({ path: 'test/netfail-guest.png' });
  await A.screenshot({ path: 'test/netfail-host.png' });
  // 진단에 따른 안내문 고르기
  out.texts = await B.evaluate(() => {
    const y = window.__yz, t = (d) => { y.NET.lastDiag = d; return y.netFailText('timeout'); };
    return { same: t({ same: true, noPub: false, noRemote: false, code: 'X' }), other: t({ same: false, noPub: false, noRemote: false, code: 'X' }), noPub: t({ same: null, noPub: true, noRemote: false, code: 'X' }), noRemote: t({ same: null, noPub: false, noRemote: true, code: 'X' }),
      noLocal: t({ same: null, noLocal: true, noPub: true, noRemote: true, code: 'X' }), none: t(null), noroom: y.netFailText('noroom') };
  });
  check('text same router', /같은 와이파이\(같은 공유기\)/.test(out.texts.same) && /와이파이를 끄고 모바일 데이터/.test(out.texts.same), out.texts.same);
  check('text other network', /통신망을 바꿔/.test(out.texts.other), out.texts.other);
  check('text udp blocked', /UDP/.test(out.texts.noPub), out.texts.noPub);
  check('text no remote', /방장 폰의 응답/.test(out.texts.noRemote), out.texts.noRemote);
  check('text no local', /이 폰에서 연결에 쓸 주소를 얻지 못했습니다/.test(out.texts.noLocal) && /이 폰에서 연결에 쓸 주소/.test(out.guest.err), [out.texts.noLocal, out.guest.err]);
  check('text plain', /찾지 못했습니다/.test(out.texts.noroom) && /연결하지 못했습니다/.test(out.texts.none), out.texts);
} catch (e) { fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e)); }
console.log(JSON.stringify(out));
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await bA.close();
server.kill();
process.exit(fail.length || errors.length ? 1 : 0);

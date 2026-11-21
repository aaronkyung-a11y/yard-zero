// 같은 와이파이 연결 실패 안내(v0.11.1): 폰 종류 판별, 종류별 안내문, 방장 쪽 안내가 뜨고 지워지는 흐름, 긴 안내문이 들어가도 버튼이 화면 안에 남는지
//   node test/lanhelp.mjs [파일, 기본 dist/index.html]   (로컬 중개 서버를 자동으로 띄운다)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const url = pathToFileURL(resolve(process.argv[2] || 'dist/index.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node_modules/.bin/peerjs', ['--host', '127.0.0.1', '--port', '9000', '--path', '/'], { stdio: 'ignore' });
await sleep(1500);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
const UA = {
  chrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36',
  kakao: 'Mozilla/5.0 (Linux; Android 16; SM-S938N Build/BP2A.250605.031; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/158.0.0.0 Mobile Safari/537.36 KAKAOTALK/26.9.2 (INAPP)',
  whale: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Whale/1.0.0.0 Crosswalk/29.138.0.4 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 17; Mobile; rv:146.0) Gecko/146.0 Firefox/146.0',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/158.0.7000.10 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36',
};
const errors = [], out = {}, fail = [];
const check = (name, ok, detail) => { if (!ok) fail.push(name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); };
// ver: userAgentData가 돌려줄 안드로이드 버전. null이면 userAgentData가 없는 브라우저처럼 만든다
const mk = async (w, h, ua, ver) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, userAgent: ua });
  await ctx.addInitScript((ver) => {
    try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ }
    window.__yzPeer = { host: '127.0.0.1', port: 9000, path: '/', secure: false };
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => (ver === null ? undefined : { platform: 'Android', mobile: true, brands: [], getHighEntropyValues: async () => ({ platformVersion: ver }) }) });
  }, ver);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.route('**/*', (r) => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('http://127.0.0.1:9000') ? r.continue() : r.abort(); });
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__yz, null, { timeout: 90000 });
  return { ctx, page };
};
const measure = (page, W, H) => page.evaluate(([W, H]) => {
  const vis = (e) => e.offsetParent !== null && !e.closest('.hidden');
  const rs = [...document.querySelectorAll('#coop button')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.dataset.k || e.textContent.slice(0, 6), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
  const off = rs.filter((a) => a.x < 0 || a.y < 0 || a.x + a.w > W || a.y + a.h > H).map((a) => a.id), overlaps = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(a.id + '×' + b.id); }
  const ov = document.getElementById('coop'), h2 = ov.querySelector('h2'), msg = [...document.querySelectorAll('#coErr,#coStatus,#coWarn')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, lines: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight)), top: Math.round(r.top), bottom: Math.round(r.bottom), n: e.textContent.length }; });
  const help = [...document.querySelectorAll('#coHelp > *')].filter(vis), helpOff = help.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > H + 1 || r.right > W + 1; }).map((e) => e.id);
  return { n: rs.length, off, overlaps, scroll: ov.scrollHeight > ov.clientHeight + 1, sh: [ov.scrollHeight, ov.clientHeight], h2: getComputedStyle(h2).display !== 'none', msg, help: help.map((e) => e.id), helpOff };
}, [W, H]);
try {
  // ── 1) 폰 종류 판별
  {
    const { ctx, page } = await mk(844, 390, UA.chrome, '17.0.0');
    await sleep(200);
    out.detect = await page.evaluate(async (UA) => {
      const y = window.__yz, keep = { ...y.plat }, r = {};
      const run = async (ua, ver) => { y.platRead(ua, ver === undefined ? undefined : { getHighEntropyValues: async () => ({ platformVersion: ver }) }); await new Promise((f) => setTimeout(f, 30)); return { ...y.plat, tag: y.platTag() }; };
      r.boot = { ...keep, tag: y.platTag() };
      r.chrome17 = await run(UA.chrome, '17.0.0');
      r.chrome16 = await run(UA.chrome, '16.0.0');
      r.chromeNoHint = await run(UA.chrome);
      r.chromeEmptyHint = await run(UA.chrome, '');
      r.samsung17 = await run(UA.samsung, '17.0.0');
      r.kakao = await run(UA.kakao);
      r.whale = await run(UA.whale, '15.0.0');
      r.firefox = await run(UA.firefox);
      r.iosSafari = await run(UA.iosSafari);
      r.iosChrome = await run(UA.iosChrome);
      r.desktop = await run(UA.desktop);
      Object.assign(y.plat, keep);
      return r;
    }, UA);
    const d = out.detect, eq = (a, os, ver, br) => a.os === os && a.ver === ver && a.br === br;
    check('boot android 17 chrome', eq(d.boot, 'android', 17, 'chrome') && d.boot.tag === '안드로이드 17·Chrome', d.boot);
    check('chrome 17', eq(d.chrome17, 'android', 17, 'chrome'), d.chrome17);
    check('chrome 16', eq(d.chrome16, 'android', 16, 'chrome') && d.chrome16.tag === '안드로이드 16·Chrome', d.chrome16);
    check('chrome without hint is unknown version', eq(d.chromeNoHint, 'android', 0, 'chrome') && d.chromeNoHint.tag === '안드로이드·Chrome', d.chromeNoHint);
    check('chrome empty hint is unknown version', eq(d.chromeEmptyHint, 'android', 0, 'chrome'), d.chromeEmptyHint);
    check('samsung internet', eq(d.samsung17, 'android', 17, 'samsung') && d.samsung17.tag === '안드로이드 17·삼성 인터넷', d.samsung17);
    check('kakaotalk in-app', eq(d.kakao, 'android', 16, 'inapp') && d.kakao.tag === '안드로이드 16·앱 속 브라우저', d.kakao);
    check('whale is other browser', eq(d.whale, 'android', 15, 'other'), d.whale);
    check('firefox reads version from ua', eq(d.firefox, 'android', 17, 'other'), d.firefox);
    check('ios safari', eq(d.iosSafari, 'ios', 0, 'safari') && d.iosSafari.tag === '아이폰·Safari', d.iosSafari);
    check('ios chrome', eq(d.iosChrome, 'ios', 0, 'chrome') && d.iosChrome.tag === '아이폰·Chrome', d.iosChrome);
    check('desktop', eq(d.desktop, 'other', 0, 'chrome') && d.desktop.tag === '기타 기기·Chrome', d.desktop);

    // ── 2) 종류별 안내문
    out.texts = await page.evaluate(() => {
      const y = window.__yz, keep = { ...y.plat }, r = {};
      const t = (os, ver, br, d) => { Object.assign(y.plat, { os, ver, br }); y.NET.lastDiag = d; return y.netFailText('timeout'); };
      const same = { same: true, noPub: false, noRemote: false, code: 'X' }, unk = { same: null, noPub: false, noRemote: false, code: 'X' }, diff = { same: false, noPub: false, noRemote: false, code: 'X' };
      r.a17 = t('android', 17, 'chrome', same);
      r.a18s = t('android', 18, 'samsung', same);
      r.a0 = t('android', 0, 'chrome', same);
      r.a16 = t('android', 16, 'chrome', same);
      r.a17app = t('android', 17, 'inapp', same);
      r.iosS = t('ios', 0, 'safari', same);
      r.iosC = t('ios', 0, 'chrome', same);
      r.pc = t('other', 0, 'chrome', same);
      r.unk17 = t('android', 17, 'chrome', unk);
      r.unk16 = t('android', 16, 'chrome', unk);
      r.unkIos = t('ios', 0, 'safari', unk);
      r.diff17 = t('android', 17, 'chrome', diff);
      r.noPub17 = t('android', 17, 'chrome', { same: null, noPub: true, noRemote: false, code: 'X' });
      Object.assign(y.plat, keep);
      return r;
    });
    const x = out.texts, perm = (app) => `설정 → 애플리케이션 → ${app} → 권한 → 근처 기기에서 "허용 안함"을 눌렀다가 다시 "허용"을 누르세요`, PERM = perm('Chrome');
    const STEP2 = '그래도 안 되면 와이파이가 폰끼리의 통신을 막는 것으로 보입니다. 한 폰을 모바일 데이터로 바꾸세요.';
    check('a17: two steps, re-grant the permission first', x.a17 === `연결하지 못했습니다. 방장 폰과 같은 와이파이에 있는데 직접 이어지지 않습니다.\n① 안드로이드 17 이상인 폰은 ${PERM}(이미 허용이어도, 두 폰 모두. 게임이 닫히면 다시 여세요).\n② ${STEP2}\n[진단: X]`, x.a17);
    check('a18 samsung: names the browser app', x.a18s.includes(`① 안드로이드 17 이상인 폰은 ${perm('삼성 인터넷')}(이미 허용이어도, 두 폰 모두.`), x.a18s);
    check('unknown android version: same wording as a17', x.a0 === x.a17, x.a0);
    check('a16: points at the other phone', x.a16.includes(`\n① 상대 폰이 안드로이드 17 이상이면 그 폰의 ${PERM}(이미 허용이어도).\n② 해당하지 않거나 ${STEP2}\n[진단: X]`) && !/이 아이폰/.test(x.a16), x.a16);
    check('a17 in-app: generic app name', x.a17app.includes(perm('이 게임을 연 앱')), x.a17app);
    check('ios safari: no local network line, same as a16', x.iosS === x.a16 && !/로컬 네트워크/.test(x.iosS), x.iosS);
    check('ios chrome: local network line', x.iosC.includes(`\n① 이 아이폰은 설정 → 개인정보 보호 및 보안 → 로컬 네트워크에서 Chrome을 켜세요. 상대가 안드로이드 17 이상이면 그 폰은 Chrome 권한의 "근처 기기"를 다시 허용하세요.\n② 해당하지 않거나 ${STEP2}`), x.iosC);
    check('desktop: same as a16', x.pc === x.a16, x.pc);
    check('old wording gone', Object.values(x).every((s) => !/이 와이파이에서는 폰끼리 직접 통신이 되지 않습니다/.test(s) && !/허용인지/.test(s) && !/이미 허용이면/.test(s)), 0);
    check('cannot compare, a17: adds the permission hint', /통신망을 바꿔/.test(x.unk17) && x.unk17.includes(`같은 와이파이라면 ${PERM}(이미 허용이어도).\n[진단: X]`), x.unk17);
    check('cannot compare, a16 / ios: plain', /통신망을 바꿔/.test(x.unk16) && !/근처 기기/.test(x.unk16) && !/근처 기기/.test(x.unkIos), [x.unk16, x.unkIos]);
    check('different networks: plain', /통신망을 바꿔/.test(x.diff17) && !/근처 기기/.test(x.diff17), x.diff17);
    check('udp blocked keeps its own text', /UDP/.test(x.noPub17) && !/근처 기기/.test(x.noPub17), x.noPub17);
    await ctx.close();
  }

  // ── 3) 실패가 없을 때는 로비 어디에도 권한 안내가 나오지 않는다(안드로이드 17 폰이어도)
  {
    const { ctx, page } = await mk(844, 390, UA.chrome, '17.0.0');
    await page.tap('#btnCoop');
    await sleep(150);
    out.quiet = await page.evaluate(() => ({ lan: !!document.getElementById('coLan'), warnShown: document.getElementById('coWarn').offsetParent !== null, text: document.getElementById('coop').innerText }));
    check('no standing permission tip', !out.quiet.lan && !out.quiet.warnShown && !/근처 기기/.test(out.quiet.text), out.quiet);
    await ctx.close();
  }

  // ── 4) 화면 배치: 가장 긴 안내문이 들어가도 버튼이 화면 안에 남는가 (참가자의 숫자판 화면, 방장의 방 화면, 미리 알림이 있는 첫 화면)
  out.fit = {};
  const DIAG = '이 폰(안드로이드 17·삼성 인터넷) 내부·공인 / 상대(안드로이드 17·삼성 인터넷) 내부·공인 / 같은 공유기 / 실패';
  const SIZES = [['land844', 844, 390, true], ['land780', 780, 360, true], ['land667', 667, 375, true], ['land568', 568, 320, false], ['port390', 390, 844, true], ['port360', 360, 780, true]];
  for (const [name, w, h, must] of SIZES) {
    const { ctx, page } = await mk(w, h, UA.chrome, '17.0.0');
    const o = (out.fit[name] = {});
    await page.tap('#btnCoop');
    await sleep(120);
    o.choose = await measure(page, w, h);
    if (name === 'land844' || name === 'port390') await page.screenshot({ path: `test/lanhelp-${name}-choose.png` });
    // 방장: 방을 만든 뒤 '같은 와이파이' 실패 알림
    await page.tap('#btnCoHost');
    await page.waitForFunction(() => window.__yz.lob.step === 'room' && window.__yz.NET.code, null, { timeout: 60000 });
    o.roomBefore = await measure(page, w, h);
    for (const [key, os, ver, br] of [['a17', 'android', 17, 'chrome'], ['a17s', 'android', 17, 'samsung'], ['iosC', 'ios', 0, 'chrome']]) {
      await page.evaluate(([os, ver, br, DIAG]) => { const y = window.__yz; Object.assign(y.plat, { os, ver, br }); y.NET.cb.miss({ same: true, code: DIAG }); }, [os, ver, br, DIAG]);
      await sleep(80);
      o['room_' + key] = await measure(page, w, h);
      if (key === 'a17') o.hostText = await page.evaluate(() => ({ status: document.getElementById('coStatus').textContent, warn: document.getElementById('coWarn').textContent }));
      if (key === 'a17' && (name === 'land844' || name === 'land780' || name === 'port390')) await page.screenshot({ path: `test/lanhelp-${name}-host.png` });
    }
    // 다른 통신망끼리 실패했을 때의 방장 쪽 글
    o.hostOther = await page.evaluate(() => { const y = window.__yz; Object.assign(y.plat, { os: 'android', ver: 17, br: 'chrome' }); y.NET.cb.miss({ same: false, code: 'X' }); const a = document.getElementById('coWarn').textContent; y.NET.cb.miss({ same: null, code: 'X' }); const b = document.getElementById('coWarn').textContent; y.NET.cb.miss(null); return { diff: a, unk: b, none: document.getElementById('coWarn').textContent }; });
    // 모드를 바꾸면 안내를 접고 그 모드의 설명을 보여 준다
    await page.evaluate(() => window.__yz.NET.cb.miss({ same: true, code: 'X' }));
    await page.tap('#btnCoMode');
    await sleep(120);
    o.modeClears = await page.evaluate(() => ({ warn: window.__yz.lob.warn, shown: document.getElementById('coWarn').offsetParent !== null, help: [...document.querySelectorAll('#coHelp > dl')].filter((e) => e.offsetParent !== null).map((e) => e.id) }));
    for (let i = 0; i < 3; i++) { await page.tap('#btnCoMode'); await sleep(60); } // 협동 생존으로 되돌린다
    // 누군가 들어오면 실패 안내는 지워진다
    await page.evaluate(() => window.__yz.NET.cb.miss({ same: true, code: 'X' }));
    o.warn = await page.evaluate(() => ({ warn: !!window.__yz.lob.warn, shown: document.getElementById('coWarn').offsetParent !== null, help: [...document.querySelectorAll('#coHelp > dl')].filter((e) => e.offsetParent !== null).length }));
    o.cleared = await page.evaluate(() => { const y = window.__yz; y.NET.cb.join({ pid: -1 }); return { text: document.getElementById('coStatus').textContent, warn: y.lob.warn, shown: document.getElementById('coWarn').offsetParent !== null, help: [...document.querySelectorAll('#coHelp > dl')].filter((e) => e.offsetParent !== null).map((e) => e.id) }; });
    await page.tap('#btnCoLeave');
    // 참가자: 숫자판 화면으로 돌아온 실패 안내
    for (const [key, os, ver, br] of [['a17', 'android', 17, 'chrome'], ['a17s', 'android', 17, 'samsung'], ['iosC', 'ios', 0, 'chrome']]) {
      await page.evaluate(([os, ver, br, DIAG]) => { const y = window.__yz; Object.assign(y.plat, { os, ver, br }); y.coopJoin('12345'); y.NET.lastDiag = { same: true, noPub: false, noRemote: false, code: DIAG }; y.NET.cb.error('timeout'); }, [os, ver, br, DIAG]);
      await sleep(80);
      o['pad_' + key] = await measure(page, w, h);
      o['pad_' + key].step = await page.evaluate(() => window.__yz.lob.step + '/' + document.getElementById('coEntry').textContent);
      if (key === 'a17' && (name === 'land844' || name === 'land780' || name === 'port390')) await page.screenshot({ path: `test/lanhelp-${name}-guest.png` });
    }
    // 오류가 지워지면 제목이 돌아온다
    await page.tap('#btnCoPadBack');
    await page.tap('#btnCoJoin');
    o.after = await page.evaluate(() => ({ err: document.getElementById('coErr').textContent, h2: getComputedStyle(document.querySelector('#coop h2')).display !== 'none' }));
    for (const k of Object.keys(o)) {
      const m = o[k];
      if (!m || !m.off) continue;
      if (m.overlaps.length) fail.push(`${name} ${k}: overlaps ${m.overlaps.join(',')}`);
      if (must && (m.off.length || m.scroll || m.helpOff.length)) fail.push(`${name} ${k}: ` + JSON.stringify({ off: m.off, helpOff: m.helpOff, scroll: m.scroll, sh: m.sh, msg: m.msg }));
    }
    check(`${name} host notice replaces the mode help`, o.warn.warn && o.warn.shown && o.warn.help === 0 && o.room_a17.help.join() === 'coWarn' && o.roomBefore.help.join() === 'coHelpS', [o.warn, o.room_a17.help, o.roomBefore.help]);
    check(`${name} host texts`, o.hostText.status === '들어오려던 폰과 연결되지 않았습니다. 안내를 확인하세요.' && o.hostText.warn === `들어오려던 폰과 같은 와이파이에 있는데 직접 이어지지 않습니다.\n① 안드로이드 17 이상인 폰은 설정 → 애플리케이션 → Chrome → 권한 → 근처 기기에서 "허용 안함"을 눌렀다가 다시 "허용"을 누르세요(이미 허용이어도, 두 폰 모두. 게임이 닫히면 다시 여세요).\n② 그래도 안 되면 와이파이가 폰끼리의 통신을 막는 것으로 보입니다. 한 폰을 모바일 데이터로 바꾸세요.\n[진단: ${DIAG}]`, o.hostText);
    check(`${name} host texts for other networks`, /^두 폰 사이에 직접 길이 열리지 않았습니다\. 한 폰의 통신망을 바꿔\(와이파이 ↔ 모바일 데이터\) 다시 시도해 보세요\.\n\[진단: X\]$/.test(o.hostOther.diff) && /같은 와이파이라면 설정 → 애플리케이션 → Chrome → 권한 → 근처 기기에서 "허용 안함"을 눌렀다가 다시 "허용"을 누르세요\(이미 허용이어도\)\.\n\[진단: X\]$/.test(o.hostOther.unk) && /다시 시도해 보세요\.$/.test(o.hostOther.none), o.hostOther);
    check(`${name} mode change folds the notice`, o.modeClears.warn === '' && !o.modeClears.shown && o.modeClears.help.join() === 'coHelpM', o.modeClears);
    check(`${name} title folds only for the guest's failure text`, o.room_a17.h2 === true && o.pad_a17.h2 === false && o.roomBefore.h2 === true && o.choose.h2 === true, [o.room_a17.h2, o.pad_a17.h2, o.roomBefore.h2, o.choose.h2]);
    check(`${name} failure cleared by a join`, o.cleared.text === '친구에게 방 코드를 알려 주세요.' && o.cleared.warn === '' && !o.cleared.shown && o.cleared.help.join() === 'coHelpS', o.cleared);
    check(`${name} guest back on pad with code`, o.pad_a17.step === 'pad/12345', o.pad_a17.step);
    check(`${name} title back after error cleared`, o.after.err === '' && o.after.h2, o.after);
    await ctx.close();
  }
} catch (e) { fail.push('exception ' + (e && e.message ? e.message.split('\n')[0] : e)); }
console.log('detect', JSON.stringify(out.detect));
console.log('texts', JSON.stringify(out.texts, null, 1));
console.log('quiet', JSON.stringify(out.quiet));
for (const [k, v] of Object.entries(out.fit || {})) console.log(k, JSON.stringify(v));
console.log(fail.length ? 'FAIL\n - ' + fail.join('\n - ') : 'PASS');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.kill();
process.exit(fail.length || errors.length ? 1 : 0);

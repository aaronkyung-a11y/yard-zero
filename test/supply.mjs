// 보급 선택: 웨이브 종료 → 선택 화면 → 터치로 선택 → 효과 확인
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function run(name, vw, vh) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' [pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; });
  await page.tap('#btnStart');
  await page.waitForTimeout(400);
  const out = {};
  out.start = await ev(() => { const y = window.__yz; return { owned: { ...y.prog.owned }, cur: y.vm.cur }; });
  await page.tap('#ammo'); await page.waitForTimeout(1200);
  out.cycle1 = await ev(() => window.__yz.vm.cur); // 소총 → 권총 (산탄총·지정사수 소총은 아직 없음)
  await page.tap('#ammo'); await page.waitForTimeout(1200);
  out.cycle2 = await ev(() => window.__yz.vm.cur);
  // 웨이브 1을 바로 끝낸다
  await ev(() => { const y = window.__yz; y.game.between = 0.05; });
  await page.waitForFunction(() => window.__yz.game.wave === 1, null, { timeout: 20000 });
  await ev(() => { const y = window.__yz; y.game.toSpawn = 0; y.enemies.forEach((e) => { if (!e.dead) e.damage(9999, 1, { x: 0, y: 0, z: -1 }, 3); }); });
  await page.waitForFunction(() => window.__yz.game.state === 'supply', null, { timeout: 40000 });
  out.offer = await ev(() => window.__yz.prog.offer.map((s) => s.id));
  out.cards = await ev(() => [0, 1, 2].map((i) => { const b = document.getElementById('sup' + i), r = b.getBoundingClientRect(); return { t: b.querySelector('.st').textContent, l: b.querySelector('.sl').textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
  out.touchHidden = await ev(() => document.getElementById('touch').classList.contains('hidden'));
  await page.screenshot({ path: `test/supply-${name}.png` });
  const t0 = await ev(() => window.__yz.game.time);
  await page.waitForTimeout(800);
  out.frozen = (await ev(() => window.__yz.game.time)) === t0;
  await page.tap('#sup0');
  await page.waitForTimeout(1500);
  out.afterPick = await ev(() => { const y = window.__yz; return { state: y.game.state, owned: { ...y.prog.owned }, cur: y.vm.cur, picks: y.prog.picks, between: +y.game.between.toFixed(1) }; });
  // 강화 효과
  out.perks = await ev(() => {
    const y = window.__yz, r = {};
    y.applySupply('mag'); r.mag = [y.W.ar.mag, y.W.shotgun.mag, y.W.dmr.mag, y.W.pistol.mag];
    y.applySupply('medkit'); r.maxHp = y.prog.maxHp; r.hp = y.player.hp;
    y.applySupply('armor'); const h0 = y.player.hp; y.hurtPlayer(20, { x: 0, z: 0 }); r.armorDmg = +(h0 - y.player.hp).toFixed(2);
    y.applySupply('gren'); r.gren = y.gren.n;
    y.applySupply('hands'); y.W.ar.ammo = 5; y.vm.cur === 'ar' || 0; r.hands = y.prog.lv.hands;
    y.applySupply('ap'); r.ap = y.prog.lv.ap;
    y.applySupply('ammo'); r.reserve = [y.W.ar.reserve, y.W.ar.cap];
    return r;
  });
  console.log(name, JSON.stringify(out));
  await ctx.close();
}
await run('land', 844, 390);
if (process.argv[2] !== 'quick') await run('port', 390, 844);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

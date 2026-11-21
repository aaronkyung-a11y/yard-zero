// v0.11.1 난이도 조정: 적·포격·폭발에서 받는 피해에 0.92를 곱하는가, 사람끼리 하는 대결에는 곱하지 않는가, 지휘관의 체력
// 사용: node test/ease.mjs [파일, 기본 dist/index.html]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 360 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('yz.quality', '"low"'); } catch (e) { /* 무시 */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve(process.argv[2] || 'dist/index.html')).href, { timeout: 120000 });
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
let ok = true;
const check = (name, cond, info) => { if (!cond) { ok = false; console.log('FAIL', name, JSON.stringify(info)); } };
await page.evaluate(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(400);
const out = await page.evaluate(() => {
  const y = window.__yz, p = y.player, r = { ease: y.EASE, ver: document.getElementById('verTxt').textContent };
  y.game.between = 9999; y.step(5, 1 / 60);
  const hit = (dmg, armor) => { y.prog.maxHp = 100; p.hp = 100; p.alive = true; y.prog.lv.armor = armor; y.hurtPlayer(dmg, { x: 0, z: 0 }); return +(100 - p.hp).toFixed(3); };
  const a0 = y.prog.lv.armor;
  r.solo = [hit(10, 0), hit(50, 0), hit(10, 1), hit(10, 2)];
  // 협동·임무·대결: 방식 표시만 바꿔서 같은 함수를 부른다(진짜 연결은 pvp·tdm·coop 시험이 한다)
  const on0 = y.coop.on, mode0 = y.coop.cfg.mode;
  r.modes = {};
  for (const m of ['surv', 'mis', 'pvp', 'tdm']) { y.coop.on = true; y.coop.cfg.mode = m; r.modes[m] = hit(10, 0); }
  y.coop.on = on0; y.coop.cfg.mode = mode0; y.prog.lv.armor = a0; p.hp = 100;
  // 지휘관의 체력(혼자)
  const s = (k) => { const e = y.spawnEnemy(p.pos.x + 30, p.pos.z + (k === 'jugg' ? 0 : 6), k); const h = e.hpMax; e.remove(); y.enemies.splice(y.enemies.indexOf(e), 1); return h; };
  r.boss = { jugg: s('jugg'), bomb: s('bomb') };
  // 포격의 한가운데(피해 60) → 55.2. 도화선은 0.3초보다 짧게 줄 수 없다
  y.barrageClear(); p.hp = 100; y.barrageApply({ y: p.pos.y, r: 3.4, d: 60, p: [[p.pos.x, p.pos.z, 0.3]] }); y.step(30, 1 / 60); r.shell = +(100 - p.hp).toFixed(2); p.hp = 100;
  return r;
});
check('곱하는 값 0.92', out.ease === 0.92, out.ease);
check('혼자: 10 → 9.2, 50 → 46, 방탄복 1단계 7.82, 2단계 6.44', JSON.stringify(out.solo) === '[9.2,46,7.82,6.44]', out.solo);
check('협동 생존·임무에는 곱하고 대결(개인전·팀전)에는 곱하지 않는다', out.modes.surv === 9.2 && out.modes.mis === 9.2 && out.modes.pvp === 10 && out.modes.tdm === 10, out.modes);
check('지휘관 체력: 철갑 3350, 화약고 2600', out.boss.jugg === 3350 && out.boss.bomb === 2600, out.boss);
check('포격 한가운데: 60 × 0.92 = 55.2', Math.abs(out.shell - 55.2) < 0.15, out.shell);
console.log(JSON.stringify(out));
console.log(ok ? 'PASS' : 'FAIL');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();

// 2층에 선 플레이어를 적이 보고 쏘는지, 창 밖/난간 너머로 탄이 통하는지
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 230 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; });
await ev(() => document.getElementById('btnStart').click());
await page.waitForTimeout(500);
const trial = (label, px, py, pz, spawns, sec) => ev(([label, px, py, pz, spawns, sec]) => new Promise((res) => {
  const y = window.__yz;
  y.game.between = 9999; y.game.toSpawn = 0; y.enemies.forEach((e) => e.remove()); y.enemies.length = 0;
  y.player.pos.set(px, py, pz); y.player.vel.set(0, 0, 0); y.player.hp = 100000; y.prog.maxHp = 100000;
  for (const [x, z, t] of spawns) { y.spawnEnemy(x, z, t); const e = y.enemies[y.enemies.length - 1]; e.pos.x = x; e.pos.z = z; }
  const t0 = y.game.time; let seen = 0, frames = 0, maxSee = 0, fires = 0; const st = {};
  for (const e of y.enemies) { const f0 = e.fire.bind(e); e.fire = () => { fires++; f0(); }; }
  const f = () => {
    y.player.pos.set(px, py, pz); frames++;
    const c = y.enemies.filter((e) => !e.dead && e.canSee).length; if (c) seen++; maxSee = Math.max(maxSee, c);
    for (const e of y.enemies) { const k = e.state + (e.fleeT > 0 ? '+flee' : '') + (e.reload > 0 ? '+reload' : ''); st[k] = (st[k] || 0) + 1; }
    if (y.game.time - t0 >= sec) res({ label, fires, st, dmg: Math.round(100000 - y.player.hp), seenFrames: seen, frames, maxSee, pos: y.enemies.map((e) => [Math.round(e.pos.x), Math.round(e.pos.z)]) });
    else requestAnimationFrame(f);
  };
  f();
}), [label, px, py, pz, spawns, sec]);
console.log(JSON.stringify(await trial('window-yard', 43.2, 3.5, -3, [[24, -3, 'rifle'], [20, 4, 'rifle']], 9)));
console.log(JSON.stringify(await trial('deck-inside', 46.5, 3.5, 0, [[57, 0, 'rifle'], [61, -11, 'rifle']], 9)));
// 플레이어 사격: 창 밖과 난간 너머
const shots = await ev(() => {
  const y = window.__yz, r = {};
  const ray = (ox, oy, oz, tx, ty, tz) => { const dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz); return !y.rayWorld || true; };
  return r;
});
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

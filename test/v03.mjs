// v0.3 확인: 래그돌, 수류탄, 적 종류, 저격수 조준선
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const gwait = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
await ev(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(500);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; y.VM.rig.visible = false; document.getElementById('touch').style.display = 'none'; document.getElementById('hud').style.display = 'none'; });
const EX = -0.5, EZ = 17.5;
const cam = (ox, oz, ty = 1.0) => ev(([ox, oz, ty, EX, EZ]) => { const y = window.__yz; y.player.pos.set(EX + ox, 0, EZ + oz); y.player.vel.set(0, 0, 0); y.player.yaw = Math.atan2(ox, oz); y.player.pitch = Math.atan2(ty - 1.62, Math.hypot(ox, oz)); }, [ox, oz, ty, EX, EZ]);
const snap = (n) => page.screenshot({ path: `test/v-${n}.png` });
const frozen = (x, z, type) => ev(([x, z, type]) => { const y = window.__yz; const e = y.spawnEnemy(x, z, type); e.state = 'combat'; e.react = 1e9; e.tactic = 1e9; e.seeT = 1e9; e.canSee = false; e.unseenFor = -1e9; e.kneel = false; e.lastKnown.set(x, 0, z + 20); e.aimYaw = e.bodyYaw = 0; return y.enemies.length - 1; }, [x, z, type]);
const clear = () => ev(() => { const y = window.__yz; y.enemies.forEach((e) => e.remove()); y.enemies.length = 0; });
const out = {};

if (process.argv[2] !== 'late') {
// 1) 적 종류 나란히 (소총병·돌격병·중장병·저격수)
await frozen(EX - 1.8, EZ, 'rifle'); await frozen(EX - 0.6, EZ, 'rusher'); await frozen(EX + 0.6, EZ, 'heavy'); await frozen(EX + 1.8, EZ, 'sniper');
await cam(0, 4.2, 1.0); await gwait(1.0); await snap('types');
out.types = await ev(() => window.__yz.enemies.map((e) => ({ k: e.T.key, hp: e.hp, body: e.body.gun ? 'mocap' : 'puppet', laser: !!e.laser })));
await clear();

// 2) 래그돌: 정면에서 피격
await frozen(EX, EZ, 'rifle');
await cam(1.2, 3.4, 0.7); await gwait(0.6);
await ev(() => { window.__yz.enemies[0].damage(500, 1, { x: 0, y: 0, z: -1 }, 3.2); });
await gwait(0.22); await snap('rag-1');
await gwait(0.4); await snap('rag-2');
await gwait(1.6); await snap('rag-3');
out.rag = await ev(() => { const R = window.__yz.enemies[0].body.rag, p = Array.from(R.p); let minY = 9, maxY = -9, nan = false, v = 0; for (let i = 0; i < 15; i++) { minY = Math.min(minY, p[i * 3 + 1]); maxY = Math.max(maxY, p[i * 3 + 1]); for (let c = 0; c < 3; c++) { if (!isFinite(p[i * 3 + c])) nan = true; v = Math.max(v, Math.abs(R.p[i * 3 + c] - R.q[i * 3 + c]) * 90); } } return { minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), nan, maxSpeed: +v.toFixed(2), t: +R.t.toFixed(1) }; });
await clear();

}
// 3) 수류탄: 세 명 한가운데로
await frozen(EX - 1.2, EZ - 6, 'rifle'); await frozen(EX + 1.0, EZ - 6.5, 'rusher'); await frozen(EX + 0.2, EZ - 8, 'rifle');
await ev(() => { const y = window.__yz; y.enemies.forEach((e) => { e.canSee = true; e.seeT = 1e9; }); });
await cam(0.3, 4.5, 1.0); await gwait(0.3);
await ev(() => { const y = window.__yz; y.player.pitch = -0.12; y.throwGrenade(); });
await gwait(1.3);
out.flee = await ev(() => ({ gren: window.__yz.gren.list.length, n: window.__yz.gren.n, fleeing: window.__yz.enemies.filter((e) => e.fleeT > 0).length, g: window.__yz.gren.list[0] ? { x: +window.__yz.gren.list[0].p.x.toFixed(1), y: +window.__yz.gren.list[0].p.y.toFixed(2), z: +window.__yz.gren.list[0].p.z.toFixed(1), fuse: +window.__yz.gren.list[0].fuse.toFixed(2) } : null }));
await ev(() => new Promise((res) => { const y = window.__yz; const f = () => (y.gren.list.length === 0 ? res() : requestAnimationFrame(f)); f(); }));
await gwait(0.06); await snap('boom-1');
await gwait(0.5); await snap('boom-2');
await gwait(1.6); await snap('boom-3');
out.boom = await ev(() => ({ kills: window.__yz.game.kills, enemies: window.__yz.enemies.map((e) => ({ dead: e.dead, hp: Math.round(e.hp) })) }));
await clear();

// 4) 저격수 조준선
await ev(([EX, EZ]) => { const y = window.__yz; const e = y.spawnEnemy(EX - 3, EZ - 14, 'sniper'); e.state = 'combat'; e.react = 0; e.tactic = 1e9; e.seeT = 1e9; e.canSee = true; e.cool = 0; }, [EX, EZ]);
await cam(0.6, 3, 1.4); await ev(([EX, EZ]) => { const y = window.__yz; y.player.yaw = Math.atan2(-(EX - 3 - y.player.pos.x), -(EZ - 14 - y.player.pos.z)); y.player.pitch = 0; }, [EX, EZ]);
const hp0 = await ev(() => window.__yz.player.hp);
await gwait(1.0); await snap('sniper');
await ev(() => new Promise((res) => { const y = window.__yz, e = y.enemies[0], t0 = y.game.time; const f = () => (e.cool > 0 || y.game.time - t0 > 4 ? res() : requestAnimationFrame(f)); f(); }));
out.sniper = await ev((hp0) => { const e = window.__yz.enemies[0]; return { fired: e.cool > 0, crouch: +e.crouch.toFixed(2), dmgTaken: Math.round(hp0 - window.__yz.player.hp) }; }, hp0);
// 옆으로 계속 움직이면 빗나가는지
await ev(() => { const y = window.__yz, e = y.enemies[0]; e.cool = 0; e.aimT = 0; y.input.keys.KeyD = true; });
const hp1 = await ev(() => window.__yz.player.hp);
await ev(() => new Promise((res) => { const y = window.__yz, e = y.enemies[0], t0 = y.game.time; const f = () => ((e.cool > 0 && y.game.time - t0 > 0.5) || y.game.time - t0 > 5 ? res() : requestAnimationFrame(f)); f(); }));
out.sniperDodge = await ev((hp1) => { const y = window.__yz; y.input.keys.KeyD = false; return { fired: y.enemies[0].cool > 0, dmgTaken: Math.round(hp1 - y.player.hp) }; }, hp1);
console.log(JSON.stringify(out));
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();

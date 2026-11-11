// 모캡 병사 시각 확인: 달리기 / 조준 / 앉아 쏴 / 뒷걸음 / 쓰러짐
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 760, height: 420 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz, null, { timeout: 60000 });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const gwait = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
await page.waitForFunction(() => window.__yz.MOCAP.ready || window.__yz.MOCAP.failed, null, { timeout: 30000 });
console.log('mocap', JSON.stringify(await ev(() => { const m = window.__yz.MOCAP; return { ready: m.ready, failed: m.failed, walk: +m.walkSpeed.toFixed(2), run: +m.runSpeed.toFixed(2), flip: m.flip }; })));
await ev(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await wait(600);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.VM.rig.visible = false; document.getElementById('hud').style.display = 'none'; document.getElementById('touch').style.display = 'none'; y.player.hp = 1e9; });
const look = (px, pz, tx, tz, ty = 1.0) => ev(([px, pz, tx, tz, ty]) => { const y = window.__yz; y.player.pos.set(px, 0, pz); y.player.vel.set(0, 0, 0); const dx = tx - px, dz = tz - pz; y.player.yaw = Math.atan2(-dx, -dz); y.player.pitch = Math.atan2(ty - 1.62, Math.hypot(dx, dz)); }, [px, pz, tx, tz, ty]);
const snap = (n) => page.screenshot({ path: `test/m-${n}.png` });
const kind = await ev(() => { const y = window.__yz; const e = y.spawnEnemy(-6, 10); return e.body.constructor.name; });
console.log('body', kind);
await ev(() => { const y = window.__yz; y.enemies.forEach((e) => e.body.dispose(y.scene)); y.enemies.length = 0; });

// A) 조준 자세 정면 3.2m
await ev(() => { const y = window.__yz; const e = y.spawnEnemy(-6, 10); e.state = 'combat'; e.react = 1e9; e.tactic = 1e9; e.seeT = 1e9; e.canSee = true; e.kneel = false; window.eA = e; });
await look(-6, 13.4, -6, 10, 1.1); await gwait(1.2); await snap('aim-front');
await look(-3.2, 10.6, -6, 10, 1.1); await ev(() => { window.eA.lastKnown.set(-6, 0, 14); }); await gwait(0.4); await snap('aim-side');
// B) 앉아 쏴
await ev(() => { window.eA.kneel = true; });
await look(-3.4, 12.2, -6, 10, 0.9); await ev(() => { window.eA.lastKnown.set(-6, 0, 14); }); await gwait(1.0); await snap('kneel');
// C) 달리기 (측면): 서쪽→동쪽으로 달리는 적
await ev(() => { const y = window.__yz; window.eA.body.dispose(y.scene); y.enemies.length = 0; const e = y.spawnEnemy(-12, 8.2); e.seeT = 1e9; e.canSee = false; e.repath = 1e9; e.path = [{ x: -12, z: 8.2 }, { x: 2, z: 8.2 }]; e.pi = 1; window.eB = e; });
await look(-7.5, 12.2, -8.5, 8.2, 1.0);
await gwait(0.75); await ev(() => { const y = window.__yz, e = window.eB; y.player.yaw = Math.atan2(-(e.pos.x - y.player.pos.x), -(e.pos.z - y.player.pos.z)); }); await gwait(0.05); await snap('run-1');
await gwait(0.2); await ev(() => { const y = window.__yz, e = window.eB; y.player.yaw = Math.atan2(-(e.pos.x - y.player.pos.x), -(e.pos.z - y.player.pos.z)); }); await gwait(0.05); await snap('run-2');
console.log('run state', JSON.stringify(await ev(() => { const e = window.eB; return { speed: +e.speed.toFixed(2), loco: e.body.loco, x: +e.pos.x.toFixed(1) }; })));
// D) 교전 중 측면 이동(상체는 표적, 하체는 진행 방향)
await ev(() => { const y = window.__yz; window.eB.body.dispose(y.scene); y.enemies.length = 0; const e = y.spawnEnemy(-12, 8.2); e.state = 'combat'; e.react = 1e9; e.tactic = 1e9; e.seeT = 1e9; e.canSee = true; e.kneel = false; e.path = [{ x: -12, z: 8.2 }, { x: 2, z: 8.2 }]; e.pi = 1; window.eC = e; });
await look(-7.5, 13.2, -8.5, 8.2, 1.0);
await gwait(1.3); await ev(() => { const y = window.__yz, e = window.eC; y.player.yaw = Math.atan2(-(e.pos.x - y.player.pos.x), -(e.pos.z - y.player.pos.z)); }); await gwait(0.05); await snap('strafe');
console.log('strafe state', JSON.stringify(await ev(() => { const e = window.eC; return { speed: +e.speed.toFixed(2), loco: e.body.loco, back: e.back, twist: +(e.aimYaw - e.bodyYaw).toFixed(2) }; })));
// E) 쓰러짐
await ev(() => { const y = window.__yz, e = window.eC; e.path = null; });
await gwait(0.6);
await ev(() => { const y = window.__yz, e = window.eC; y.player.pos.set(e.pos.x + 0.5, 0, e.pos.z + 3.6); y.player.yaw = Math.atan2(0.5, 3.6); y.player.pitch = -0.28; e.damage(500, 1, { x: 0, y: 0, z: -1 }); });
await gwait(0.22); await snap('die-1');
await gwait(0.3); await snap('die-2');
await gwait(1.2); await snap('die-3');
console.log(errors.length ? 'CONSOLE:\n' + [...new Set(errors)].slice(0, 20).join('\n') : 'no console errors');
await browser.close();

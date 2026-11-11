// 근접 자세 확인(햇빛 아래): 조준 3/4·측면, 앉아 쏴 측면, 이동 자세, 쓰러짐
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 560, height: 520 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const gwait = (sec) => ev((s) => new Promise((res) => { const y = window.__yz, t0 = y.game.time; const f = () => (y.game.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
await ev(() => { const y = window.__yz; y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(500);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.VM.rig.visible = false; document.getElementById('hud').style.display = 'none'; document.getElementById('touch').style.display = 'none'; y.player.hp = 1e9; });
const EX = -0.5, EZ = 17.5;
const cam = (ox, oz, ty = 1.0) => ev(([ox, oz, ty, EX, EZ]) => { const y = window.__yz; y.player.pos.set(EX + ox, 0, EZ + oz); y.player.vel.set(0, 0, 0); y.player.yaw = Math.atan2(ox, oz); y.player.pitch = Math.atan2(ty - 1.62, Math.hypot(ox, oz)); }, [ox, oz, ty, EX, EZ]);
const snap = (n) => page.screenshot({ path: `test/p-${n}.png` });
const info = () => ev(() => { const y = window.__yz, e = window.eA, b = e.body.b, P = (o) => { const v = o.getWorldPosition(new y.camera.position.constructor()); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; }; const foot = e.body.obj.getObjectByName('mixamorigLeftFoot'), rh = e.body.obj.getObjectByName('mixamorigRightHand'), lh = e.body.obj.getObjectByName('mixamorigLeftHand'), head = e.body.obj.getObjectByName('mixamorigHead'); return { crouch: +e.crouch.toFixed(2), aim: +e.aim.toFixed(2), foot: P(foot), hips: P(b.hips), spine2: P(b.spine2), head: P(head), rArm: P(b.rArm), lArm: P(b.lArm), rHand: P(rh), lHand: P(lh), gun: P(e.body.gun), epos: [e.pos.x, e.pos.z] }; });
// 적: 남쪽(+z)을 조준
await ev(([EX, EZ]) => { const y = window.__yz; const e = y.spawnEnemy(EX, EZ); e.state = 'combat'; e.react = 1e9; e.tactic = 1e9; e.seeT = 1e9; e.canSee = false; e.unseenFor = -1e9; e.kneel = false; e.lastKnown.set(EX, 0, EZ + 20); e.aimYaw = e.bodyYaw = 0; window.eA = e; }, [EX, EZ]);
await cam(1.6, 2.2, 1.05); await gwait(1.0); await snap('aim-34');
console.log('aim', JSON.stringify(await info()));
await cam(2.6, 0.2, 1.05); await gwait(0.2); await snap('aim-side');
// 앉기
await ev(() => { const e = window.eA; e.kneel = true; e.canSee = true; });
await ev(() => { const y = window.__yz; y.player.pos.set(-0.5, 0, 37); }); // 표적 높이용: 멀리
await gwait(0.9);
await cam(2.6, 0.2, 0.8); await ev(() => { window.eA.canSee = true; }); await gwait(0.15); await snap('kneel-side');
console.log('kneel', JSON.stringify(await info()));
await cam(1.9, 2.1, 0.8); await gwait(0.1); await snap('kneel-34');
// 쓰러짐 (뒤에서 맞음 → 앞으로)
await cam(2.4, 2.6, 0.5);
await ev(() => { window.eA.damage(500, 1, { x: 0, y: 0, z: 1 }); });
await gwait(0.25); await snap('die-a');
await gwait(0.35); await snap('die-b');
await gwait(1.5); await snap('die-c');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

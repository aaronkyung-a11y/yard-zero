// 옮겨 붙인 클립 점검: 클립별로 4개 시점을 한 장에 이어 붙인다 + 수치 출력
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import sharp from '/opt/npm-tools/node_modules/sharp/dist/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 330 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (m.type() === 'warning' && /extra clips|mocap/.test(m.text())) errors.push('[warn] ' + m.text()); });
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => { const y = window.__yz; y.opt.quality = 'medium'; y.applyQuality(); y.dbg.noDyn = true; });
await ev(() => document.getElementById('btnStart').click());
await page.waitForTimeout(1500);
console.log(JSON.stringify(await ev(() => ({ extra: window.__yz.MOCAP.extra, err: window.__yz.MOCAP.extraErr, clips: Object.keys(window.__yz.MOCAP.clips), deathYaw: window.__yz.MOCAP.deathYaw, deathReach: window.__yz.MOCAP.deathReach, samples: window.__yz.SFX.sampleState }))));
await ev(() => {
  const y = window.__yz; y.game.between = 9999; y.player.hp = 1e9; y.game.state = 'paused';
  document.querySelectorAll('.overlay,#hud,#touch').forEach((o) => (o.style.display = 'none'));
});
const run = async (name, yaw, setup, times, cam = [3.4, 1.25, 23.6]) => {
  const tiles = [];
  await ev(([yaw, setup]) => {
    const y = window.__yz;
    y.enemies.forEach((e) => e.remove()); y.enemies.length = 0;
    y.spawnEnemy(0, 21.5, 'rifle');
    const e = y.enemies[y.enemies.length - 1];
    e.pos.x = 0; e.pos.z = 21.5; e.bodyYaw = yaw; e.aimYaw = yaw; e.aim = setup.aim ?? 1; e.speed = 0; e.crouch = 0; e.flinch = 0; e.aimPitch = 0; e.vx = 0; e.vz = 0;
    for (let i = 0; i < 30; i++) e.body.animate(e, 1 / 60);
    if (setup.over) e.body.playOver(setup.over, setup.opt || {});
    if (setup.die) { e.dead = true; e.deadT = 0; e.body.die(e, y.scene, { dir: { x: 0, y: 0, z: -1 }, power: 3, part: 1, clip: true }); }
    window.__e = e; window.__t = 0; window.__setup = setup;
  }, [yaw, setup]);
  for (const t of times) {
    await ev(([t, cam]) => {
      const y = window.__yz, e = window.__e, s = window.__setup;
      while (window.__t < t - 1e-6) { const dt = 1 / 60; window.__t += dt; if (s.die) { e.deadT += dt; e.body.animateDead(e, dt); } else e.body.animate(e, dt); }
      y.camera.position.set(cam[0], cam[1], cam[2]); y.camera.lookAt(0, 0.95, 21.5); y.camera.fov = 44; y.camera.updateProjectionMatrix();
      y.renderer.render(y.scene, y.camera);
    }, [t, cam]);
    tiles.push(await page.screenshot({ clip: { x: 60, y: 30, width: 240, height: 270 } }));
  }
  await sharp({ create: { width: 240 * tiles.length, height: 270, channels: 3, background: '#000' } }).composite(tiles.map((b, i) => ({ input: b, left: 240 * i, top: 0 }))).png().toFile(`test/anim-${name}.png`);
};
const which = (process.argv[2] || 'hit,head,knock,roll,death').split(',');
const side = Math.PI / 2; // 카메라 기준 옆모습
if (which.includes('hit')) await run('hit', 0.9, { over: 'HitChest' }, [0.02, 0.1, 0.2, 0.3]);
if (which.includes('head')) await run('head', 0.9, { over: 'HitHead' }, [0.05, 0.15, 0.28, 0.4]);
if (which.includes('knock')) await run('knock', 0.9, { over: 'Knockback', opt: { full: true } }, [0.1, 0.3, 0.5, 0.75]);
if (which.includes('roll')) await run('roll', side, { over: 'Roll', opt: { full: true }, aim: 0 }, [0.2, 0.5, 0.8, 1.1, 1.35]);
if (which.includes('death')) await run('death', 0.9, { die: true }, [0.2, 0.6, 1.0, 1.5, 2.2], [4.2, 1.6, 24.4]);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// v0.11 그래픽 확인용 캡처와 점검: 총 4종(지향·정조준·옆·위), 밤의 전등과 가로등, 폭발, 빛 번짐 켬/끔, 해 눈부심, 품질별 등의 수
// 사용: node test/gfx.mjs [guns|light|all]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const what = process.argv[2] || 'all';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 700, height: 360 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|GPU stall|ReadPixels/.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
const ev = (fn, arg) => page.evaluate(fn, arg);
const out = {}, fails = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' → ' + JSON.stringify(info) : '')); };
const snap = async (name) => { await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300); await page.screenshot({ path: `test/${name}.png` }); console.log('shot', name); };
await ev(() => { const y = window.__yz; y.opt.quality = 'high'; y.applyQuality(); y.dbg.noDyn = true; y.opt.autoFire = false; document.getElementById('btnStart').click(); });
await page.waitForTimeout(400);
await ev(() => { const y = window.__yz; y.game.between = 9999; y.prog.maxHp = 1e9; y.player.hp = 1e9; y.player.pos.set(-0.5, 0, 19.5); y.player.yaw = 0.5; y.player.pitch = 0.03; document.getElementById('touch').style.display = 'none'; for (const k of y.ORDER) y.prog.owned[k] = true; y.step(30, 1 / 60); document.getElementById('msg').style.display = 'none'; });

if (what === 'guns' || what === 'all') {
  for (const k of ['ar', 'shotgun', 'dmr', 'pistol']) {
    await ev((k) => { const y = window.__yz; y.dbg.freeze = false; y.input.ads = false; if (y.vm.cur !== k) y.switchWeapon(k); y.step(70, 1 / 60); y.dbg.freeze = true; }, k);
    await snap(`g-${k}-hip`);
    if (k !== 'dmr') { await ev(() => { const y = window.__yz; y.input.ads = true; y.step(40, 1 / 60); }); await snap(`g-${k}-ads`); await ev(() => { window.__yz.input.ads = false; window.__yz.step(40, 1 / 60); }); }
    // 살펴보기: 왼쪽 옆, 오른쪽 옆, 위
    for (const [tag, rot, pos] of [['left', [0, Math.PI / 2, 0], [-0.14, 0.03, -0.5]], ['right', [0, -Math.PI / 2, 0], [0.14, 0.03, -0.5]], ['top', [Math.PI / 2, 0, Math.PI / 2], [-0.14, 0.0, -0.5]]]) {
      await ev(([rot, pos]) => { const r = window.__yz.VM.rig; r.rotation.set(rot[0], rot[1], rot[2]); r.position.set(pos[0], pos[1], pos[2]); r.visible = true; }, [rot, pos]);
      await snap(`g-${k}-${tag}`);
    }
  }
  // 내 총구 화염(낮): 소총과 산탄총
  for (const k of ['ar', 'shotgun']) {
    out['flash_' + k] = await ev((k) => { const y = window.__yz, r = y.VM.rig; y.dbg.freeze = false; r.rotation.set(0, 0, 0); y.input.ads = false; y.switchWeapon(k); y.step(70, 1 / 60); y.W[k].ammo = 5; y.input.fire = true; y.vm.fireBuf = 0.18; let n = 0; while (n < 40 && !y.VM[k].flash.visible) { y.step(1, 1 / 60); n++; } y.input.fire = false; y.dbg.freeze = true; return n; }, k);
    await snap(`g-${k}-fire`);
  }
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.step(60, 1 / 60); });
  // 재장전: 장전 손잡이가 움직이는가, 빈 권총의 슬라이드가 뒤에 멈춰 있는가
  out.anim = await ev(() => {
    const y = window.__yz, r = {};
    y.dbg.freeze = false; y.switchWeapon('ar'); y.step(60, 1 / 60);
    y.W.ar.ammo = 5; y.startReload();
    let maxZ = 0, magMin = 0;
    for (let i = 0; i < 200 && y.vm.reloadT > 0; i++) { y.step(1, 1 / 60); maxZ = Math.max(maxZ, y.VM.ar.charge.position.z); magMin = Math.min(magMin, y.VM.ar.mag.position.y); }
    r.charge = +maxZ.toFixed(3); r.mag = +magMin.toFixed(2); r.chargeAfter = y.VM.ar.charge.position.z; r.ammo = y.W.ar.ammo;
    y.switchWeapon('pistol'); y.step(60, 1 / 60);
    y.W.pistol.ammo = 1; y.step(2, 1 / 60); r.slideLoaded = +y.VM.pistol.slide.position.z.toFixed(3);
    y.W.pistol.ammo = 0; y.vm.reloadT = 0; y.step(1, 1 / 60); r.slideEmpty = +y.VM.pistol.slide.position.z.toFixed(3);
    y.W.pistol.ammo = 15; y.step(20, 1 / 60); r.slideBack = +y.VM.pistol.slide.position.z.toFixed(3);
    y.switchWeapon('ar'); y.step(60, 1 / 60);
    return r;
  });
  check('재장전 끝에 장전 손잡이를 당겼다 놓는다, 탄창이 빠졌다 들어온다', out.anim.charge > 0.025 && out.anim.chargeAfter === 0 && out.anim.mag < -0.15 && out.anim.ammo === 30, out.anim);
  check('다 쏜 권총은 슬라이드가 뒤에 멈춘다', out.anim.slideLoaded === 0 && out.anim.slideEmpty === 0.028 && out.anim.slideBack === 0, out.anim);
}

if (what === 'light' || what === 'all') {
  // 화면에서 쓰는 도우미: 가장 멀리 트인 쪽, 앞쪽의 트인 자리, 가까운 야외등을 바라보는 자리
  await ev(() => {
    const y = window.__yz;
    const free = (x, z, yaw, h = 1.5) => { const dx = -Math.sin(yaw), dz = -Math.cos(yaw); return y.rayWorld(x, h, z, dx, 0, dz, 60, false) ? y.hit.t : 60; };
    window.__g = {
      free,
      open(x, z) { let best = 0, by = 0; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, d = Math.min(free(x, z, a), free(x, z, a + 0.12), free(x, z, a - 0.12)); if (d > best) { best = d; by = a; } } return { yaw: by, d: best }; },
      ahead(dist) { const p = y.player, dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw); for (let d = dist; d > 3; d -= 0.5) { const x = p.pos.x + dx * d, z = p.pos.z + dz * d; if (!y.blockedAt(x, z) && y.losClear(p.pos.x, 1.6, p.pos.z, x, 1.0, z)) return { x, z, d }; } return { x: p.pos.x + dx * 3, z: p.pos.z + dz * 3, d: 3 }; },
      lampSpot(dist) {
        let best = null;
        for (const l of y.WORLD.lamps.filter((q) => q.night)) for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2, x = l.x + Math.sin(a) * dist, z = l.z + Math.cos(a) * dist;
          if (x < y.B.x0 + 2 || x > y.B.x1 - 2 || z < y.B.z0 + 2 || z > y.B.z1 - 2 || y.blockedAt(x, z)) continue;
          if (!y.losClear(x, 1.6, z, l.x, 1.0, l.z) || !y.losClear(x, 1.6, z, l.x, l.y - 0.6, l.z)) continue;
          const yaw = Math.atan2(-(l.x - x), -(l.z - z)), room = free(x, z, yaw + Math.PI);
          if (!best || room > best.room) best = { x, z, yaw, room, l };
        }
        return best;
      },
      hideHurt(on) { for (const id of ['vig', 'hurt', 'dmgDir', 'hitDir']) { const e = document.getElementById(id); if (e) e.style.visibility = on ? 'hidden' : ''; } for (const e of document.querySelectorAll('.dmgArc,.hitArc,#dirs,#hitInd')) e.style.visibility = on ? 'hidden' : ''; },
    };
  });
  // 품질별 등의 수와 빛 번짐
  out.qual = await ev(() => {
    const y = window.__yz, r = {};
    const count = () => { let p = 0, s = 0; y.scene.traverse((o) => { if (o.isPointLight) p++; else if (o.isSpotLight) s++; }); return [p, s, y.bloom.on]; };
    r.bump = {};
    for (const q of ['high', 'mid', 'low']) { y.opt.quality = q; y.applyQuality(); r[q] = count(); r.bump[q] = Object.values(y.VM.mats).filter((m) => m.bumpMap).length; r.bump[q + 'R'] = Object.values(y.VM.mats).filter((m) => m.roughnessMap).length; }
    y.loadMap('yard', 'night'); r.nightLow = count();
    y.opt.quality = 'high'; y.applyQuality(); r.nightHigh = count();
    y.loadMap('yard', 'day'); r.dayHigh = count();
    r.lamps = { yard: y.WORLD.lamps.length, night: y.WORLD.lamps.filter((l) => l.night).length };
    // 맵마다: 등의 수 [전체, 야외등], 낮·밤에 넣는 빛의 수
    r.maps = {};
    for (const id of Object.keys(y.MAPS)) { y.loadMap(id, 'day'); const d = count()[0]; y.loadMap(id, 'night'); r.maps[id] = [y.WORLD.lamps.length, y.WORLD.lamps.filter((l) => l.night).length, d, count()[0]]; }
    y.loadMap('yard', 'day');
    return r;
  });
  check('빛의 수(낮): 높음 3(번쩍이는 빛 하나 + 실내등 둘) / 중간 1 / 낮음 1, 빛 번짐은 높음만', JSON.stringify(out.qual.high) === '[3,0,true]' && JSON.stringify(out.qual.mid) === '[1,0,false]' && JSON.stringify(out.qual.low) === '[1,0,false]', out.qual);
  check('빛의 수(밤): 높음 4(번쩍이는 빛 하나 + 가까운 등 셋), 전등은 품질과 상관없이 하나', JSON.stringify(out.qual.nightHigh) === '[4,1,true]' && JSON.stringify(out.qual.nightLow) === '[1,1,false]' && out.qual.dayHigh[1] === 0, out.qual);
  check('총의 요철 질감은 높음에서만, 윤기 질감은 중간부터', out.qual.bump.high > 0 && out.qual.bump.mid === 0 && out.qual.bump.low === 0 && out.qual.bump.highR > 0 && out.qual.bump.midR === out.qual.bump.highR && out.qual.bump.lowR === 0, out.qual.bump);
  // 낮: 해 쪽을 보면 눈부심, 등지면 없음
  out.glare = await ev(() => {
    const y = window.__yz, p = y.player, s = y.sunDir, r = {};
    y.dbg.freeze = false;
    p.pos.set(-0.5, 0, 19.5);
    const o = () => +document.getElementById('glare').style.opacity;
    p.yaw = Math.atan2(-s.x, -s.z); p.pitch = Math.asin(s.y); y.step(90, 1 / 60); r.toward = o(); r.shade = y.vm.shadeTarget;
    p.yaw += Math.PI; p.pitch = 0; y.step(90, 1 / 60); r.away = o();
    y.dbg.freeze = true;
    return r;
  });
  await ev(() => { const y = window.__yz, p = y.player, s = y.sunDir; y.dbg.freeze = false; p.yaw = Math.atan2(-s.x, -s.z) + 0.18; p.pitch = Math.asin(s.y) - 0.12; y.step(90, 1 / 60); y.dbg.freeze = true; });
  await snap('gfx-day-sun-bloom');
  await ev(() => { window.__yz.bloom.on = false; });
  await snap('gfx-day-sun-nobloom');
  await ev(() => { document.getElementById('glare').style.visibility = 'hidden'; });
  await snap('gfx-day-sun-noglare');
  await ev(() => { document.getElementById('glare').style.visibility = ''; window.__yz.bloom.on = true; });
  check('해 눈부심: 해 쪽을 보면 켜지고(가려지지 않았을 때) 등지면 꺼진다', (out.glare.shade > 0.5 ? out.glare.toward > 0.3 : out.glare.toward === 0) && out.glare.away === 0, out.glare);
  // 비: 젖은 바닥과 벽(하늘빛이 비친다). 같은 자리에서 낮과 견준다
  await ev(() => { const y = window.__yz, p = y.player; y.dbg.freeze = false; p.pos.set(-0.5, 0, 19.5); const o = window.__g.open(p.pos.x, p.pos.z); p.yaw = o.yaw; p.pitch = -0.1; y.step(40, 1 / 60); y.dbg.freeze = true; });
  await snap('gfx-dry');
  out.wet = await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.loadMap('yard', 'overcast'); y.step(40, 1 / 60); y.dbg.freeze = true; const s = y.scene, r = {}; s.traverse((o) => { if (o.isMesh && o.material && o.material.map && o.material.roughness < 0.4 && !r.a) r.a = o.material.roughness; }); return r; });
  await snap('gfx-rain');
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.loadMap('yard', 'day'); y.step(20, 1 / 60); y.dbg.freeze = true; });
  // 폭발(낮): 트인 쪽 앞 10m
  out.boomDay = await ev(() => { const y = window.__yz, p = y.player; y.dbg.freeze = false; p.pos.set(-0.5, 0, 19.5); const o = window.__g.open(p.pos.x, p.pos.z); p.yaw = o.yaw; p.pitch = -0.06; y.step(30, 1 / 60); const c = window.__g.ahead(10); y.explode(c.x, 0.3, c.z, true); y.step(4, 1 / 60); y.dbg.freeze = true; return { open: +o.d.toFixed(1), at: +c.d.toFixed(1), fire: Math.round(y.flashLight.intensity) }; });
  await snap('gfx-day-boom');
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.step(26, 1 / 60); y.dbg.freeze = true; });
  await snap('gfx-day-boom-after');
  // 밤: 작전 4(야드, 밤)
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.quitToMenu(); y.startEpisode(3); y.prog.maxHp = 1e9; y.player.hp = 1e9; y.camp.next = null; for (const e of y.enemies) e.remove(); y.enemies.length = 0; document.getElementById('msg').style.display = 'none'; document.getElementById('radio').style.display = 'none'; y.step(60, 1 / 60); });
  out.night = await ev(() => {
    const y = window.__yz, r = {}, p = y.player;
    const o = window.__g.open(p.pos.x, p.pos.z); p.yaw = o.yaw; p.pitch = 0.0;
    y.step(60, 1 / 60);
    r.open = +o.d.toFixed(1);
    r.env = y.envOf(); r.torch = [!!y.torch.parent, y.torch.intensity]; r.lamps = y.lampL.map((s) => [!!s.lamp, +s.k.toFixed(2), Math.round(s.light.intensity)]);
    r.halo = y.scene.children.filter((o) => o.isPoints && o.material && o.material.size > 3).map((o) => [o.geometry.attributes.position.count, o.visible, +o.material.opacity.toFixed(2)]);
    y.dbg.freeze = true;
    return r;
  });
  check('밤: 전등이 켜지고 가까운 등이 진짜 빛으로 켜진다', out.night.env === 'night' && out.night.torch[0] && out.night.torch[1] > 0 && out.night.lamps.filter((q) => q[0] && q[2] > 0).length >= 1, out.night);
  await snap('gfx-night-bloom');
  await ev(() => { window.__yz.bloom.on = false; });
  await snap('gfx-night-nobloom');
  await ev(() => { const y = window.__yz; y.bloom.on = true; y.torch.intensity = 0; });
  await snap('gfx-night-notorch');
  await ev(() => { const y = window.__yz; y.torch.intensity = y.TORCH_I; });
  // 밤: 가까운 벽 앞(전등이 하얗게 타지 않는가)
  out.wall = await ev(() => { const y = window.__yz, p = y.player; y.dbg.freeze = false; let best = null; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, d = window.__g.free(p.pos.x, p.pos.z, a); if (d > 2.5 && d < 6 && (!best || d < best.d)) best = { a, d }; } if (best) { p.yaw = best.a; p.pitch = 0; } y.step(40, 1 / 60); y.dbg.freeze = true; return best && +best.d.toFixed(1); });
  await snap('gfx-night-wall');
  // 밤: 내 총구 화염이 벽을 비춘다
  out.flashNight = await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.W.ar.ammo = 5; y.input.fire = true; y.vm.fireBuf = 0.18; let n = 0; while (n < 40 && !y.VM.ar.flash.visible) { y.step(1, 1 / 60); n++; } y.input.fire = false; y.dbg.freeze = true; return { n, light: Math.round(y.VM.light.intensity * 10) / 10 }; });
  await snap('gfx-night-muzzle');
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.step(40, 1 / 60); y.dbg.freeze = true; });
  // 밤: 가로등 아래(높음·중간·낮음)
  out.lamp = await ev(() => { const y = window.__yz, p = y.player; y.dbg.freeze = false; const s = window.__g.lampSpot(13); if (!s) return null; p.pos.set(s.x, 0, s.z); p.yaw = s.yaw; p.pitch = 0.16; y.step(80, 1 / 60); y.dbg.freeze = true; return { room: +s.room.toFixed(1), y: s.l.y, lit: y.lampL.map((q) => Math.round(q.light.intensity)) }; });
  await snap('gfx-night-lamp-high');
  await ev(() => { const y = window.__yz; y.opt.quality = 'mid'; y.applyQuality(); });
  await snap('gfx-night-lamp-mid');
  await ev(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); });
  await snap('gfx-night-lamp-low');
  await ev(() => { const y = window.__yz; y.opt.quality = 'high'; y.applyQuality(); y.dbg.freeze = false; y.step(40, 1 / 60); y.dbg.freeze = true; });
  // 밤: 적 하나를 앞에 세워 쏘게 한다(총구 화염이 둘레를 비춘다). 맞은 표시는 가린다
  out.foe = await ev(() => {
    const y = window.__yz, p = y.player; y.dbg.freeze = false;
    const o = window.__g.open(p.pos.x, p.pos.z); p.yaw = o.yaw; p.pitch = 0; y.step(20, 1 / 60);
    const c = window.__g.ahead(13);
    window.__g.hideHurt(true);
    const e = y.spawnEnemy(c.x, c.z, 'rifle'); let n = 0; for (; n < 600 && e.flashT <= 0; n++) y.step(1, 1 / 60);
    y.dbg.freeze = true;
    return { d: +c.d.toFixed(1), steps: n, foe: +y.flashLight.intensity.toFixed(1) };
  });
  await snap('gfx-night-enemy-fire');
  out.boomNight = await ev(() => { const y = window.__yz, p = y.player; y.dbg.freeze = false; for (const e of y.enemies) e.remove(); y.enemies.length = 0; y.step(50, 1 / 60); const c = window.__g.ahead(11); y.explode(c.x, 0.3, c.z, true); y.step(4, 1 / 60); y.dbg.freeze = true; return { at: +c.d.toFixed(1), fire: Math.round(y.flashLight.intensity) }; });
  await snap('gfx-night-boom');
  await ev(() => { const y = window.__yz; y.dbg.freeze = false; y.step(26, 1 / 60); y.dbg.freeze = true; });
  await snap('gfx-night-boom-after');
  await ev(() => { window.__g.hideHurt(false); });
  out.bloom = await ev(() => ({ on: window.__yz.bloom.on, err: window.__yz.bloom.err }));
  check('빛 번짐이 오류 없이 돈다', out.bloom.on && !out.bloom.err, out.bloom);
  // 한 장면을 그리는 양(품질 높음, 밤)
  out.info = await ev(() => new Promise((res) => { const y = window.__yz, i = y.renderer.info; i.autoReset = false; i.reset(); requestAnimationFrame(() => requestAnimationFrame(() => { const r = { calls: i.render.calls, tris: i.render.triangles, frame: i.render.frame }; i.autoReset = true; res(r); })); }));
}
console.log(JSON.stringify(out));
console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS');
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no page errors');
await browser.close();

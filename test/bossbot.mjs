// v0.10 지휘관(보스) 난이도 가늠용 봇. 사람이 하는 것을 대신하지는 못한다: 반응이 즉각이고(0.15초), 자리 선정은 단순하다. "규칙대로 하면 깰 수 있는가"를 어림하는 용도.
//   node test/bossbot.mjs [ep5|wave5|wave10] [판 수]
// 봇의 규칙: 붉은 원 안이면 가장 가까운 바깥으로 뛴다 / 지휘관의 방탄이 풀렸을 때만(또는 옆·뒤에서) 지휘관을 쏜다 / 지휘관이 쏘는 동안에는 시야가 막힌 자리로 간다 /
//   숨은 동안 보이는 호위를 쏜다 / 체력이 70 아래면 가까운 의무 보급품을 주우러 간다 / 수류탄은 지휘관이 8~22m에 보일 때 던진다(명중 70%로 가정)
// 사격: 돌격소총 26 피해, 분당 680발, 명중 55%(25m 밖 35%), 머리 12%. 탄창 30발·장전 2.3초, 예비탄은 게임의 실제 값. 탄이 떨어지면 권총(32 피해, 분당 300발로 가정)
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const mode = process.argv[2] || 'ep5', N = +(process.argv[3] || 6);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 480, height: 230 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; y.dbg.freeze = true; y.opt.autoFire = false; });
const all = [];
for (let n = 0; n < N; n++) {
  const res = await page.evaluate((mode) => {
    const y = window.__yz, p = y.player, DT = 0.05, rnd = Math.random;
    if (y.game.state !== 'menu') y.quitToMenu();
    if (mode === 'ep5') { localStorage.removeItem('yz.camp'); y.startEpisode(4); }
    else if (mode === 'ep5b') { y.camp.on = false; y.startEpisode(4, 1); } // 2단계(화약고)만
    else { document.getElementById('btnStart').click(); y.game.wave = mode === 'wave10' ? 9 : mode === 'wave4' ? 3 : 4; y.game.between = 0.05; }
    const wave0 = y.game.wave + 1;
    if (mode === 'ep5b') y.squadJoin('han', null, true); // 재도전 때처럼 팀원과 함께
    const st = { t: 0, win: false, dead: false, dmg: { boss: 0, shell: 0, other: 0 }, by: {}, dist: [], heal: 0, bossT: [], shots: 0, gren: 0, minHp: 100, stage: 0, pistol: 0, modeT: {} };
    let path = null, pi = 0, goal = null, aim = 0, cool = 0, rl = 0, grenT = -1, grenAt = null, react = 0, lastBoss = null, bossStart = 0, hpPrev = p.hp, mode2 = '';
    const eyeLos = (ax, az, ah, bx, bz, bh) => y.losClear(ax, ah, az, bx, bh, bz);
    // 몸의 가장자리(어깨)까지 가려져야 숨은 것으로 친다: 가운데와 좌우 0.45m를 머리·허리 높이에서 본다
    const seenBy = (e, x, z) => { const h = (1.7 - e.crouch * 0.37) * (e.hs || 1), dx = x - e.pos.x, dz = z - e.pos.z, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * 0.45, nz = (dx / l) * 0.45; for (const k of [0, 1, -1]) if (eyeLos(e.pos.x, e.pos.z, h, x + nx * k, z + nz * k, 1.62) || eyeLos(e.pos.x, e.pos.z, h, x + nx * k, z + nz * k, 1.0)) return true; return false; };
    const inRing = (x, z) => y.barrage.list.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 0.3);
    const go = (c) => { if (!c) return; if (goal && Math.hypot(goal.x - c.x, goal.z - c.z) < 0.6 && path) return; goal = c; path = y.findPath(p.pos.x, p.pos.z, c.x, c.z); pi = path && path.length > 1 ? 1 : 0; };
    const move = (sp) => { if (!path || pi >= path.length) return false; const t = path[pi], tx = t.x - p.pos.x, tz = t.z - p.pos.z, td = Math.hypot(tx, tz), d = sp * DT; if (td < d) { p.pos.x = t.x; p.pos.z = t.z; pi++; } else { p.pos.x += (tx / td) * d; p.pos.z += (tz / td) * d; } p.vel.set((tx / (td || 1)) * sp, 0, (tz / (td || 1)) * sp); return true; };
    const cells = (r, n) => { const out = []; for (let k = 0; k < n; k++) { const c = y.cellNear(p.pos.x, p.pos.z, r); if (c) out.push(c); } return out; };
    for (let it = 0; it < (window.__botMax || 12000); it++) {
      if (y.game.state === 'supply') { const o = y.prog.offer || [], f = (...ids) => o.findIndex((q) => q && ids.includes(q.id)); let k = p.hp <= 80 ? f('heal', 'medkit') : -1; if (k < 0 && y.W.ar.reserve < 90) k = f('ammo'); if (k < 0) k = f('armor', 'ap', 'medkit'); y.pickSupply(Math.max(0, k)); }
      if (y.game.state === 'epdone') { st.win = true; break; }
      if (y.game.state === 'over' || y.game.state === 'dying') { st.dead = true; break; }
      if (y.game.state !== 'playing') break;
      const b = y.bossOf(), w = y.W.ar;
      if (b !== lastBoss) { if (lastBoss && lastBoss.dead) st.bossT.push(+(y.game.time - bossStart).toFixed(0)); if (b) bossStart = y.game.time; lastBoss = b; }
      if (mode !== 'ep5' && mode !== 'ep5b' && y.game.wave === wave0 && (st.bossT.length || mode === 'wave4') && y.enemies.every((e) => e.dead) && y.game.toSpawn === 0) { st.win = true; break; }
      const foes = y.enemies.filter((e) => !e.dead), x = p.pos.x, z = p.pos.z;
      let moving = false;
      // 1) 붉은 원
      if (inRing(x, z)) {
        let best = null, bd = 1e9;
        for (const c of cells(11, 40)) { if (inRing(c.x, c.z)) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
        go(best); moving = move(6.4); mode2 = 'flee'; aim = 0;
      } else {
        const danger = b && !b.boss.expose && (b.burst > 0 || b.canSee) && Math.hypot(b.pos.x - x, b.pos.z - z) < 60; // 지휘관이 쏘고 있거나 나를 보고 있다
        const sb = b ? seenBy(b, x, z) : false;
        const want = (q) => (q.type === 'med' ? p.hp < 70 : w.reserve < 90); // 체력이 70 아래면 의무 보급품, 예비탄이 90발 아래면 탄약
        const med = y.pickups.filter(want).sort((u, v) => Math.hypot(u.x - x, u.z - z) - Math.hypot(v.x - x, v.z - z))[0] || null;
        if (b && danger && sb) { // 숨는다
          let best = null, bd = 1e9;
          for (const c of cells(12, 50)) { if (seenBy(b, c.x, c.z) || inRing(c.x, c.z)) continue; const d = Math.hypot(c.x - x, c.z - z) + (Math.hypot(c.x - b.pos.x, c.z - b.pos.z) < 7 ? 8 : 0); if (d < bd) { bd = d; best = c; } }
          go(best); moving = move(6.4); mode2 = 'hide'; aim = 0;
        } else if (b && b.boss.expose && !y.losClear(x, 1.55, z, b.pos.x, y.chestY(b), b.pos.z) && Math.hypot(b.pos.x - x, b.pos.z - z) < 45) { // 틈이다: 쏠 수 있는 자리로
          let best = null, bd = 1e9;
          for (const c of cells(8, 40)) { if (!y.losClear(c.x, 1.55, c.z, b.pos.x, y.chestY(b), b.pos.z) || inRing(c.x, c.z)) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
          go(best); moving = move(4.3); mode2 = 'peek';
        } else if (med && !(b && sb && !b.boss.expose) && Math.hypot(med.x - x, med.z - z) < 30) { go({ x: med.x, z: med.z }); moving = move(4.3); mode2 = 'med'; }
        else { mode2 = 'hold'; path = null; p.vel.set(0, 0, 0); }
      }
      // 2) 사격
      if (rl > 0) { rl -= DT; if (rl <= 0) { const need = 30 - w.ammo, take = Math.min(need, w.reserve); w.ammo += take; w.reserve -= take; } }
      cool -= DT;
      let tgt = null, td = 1e9;
      if (mode2 !== 'flee') for (const e of foes) {
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d > 60 || !y.losClear(x, 1.55, z, e.pos.x, y.chestY(e), e.pos.z)) continue;
        let pr = d;
        if (e.boss) { const k = y.bossArmor(e, { x: e.pos.x - x, y: 0, z: e.pos.z - z }, null); if (k < 0.5) continue; pr = d + 40; } // 피해가 절반 넘게 들어갈 때만(철갑은 방탄이 풀렸거나 옆·뒤, 화약고는 언제나). 호위가 보이면 호위부터
        if (pr < td) { td = pr; tgt = e; }
      }
      aim = tgt && !moving ? aim + DT : tgt ? Math.min(aim + DT * 0.5, 0.2) : 0;
      if (tgt && aim > 0.25 && cool <= 0 && rl <= 0) {
        const d = Math.hypot(tgt.pos.x - x, tgt.pos.z - z), dir = { x: (tgt.pos.x - x) / d, y: 0, z: (tgt.pos.z - z) / d };
        if (w.ammo > 0) {
          w.ammo--; cool = 60 / 680; st.shots++;
          if (rnd() < (d > 25 ? 0.35 : 0.55)) { const head = rnd() < 0.12; tgt.damage(26 * (1 + 0.12 * y.prog.lv.ap) * (head ? tgt.T.headMul : 1), head ? 2 : 1, dir, 3); }
          if (w.ammo === 0 && w.reserve > 0) rl = 2.3 * (1 - 0.2 * y.prog.lv.hands);
        } else if (w.reserve > 0) { if (rl <= 0) rl = 2.3; }
        else { cool = 0.2; st.pistol++; if (rnd() < (d > 25 ? 0.3 : 0.5)) tgt.damage(32, 1, dir, 3); } // 권총
      }
      // 3) 수류탄
      if (grenT > 0) { grenT -= DT; if (grenT <= 0) { if (rnd() < 0.7 && grenAt && !grenAt.dead && Math.hypot(grenAt.pos.x - x, grenAt.pos.z - z) > 8.5) y.explode(grenAt.pos.x + (rnd() - 0.5) * 3, 0.5, grenAt.pos.z + (rnd() - 0.5) * 3); grenAt = null; } } // 터질 때 지휘관이 내 곁(8.5m 안)까지 와 있으면 빗나간 것으로 친다(봇이 제 수류탄에 쓰러지지 않게)
      else if (b && y.gren.n > 0 && b.boss.stagCd <= 0 && b.boss.stagT <= 0) { const d = Math.hypot(b.pos.x - x, b.pos.z - z); if (d > 8 && d < 22 && y.losClear(x, 1.55, z, b.pos.x, 1.5, b.pos.z)) { y.gren.n--; grenT = 1.6; grenAt = b; st.gren++; } }
      // 4) 한 걸음
      const rings0 = y.barrage.list.length, hpB = p.hp;
      p.yaw = b ? Math.atan2(-(b.pos.x - x), -(b.pos.z - z)) : p.yaw;
      y.step(1, DT);
      st.modeT[mode2] = +((st.modeT[mode2] || 0) + DT).toFixed(2);
      if (b) { const k = b.boss.stagT > 0 ? 'stag' : b.reload > 0 ? 'reload' : b.burst > 0 ? (b.canSee ? 'fire' : 'suppress') : b.state; st.bossSt = st.bossSt || {}; st.bossSt[k] = (st.bossSt[k] || 0) + DT; if (b.reload > 0 && !st._rl) st.reloads = (st.reloads || 0) + 1; st._rl = b.reload > 0; st.bossD = st.bossD || []; if (it % 100 === 0) st.bossD.push(Math.round(Math.hypot(b.pos.x - x, b.pos.z - z))); }
      if (p.hp < hpB) { const d = hpB - p.hp; if (y.barrage.list.length < rings0) st.dmg.shell += d; else if (b && b.burst > 0 && b.tg === p) { st.dmg.boss += d; st.by[mode2] = Math.round((st.by[mode2] || 0) + d); st.dist.push(Math.round(Math.hypot(b.pos.x - x, b.pos.z - z))); } else st.dmg.other += d; }
      else if (p.hp > hpB) st.heal += p.hp - hpB;
      st.minHp = Math.min(st.minHp, p.hp);
      if (y.camp.on) st.stage = y.camp.si;
    }
    st.t = +y.game.time.toFixed(0); st.hp = Math.round(p.hp); st.kills = y.game.kills; st.wave = y.game.wave;
    for (const k in st.dmg) st.dmg[k] = Math.round(st.dmg[k]);
    st.heal = Math.round(st.heal); st.minHp = Math.round(st.minHp); st.state = y.game.state;
    for (const k in st.bossSt || {}) st.bossSt[k] = Math.round(st.bossSt[k]);
    for (const k in st.modeT) st.modeT[k] = Math.round(st.modeT[k]);
    delete st._rl; delete st.bossD;
    st.dist = st.dist.length ? [Math.min(...st.dist), Math.round(st.dist.reduce((a, q) => a + q, 0) / st.dist.length), Math.max(...st.dist), st.dist.length] : [];
    const lb = y.bossOf(); st.bossLeft = lb ? Math.round(lb.boss.hpK * 100) + '% ' + lb.T.short : '';
    return st;
  }, mode);
  all.push(res);
  console.log(JSON.stringify(res));
}
const wins = all.filter((r) => r.win).length;
console.log(`${mode}: ${wins}/${all.length} 승 · 평균 시간 ${Math.round(all.reduce((a, r) => a + r.t, 0) / all.length)}초 · 평균 받은 피해 지휘관 ${Math.round(all.reduce((a, r) => a + r.dmg.boss, 0) / all.length)} / 포격 ${Math.round(all.reduce((a, r) => a + r.dmg.shell, 0) / all.length)} / 그 밖 ${Math.round(all.reduce((a, r) => a + r.dmg.other, 0) / all.length)}`);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

// 작전(에피소드) 자동 진행: 렌더링 없이 게임 로직만 빠르게 돌린다.
// 봇: 내비 경로로 목표까지 걷고, 보이는 가장 가까운 적에게 0.4초마다 피해 40을 준다(플레이어 사격을 흉내). 체력은 사실상 무한.
// 사용: node test/camp.mjs [에피소드 번호들, 예: 0,1,2,3]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 230 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { const y = window.__yz; y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true; try { localStorage.removeItem('yz_camp'); } catch (e) {} });
const eps = (process.argv[2] || '0,1,2,3').split(',').map(Number);
for (const i of eps) {
  const res = await page.evaluate((i) => {
    const y = window.__yz, p = y.player;
    y.startEpisode(i);
    y.prog.maxHp = 1e7; p.hp = 1e7;
    const log = [], stat = { hpLost: 0, allyTargeted: 0, allyDown: 0, radio: 0, maxEnemies: 0, steps: 0, supply: 0, stuck: 0, maxAllies: 0 };
    let lastSi = -2, botT = 0, path = null, pi = 0, pathT = 0, hp0 = p.hp, lastRadio = 0, downSeen = new Set();
    const snap = (why) => log.push({ why, t: +y.camp.epT.toFixed(1), si: y.camp.si, stage: y.camp.s ? y.camp.s.type : null, squad: y.allies.filter((a) => !a.gone).map((a) => a.def.short + ':' + a.state), ow: y.overwatch.on, enemies: y.enemies.filter((e) => !e.dead).length, pos: [Math.round(p.pos.x), Math.round(p.pos.z)] });
    for (let it = 0; it < 14000; it++) {
      if (y.game.state === 'supply') { stat.supply++; y.pickSupply(0); }
      if (y.game.state !== 'playing') break;
      const s = y.camp.s, st = y.camp.st;
      if (y.camp.si !== lastSi && s) { lastSi = y.camp.si; path = null; snap('stage'); }
      if (s) {
        let goal = null;
        if (s.type === 'reach' || s.type === 'hold') goal = s.at;
        else if (s.type === 'plant') { let bd = 1e9; for (const q of st.sites) { if (q.done) continue; const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); if (d < bd) { bd = d; goal = q; } } }
        if (goal) {
          const d = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
          if (d > 1.0) {
            pathT -= 0.05;
            if (!path || pathT <= 0) { path = y.findPath(p.pos.x, p.pos.z, goal.x, goal.z); pi = path && path.length > 1 ? 1 : 0; pathT = 2; if (!path) stat.stuck++; }
            if (path && pi < path.length) {
              const t = path[pi], tx = t.x - p.pos.x, tz = t.z - p.pos.z, td = Math.hypot(tx, tz);
              if (td < 0.4) pi++; else { p.pos.x += (tx / td) * 0.3; p.pos.z += (tz / td) * 0.3; p.yaw = Math.atan2(-tx, -tz); }
            } else if (goal.y) { p.pos.set(goal.x, goal.y, goal.z); p.vel.set(0, 0, 0); } // 2층 지점: 계단 대신 바로 올린다
            else if (d < 3) { p.pos.x = goal.x; p.pos.z = goal.z; }
          }
          if (goal.y && d <= 1.0 && p.pos.y < goal.y - 0.5) p.pos.y = goal.y;
        }
        botT -= 0.05;
        if (botT <= 0) {
          botT = 0.4;
          let best = null, bd = 70;
          for (const e of y.enemies) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd && y.losClear(p.pos.x, p.pos.y + 1.5, p.pos.z, e.pos.x, y.chestY(e), e.pos.z)) { bd = d; best = e; } }
          if (best) { const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1; best.damage(40, 1, { x: dx / l, y: 0, z: dz / l }, 3.2); }
        }
      }
      y.step(1, 0.05);
      stat.steps++;
      const alive = y.enemies.filter((e) => !e.dead);
      stat.maxEnemies = Math.max(stat.maxEnemies, alive.length);
      stat.maxAllies = Math.max(stat.maxAllies, y.allies.filter((a) => !a.gone).length);
      if (alive.some((e) => e.tg !== p)) stat.allyTargeted++;
      for (const a of y.allies) if (a.state === 'down' && !downSeen.has(a.def.id + a.downT.toFixed(0))) { if (a.downT > 8.9) stat.allyDown++; }
      if (y.radioQ.length > lastRadio) stat.radio += y.radioQ.length - lastRadio;
      lastRadio = y.radioQ.length;
      if (p.hp < hp0) { stat.hpLost += hp0 - p.hp; hp0 = p.hp; }
      if (it % 400 === 399) snap('tick');
    }
    snap('end');
    return { ep: i, title: y.EPISODES[i].title, state: y.game.state, epT: +y.camp.epT.toFixed(1), kills: y.game.kills, teamKills: y.game.teamKills, stat: { ...stat, hpLost: Math.round(stat.hpLost) }, allyShots: y.allies.map((a) => a.def.short + ' ' + a.shots + '발/' + a.kills + '킬'), ow: [y.overwatch.shots, y.overwatch.kills], saved: y.store.get('camp', 0), log: log.filter((l) => l.why !== 'tick').concat(log.filter((l) => l.why === 'tick').slice(-2)) };
  }, i);
  console.log(JSON.stringify(res));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

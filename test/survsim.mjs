// 생존 모드 빠른 시뮬레이션(렌더링 없음): 제자리에 선 봇이 보이는 적에게 0.4초마다 피해 40. 웨이브 진행 속도 확인용
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 480, height: 230 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__yz && (window.__yz.MOCAP.ready || window.__yz.MOCAP.failed), null, { timeout: 60000 });
await page.waitForFunction(() => window.__yz.MOCAP.clips && window.__yz.MOCAP.clips.Roll, null, { timeout: 30000 }).catch(() => {});
const noBot = process.argv[2] === 'nobot';
const res = await page.evaluate((noBot) => {
  const y = window.__yz, p = y.player;
  y.opt.quality = 'low'; y.applyQuality(); y.dbg.noDyn = true;
  document.getElementById('btnStart').click();
  y.prog.maxHp = 1e7; p.hp = 1e7;
  const marks = []; let lastWave = 0, botT = 0, hp0 = p.hp, lost = 0;
  for (let it = 0; it < (noBot ? 1200 : 3600); it++) {
    if (y.game.state === 'supply') y.pickSupply(1);
    if (y.game.state !== 'playing') break;
    botT -= 0.05;
    if (botT <= 0) {
      botT = 0.4;
      let best = null, bd = 70;
      for (const e of y.enemies) { if (e.dead) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd && y.losClear(p.pos.x, 1.5, p.pos.z, e.pos.x, y.chestY(e), e.pos.z)) { bd = d; best = e; } }
      if (best && !noBot) { const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1; best.damage(40, 1, { x: dx / l, y: 0, z: dz / l }, 3.2); }
    }
    y.step(1, 0.05);
    if (p.hp < hp0) { lost += hp0 - p.hp; hp0 = p.hp; }
    if (y.game.wave !== lastWave) { lastWave = y.game.wave; marks.push([y.game.wave, +y.game.time.toFixed(1), y.game.kills]); }
  }
  return { t: +y.game.time.toFixed(1), wave: y.game.wave, kills: y.game.kills, hpLost: Math.round(lost), waveStarts: marks, camp: y.camp.on, allies: y.allies.length };
}, noBot);
console.log(JSON.stringify(res));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();

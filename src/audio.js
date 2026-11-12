// 효과음: CC0 녹음 샘플(총성·발소리·피격·재장전·폭발)을 우선 쓰고, 디코드 전이거나 실패하면 합성음으로 대체
import { clamp, TAU } from './util.js';
import { SAMPLES } from './samples.js';

let ac = null, master = null, on = true, rainGain = null, wantRain = false;
export function setRain(v) {
  wantRain = !!v;
  if (rainGain && ac) rainGain.gain.setTargetAtTime(wantRain ? 0.16 : 0, ac.currentTime, 0.6);
}
const bufs = {};
const vars = {}; // 이름 → 디코드된 샘플 변주 목록
const last = {};
export const sampleState = { total: 0, ok: 0, fail: 0 };

function loadSamples() {
  for (const name in SAMPLES) {
    for (const b64 of SAMPLES[name]) {
      sampleState.total++;
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const done = (buf) => { (vars[name] = vars[name] || []).push(buf); sampleState.ok++; };
        const p = ac.decodeAudioData(u.buffer, done, () => { sampleState.fail++; });
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        sampleState.fail++;
      }
    }
  }
}
export function has(name) { return !!(vars[name] && vars[name].length); }
function pick(name) {
  const v = vars[name];
  if (!v || !v.length) return bufs[name];
  if (v.length === 1) return v[0];
  // 발소리는 좌우 순서대로, 나머지는 직전과 다른 변주를 무작위로
  const i = name === 'step' || name === 'stepM' ? ((last[name] ?? -1) + 1) % v.length : ((last[name] ?? 0) + 1 + Math.floor(Math.random() * (v.length - 1))) % v.length;
  last[name] = i;
  return v[i];
}
export const listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };

function mkBuf(dur, fn) {
  const sr = ac.sampleRate, n = Math.max(1, Math.floor(dur * sr)), b = ac.createBuffer(1, n, sr);
  fn(b.getChannelData(0), sr, n);
  return b;
}

// 총성: 고역 크랙 + 중역 몸통 + 저역 펀치 + 야외 잔향 꼬리 + 반사음
function shot(o) {
  return (d, sr, n) => {
    let lp1 = 0, lp2 = 0, lp3 = 0, ph = 0;
    const a1 = 1 - Math.exp((-TAU * o.hp) / sr), a2 = 1 - Math.exp((-TAU * o.bodyF) / sr), a3 = 1 - Math.exp((-TAU * 520) / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = Math.random() * 2 - 1;
      lp1 += (w - lp1) * a1;
      lp2 += (w - lp2) * a2;
      lp3 += (w - lp3) * a3;
      ph += (TAU * (o.f1 + (o.f0 - o.f1) * Math.exp(-t * 35))) / sr;
      const s = o.crack * (w - lp1) * Math.exp(-t * 90) + o.body * lp2 * 2.2 * Math.exp(-t * 22) + o.thump * Math.sin(ph) * Math.exp(-t * 26) + o.tail * lp3 * 3 * Math.exp(-t * 5.5) * (1 - Math.exp(-t * 60));
      d[i] = Math.tanh(s * 1.6);
    }
    const dl = Math.floor(0.085 * sr);
    let e = 0;
    for (let i = dl; i < n; i++) {
      e += (d[i - dl] - e) * 0.25;
      d[i] += e * 0.2;
    }
  };
}

function clicks(list) {
  return (d, sr, n) => {
    for (const [t0, f, dec, amp, noise] of list) {
      for (let i = Math.floor(t0 * sr); i < n; i++) {
        const t = i / sr - t0, e = Math.exp(-t * dec);
        if (e < 0.001) break;
        d[i] += amp * e * (Math.sin(TAU * f * t) * (1 - noise) + (Math.random() * 2 - 1) * noise);
      }
    }
  };
}

export function initAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC();
  } catch (e) {
    ac = null;
    return;
  }
  master = ac.createGain();
  master.gain.value = on ? 0.9 : 0;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(ac.destination);
  loadSamples();

  bufs.shotAR = mkBuf(0.85, shot({ crack: 0.9, body: 0.9, thump: 1.0, f0: 170, f1: 55, hp: 2500, bodyF: 1400, tail: 0.35 }));
  bufs.shotPistol = mkBuf(0.6, shot({ crack: 1.0, body: 0.7, thump: 0.7, f0: 230, f1: 80, hp: 3000, bodyF: 1800, tail: 0.25 }));
  bufs.shotFar = mkBuf(1.0, shot({ crack: 0.5, body: 1.0, thump: 0.8, f0: 140, f1: 50, hp: 1500, bodyF: 900, tail: 0.6 }));
  bufs.shotSG = mkBuf(1.0, shot({ crack: 0.7, body: 1.15, thump: 1.35, f0: 120, f1: 40, hp: 1800, bodyF: 900, tail: 0.5 }));
  bufs.shotDMR = mkBuf(1.1, shot({ crack: 1.1, body: 0.9, thump: 1.1, f0: 190, f1: 50, hp: 2800, bodyF: 1500, tail: 0.55 }));
  bufs.pump = mkBuf(0.35, clicks([[0, 700, 40, 0.6, 0.7], [0.16, 1100, 50, 0.6, 0.7]]));
  bufs.shellIn = mkBuf(0.15, clicks([[0, 500, 50, 0.5, 0.6], [0.04, 1500, 90, 0.3, 0.5]]));
  bufs.clink = mkBuf(0.12, clicks([[0, 3200, 60, 0.3, 0.2], [0.02, 4100, 80, 0.2, 0.2]]));
  bufs.boom = mkBuf(2.0, (d, sr, n) => {
    let lp = 0, lp2 = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = Math.random() * 2 - 1;
      lp += (w - lp) * 0.035;
      lp2 += (w - lp2) * 0.3;
      ph += (TAU * (28 + 75 * Math.exp(-t * 9))) / sr;
      d[i] = Math.tanh((Math.sin(ph) * 1.3 * Math.exp(-t * 3.2) + lp * 7 * Math.exp(-t * 2.6) + (w - lp2) * 0.9 * Math.exp(-t * 28)) * 1.5);
    }
  });
  bufs.magOut = mkBuf(0.25, clicks([[0, 900, 60, 0.5, 0.6], [0.05, 420, 45, 0.5, 0.4]]));
  bufs.magIn = mkBuf(0.25, clicks([[0, 600, 55, 0.6, 0.5], [0.07, 1400, 80, 0.4, 0.6]]));
  bufs.bolt = mkBuf(0.3, clicks([[0, 1800, 70, 0.5, 0.7], [0.09, 1100, 50, 0.7, 0.6]]));
  bufs.dry = mkBuf(0.1, clicks([[0, 2400, 120, 0.4, 0.5]]));
  bufs.hit = mkBuf(0.08, clicks([[0, 1500, 90, 0.5, 0.3]]));
  bufs.kill = mkBuf(0.2, clicks([[0, 700, 40, 0.6, 0.3], [0.04, 1900, 60, 0.4, 0.2]]));
  bufs.head = mkBuf(0.3, clicks([[0, 2600, 22, 0.5, 0.05], [0, 3900, 28, 0.3, 0.05]]));
  bufs.pickup = mkBuf(0.35, clicks([[0, 880, 25, 0.35, 0], [0.08, 1320, 22, 0.35, 0]]));
  bufs.casing = mkBuf(0.25, clicks([[0, 5200, 45, 0.25, 0.1], [0.07, 6100, 60, 0.15, 0.1], [0.12, 5600, 70, 0.08, 0.1]]));
  bufs.impact = mkBuf(0.12, clicks([[0, 300, 70, 0.7, 0.9]]));
  bufs.impactM = mkBuf(0.3, clicks([[0, 2100, 25, 0.3, 0.2], [0, 3300, 35, 0.2, 0.2], [0, 400, 80, 0.5, 0.9]]));
  bufs.step = mkBuf(0.16, (d, sr, n) => {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * 0.12;
      d[i] = lp * 3.2 * Math.exp(-t * 38) + Math.sin(TAU * 85 * t) * 0.25 * Math.exp(-t * 50);
    }
  });
  bufs.hurt = mkBuf(0.3, (d, sr, n) => {
    let lp = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * 0.08;
      ph += (TAU * (60 + 70 * Math.exp(-t * 20))) / sr;
      d[i] = Math.tanh((Math.sin(ph) * 0.9 + lp * 2.5) * Math.exp(-t * 16) * 1.4);
    }
  });
  bufs.whiz = mkBuf(0.22, (d, sr, n) => {
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, w = (TAU * (3400 - 2300 * t)) / sr, r = 0.985;
      const y = 2 * r * Math.cos(w) * y1 - r * r * y2 + (Math.random() * 2 - 1) * (1 - r);
      y2 = y1;
      y1 = y;
      d[i] = y * 6 * Math.sin(Math.PI * t) ** 2;
    }
  });
  bufs.wave = mkBuf(1.3, (d, sr, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr, e = Math.min(1, t * 20) * Math.exp(-t * 2.6);
      d[i] = e * 0.3 * (Math.sin(TAU * 98 * t) + 0.5 * Math.sin(TAU * 147 * t) + 0.3 * Math.sin(TAU * 196 * t + Math.sin(TAU * 5 * t) * 0.3));
    }
  });

  // 바람 루프
  const wb = mkBuf(4, (d, sr, n) => {
    let b = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      b += (Math.random() * 2 - 1) * 0.02;
      b *= 0.998;
      lp += (b - lp) * 0.02;
      d[i] = lp * 6;
    }
    const f = Math.floor(0.5 * sr);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i] * k + d[n - f + i] * (1 - k);
    }
  });
  const ws = ac.createBufferSource();
  ws.buffer = wb;
  ws.loop = true;
  ws.loopEnd = 3.5;
  const wg = ac.createGain();
  wg.gain.value = 0.5;
  ws.connect(wg);
  wg.connect(master);
  // 빗소리: 흰 잡음을 고역만 남겨 반복 재생 (비 오는 환경에서만 켠다)
  const rb = ac.createBuffer(1, Math.floor(ac.sampleRate * 2.5), ac.sampleRate), rd = rb.getChannelData(0);
  for (let i = 0; i < rd.length; i++) rd[i] = (Math.random() * 2 - 1) * (0.75 + 0.25 * Math.sin(i / 700));
  const rs = ac.createBufferSource();
  rs.buffer = rb;
  rs.loop = true;
  const rf = ac.createBiquadFilter();
  rf.type = 'bandpass';
  rf.frequency.value = 5200;
  rf.Q.value = 0.35;
  rainGain = ac.createGain();
  rainGain.gain.value = wantRain ? 0.16 : 0;
  rs.connect(rf);
  rf.connect(rainGain);
  rainGain.connect(master);
  rs.start();
  ws.start();
}

export function setSound(v) {
  on = v;
  if (master) master.gain.value = v ? 0.9 : 0;
}

export function suspend(v) {
  if (!ac) return;
  if (v) ac.suspend().catch(() => {});
  else ac.resume().catch(() => {});
}

export function play(name, vol = 1, rate = 1, pan = 0, lp = 0) {
  if (!ac || !on) return;
  const b = pick(name);
  if (!b) return;
  const s = ac.createBufferSource();
  s.buffer = b;
  s.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = vol;
  let node = s;
  if (lp > 0) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  if (pan !== 0 && ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p);
    p.connect(master);
  } else g.connect(master);
  s.start();
}

// 위치 기반 재생: 거리 감쇠 + 좌우 패닝 + 원거리 고역 감쇠
export function playAt(name, x, y, z, vol = 1, rate = 1) {
  const dx = x - listener.x, dy = y - listener.y, dz = z - listener.z, dist = Math.hypot(dx, dy, dz);
  const pan = ((dx * listener.rx + dz * listener.rz) / Math.max(dist, 0.001)) * 0.85;
  play(name, vol / (1 + dist * 0.06), rate, pan, dist > 12 ? 18000 / (1 + dist * 0.05) : 0);
}

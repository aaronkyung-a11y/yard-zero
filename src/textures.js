// 외부 이미지 없이 캔버스로 만드는 절차적 텍스처 (알베도 + 노멀맵)
import * as THREE from 'three';
import { mulberry32, lerp, clamp } from './util.js';

function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// 타일링되는 fBm 값 노이즈
export function fbm(size, basePeriod, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = Math.min(size, basePeriod << o);
    const lat = new Float32Array(p * p);
    const r = mulberry32(seed + o * 101);
    for (let i = 0; i < p * p; i++) lat[i] = r();
    const scale = p / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const ya = (y0 % p) * p, yb = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x * scale, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % p, xb = (x0 + 1) % p;
        out[y * size + x] += lerp(lerp(lat[ya + xa], lat[ya + xb], sx), lerp(lat[yb + xa], lat[yb + xb], sx), sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalFrom(h, size, strength, repeat = true) {
  const c = mk(size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) {
    const yu = ((y + size - 1) % size) * size, yd = ((y + 1) % size) * size, yc = y * size;
    for (let xx = 0; xx < size; xx++) {
      const xl = h[yc + ((xx + size - 1) % size)], xr = h[yc + ((xx + 1) % size)];
      const nx = -(xr - xl) * strength, ny = (h[yd + xx] - h[yu + xx]) * strength;
      const l = Math.hypot(nx, ny, 1), i = (yc + xx) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, repeat);
}

function heightOf(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const h = new Float32Array(c.width * c.height);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}

function makeAsphalt() {
  const S = 512, n1 = fbm(S, 8, 6, 11), n2 = fbm(S, 2, 4, 23), r = mulberry32(5);
  const c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const g = r(), v = n1[i], big = n2[i];
    let b = 84 + (v - 0.5) * 36 + (big - 0.5) * 34 + (g - 0.5) * 30;
    if (g > 0.94) b += 38;
    else if (g < 0.06) b -= 18;
    d[i * 4] = b;
    d[i * 4 + 1] = b;
    d[i * 4 + 2] = b * 1.04;
    d[i * 4 + 3] = 255;
    h[i] = v * 0.5 + g * 0.5;
  }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 8; k++) {
    const cx = 70 + r() * (S - 140), cy = 70 + r() * (S - 140), R = 20 + r() * 44;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(12,12,14,0.38)');
    g.addColorStop(1, 'rgba(12,12,14,0)');
    x.fillStyle = g;
    x.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  x.strokeStyle = 'rgba(8,8,10,0.8)';
  x.lineWidth = 1.4;
  x.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    let px = 60 + r() * (S - 120), py = 60 + r() * (S - 120), a = r() * 6.28;
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 28; s++) {
      a += (r() - 0.5) * 0.9;
      px += Math.cos(a) * 7;
      py += Math.sin(a) * 7;
      if (px < 14 || py < 14 || px > S - 14 || py > S - 14) break;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  return { map: tex(c), normalMap: normalFrom(h, S, 1.5) };
}

function makeConcrete() {
  const S = 256, n1 = fbm(S, 4, 6, 31), n2 = fbm(S, 16, 4, 37), r = mulberry32(8);
  const c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    let g = 158 + (n1[i] - 0.5) * 76 + (n2[i] - 0.5) * 34, hh = n1[i] * 0.6 + n2[i] * 0.4;
    if (r() > 0.988) { g -= 55; hh -= 0.5; }
    const y = (i / S) | 0;
    if (y === 0 || y === S - 1 || y === (S >> 1)) { g -= 38; hh -= 0.6; }
    d[i * 4] = g;
    d[i * 4 + 1] = g * 0.975;
    d[i * 4 + 2] = g * 0.93;
    d[i * 4 + 3] = 255;
    h[i] = hh;
  }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 12; k++) {
    const sx = r() * S, w = 4 + r() * 16, len = 50 + r() * 180;
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(45,38,30,0.24)');
    g.addColorStop(1, 'rgba(45,38,30,0)');
    x.fillStyle = g;
    x.fillRect(sx, 0, w, len);
  }
  return { map: tex(c), normalMap: normalFrom(h, S, 2.2) };
}

function makeCorrugated() {
  const S = 256, n = fbm(S, 4, 5, 41), n2 = fbm(S, 32, 3, 43), r = mulberry32(9);
  const c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx, ph = ((xx / S) * 8) % 1;
      const t = ph < 0.14 ? ph / 0.14 : ph < 0.5 ? 1 : ph < 0.64 ? 1 - (ph - 0.5) / 0.14 : 0;
      h[i] = t;
      const b = 236 - (1 - t) * 30 - Math.max(0, n[i] - 0.35) * 95;
      let R = b, G = b, B = b;
      const rust = n2[i] * (0.3 + 0.7 * (y / S)) * (0.7 + n[i] * 0.6);
      if (rust > 0.56) {
        const k = Math.min(0.85, (rust - 0.56) * 5);
        R = lerp(R, 126, k);
        G = lerp(G, 92, k);
        B = lerp(B, 66, k);
      }
      d[i * 4] = R;
      d[i * 4 + 1] = G;
      d[i * 4 + 2] = B;
      d[i * 4 + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 14; k++) {
    const sx = r() * S, w = 2 + r() * 5, len = 40 + r() * 170;
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(60,44,28,0.3)');
    g.addColorStop(1, 'rgba(60,44,28,0)');
    x.fillStyle = g;
    x.fillRect(sx, 0, w, len);
  }
  return { map: tex(c), normalMap: normalFrom(h, S, 3.2) };
}

function makeCrate() {
  const S = 256, c = mk(S), x = c.getContext('2d'), hc = mk(S), hx = hc.getContext('2d'), r = mulberry32(13);
  x.fillStyle = '#6f5333';
  x.fillRect(0, 0, S, S);
  hx.fillStyle = '#6a6a6a';
  hx.fillRect(0, 0, S, S);
  const pl = 6, ph = S / pl;
  for (let i = 0; i < pl; i++) {
    const tone = 0.82 + r() * 0.32;
    x.fillStyle = `rgb(${(128 * tone) | 0},${(98 * tone) | 0},${(60 * tone) | 0})`;
    x.fillRect(0, i * ph + 1, S, ph - 2);
    for (let g = 0; g < 24; g++) {
      x.strokeStyle = `rgba(58,38,18,${0.06 + r() * 0.13})`;
      x.lineWidth = 1;
      const yy = i * ph + 2 + r() * (ph - 4);
      x.beginPath();
      x.moveTo(0, yy);
      x.bezierCurveTo(S * 0.3, yy + (r() - 0.5) * 5, S * 0.6, yy + (r() - 0.5) * 5, S, yy + (r() - 0.5) * 3);
      x.stroke();
    }
    x.fillStyle = 'rgba(18,11,6,0.9)';
    x.fillRect(0, i * ph - 1, S, 2);
    hx.fillStyle = '#000';
    hx.fillRect(0, i * ph - 1, S, 2);
  }
  const plank = (px, py, w, h, col) => {
    x.fillStyle = col;
    x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(22,14,7,0.85)';
    x.lineWidth = 2;
    x.strokeRect(px + 1, py + 1, w - 2, h - 2);
    hx.fillStyle = '#d8d8d8';
    hx.fillRect(px, py, w, h);
    hx.strokeStyle = '#1a1a1a';
    hx.lineWidth = 2;
    hx.strokeRect(px + 1, py + 1, w - 2, h - 2);
  };
  for (const ctx of [x, hx]) {
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-S / 2, -S / 2);
  }
  plank(-40, S / 2 - 13, S + 80, 26, '#84653e');
  x.restore();
  hx.restore();
  const fw = 30;
  plank(0, 0, S, fw, '#8d6c44');
  plank(0, S - fw, S, fw, '#876740');
  plank(0, fw, fw, S - 2 * fw, '#8a6a42');
  plank(S - fw, fw, fw, S - 2 * fw, '#8a6a42');
  x.fillStyle = 'rgba(15,12,10,0.9)';
  for (const [nx, ny] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14], [S / 2, 14], [S / 2, S - 14]]) {
    x.beginPath();
    x.arc(nx, ny, 2.6, 0, 7);
    x.fill();
  }
  for (let k = 0; k < 900; k++) {
    x.fillStyle = `rgba(20,12,5,${r() * 0.12})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  return { map: tex(c, true, false), normalMap: normalFrom(heightOf(hc), S, 2.4, false) };
}

function makeBlotch() {
  const S = 128, n = fbm(S, 4, 4, 17), r = mulberry32(3);
  const c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = (n[i] < 0.44 ? 0.6 : n[i] < 0.56 ? 0.8 : 1.0) * 255 * (0.94 + r() * 0.08);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c);
}

function makeHole() {
  const S = 64, c = mk(S), x = c.getContext('2d'), r = mulberry32(21);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(4,4,4,1)');
  g.addColorStop(0.17, 'rgba(8,8,8,1)');
  g.addColorStop(0.26, 'rgba(70,66,60,0.9)');
  g.addColorStop(0.48, 'rgba(38,36,34,0.42)');
  g.addColorStop(1, 'rgba(30,30,30,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(10,10,10,0.6)';
  x.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    const a = r() * 6.28, l = 9 + r() * 12;
    x.beginPath();
    x.moveTo(32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5);
    x.lineTo(32 + Math.cos(a) * l, 32 + Math.sin(a) * l);
    x.stroke();
  }
  return tex(c, true, false);
}

function makeFlash() {
  const S = 128, c = mk(S), x = c.getContext('2d'), r = mulberry32(77);
  x.translate(S / 2, S / 2);
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
  g.addColorStop(0, 'rgba(255,250,228,1)');
  g.addColorStop(0.35, 'rgba(255,205,115,0.85)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, S * 0.3, 0, 7);
  x.fill();
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.283, len = S * (0.3 + r() * 0.19), w = S * (0.03 + r() * 0.04);
    x.save();
    x.rotate(a);
    const gg = x.createLinearGradient(0, 0, len, 0);
    gg.addColorStop(0, 'rgba(255,236,185,0.9)');
    gg.addColorStop(1, 'rgba(255,130,40,0)');
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(0, -w);
    x.lineTo(len, 0);
    x.lineTo(0, w);
    x.closePath();
    x.fill();
    x.restore();
  }
  return tex(c, true, false);
}

function makeSoft() {
  const S = 64, c = mk(S), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return tex(c, true, false);
}

// 물웅덩이 모양 (alphaMap: 초록 채널 사용)
function makePuddle() {
  const S = 128, n = fbm(S, 4, 4, 51), c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx, rr = Math.hypot(xx / S - 0.5, y / S - 0.5) * 2 + (n[i] - 0.5) * 0.5;
      const a = clamp((0.75 - rr) / 0.3, 0, 1), v = a * a * (3 - 2 * a) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, false);
}

// 벗겨진 도색 (alphaMap)
function makeWorn() {
  const S = 128, n = fbm(S, 8, 4, 29), c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = clamp((n[i] - 0.3) * 3.4, 0.2, 1) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, true);
}

function makeLabel(kind) {
  const S = 64, c = mk(S), x = c.getContext('2d');
  if (kind === 'ammo') {
    x.fillStyle = '#4b5a33';
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#d9b21c';
    x.fillRect(0, 22, S, 9);
    x.fillStyle = '#e8e2c8';
    x.font = 'bold 15px sans-serif';
    x.textAlign = 'center';
    x.fillText('5.56', 32, 50);
  } else {
    x.fillStyle = '#e9e6dc';
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#c8261c';
    x.fillRect(25, 10, 14, 44);
    x.fillRect(10, 25, 44, 14);
  }
  return tex(c, true, false);
}

function makeCloud() {
  const S = 256, n = fbm(S, 4, 6, 71), c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = n[i] * 255;
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, true);
}

function makeScorch() {
  const S = 128, n = fbm(S, 8, 4, 83), c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const i = y * S + xx, rr = Math.hypot(xx / S - 0.5, y / S - 0.5) * 2 + (n[i] - 0.5) * 0.55;
      const a = clamp((0.85 - rr) / 0.55, 0, 1);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 8 + n[i] * 22;
      d[i * 4 + 3] = a * a * 235;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, true, false);
}

// 컨테이너 옆면 표기(가상의 선사명 + 컨테이너 번호). 4×2 아틀라스
function makeMarks() {
  const W = 1024, H = 512, c = mk(W, H), x = c.getContext('2d'), r = mulberry32(57);
  const names = ['HANRYO', 'KESTREL', 'NORDWAL', 'TAEYANG', 'OCEANBRIDGE', 'DELMAR', 'ISTRA LINE', 'PACWAY'];
  const codes = ['HNRU 482917 3', 'KSTU 305561 8', 'NDWU 771204 1', 'TYGU 260814 5', 'OCBU 119370 2', 'DLMU 640258 7', 'ISTU 903416 0', 'PCWU 528143 6'];
  x.textBaseline = 'top';
  for (let k = 0; k < 8; k++) {
    const ox = (k % 4) * 256, oy = ((k / 4) | 0) * 256;
    x.fillStyle = 'rgba(245,243,236,0.9)';
    let fs = 50;
    x.font = `bold ${fs}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    while (x.measureText(names[k]).width > 236 && fs > 20) { fs -= 2; x.font = `bold ${fs}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
    x.fillText(names[k], ox + 10, oy + 16);
    x.fillRect(ox + 10, oy + 16 + fs + 6, 236, 5);
    x.font = 'bold 25px "Arial Narrow", Arial, sans-serif';
    x.fillText(codes[k], ox + 10, oy + 98);
    x.font = 'bold 21px "Arial Narrow", Arial, sans-serif';
    x.fillText('22G1', ox + 10, oy + 132);
    x.font = '14px Arial, sans-serif';
    x.fillStyle = 'rgba(245,243,236,0.8)';
    x.fillText('MAX GROSS  30,480 KG', ox + 10, oy + 168);
    x.fillText('TARE         2,230 KG', ox + 10, oy + 188);
    x.fillText('NET         28,250 KG', ox + 10, oy + 208);
    x.fillText('CU. CAP.      33.2 CU.M', ox + 10, oy + 228);
  }
  x.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 2600; k++) {
    x.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
    x.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 5);
  }
  const t = tex(c, true, false);
  t.anisotropy = 4;
  return t;
}

// 물체가 바닥에 닿는 자리의 부드러운 그림자 (alphaMap)
function makeAO() {
  const S = 64, c = mk(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const u = (xx + 0.5) / S, v = (y + 0.5) / S, e = Math.min(u, 1 - u, v, 1 - v), a = clamp(e / 0.24, 0, 1);
      d[(y * S + xx) * 4] = d[(y * S + xx) * 4 + 1] = d[(y * S + xx) * 4 + 2] = a * a * (3 - 2 * a) * 255;
      d[(y * S + xx) * 4 + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, false, false);
}

export function makeTextures() {
  return {
    asphalt: makeAsphalt(),
    concrete: makeConcrete(),
    corrugated: makeCorrugated(),
    crate: makeCrate(),
    blotch: makeBlotch(),
    hole: makeHole(),
    flash: makeFlash(),
    soft: makeSoft(),
    puddle: makePuddle(),
    worn: makeWorn(),
    ammoLabel: makeLabel('ammo'),
    medLabel: makeLabel('med'),
    cloud: makeCloud(),
    scorch: makeScorch(),
    marks: makeMarks(),
    ao: makeAO(),
  };
}

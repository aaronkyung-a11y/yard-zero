// 컨테이너 야드 맵 + 충돌(AABB) + 레이캐스트 + 내비게이션 그리드
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

export const START = { x: 0, z: 27 };
export const B = { x0: -42, x1: 66, z0: -32, z1: 32 }; // 전체 경계(야드 + 창고)
const YB = { x0: -42, x1: 42, z0: -32, z1: 32 }; // 야드 담장 안쪽
export const WH = { x0: 42.5, x1: 66, z0: -13, z1: 13, deckX: 48.5, deckY: 3.5, h: 7.6 }; // 창고 내부
export const colliders = []; // {x0,y0,z0,x1,y1,z1,m}  m: 0 콘크리트, 1 금속, 2 목재
export const NAV = { W: 108, H: 64, blocked: null, free: [] };

const CL = 6.06, CW = 2.44, CH = 2.59; // 20ft 컨테이너 실제 치수(m)
const C = (hex) => new THREE.Color(hex);

function addCol(x0, y0, z0, x1, y1, z1, m = 0, nr = false) {
  colliders.push({ x0, y0, z0, x1, y1, z1, m, nr }); // nr: 이동만 막고 탄은 통과(난간)
}
function colBox(cx, cy, cz, w, h, d, m = 0) {
  addCol(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, m);
}

function tint(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = color.r;
    a[i * 3 + 1] = color.g;
    a[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// 텍스처 밀도가 실제 치수에 맞도록 UV를 다시 잡은 박스
function box(w, h, d, tile = 1, tileV = tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dm = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dm[f][0]) / tile, (uv.getY(k) * dm[f][1]) / tileV);
    }
  }
  return g;
}

function barrierGeo(len) {
  const g = box(len, 0.85, 0.6, 1.6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.36);
  g.computeVertexNormals();
  return g;
}

export function buildWorld(scene, M) {
  const r = mulberry32(4242);
  const L = { concrete: [], container: [], steel: [], wood: [], glass: [], paint: [], puddle: [], marks: [], ao: [], floor: [], lamp: [], glow: [] };
  const foot = [];
  const put = (list, g, x, y, z, ry = 0, color = null) => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    if (color) tint(g, color);
    L[list].push(g);
  };
  const reserve = (x0, z0, x1, z1) => foot.push({ x0, z0, x1, z1 });
  const freeRect = (x0, z0, x1, z1) => {
    for (const f of foot) if (x0 < f.x1 && x1 > f.x0 && z0 < f.z1 && z1 > f.z0) return false;
    return true;
  };
  const place = (w, d, margin) => {
    for (let i = 0; i < 60; i++) {
      const x = YB.x0 + 3 + r() * (YB.x1 - YB.x0 - 6), z = YB.z0 + 3 + r() * (YB.z1 - YB.z0 - 6);
      if (Math.hypot(x - START.x, z - START.z) < 5.5) continue;
      if (freeRect(x - w / 2 - margin, z - d / 2 - margin, x + w / 2 + margin, z + d / 2 + margin)) {
        reserve(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
        return { x, z };
      }
    }
    return null;
  };

  // ── 지면
  const gg = new THREE.PlaneGeometry(700, 700);
  gg.rotateX(-Math.PI / 2);
  const guv = gg.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 233, guv.getY(i) * 233);
  const ground = new THREE.Mesh(gg, M.asphalt);
  ground.receiveShadow = true;
  scene.add(ground);

  // ── 컨테이너
  const palette = [0x8c2f1f, 0x1f4e79, 0x2f6b3a, 0xb5651d, 0x8f918c, 0x7a1f2b, 0x1c6b6b, 0xcfcabb, 0xbd9a1c].map(C);
  const layout = [
    [-30, -25, 0, 2], [-23.6, -25, 0, 1], [-11, -24, 1, 1], [-2, -21, 0, 2], [4.4, -21, 0, 1], [16, -25, 0, 1], [22.4, -25, 0, 2], [34, -21, 1, 1],
    [-35, -9, 1, 2], [-21, -12, 0, 1], [-14.6, -12, 0, 2], [0, -10, 1, 1], [12, -13, 0, 2], [18.4, -13, 0, 1], [31, -8, 1, 2],
    [-27, 2, 0, 1], [-9, 3, 1, 2], [7, 1, 0, 1], [22, 3, 0, 2], [36, 6, 1, 1], [-16, -2, 0, 1], [14, -4, 1, 1],
    [-33, 13, 0, 2], [-19, 13, 1, 1], [-5, 14, 0, 1], [12, 16, 1, 2], [25, 17, 0, 1], [6.2, 22, 0, 1],
  ];
  const rodC = C(0x9b9d9a);
  for (const [x, z, rot, stack] of layout) {
    const w = rot ? CW : CL, d = rot ? CL : CW;
    for (let l = 0; l < stack; l++) {
      const col = palette[(r() * palette.length) | 0].clone();
      col.offsetHSL(0, 0, (r() - 0.5) * 0.05);
      const y = CH / 2 + l * CH;
      put('container', box(CL, CH, CW, 2.2, CH), x, y, z, rot ? Math.PI / 2 : 0, col);
      const pc = col.clone().multiplyScalar(0.62);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('steel', new THREE.BoxGeometry(0.13, CH, 0.13), x + sx * (w / 2 - 0.05), y, z + sz * (d / 2 - 0.05), 0, pc);
      for (const o of [-0.78, -0.3, 0.3, 0.78]) {
        if (rot) put('steel', new THREE.BoxGeometry(0.035, CH - 0.3, 0.035), x + o, y, z + d / 2 + 0.03, 0, rodC);
        else put('steel', new THREE.BoxGeometry(0.035, CH - 0.3, 0.035), x + w / 2 + 0.03, y, z + o, 0, rodC);
      }
    }
    // 옆면 표기: 층마다 양쪽 긴 면에 하나씩
    for (let l = 0; l < stack; l++) {
      for (const side of [-1, 1]) {
        const g = new THREE.PlaneGeometry(2.3, 1.15), uv = g.attributes.uv, cell = (r() * 8) | 0, u0 = (cell % 4) / 4, v0 = 1 - (((cell / 4) | 0) + 1) / 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.25, v0 + uv.getY(i) * 0.5);
        const y = l * CH + CH - 0.78;
        if (rot) { g.rotateY((side * Math.PI) / 2); g.translate(x + side * (CW / 2 + 0.022), y, z - side * (CL / 2 - 1.45)); }
        else { if (side < 0) g.rotateY(Math.PI); g.translate(x + side * (CL / 2 - 1.45), y, z + side * (CW / 2 + 0.022)); }
        L.marks.push(g);
      }
    }
    addCol(x - w / 2, 0, z - d / 2, x + w / 2, stack * CH, z + d / 2, 1);
    reserve(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  // ── 외벽
  const wh = 3.2, wt = 0.5, sx = YB.x1 - YB.x0, sz = YB.z1 - YB.z0;
  put('concrete', box(sx + 2 * wt, wh, wt, 3), 0, wh / 2, YB.z0 - wt / 2);
  put('concrete', box(sx + 2 * wt, wh, wt, 3), 0, wh / 2, YB.z1 + wt / 2);
  put('concrete', box(wt, wh, sz, 3), YB.x0 - wt / 2, wh / 2, 0);
  for (const zc of [-22.5, 22.5]) put('concrete', box(wt, wh, 19, 3), YB.x1 + wt / 2, wh / 2, zc);
  colBox(0, wh / 2, YB.z0 - wt / 2, sx + 2 * wt, wh, wt);
  colBox(0, wh / 2, YB.z1 + wt / 2, sx + 2 * wt, wh, wt);
  colBox(YB.x0 - wt / 2, wh / 2, 0, wt, wh, sz);
  for (const zc of [-22.5, 22.5]) colBox(YB.x1 + wt / 2, wh / 2, zc, wt, wh, 19);
  for (let x = YB.x0 + 3.5; x < YB.x1; x += 7) {
    put('concrete', box(0.55, wh + 0.16, 0.22, 3), x, (wh + 0.16) / 2, YB.z0 + 0.1);
    put('concrete', box(0.55, wh + 0.16, 0.22, 3), x, (wh + 0.16) / 2, YB.z1 - 0.1);
  }
  for (let z = YB.z0 + 4; z < YB.z1; z += 7) {
    put('concrete', box(0.22, wh + 0.16, 0.55, 3), YB.x0 + 0.1, (wh + 0.16) / 2, z);
    if (Math.abs(z) > 13.5) put('concrete', box(0.22, wh + 0.16, 0.55, 3), YB.x1 - 0.1, (wh + 0.16) / 2, z);
  }

  // ── 캐노피 (남서쪽 적치장)
  const colC = C(0x4a4f55);
  for (const x of [-36.6, -30, -23.4]) {
    for (const z of [20.4, 29.1]) {
      put('steel', new THREE.BoxGeometry(0.25, 4.6, 0.25), x, 2.3, z, 0, colC);
      colBox(x, 2.3, z, 0.25, 4.6, 0.25, 1);
    }
  }
  put('container', box(14.6, 0.14, 10.2, 2.2, 2.2), -30, 4.72, 24.75, 0, C(0x8d9296));
  colBox(-30, 4.72, 24.75, 14.6, 0.14, 10.2, 1);
  put('steel', new THREE.BoxGeometry(14.2, 0.26, 0.18), -30, 4.5, 20.4, 0, colC);
  put('steel', new THREE.BoxGeometry(14.2, 0.26, 0.18), -30, 4.5, 29.1, 0, colC);
  for (const x of [-36.6, -30, -23.4]) put('steel', new THREE.BoxGeometry(0.18, 0.26, 8.7), x, 4.5, 24.75, 0, colC);
  reserve(-37.5, 19.5, -22.5, 30);
  const crate = (x, z, s, y0 = 0) => {
    put('wood', box(s, s, s, s), x, y0 + s / 2, z);
    colBox(x, y0 + s / 2, z, s, s, s, 2);
  };
  const pallet = (x, z, n) => {
    for (let k = 0; k < n; k++) {
      put('wood', box(1.2, 0.14, 1.0, 1.2), x, 0.07 + k * 0.15, z);
    }
    colBox(x, n * 0.075, z, 1.2, n * 0.15, 1.0, 2);
  };
  crate(-33.4, 26.4, 1.2); crate(-32.1, 26.5, 1.0); crate(-33.3, 26.4, 1.0, 1.2);
  crate(-27.2, 22.6, 1.2); crate(-27.2, 23.9, 1.2);
  pallet(-30.2, 27.6, 4); pallet(-25, 27, 2);

  // ── 관리동 (남동쪽)
  const bx = 33, bz = 25.2, bw = 9, bd = 7, bh = 3.6;
  put('concrete', box(bw, bh, bd, 3), bx, bh / 2, bz);
  colBox(bx, bh / 2, bz, bw, bh, bd, 0);
  put('concrete', box(bw + 0.6, 0.2, bd + 0.6, 3), bx, bh + 0.1, bz);
  put('steel', new THREE.BoxGeometry(0.06, 2.1, 1.0), bx - bw / 2 - 0.02, 1.05, bz + 1.6, 0, C(0x2b3138));
  for (const dx of [-2.6, 0, 2.6]) {
    put('steel', new THREE.BoxGeometry(1.66, 1.16, 0.04), bx + dx, 2.0, bz - bd / 2 - 0.012, 0, C(0x30353a));
    put('glass', new THREE.BoxGeometry(1.5, 1.0, 0.05), bx + dx, 2.0, bz - bd / 2 - 0.02);
  }
  put('steel', new THREE.BoxGeometry(0.04, 1.16, 1.56), bx - bw / 2 - 0.012, 2.0, bz - 1.4, 0, C(0x30353a));
  put('glass', new THREE.BoxGeometry(0.05, 1.0, 1.4), bx - bw / 2 - 0.02, 2.0, bz - 1.4);
  put('steel', new THREE.BoxGeometry(1.2, 0.7, 0.8), bx + 2, bh + 0.55, bz + 1, 0, C(0x8a8f94));
  reserve(bx - bw / 2 - 0.8, bz - bd / 2 - 0.8, bx + bw / 2, bz + bd / 2);

  // ── 갠트리 크레인
  const crC = C(0xc79a12);
  for (const [x, z] of [[5, -6], [5, 9], [27, -6], [27, 9]]) {
    put('steel', new THREE.BoxGeometry(0.7, 13, 0.7), x, 6.5, z, 0, crC);
    colBox(x, 6.5, z, 0.7, 13, 0.7, 1);
    reserve(x - 1, z - 1, x + 1, z + 1);
  }
  for (const z of [-6, 9]) put('steel', new THREE.BoxGeometry(23.4, 1.0, 0.8), 16, 13.5, z, 0, crC);
  for (const x of [5, 27]) put('steel', new THREE.BoxGeometry(0.8, 1.0, 15.8), x, 13.5, 1.5, 0, crC);
  for (const x of [20.9, 23.1]) put('steel', new THREE.BoxGeometry(0.4, 0.5, 15.8), x, 14.2, 1.5, 0, crC);
  put('steel', new THREE.BoxGeometry(2.6, 0.9, 2.4), 22, 13.5, 3, 0, C(0x3a3f45));
  for (const dx of [-2.6, 2.6]) for (const dz of [-0.9, 0.9]) put('steel', new THREE.BoxGeometry(0.04, 5.4, 0.04), 22 + dx, 10.4, 3 + dz, 0, C(0x1c1d1f));
  put('steel', new THREE.BoxGeometry(6.1, 0.25, 2.5), 22, 7.6, 3, 0, C(0xb03a1e));
  put('steel', new THREE.BoxGeometry(1.6, 1.8, 1.6), 26.1, 12.1, 7.8, 0, C(0xd8d4c6));

  // ── 조명탑
  const poleC = C(0x55595e);
  for (const [x, z, dx, dz] of [[-40.5, -30.5, 1, 1], [40.5, -30.5, -1, 1], [-40.5, 30.5, 1, -1], [40.5, 30.5, -1, -1], [0, -31, 0, 1], [-41, 0, 1, 0], [41, 0, -1, 0]]) {
    put('steel', new THREE.CylinderGeometry(0.08, 0.12, 9, 8), x, 4.5, z, 0, poleC);
    const l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    put('steel', new THREE.BoxGeometry(Math.abs(ux) * 1.6 + 0.08, 0.08, Math.abs(uz) * 1.6 + 0.08), x + ux * 0.8, 8.95, z + uz * 0.8, 0, poleC);
    put('steel', new THREE.BoxGeometry(0.5, 0.12, 0.5), x + ux * 1.6, 8.9, z + uz * 1.6, 0, C(0xdedbd0));
    colBox(x, 4.5, z, 0.24, 9, 0.24, 1);
    reserve(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
  }

  // ── 무작위 엄폐물 (시드 고정)
  for (let i = 0; i < 15; i++) {
    const rot = r() < 0.5, p = place(rot ? 0.6 : 2.4, rot ? 2.4 : 0.6, 1.6);
    if (!p) continue;
    put('concrete', barrierGeo(2.4), p.x, 0.425, p.z, rot ? Math.PI / 2 : 0);
    colBox(p.x, 0.425, p.z, rot ? 0.6 : 2.4, 0.85, rot ? 2.4 : 0.6, 0);
  }
  for (let i = 0; i < 14; i++) {
    const p = place(2.5, 1.3, 1.6);
    if (!p) continue;
    crate(p.x - 0.62, p.z, 1.2);
    crate(p.x + 0.6, p.z + 0.05, 1.0);
    if (r() < 0.45) crate(p.x - 0.6, p.z, 1.0, 1.2);
  }
  const barC = [0x1d3f6e, 0x8a1c14, 0x4d5a2a, 0x2a2c2e].map(C);
  for (let i = 0; i < 11; i++) {
    const p = place(1.4, 1.4, 1.5);
    if (!p) continue;
    const n = 1 + ((r() * 3) | 0), offs = [[-0.32, -0.3], [0.33, -0.25], [0, 0.34]];
    for (let k = 0; k < n; k++) {
      const x = p.x + offs[k][0], z = p.z + offs[k][1], c = barC[(r() * barC.length) | 0];
      put('steel', new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), x, 0.44, z, 0, c);
      put('steel', new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), x, 0.29, z, 0, c);
      put('steel', new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), x, 0.6, z, 0, c);
      colBox(x, 0.44, z, 0.56, 0.88, 0.56, 1);
    }
  }
  for (let i = 0; i < 6; i++) {
    const p = place(1.3, 1.1, 1.4);
    if (p) pallet(p.x, p.z, 1 + ((r() * 3) | 0));
  }

  // ── 담장 밖 원경: 컨테이너 적치와 대형 크레인
  for (let i = 0; i < 70; i++) {
    const side = (r() * 4) | 0, off = 8 + r() * 95, along = (r() - 0.5) * 280;
    let x, z;
    if (side === 0) { z = YB.z0 - off; x = along; }
    else if (side === 1) { z = YB.z1 + off; x = along; }
    else if (side === 2) { x = YB.x0 - off; z = along; }
    else { x = YB.x1 + off; z = along; }
    const st = 2 + ((r() * 3) | 0), rot = r() < 0.5, n = 1 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const col = palette[(r() * palette.length) | 0];
      const px = x + (rot ? 0 : k * (CL + 0.2)), pz = z + (rot ? k * (CL + 0.2) : 0);
      if (px > 36 && px < 76 && Math.abs(pz) < 23) continue; // 창고 자리
      put('container', box(CL, CH * st, CW, 2.2, CH), px, (CH * st) / 2, pz, rot ? Math.PI / 2 : 0, col);
    }
  }
  const farC = C(0x9c3b22);
  for (const [x, z, h] of [[-70, -150, 48], [30, -175, 54], [120, -140, 46], [-150, -40, 50]]) {
    for (const dx of [-11, 11]) for (const dz of [-8, 8]) put('steel', new THREE.BoxGeometry(2.4, h, 2.4), x + dx, h / 2, z + dz, 0, farC);
    put('steel', new THREE.BoxGeometry(26, 3.5, 20), x, h, z, 0, farC);
    put('steel', new THREE.BoxGeometry(4, 3, 95), x, h + 3.5, z + 20, 0, farC);
    put('steel', new THREE.BoxGeometry(2, 16, 2), x, h + 10, z - 4, 0, farC);
  }

  // ── 바닥 도색선
  const line = (x0, z0, x1, z1, w = 0.15) => {
    const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len, w), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 1.6);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, 0.016, (z0 + z1) / 2);
    L.paint.push(g);
  };
  for (const z of [-17.6, -17.2, 8.2, 8.6, 20]) line(-41, z, 41, z);
  for (const x of [-13.2, 9.4]) line(x, -31, x, 31);
  for (let x = -38; x <= 38; x += 6.6) line(x, 20, x, 23.2, 0.12);
  for (let k = 0; k < 7; k++) line(27 + k * 0.9, 19.2, 26 + k * 0.9, 20.9, 0.2);

  // ── 물웅덩이
  for (const [x, z, s] of [[3, 25.2, 5], [-12, 18.5, 6.5], [10, -5.5, 7], [-22, -6, 5], [18, 10.5, 6], [30, -15.5, 5.5], [-30, 7, 4.5], [-4, -16, 6.5], [23, 24, 4.2], [-6, 8.5, 3.6]]) {
    const g = new THREE.PlaneGeometry(s, s * (0.6 + r() * 0.4));
    g.rotateX(-Math.PI / 2);
    g.rotateY(r() * 6.28);
    g.translate(x, 0.022, z);
    L.puddle.push(g);
  }

  // ── 창고 (동쪽 확장 구역): 트럭 출입구 2개와 쪽문, 서쪽 벽을 따라 2층 발판과 창, 양 끝 계단, 랙 통로
  {
    const { x0: wx0, x1: wx1, z0: wz0, z1: wz1, deckX, deckY, h: H } = WH;
    const WT = 0.5, sideC = C(0x8f989c), roofC = C(0x7d8589), frameC = C(0x3c4248), deckC = C(0x4b5157), railC = C(0xc9a227);
    const wallX = (z0, z1, y0, y1) => {
      put('concrete', box(WT, y1 - y0, z1 - z0, 3), 42.25, (y0 + y1) / 2, (z0 + z1) / 2);
      addCol(42, y0, z0, 42.5, y1, z1, 0);
    };
    wallX(-13.4, -10, 0, 3.3); wallX(-6, 2.3, 0, 3.3); wallX(3.7, 6, 0, 3.3); wallX(10, 13.4, 0, 3.3);
    wallX(2.3, 3.7, 2.2, 3.3);
    wallX(-13.4, 13.4, 3.3, 4.5);
    let zc = -13.4;
    for (const [a, b] of [[-10.5, -7.5], [-4.5, -1.5], [1.5, 4.5], [7.5, 10.5]]) {
      wallX(zc, a, 4.5, 5.9);
      zc = b;
      put('steel', new THREE.BoxGeometry(0.62, 0.06, b - a), 42.25, 4.5, (a + b) / 2, 0, frameC);
      put('steel', new THREE.BoxGeometry(0.62, 0.06, b - a), 42.25, 5.9, (a + b) / 2, 0, frameC);
    }
    wallX(zc, 13.4, 4.5, 5.9);
    wallX(-13.4, 13.4, 5.9, H);
    for (const [a, b] of [[-10, -6], [6, 10]]) {
      put('steel', new THREE.BoxGeometry(0.6, 0.2, b - a + 0.3), 42.25, 3.4, (a + b) / 2, 0, C(0xb8891a));
      for (const z of [a, b]) put('steel', new THREE.BoxGeometry(0.6, 3.3, 0.14), 42.25, 1.65, z, 0, C(0xb8891a));
    }
    put('steel', new THREE.BoxGeometry(0.04, 0.5, 26.6), 41.985, 4.0, 0, 0, C(0x1f4e79));
    const wall = (cx, cz, w, d) => {
      put('concrete', box(w, 1.2, d, 3), cx, 0.6, cz);
      put('container', box(w, H - 1.2, d, 2.2, H - 1.2), cx, 1.2 + (H - 1.2) / 2, cz, 0, sideC);
      colBox(cx, H / 2, cz, w, H, d, 1);
    };
    wall(54.45, -13.2, 23.9, 0.4);
    wall(54.45, 13.2, 23.9, 0.4);
    wall(66.2, 0, 0.4, 26);
    const roof = (xa, xb, za, zb) => {
      put('container', box(xb - xa, 0.16, zb - za, 2.2, 2.2), (xa + xb) / 2, H + 0.08, (za + zb) / 2, 0, roofC);
      addCol(xa, H, za, xb, H + 0.16, zb, 1);
    };
    roof(41.8, 53, -13.6, 13.6); roof(54.6, 59, -13.6, 13.6); roof(60.6, 66.6, -13.6, 13.6);
    for (const [xa, xb] of [[53, 54.6], [59, 60.6]]) { roof(xa, xb, -13.6, -9); roof(xa, xb, 9, 13.6); }
    for (const z of [-8.7, -4.35, 0, 4.35, 8.7]) put('steel', new THREE.BoxGeometry(23.4, 0.3, 0.16), 54.25, H - 0.2, z, 0, frameC);
    for (const z of [-13, 13]) for (const x of [48.5, 54.4, 60.3]) put('steel', new THREE.BoxGeometry(0.24, H, 0.24), x, H / 2, z * 0.992, 0, frameC);
    // 바닥 슬래브와 통로선
    {
      const g = new THREE.PlaneGeometry(wx1 - wx0, wz1 - wz0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (wx1 - wx0)) / 3, (uv.getY(i) * (wz1 - wz0)) / 3);
      g.rotateX(-Math.PI / 2);
      g.translate((wx0 + wx1) / 2, 0.004, 0);
      L.floor.push(g);
    }
    line(49.5, -12.6, 49.5, 12.6); line(52.4, -11.2, 52.4, 11.2);
    for (const z of [-10, -6, 6, 10]) line(42.6, z, 49.5, z, 0.12);
    // 2층 발판, 기둥, 난간(탄은 통과)
    put('steel', new THREE.BoxGeometry(deckX - wx0, 0.2, wz1 - wz0), (wx0 + deckX) / 2, deckY - 0.1, 0, 0, deckC);
    addCol(wx0, deckY - 0.2, wz0, deckX, deckY, wz1, 1);
    for (const z of [-11.6, -5, -1.2, 5, 11.6]) {
      put('steel', new THREE.BoxGeometry(0.22, deckY - 0.2, 0.22), deckX - 0.16, (deckY - 0.2) / 2, z, 0, frameC);
      colBox(deckX - 0.16, (deckY - 0.2) / 2, z, 0.22, deckY - 0.2, 0.22, 1);
    }
    for (let z = -11.5; z <= 11.51; z += 23 / 15) put('steel', new THREE.BoxGeometry(0.05, 1.05, 0.05), deckX - 0.05, deckY + 0.525, z, 0, railC);
    for (const y of [0.55, 1.05]) put('steel', new THREE.BoxGeometry(0.05, 0.05, 23), deckX - 0.05, deckY + y, 0, 0, railC);
    addCol(deckX - 0.1, deckY, -11.55, deckX, deckY + 1.05, 11.55, 1, true);
    // 계단 (양 끝 벽을 따라 동쪽으로 내려감)
    const NS = 17, rise = deckY / NS, run = 0.42;
    for (const sgn of [-1, 1]) {
      const sz0 = sgn * 12.3;
      for (let k = 1; k < NS; k++) {
        const xa = deckX + (NS - 1 - k) * run, top = k * rise;
        put('concrete', box(run, top, 1.2, 3), xa + run / 2, top / 2, sz0);
        addCol(xa, 0, sz0 - 0.6, xa + run, top, sz0 + 0.6, 0);
        colliders[colliders.length - 1].noao = true;
      }
      const len = Math.hypot((NS - 1) * run, (NS - 1) * rise), rail = new THREE.BoxGeometry(len, 0.05, 0.05);
      rail.rotateZ(-Math.atan2(rise, run));
      put('steel', rail, deckX + ((NS - 1) * run) / 2, deckY / 2 + 0.95, sz0 - sgn * 0.58, 0, railC);
      for (const k of [2, 6, 10, 14]) put('steel', new THREE.BoxGeometry(0.05, 1.0, 0.05), deckX + (NS - 1 - k) * run + run / 2, k * rise + 0.5, sz0 - sgn * 0.58, 0, railC);
      const ag = new THREE.PlaneGeometry((NS - 1) * run + 0.7, 1.9);
      ag.rotateX(-Math.PI / 2);
      ag.translate(deckX + ((NS - 1) * run) / 2, 0.011, sz0);
      L.ao.push(ag);
    }
    // 팔레트 랙
    const rackC = C(0x23508a), beamC = C(0xc4661a), loadC = [0x8a6f4d, 0x6f7f8c, 0x9a8c6a, 0x4f5d6b].map(C);
    const rack = (x, za, zb) => {
      const len = zb - za, bays = Math.round(len / 2.7), bl = len / bays;
      for (let b = 0; b <= bays; b++) for (const dx of [-0.5, 0.5]) put('steel', new THREE.BoxGeometry(0.09, 4.4, 0.09), x + dx, 2.2, za + b * bl, 0, rackC);
      for (const y of [1.55, 3.0]) for (const dx of [-0.5, 0.5]) put('steel', new THREE.BoxGeometry(0.06, 0.12, len), x + dx, y, (za + zb) / 2, 0, beamC);
      for (let b = 0; b < bays; b++) {
        for (const y of [0.0, 1.62, 3.07]) {
          const w = 0.9 + r() * 0.15, hh = 0.95 + r() * 0.35, d = bl - 0.3 - r() * 0.35, zz = za + (b + 0.5) * bl;
          if (r() < 0.6) put('wood', box(w, hh, d, 1.2), x, y + 0.14 + hh / 2, zz);
          else put('steel', new THREE.BoxGeometry(w, hh, d), x, y + 0.14 + hh / 2, zz, 0, loadC[(r() * loadC.length) | 0]);
          put('wood', box(1.0, 0.13, d + 0.1, 1.2), x, y + 0.07, zz);
        }
      }
      colBox(x, 2.2, (za + zb) / 2, 1.1, 4.4, len, 1);
    };
    for (const x of [53.6, 58.2, 62.8]) { rack(x, -9.6, -1.5); rack(x, 1.5, 9.6); }
    // 지게차
    {
      const x = 50.9, z = 4.4, yel = C(0xd9a514), dark = C(0x1c1e21);
      put('steel', new THREE.BoxGeometry(1.9, 0.75, 1.15), x + 0.35, 0.62, z, 0, yel);
      put('steel', new THREE.BoxGeometry(0.7, 0.5, 1.15), x + 0.95, 1.2, z, 0, yel);
      for (const dz of [-0.45, 0.45]) {
        put('steel', new THREE.BoxGeometry(0.08, 2.9, 0.1), x - 0.68, 1.5, z + dz, 0, dark);
        put('steel', new THREE.BoxGeometry(1.1, 0.06, 0.12), x - 1.25, 0.1, z + dz * 0.6, 0, dark);
      }
      put('steel', new THREE.BoxGeometry(0.08, 0.1, 1.0), x - 0.68, 2.9, z, 0, dark);
      put('steel', new THREE.BoxGeometry(0.1, 0.6, 1.0), x - 0.72, 0.5, z, 0, dark);
      for (const dx of [-0.45, 0.75]) for (const dz of [-0.5, 0.5]) put('steel', new THREE.BoxGeometry(0.06, 1.25, 0.06), x + dx, 1.62, z + dz, 0, dark);
      put('steel', new THREE.BoxGeometry(1.35, 0.06, 1.12), x + 0.15, 2.26, z, 0, dark);
      put('steel', new THREE.BoxGeometry(0.5, 0.5, 0.5), x + 0.3, 1.15, z, 0, dark);
      for (const dx of [-0.35, 0.95]) for (const dz of [-0.6, 0.6]) {
        const g = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14);
        g.rotateX(Math.PI / 2);
        put('steel', g, x + dx, 0.3, z + dz, 0, dark);
      }
      colBox(x + 0.2, 1.15, z, 2.3, 2.3, 1.3, 1);
    }
    // 흩어진 상자
    crate(43.6, -2.0, 1.2); crate(43.6, -0.7, 1.2); crate(43.7, -1.4, 1.0, 1.2); pallet(45.7, 0.5, 3);
    crate(44.2, 11.9, 1.2); crate(44.2, -12.0, 1.2); crate(45.5, -12.1, 1.0);
    crate(51.2, -6.4, 1.2); crate(51.3, -5.1, 1.0); crate(64.9, -11.2, 1.2); crate(64.9, 11.3, 1.2); pallet(64.9, 0, 5);
    crate(47.3, -5.8, 1.0, deckY); crate(47.2, 5.6, 1.2, deckY); crate(43.3, 12.2, 1.0, deckY);
    // 조명: 천장 등기구와 바닥 빛웅덩이(가짜 조명)
    for (const x of [51, 56.8, 62.6]) {
      for (const z of [-8.6, 0, 8.6]) {
        put('steel', new THREE.BoxGeometry(0.03, 1.1, 0.03), x, H - 0.55, z, 0, frameC);
        put('steel', new THREE.CylinderGeometry(0.16, 0.34, 0.26, 12), x, H - 1.2, z, 0, frameC);
        const d = new THREE.CircleGeometry(0.3, 12);
        d.rotateX(Math.PI / 2);
        d.translate(x, H - 1.335, z);
        L.lamp.push(d);
        const g = new THREE.PlaneGeometry(8, 8);
        g.rotateX(-Math.PI / 2);
        g.translate(x, 0.03, z);
        L.glow.push(g);
      }
    }
    for (const z of [-8, -3.2, 3.2, 8]) {
      const d = new THREE.BoxGeometry(0.12, 0.04, 1.3);
      d.translate(45.5, deckY - 0.24, z);
      L.lamp.push(d);
      const g = new THREE.PlaneGeometry(5, 5);
      g.rotateX(-Math.PI / 2);
      g.translate(45.5, 0.03, z);
      L.glow.push(g);
    }
  }

  // ── 접지 그림자: 바닥에 놓인 충돌체 둘레
  for (const c of colliders) {
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    if (c.noao || c.y0 > 0.01 || c.y1 < 0.3 || (w < 0.4 && d < 0.4)) continue;
    const m = Math.min(0.45, 0.18 + Math.min(c.y1, 2.6) * 0.11), g = new THREE.PlaneGeometry(w + m * 2, d + m * 2);
    g.rotateX(-Math.PI / 2);
    g.translate((c.x0 + c.x1) / 2, 0.011, (c.z0 + c.z1) / 2);
    L.ao.push(g);
  }

  const add = (list, mat, cast = true, order = 0) => {
    if (!L[list].length) return null;
    const g = mergeGeometries(L[list], false);
    if (!g) throw new Error('merge failed: ' + list);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    m.renderOrder = order;
    scene.add(m);
    return m;
  };
  add('concrete', M.concrete);
  add('container', M.container);
  add('steel', M.steel);
  add('wood', M.wood);
  add('glass', M.glass, false);
  add('floor', M.floor, false, 0.2);
  add('lamp', M.lamp, false);
  add('glow', M.glow, false, 3);
  add('ao', M.ao, false, 0.5);
  add('marks', M.marks, false, 1);
  add('paint', M.paint, false, 1);
  add('puddle', M.puddle, false, 2);
}

// ───────────────────────── 레이캐스트
export const hit = { t: 0, nx: 0, ny: 0, nz: 0, m: 0 };

export function rayWorld(ox, oy, oz, dx, dy, dz, maxT, ground = true) {
  let best = maxT, found = false, bax = 0, bsg = 0, bm = 0;
  if (ground && dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < best) { best = t; found = true; bax = 1; bsg = 1; bm = 0; }
  }
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  for (let k = 0, n = colliders.length; k < n; k++) {
    const c = colliders[k];
    if (c.nr) continue;
    let t1 = (c.x0 - ox) * ix, t2 = (c.x1 - ox) * ix, sg = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sg = 1; }
    let tmin = t1, tmax = t2, ax = 0, sign = sg;
    if (tmin > best) continue;
    t1 = (c.y0 - oy) * iy; t2 = (c.y1 - oy) * iy; sg = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sg = 1; }
    if (t1 > tmin) { tmin = t1; ax = 1; sign = sg; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) continue;
    t1 = (c.z0 - oz) * iz; t2 = (c.z1 - oz) * iz; sg = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sg = 1; }
    if (t1 > tmin) { tmin = t1; ax = 2; sign = sg; }
    if (t2 < tmax) tmax = t2;
    if (tmax >= tmin && tmin > 0 && tmin < best) { best = tmin; found = true; bax = ax; bsg = sign; bm = c.m; }
  }
  if (found) {
    hit.t = best;
    hit.nx = bax === 0 ? bsg : 0;
    hit.ny = bax === 1 ? bsg : 0;
    hit.nz = bax === 2 ? bsg : 0;
    hit.m = bm;
  }
  return found;
}

export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 0.2) return true;
  return !rayWorld(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, false);
}

// ───────────────────────── 캐릭터 이동 충돌 (축별 해결 + 낮은 턱 오르기)
export function collideMove(p, v, dt, r, h, st) {
  const STEP = 0.36, E = 0.001, n = colliders.length;
  let nx = p.x + v.x * dt;
  for (let k = 0; k < n; k++) {
    const c = colliders[k];
    if (p.y >= c.y1 - E || p.y + h <= c.y0) continue;
    if (c.y1 - p.y <= STEP) continue; // 낮은 턱은 걸어 오르고, 점프 중에는 모서리를 짚고 올라선다
    if (p.z + r <= c.z0 || p.z - r >= c.z1) continue;
    if (nx + r > c.x0 && nx - r < c.x1) {
      if (p.x <= c.x0) { nx = c.x0 - r - E; v.x = 0; }
      else if (p.x >= c.x1) { nx = c.x1 + r + E; v.x = 0; }
    }
  }
  p.x = nx;
  let nz = p.z + v.z * dt;
  for (let k = 0; k < n; k++) {
    const c = colliders[k];
    if (p.y >= c.y1 - E || p.y + h <= c.y0) continue;
    if (c.y1 - p.y <= STEP) continue; // 낮은 턱은 걸어 오르고, 점프 중에는 모서리를 짚고 올라선다
    if (p.x + r <= c.x0 || p.x - r >= c.x1) continue;
    if (nz + r > c.z0 && nz - r < c.z1) {
      if (p.z <= c.z0) { nz = c.z0 - r - E; v.z = 0; }
      else if (p.z >= c.z1) { nz = c.z1 + r + E; v.z = 0; }
    }
  }
  p.z = nz;
  let ny = p.y + v.y * dt, grounded = false;
  if (ny <= 0) {
    ny = 0;
    st.gm = 0;
    if (v.y < st.landV) st.landV = v.y;
    v.y = 0;
    grounded = true;
  }
  for (let k = 0; k < n; k++) {
    const c = colliders[k];
    if (p.x + r <= c.x0 || p.x - r >= c.x1 || p.z + r <= c.z0 || p.z - r >= c.z1) continue;
    if (v.y <= 0 && p.y >= c.y1 - STEP - E && ny < c.y1) {
      ny = c.y1;
      st.gm = c.m;
      if (v.y < st.landV) st.landV = v.y;
      v.y = 0;
      grounded = true;
    } else if (v.y > 0 && p.y + h <= c.y0 + E && ny + h > c.y0) {
      ny = c.y0 - h;
      v.y = 0;
    }
  }
  p.y = ny;
  st.grounded = grounded;
}

// 계단·낮은 턱을 내려갈 때 공중에 뜨지 않도록 바로 아래 면에 붙인다
export function snapDown(p, r, maxDrop, st) {
  let best = p.y - maxDrop <= 0 ? 0 : -1, bm = 0;
  for (let k = 0, n = colliders.length; k < n; k++) {
    const c = colliders[k];
    if (p.x + r <= c.x0 || p.x - r >= c.x1 || p.z + r <= c.z0 || p.z - r >= c.z1) continue;
    if (c.y1 <= p.y + 0.001 && c.y1 >= p.y - maxDrop && c.y1 > best) { best = c.y1; bm = c.m; }
  }
  if (best < 0) return false;
  p.y = best;
  st.gm = bm;
  return true;
}

// ───────────────────────── 내비게이션 그리드 + A*
export const cellOf = (x, z) => {
  const i = Math.floor(x - B.x0), j = Math.floor(z - B.z0);
  return i < 0 || j < 0 || i >= NAV.W || j >= NAV.H ? -1 : j * NAV.W + i;
};
export const cellX = (c) => B.x0 + (c % NAV.W) + 0.5;
export const cellZ = (c) => B.z0 + ((c / NAV.W) | 0) + 0.5;
export const blockedAt = (x, z) => {
  const c = cellOf(x, z);
  return c < 0 || NAV.blocked[c] === 1;
};

export function navLineClear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.35);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

let _g, _f, _from, _stamp, _closed, _run = 0;
const heap = [];
function hpush(i) {
  heap.push(i);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (_f[heap[p]] <= _f[heap[k]]) break;
    const s = heap[p]; heap[p] = heap[k]; heap[k] = s;
    k = p;
  }
}
function hpop() {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let k = 0;
    for (;;) {
      const l = k * 2 + 1, r = l + 1;
      let m = k;
      if (l < heap.length && _f[heap[l]] < _f[heap[m]]) m = l;
      if (r < heap.length && _f[heap[r]] < _f[heap[m]]) m = r;
      if (m === k) break;
      const s = heap[m]; heap[m] = heap[k]; heap[k] = s;
      k = m;
    }
  }
  return top;
}

export function buildNav() {
  const { W, H } = NAV, N = W * H, b = new Uint8Array(N), R = 0.42;
  for (const c of colliders) {
    if (c.y1 < 0.4 || c.y0 > 1.7) continue;
    const i0 = Math.max(0, Math.ceil(c.x0 - R - B.x0 - 0.5)), i1 = Math.min(W - 1, Math.floor(c.x1 + R - B.x0 - 0.5));
    const j0 = Math.max(0, Math.ceil(c.z0 - R - B.z0 - 0.5)), j1 = Math.min(H - 1, Math.floor(c.z1 + R - B.z0 - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b[j * W + i] = 1;
  }
  NAV.blocked = b;
  // 시작 지점에서 닿을 수 없는 칸은 막힌 것으로 처리
  const reach = new Uint8Array(N), stack = [];
  let s = cellOf(START.x, START.z);
  if (b[s]) s = nearestFree(s);
  reach[s] = 1;
  stack.push(s);
  while (stack.length) {
    const c = stack.pop(), ci = c % W, cj = (c / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nn = nj * W + ni;
      if (b[nn] || reach[nn]) continue;
      reach[nn] = 1;
      stack.push(nn);
    }
  }
  NAV.free.length = 0;
  for (let i = 0; i < N; i++) {
    if (!reach[i]) b[i] = 1;
    else NAV.free.push(i);
  }
  _g = new Float32Array(N);
  _f = new Float32Array(N);
  _from = new Int32Array(N);
  _stamp = new Uint32Array(N);
  _closed = new Uint32Array(N);
}

function nearestFree(c) {
  const { W, H, blocked } = NAV, ci = c % W, cj = (c / W) | 0;
  for (let rad = 1; rad <= 6; rad++) {
    for (let dj = -rad; dj <= rad; dj++) {
      for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        if (!blocked[j * W + i]) return j * W + i;
      }
    }
  }
  return -1;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

export function findPath(sx, sz, tx, tz) {
  const { W, H, blocked } = NAV;
  let s = cellOf(sx, sz), t = cellOf(tx, tz);
  if (s < 0 || t < 0) return null;
  if (blocked[s]) s = nearestFree(s);
  if (blocked[t]) t = nearestFree(t);
  if (s < 0 || t < 0) return null;
  if (s === t) return [{ x: cellX(t), z: cellZ(t) }];
  const ti = t % W, tj = (t / W) | 0;
  const hfn = (c) => {
    const dx = Math.abs((c % W) - ti), dz = Math.abs(((c / W) | 0) - tj);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  _run++;
  heap.length = 0;
  _g[s] = 0;
  _f[s] = hfn(s);
  _from[s] = -1;
  _stamp[s] = _run;
  hpush(s);
  let found = false;
  while (heap.length) {
    const c = hpop();
    if (c === t) { found = true; break; }
    if (_closed[c] === _run) continue;
    _closed[c] = _run;
    const ci = c % W, cj = (c / W) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0], dz = DIRS[k][1], ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nn = nj * W + ni;
      if (blocked[nn] || _closed[nn] === _run) continue;
      if (dx && dz && (blocked[cj * W + ni] || blocked[nj * W + ci])) continue;
      const ng = _g[c] + DIRS[k][2];
      if (_stamp[nn] !== _run || ng < _g[nn]) {
        _g[nn] = ng;
        _f[nn] = ng + hfn(nn);
        _from[nn] = c;
        _stamp[nn] = _run;
        hpush(nn);
      }
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = t; c !== -1; c = _from[c]) path.push({ x: cellX(c), z: cellZ(c) });
  path.reverse();
  return path;
}

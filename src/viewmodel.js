// 1인칭 총기 모델 4종 (돌격소총·지정사수 소총·산탄총·권총), 장갑 낀 손과 팔 포함. 총구는 -Z 방향.
// 옆모습 윤곽을 폭 방향으로 돌출하고 모서리를 깎아(bevel) 상자 조합보다 실물에 가까운 형태를 만든다.
// v0.11: 재질에 질감(긁힌 금속, 사출 무늬, 나뭇결)을 입히고 색을 실물의 마감에 맞췄다. 부품을 늘렸다(조준기, 조정간, 핀, 장전 손잡이, 소염기, 방열판, 예비탄 등).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Yup = V(0, 1, 0);
const NI = (g) => (g.index ? g.toNonIndexed() : g);

function bx(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
// z축 원통. r = 앞쪽(-z) 반지름, r2 = 뒤쪽 반지름
function cylZ(r, z0, z1, y = 0, x = 0, seg = 16, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, Math.abs(z1 - z0), seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}
// x축 원통(핀·손잡이·노브). 중심 (x, y, z), 길이 len
function cylX(r, len, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
// y축 원통
function cylY(r, len, x, y, z, seg = 12, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.translate(x, y, z);
  return g;
}
function cylBetween(a, b, r1, r2, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yup, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// 손가락용 캡슐. axis: 'x' | 'y' | 'z'
function cap(r, len, x, y, z, axis = 'y') {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
// 옆모습 윤곽 [[u(앞쪽 +), v(위 +)], ...] 을 폭 w 로 돌출
function prof(pts, w, bevel = 0.0025, holes = null, x = 0) {
  const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const depth = Math.max(0.0005, w - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, steps: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2); // u → -z, 폭 → x
  if (x) g.translate(x, 0, 0);
  return g;
}
function rrect(P, w, h, r) {
  const x = -w / 2, y = -h / 2;
  P.moveTo(x + r, y);
  P.lineTo(x + w - r, y);
  P.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  P.lineTo(x + w, y + h - r);
  P.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  P.lineTo(x + r, y + h);
  P.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  P.lineTo(x, y + r);
  P.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return P;
}
// 모서리가 둥근 사각 단면을 z 방향으로 돌출 (wall > 0 이면 속이 빈 관)
function tubeZ(w, h, r, z0, z1, y, wall = 0) {
  const s = rrect(new THREE.Shape(), w, h, r);
  if (wall > 0) s.holes.push(rrect(new THREE.Path(), w - wall * 2, h - wall * 2, Math.max(0.0015, r - wall)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 5 });
  g.translate(0, y, Math.min(z0, z1));
  return g;
}
// 총열 축(중심 높이 cy)을 따라 ang만큼 돌려 붙이는 작은 상자: 총열 덮개의 비스듬한 면에 난 홈
function bxAround(w, h, d, rad0, ang, cy, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, rad0, 0);
  g.rotateZ(ang);
  g.translate(0, cy, z);
  return g;
}
// 상자 투영 UV: 면이 향한 쪽에 따라 위치를 그대로 UV로 쓴다. 부품의 크기와 상관없이 질감의 크기가 같아지고, 결은 총열 방향(z)으로 흐른다
function boxUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getZ(i); v = p.getX(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 총기 재질용 질감(캔버스에 그린다): 긁힌 금속의 색·거칠기, 사출 플라스틱의 색·돌기, 나뭇결
function gunTextures() {
  let seed = 20261120;
  const R = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mk = (S, srgb, draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d'), S);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // 가장자리에서 무늬가 이어지도록 아홉 번 겹쳐 그린다
  const tile = (x, S, fn) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { x.save(); x.translate(i * S, j * S); fn(); x.restore(); } };
  const speck = (x, S, n, lo, hi, a) => { for (let i = 0; i < n; i++) { const g = (lo + R() * (hi - lo)) | 0; x.fillStyle = `rgba(${g},${g},${g},${a})`; x.fillRect(R() * S, R() * S, 1 + R() * 1.5, 1 + R() * 1.5); } };
  const scr = Array.from({ length: 38 }, () => ({ x: R() * 256, y: R() * 256, l: 8 + R() * 72, a: (R() - 0.5) * 0.5 + (R() < 0.18 ? 1.3 : 0), w: 0.4 + R() * 0.9, o: 0.18 + R() * 0.5 }));
  const blot = Array.from({ length: 11 }, () => ({ x: R() * 256, y: R() * 256, r: 14 + R() * 34, o: 0.07 + R() * 0.12 }));
  const marks = (x, blotCol, blotK, scrCol, scrK, dw) => {
    for (const b of blot) {
      const gr = x.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      gr.addColorStop(0, `rgba(${blotCol},${Math.min(1, b.o * blotK)})`);
      gr.addColorStop(1, `rgba(${blotCol},0)`);
      x.fillStyle = gr;
      x.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    x.lineCap = 'round';
    for (const s of scr) {
      x.strokeStyle = `rgba(${scrCol},${Math.min(1, s.o * scrK)})`;
      x.lineWidth = s.w + dw;
      x.beginPath();
      x.moveTo(s.x, s.y);
      x.lineTo(s.x + Math.cos(s.a) * s.l, s.y + Math.sin(s.a) * s.l);
      x.stroke();
    }
  };
  // 금속의 색: 고운 얼룩, 가로 결, 손때(어두운 얼룩), 긁힘(밝은 선)
  const metalA = mk(256, true, (x, S) => {
    x.fillStyle = '#bcbcbc';
    x.fillRect(0, 0, S, S);
    speck(x, S, 2600, 140, 240, 0.22);
    for (let i = 0; i < 70; i++) { const g = R() < 0.5 ? 255 : 70; x.fillStyle = `rgba(${g},${g},${g},0.045)`; x.fillRect(0, R() * S, S, 1 + R() * 2.5); }
    tile(x, S, () => marks(x, '40,40,40', 1, '255,255,255', 1, 0));
  });
  // 금속의 거칠기: 긁힌 자리는 매끈하고(어둡게) 손때 묻은 자리는 거칠다(밝게)
  const metalR = mk(256, false, (x, S) => {
    x.fillStyle = '#a6a6a6';
    x.fillRect(0, 0, S, S);
    speck(x, S, 1800, 120, 210, 0.25);
    tile(x, S, () => marks(x, '235,235,235', 1.6, '28,28,28', 1.5, 0.3));
  });
  // 사출 플라스틱: 고운 알갱이
  const polyA = mk(128, true, (x, S) => {
    x.fillStyle = '#c6c6c6';
    x.fillRect(0, 0, S, S);
    speck(x, S, 2400, 120, 235, 0.3);
  });
  const polyB = mk(128, false, (x, S) => {
    x.fillStyle = '#7c7c7c';
    x.fillRect(0, 0, S, S);
    for (let j = 0; j < S; j += 8) for (let i = 0; i < S; i += 8) { // 돌기
      const cx = i + 4 + (((j / 8) | 0) % 2 ? 4 : 0), cy = j + 4, gr = x.createRadialGradient(cx, cy, 0, cx, cy, 3.4);
      gr.addColorStop(0, 'rgba(235,235,235,0.9)');
      gr.addColorStop(1, 'rgba(235,235,235,0)');
      x.fillStyle = gr;
      x.fillRect(cx - 4, cy - 4, 8, 8);
      if (cx + 4 > S) { x.fillStyle = gr; x.save(); x.translate(-S, 0); x.fillRect(cx - 4, cy - 4, 8, 8); x.restore(); }
    }
  });
  // 나뭇결: 총열 방향으로 길게 흐르는 굽은 선
  const woodA = mk(256, true, (x, S) => {
    x.fillStyle = '#74492a';
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 110; i++) {
      const y0 = R() * S, amp = 2 + R() * 5, ph = R() * 6.283, f = 1 + ((R() * 2) | 0);
      x.strokeStyle = R() < 0.55 ? `rgba(38,20,9,${0.16 + R() * 0.3})` : `rgba(168,112,62,${0.1 + R() * 0.2})`;
      x.lineWidth = 0.6 + R() * 1.8;
      for (const dy of [-S, 0, S]) {
        x.beginPath();
        for (let px = 0; px <= S; px += 8) { const y = y0 + dy + Math.sin((px / S) * 6.283 * f + ph) * amp; if (px) x.lineTo(px, y); else x.moveTo(px, y); }
        x.stroke();
      }
    }
    speck(x, S, 900, 30, 120, 0.12);
  });
  return { metalA, metalR, polyA, polyB, woodA };
}

export function buildViewmodel(T) {
  const X = gunTextures();
  // 하늘 반사의 세기는 재질마다 따로 주지 않는다: 이 three.js(0.170)에서 장면의 환경맵을 쓰는 재질은 재질의 envMapIntensity가 아니라 장면의 environmentIntensity를 따른다(main.js가 해를 마주 볼 때 줄인다)
  const M = {
    // 검은 양극 산화 알루미늄(리시버·레일·총열 덮개)
    metal: new THREE.MeshStandardMaterial({ color: 0x4f535a, map: X.metalA, roughnessMap: X.metalR, bumpMap: X.metalA, bumpScale: 0.25, metalness: 0.5, roughness: 0.74 }),
    // 인산염 피막 강철(총열·노리쇠·슬라이드)
    steel: new THREE.MeshStandardMaterial({ color: 0x5d6168, map: X.metalA, roughnessMap: X.metalR, metalness: 0.85, roughness: 0.6 }),
    // 맨 강철(약실·탄피 배출구 안쪽)
    bare: new THREE.MeshStandardMaterial({ color: 0xa3a7ad, roughnessMap: X.metalR, metalness: 1, roughness: 0.5 }),
    // 흙빛 도장(지정사수 소총의 리시버·총열 덮개)
    fde: new THREE.MeshStandardMaterial({ color: 0xa8946e, map: X.metalA, roughnessMap: X.metalR, bumpMap: X.metalA, bumpScale: 0.25, metalness: 0.15, roughness: 0.82 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x2f3035, map: X.polyA, bumpMap: X.polyB, bumpScale: 0.5, metalness: 0, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ map: X.woodA, bumpMap: X.woodA, bumpScale: 0.2, metalness: 0, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151618, map: X.polyA, metalness: 0, roughness: 0.96 }),
    slot: new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb39a62, roughnessMap: X.metalR, metalness: 1, roughness: 0.55 }),
    hull: new THREE.MeshStandardMaterial({ color: 0x8a2018, map: X.polyA, metalness: 0, roughness: 0.55 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x5a5b47, map: T.blotch, roughness: 0.95 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1f2024, map: X.polyA, bumpMap: X.polyB, bumpScale: 0.35, roughness: 0.82 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x9cc4e4, transparent: true, opacity: 0.07, roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.03, metalness: 1, side: THREE.DoubleSide }), // 코팅된 렌즈: 하늘이 보랏빛으로 비친다
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false, side: THREE.DoubleSide }),
    white: new THREE.MeshBasicMaterial({ color: 0xc9ccc2 }), // 가늠쇠·가늠자의 흰 점
    flash: new THREE.MeshBasicMaterial({ map: T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }),
    halo: new THREE.MeshBasicMaterial({ map: T.soft, color: 0xffb060, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }),
  };
  for (const m of Object.values(M)) { if (m.bumpMap) m.userData.bump = m.bumpMap; if (m.roughnessMap) m.userData.rough = m.roughnessMap; } // 품질에 따라 켜고 끈다(main.js applyQuality)
  const UVS = 9; // 질감 한 장이 덮는 길이 = 1/9 m
  const mesh = (geos, mat) => new THREE.Mesh(boxUV(mergeGeometries(geos.map(NI)), UVS), mat);
  // 총구 화염: 별 모양 판 셋 + 둘레의 부드러운 빛 번짐
  const mkFlash = (size, x, y, z) => {
    const a = new THREE.PlaneGeometry(size, size), b = new THREE.PlaneGeometry(size * 1.5, size * 0.7), c = new THREE.PlaneGeometry(size * 1.5, size * 0.7);
    b.rotateY(Math.PI / 2);
    c.rotateY(Math.PI / 2);
    c.rotateZ(Math.PI / 2);
    b.translate(0, 0, -size * 0.45);
    c.translate(0, 0, -size * 0.45);
    const f = new THREE.Group(), star = new THREE.Mesh(mergeGeometries([a, b, c]), M.flash), halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.9, size * 1.9), M.halo);
    star.renderOrder = 10;
    halo.renderOrder = 9;
    f.add(halo, star);
    f.position.set(x, y, z);
    f.visible = false;
    return f;
  };
  const arm = (wrist, elbow) => [cylBetween(wrist, elbow, 0.034, 0.053)];
  const cuff = (wrist, elbow) => cylBetween(wrist, wrist.clone().lerp(elbow, 0.1), 0.037, 0.039);
  const rig = new THREE.Group();

  // ───── AR 계열 (돌격소총 / 지정사수 소총)
  function buildAR(dmr) {
    const g = new THREE.Group(), hgEnd = dmr ? -0.46 : -0.4, brl = dmr ? -0.69 : -0.55, mz = brl - 0.06, lh = dmr ? -0.3 : -0.27;
    const body = dmr ? M.fde : M.metal; // 리시버와 총열 덮개의 마감
    const recv = [
      prof([[-0.095, -0.006], [0.125, -0.006], [0.125, 0.034], [0.02, 0.036], [-0.07, 0.036], [-0.095, 0.026]], 0.04, 0.003), // 상부 리시버
      prof([[-0.1, -0.004], [0.068, -0.004], [0.07, -0.07], [0.014, -0.078], [0.01, -0.048], [-0.045, -0.048], [-0.062, -0.04], [-0.105, -0.036]], 0.036, 0.003), // 하부 리시버 + 탄창 삽입구
      prof([[0.012, -0.076], [0.012, -0.082], [-0.05, -0.087], [-0.064, -0.05], [-0.057, -0.05], [-0.046, -0.081]], 0.012, 0), // 방아쇠울
      bx(0.021, 0.006, Math.abs(hgEnd) + 0.085, 0, 0.039, (hgEnd + 0.085) / 2), // 상부 레일 받침
      bx(0.012, 0.012, 0.022, 0.024, 0.014, 0.062), // 노리쇠 전진기
      bx(0.01, 0.012, 0.014, 0.022, 0.016, 0.012), // 탄피 받이
      bx(0.004, 0.004, 0.062, 0.021, 0.002, -0.035),
      bx(0.004, 0.01, 0.012, 0.0195, -0.03, -0.045), // 탄창 멈치
      bx(0.0035, 0.022, 0.011, -0.0197, -0.011, -0.03), bx(0.0045, 0.008, 0.013, -0.0205, -0.004, -0.03), // 노리쇠 멈치(왼쪽)
      cylX(0.0052, 0.004, -0.02, -0.021, 0.05), bx(0.003, 0.0045, 0.017, -0.0222, -0.0195, 0.043), // 조정간(왼쪽)
      cylX(0.0036, 0.0392, 0, -0.016, 0.084), cylX(0.0036, 0.0392, 0, -0.013, -0.058), // 분해 핀 둘
      cylX(0.0028, 0.038, 0, -0.03, 0.012), cylX(0.0028, 0.038, 0, -0.027, 0.034), // 방아쇠·공이치기 핀
      tubeZ(0.047, 0.053, 0.0135, -0.118, -0.134, 0.012, 0.007), // 총열 덮개 고정 고리
      bx(0.016, 0.007, 0.03, 0, 0.0475, hgEnd + 0.025), bx(0.018, 0.008, 0.03, 0, 0.0478, 0.064), // 접어 둔 가늠쇠·가늠자
    ];
    for (let z = hgEnd + 0.008; z < 0.086; z += 0.0105) recv.push(bx(0.0215, 0.0035, 0.0055, 0, 0.0437, z)); // 레일 톱니
    g.add(mesh(recv, body));
    g.add(mesh([tubeZ(0.044, 0.05, 0.012, -0.125, hgEnd, 0.012, 0.0045)], body)); // 총열 덮개
    g.add(mesh([
      cylZ(0.0135, 0.095, 0.275, 0.012), cylZ(0.0168, 0.095, 0.108, 0.012, 0, 14), // 완충관과 고정 너트
      bx(0.006, 0.022, 0.007, 0, -0.062, 0.022, 0.25), // 방아쇠
    ], M.metal));
    // 장전 손잡이: 재장전의 끝에 당겼다 놓는다
    const charge = mesh([bx(0.05, 0.009, 0.022, 0, 0.03, 0.092), bx(0.014, 0.008, 0.06, 0, 0.0305, 0.066), bx(0.012, 0.006, 0.012, -0.021, 0.0305, 0.084)], M.metal);
    g.add(charge);
    // 총열과 총구 장치
    const steel = [cylZ(0.009, hgEnd + 0.02, brl, 0.012), cylZ(0.0132, brl - 0.002, brl - 0.012, 0.012)];
    if (dmr) steel.push(bx(0.03, 0.021, 0.052, 0, 0.012, mz + 0.028), cylZ(0.0115, brl - 0.012, mz + 0.054, 0.012)); // 제퇴기
    else steel.push(cylZ(0.0118, brl, mz, 0.012), cylZ(0.0132, mz + 0.008, mz, 0.012)); // 새장형 소염기
    g.add(mesh(steel, M.steel));
    g.add(mesh([
      prof([[-0.045, -0.044], [-0.082, -0.04], [-0.118, -0.13], [-0.082, -0.142], [-0.058, -0.09]], 0.03, 0.005), // 권총 손잡이
      prof([[-0.165, 0.032], [-0.29, 0.032], [-0.3, 0.02], [-0.305, -0.078], [-0.275, -0.082], [-0.24, -0.03], [-0.165, -0.012]], 0.04, 0.005), // 개머리판
    ], M.poly));
    g.add(mesh([prof([[-0.303, 0.021], [-0.313, 0.016], [-0.318, -0.075], [-0.308, -0.081]], 0.04, 0.004)], M.rubber)); // 어깨 받침
    // 홈: 탄피 배출구, 총구 장치의 틈, 총열 덮개의 홈(옆·아래·비스듬한 면)
    const slots = [bx(0.002, 0.018, 0.06, 0.0205, 0.013, -0.035)];
    if (dmr) for (const z of [mz + 0.014, mz + 0.03, mz + 0.046]) slots.push(bx(0.0306, 0.011, 0.008, 0, 0.012, z));
    else slots.push(bx(0.0238, 0.004, 0.012, 0, 0.012, mz + 0.03), bx(0.004, 0.0238, 0.012, 0, 0.012, mz + 0.03));
    for (let z = -0.165; z > hgEnd + 0.02; z -= 0.05) {
      slots.push(bx(0.0446, 0.007, 0.03, 0, 0.012, z), bx(0.007, 0.0506, 0.03, 0, 0.012, z));
      for (const a of [0.71, -0.71]) slots.push(bxAround(0.007, 0.0012, 0.03, 0.0281, a, 0.012, z - 0.025));
    }
    g.add(mesh(slots, M.slot));
    // 탄창(재장전 때 빠졌다 들어온다): 몸통 + 바닥판
    const mag = dmr
      ? mesh([prof([[0.018, -0.062], [0.062, -0.06], [0.066, -0.12], [0.07, -0.155], [0.03, -0.16], [0.022, -0.12]], 0.024, 0.002), prof([[0.072, -0.153], [0.074, -0.161], [0.029, -0.167], [0.027, -0.159]], 0.027, 0.0015)], M.steel)
      : mesh([prof([[0.018, -0.062], [0.062, -0.06], [0.07, -0.13], [0.088, -0.205], [0.044, -0.215], [0.026, -0.135]], 0.024, 0.002), prof([[0.09, -0.203], [0.092, -0.212], [0.043, -0.223], [0.041, -0.214]], 0.027, 0.0015),
        bx(0.0255, 0.004, 0.036, 0, -0.1, -0.044, 0.1), bx(0.0255, 0.004, 0.036, 0, -0.125, -0.047, 0.14), bx(0.0255, 0.004, 0.038, 0, -0.15, -0.052, 0.2)], M.poly);
    g.add(mag);
    if (dmr) {
      // 조준경: 경통, 대물부, 접안부, 배율 조절 고리, 조절 노브 셋, 고정 고리 둘
      const tubes = [
        cylZ(0.015, 0.045, -0.13, 0.085), cylZ(0.024, -0.13, -0.165, 0.085, 0, 18, 0.015), cylZ(0.024, -0.165, -0.21, 0.085), cylZ(0.0255, -0.2, -0.214, 0.085, 0, 18),
        cylZ(0.019, 0.085, 0.045, 0.085), cylZ(0.0215, 0.1, 0.085, 0.085), cylZ(0.0205, 0.05, 0.036, 0.085, 0, 18),
        bx(0.028, 0.03, 0.018, 0, 0.062, 0.01), bx(0.028, 0.03, 0.018, 0, 0.062, -0.085), bx(0.02, 0.005, 0.018, 0, 0.1025, 0.01), bx(0.02, 0.005, 0.018, 0, 0.1025, -0.085),
        bx(0.03, 0.008, 0.115, 0, 0.0505, -0.0375), // 받침대
        cylY(0.009, 0.02, 0, 0.108, -0.04), cylY(0.0105, 0.006, 0, 0.119, -0.04, 14), // 위(상하)
        cylX(0.009, 0.02, 0.023, 0.085, -0.04), cylX(0.0105, 0.006, 0.034, 0.085, -0.04, 14), // 오른쪽(좌우)
        cylX(0.0095, 0.018, -0.022, 0.085, -0.04), cylX(0.011, 0.006, -0.032, 0.085, -0.04, 14), // 왼쪽(초점)
      ];
      g.add(mesh(tubes, M.metal));
      const l1 = new THREE.Mesh(new THREE.CircleGeometry(0.0225, 20), M.glass);
      l1.position.set(0, 0.085, -0.2);
      const l2 = new THREE.Mesh(new THREE.CircleGeometry(0.0185, 20), M.glass);
      l2.position.set(0, 0.085, 0.098);
      g.add(l1, l2);
    } else {
      // 홀로그래픽 조준기: 받침, 창틀, 지붕과 옆 보호판, 뒤쪽 전지함, 조작 버튼
      g.add(mesh([
        bx(0.032, 0.014, 0.062, 0, 0.0525, -0.028), tubeZ(0.042, 0.04, 0.006, -0.022, -0.04, 0.078, 0.0035),
        bx(0.046, 0.0035, 0.05, 0, 0.0995, -0.026), bx(0.003, 0.03, 0.03, 0.0222, 0.083, -0.013), bx(0.003, 0.03, 0.03, -0.0222, 0.083, -0.013),
        bx(0.026, 0.008, 0.02, 0, 0.0585, 0.008), cylX(0.0085, 0.012, 0.026, 0.063, -0.03), bx(0.008, 0.005, 0.003, -0.006, 0.0585, 0.0185), bx(0.008, 0.005, 0.003, 0.006, 0.0585, 0.0185),
      ], M.metal));
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.033), M.lens);
      lens.position.set(0, 0.078, -0.03);
      // 조준점: 고리 + 가운데 점
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.00165, 0.002, 28), M.dot), dot = new THREE.Mesh(new THREE.CircleGeometry(0.00042, 12), M.dot);
      ring.position.set(0, 0.078, -0.0298);
      dot.position.set(0, 0.078, -0.0298);
      g.add(lens, ring, dot);
    }
    // 손: 오른손은 손잡이, 왼손은 총열 덮개 아래
    const glove = [
      bx(0.014, 0.07, 0.05, 0.021, -0.09, 0.09, -0.38), bx(0.03, 0.08, 0.03, 0.002, -0.098, 0.112, -0.38),
      cap(0.0095, 0.026, 0, -0.068, 0.045, 'x'), cap(0.0095, 0.026, 0, -0.089, 0.053, 'x'), cap(0.0095, 0.026, 0, -0.11, 0.063, 'x'),
      cap(0.009, 0.03, -0.021, -0.05, 0.07, 'z'), cap(0.0085, 0.042, 0.0215, -0.04, 0.026, 'z'),
      bx(0.05, 0.028, 0.085, 0, -0.03, lh), bx(0.012, 0.03, 0.07, -0.027, -0.012, lh + 0.008), cap(0.009, 0.038, -0.0275, 0.008, lh - 0.015, 'z'),
    ];
    for (let k = 0; k < 4; k++) glove.push(cap(0.009, 0.028, 0.0275, 0, lh - 0.033 + k * 0.021, 'y'));
    const rw = V(0.012, -0.13, 0.125), re = V(0.16, -0.3, 0.48), lw = V(-0.01, -0.05, lh + 0.038), le = V(-0.23, -0.26, 0.2);
    glove.push(cuff(rw, re), cuff(lw, le));
    g.add(mesh(glove, M.glove));
    g.add(mesh([...arm(rw, re), ...arm(lw, le)], M.sleeve));
    const flash = mkFlash(dmr ? 0.22 : 0.2, 0, 0.012, mz - 0.03);
    g.add(flash);
    return { group: g, mag, flash, slide: null, pump: null, charge };
  }

  // ───── 산탄총 (펌프 액션): 나무 개머리판·앞손잡이, 총열 방열판, 리시버 왼쪽의 예비탄
  function buildShotgun() {
    const g = new THREE.Group();
    g.add(mesh([
      prof([[-0.115, -0.03], [0.105, -0.03], [0.11, -0.012], [0.11, 0.034], [-0.09, 0.034], [-0.118, 0.01]], 0.042, 0.004), // 리시버
      prof([[-0.02, -0.029], [-0.02, -0.035], [-0.082, -0.066], [-0.108, -0.03], [-0.101, -0.03], [-0.08, -0.058]], 0.012, 0), // 방아쇠울
      bx(0.006, 0.02, 0.007, 0, -0.042, 0.06, 0.25),
      cylX(0.003, 0.0432, 0, -0.012, 0.03), cylX(0.003, 0.0432, 0, -0.006, -0.03), cylX(0.0042, 0.0445, 0, -0.022, 0.092), // 방아쇠 뭉치 핀 둘, 안전 단추
      bx(0.012, 0.036, 0.012, 0, 0.006, -0.5), cylZ(0.0135, -0.53, -0.548, -0.008), cylZ(0.0145, -0.536, -0.542, -0.008, 0, 14), // 총열 고정 띠, 탄창관 마개
      bx(0.005, 0.016, 0.012, 0, 0.038, -0.588), // 가늠쇠 받침(총열 위)
    ], M.steel));
    g.add(mesh([cylZ(0.0105, -0.11, -0.6, 0.02), cylZ(0.012, -0.11, -0.53, -0.008), cylZ(0.0118, -0.596, -0.602, 0.02)], M.steel));
    // 방열판(총열 위를 덮는 얇은 관)과 그 구멍
    g.add(mesh([tubeZ(0.03, 0.03, 0.013, -0.15, -0.44, 0.0235, 0.0014)], M.metal));
    const holes = [bx(0.002, 0.02, 0.07, 0.0215, 0.012, -0.02), bx(0.03, 0.002, 0.07, 0, -0.0305, -0.04)]; // 탄피 배출구, 장전구
    for (let z = -0.17; z > -0.43; z -= 0.022) holes.push(bx(0.006, 0.0306, 0.009, 0, 0.0235, z), bx(0.0306, 0.006, 0.009, 0, 0.027, z - 0.011));
    g.add(mesh(holes, M.slot));
    g.add(mesh([bx(0.006, 0.012, 0.045, 0.0199, 0.012, -0.02)], M.bare)); // 배출구 안쪽으로 보이는 노리쇠
    g.add(mesh([prof([[-0.11, 0.022], [-0.11, -0.028], [-0.2, -0.05], [-0.4, -0.105], [-0.412, -0.025], [-0.2, 0.0]], 0.04, 0.006)], M.wood)); // 개머리판
    g.add(mesh([prof([[-0.402, -0.108], [-0.414, -0.105], [-0.426, -0.023], [-0.414, -0.02]], 0.04, 0.004)], M.rubber)); // 어깨 받침
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8), M.white); // 가늠쇠 구슬
    dot.position.set(0, 0.0478, -0.588);
    g.add(dot);
    // 예비탄 다섯 발(리시버 왼쪽): 받침 + 틀 + 붉은 탄피 + 황동 밑동. 밑동이 위로 오게 꽂아서 쏘는 사람 눈에는 황동 밑동과 뇌관이 보인다
    const hull = [], brass = [], primer = [];
    for (let k = 0; k < 5; k++) {
      const z = -0.062 + k * 0.026;
      hull.push(cylY(0.0098, 0.046, -0.0335, 0.0, z));
      brass.push(cylY(0.0102, 0.012, -0.0335, 0.029, z), cylY(0.0109, 0.0016, -0.0335, 0.0352, z));
      primer.push(cylY(0.0032, 0.0006, -0.0335, 0.0362, z));
    }
    g.add(mesh([bx(0.005, 0.03, 0.135, -0.0235, 0.002, -0.01)], M.poly));
    g.add(mesh([bx(0.0225, 0.024, 0.14, -0.0335, 0.002, -0.01)], M.metal)); // 탄을 끼워 두는 틀: 탄의 가운데를 가려 밑동과 윗부분만 보인다
    g.add(mesh(hull, M.hull));
    g.add(mesh(brass, M.brass));
    g.add(mesh(primer, M.bare));
    // 펌프(앞손잡이)와 왼손은 함께 움직인다
    const pump = new THREE.Group();
    pump.add(mesh([tubeZ(0.044, 0.04, 0.014, -0.22, -0.39, -0.006)], M.wood));
    pump.add(mesh([bx(0.003, 0.008, 0.13, 0.0165, -0.002, -0.165), bx(0.003, 0.008, 0.13, -0.0165, -0.002, -0.165)], M.steel)); // 작동 막대
    const ribs = [];
    for (let z = -0.24; z > -0.38; z -= 0.022) ribs.push(bx(0.0446, 0.03, 0.005, 0, -0.006, z));
    pump.add(mesh(ribs, M.slot));
    const lg = [bx(0.05, 0.026, 0.085, 0, -0.04, -0.305), bx(0.012, 0.03, 0.07, -0.0265, -0.02, -0.3), cap(0.009, 0.036, -0.0265, 0, -0.325, 'z')];
    for (let k = 0; k < 4; k++) lg.push(cap(0.009, 0.026, 0.0265, -0.01, -0.338 + k * 0.021, 'y'));
    const lw = V(-0.01, -0.06, -0.27), le = V(-0.23, -0.27, 0.18);
    lg.push(cuff(lw, le));
    pump.add(mesh(lg, M.glove));
    pump.add(mesh(arm(lw, le), M.sleeve));
    g.add(pump);
    const rw = V(0.014, -0.06, 0.2), re = V(0.16, -0.27, 0.52);
    g.add(mesh([
      bx(0.014, 0.06, 0.06, 0.022, -0.016, 0.16, -0.25), cap(0.0085, 0.04, 0.0225, 0.004, 0.128, 'z'),
      cap(0.0095, 0.026, 0, -0.05, 0.135, 'x'), cap(0.0095, 0.026, 0, -0.056, 0.155, 'x'), cap(0.0095, 0.026, 0, -0.063, 0.175, 'x'),
      cap(0.0085, 0.045, 0.0225, -0.022, 0.078, 'z'), cuff(rw, re),
    ], M.glove));
    g.add(mesh(arm(rw, re), M.sleeve));
    const flash = mkFlash(0.26, 0, 0.02, -0.64);
    g.add(flash);
    return { group: g, mag: null, flash, slide: null, pump, charge: null };
  }

  // ───── 권총: 강철 슬라이드(앞뒤 톱니, 배출구로 보이는 약실, 흰 점 조준기) + 플라스틱 몸통(레일, 멈치, 돌기 무늬)
  function buildPistol() {
    const g = new THREE.Group();
    const sl = [
      prof([[-0.086, 0.004], [-0.086, 0.034], [0.097, 0.034], [0.1, 0.029], [0.1, 0.004]], 0.026, 0.0025), // 슬라이드
      bx(0.007, 0.0065, 0.008, -0.0072, 0.0372, 0.075), bx(0.007, 0.0065, 0.008, 0.0072, 0.0372, 0.075), bx(0.004, 0.0065, 0.008, 0, 0.0372, -0.09), // 가늠자 둘, 가늠쇠
      bx(0.012, 0.012, 0.003, 0, 0.018, 0.0868), // 뒤판
    ];
    for (let z = 0.045; z < 0.08; z += 0.0065) sl.push(bx(0.0268, 0.02, 0.0028, 0, 0.017, z)); // 뒤쪽 톱니
    for (let z = -0.085; z < -0.06; z += 0.0065) sl.push(bx(0.0268, 0.016, 0.0028, 0, 0.017, z)); // 앞쪽 톱니
    const slide = new THREE.Group();
    slide.add(mesh(sl, M.steel));
    slide.add(mesh([bx(0.0135, 0.0012, 0.034, 0.003, 0.0343, -0.008), bx(0.0012, 0.012, 0.034, 0.0131, 0.027, -0.008)], M.bare)); // 배출구로 보이는 약실(위·오른쪽)
    const dots = [];
    for (const x of [-0.0072, 0.0072]) { const d = new THREE.CircleGeometry(0.0017, 10); d.translate(x, 0.0378, 0.0791); dots.push(d); }
    { const d = new THREE.CircleGeometry(0.0017, 10); d.translate(0, 0.0378, -0.0859); dots.push(d); }
    slide.add(new THREE.Mesh(mergeGeometries(dots), M.white));
    g.add(slide);
    g.add(mesh([cylZ(0.0062, -0.098, -0.106, 0.02), cylZ(0.0035, -0.098, -0.1065, 0.008)], M.bare)); // 총열 끝, 복좌 용수철 막대 끝
    g.add(mesh([cylZ(0.0042, -0.1, -0.1068, 0.02)], M.slot)); // 총구
    g.add(mesh([
      prof([[-0.088, 0.003], [0.1, 0.003], [0.1, -0.016], [0.05, -0.018], [0.048, -0.052], [0, -0.058], [-0.012, -0.058], [-0.032, -0.125], [-0.082, -0.118], [-0.09, -0.03], [-0.096, -0.008]],
        0.027, 0.003, [[[0.04, -0.022], [0.04, -0.046], [0.004, -0.05], [-0.004, -0.022]]]), // 프레임 + 손잡이 + 방아쇠울
      bx(0.005, 0.02, 0.006, 0, -0.034, -0.014, 0.3), bx(0.0275, 0.008, 0.05, 0, -0.126, 0.057, -0.12), // 방아쇠, 탄창 바닥
      bx(0.0278, 0.003, 0.004, 0, -0.0165, -0.062), bx(0.0278, 0.003, 0.004, 0, -0.0165, -0.074), bx(0.0278, 0.003, 0.004, 0, -0.0165, -0.086), // 아래 레일의 홈턱
    ], M.poly));
    g.add(mesh([bx(0.0022, 0.0045, 0.024, -0.0146, -0.0005, 0.012), bx(0.0022, 0.004, 0.008, -0.0146, -0.006, -0.03), cylX(0.0032, 0.0295, 0, -0.03, 0.006)], M.steel)); // 슬라이드 멈치, 분해 레버, 탄창 멈치
    const rw = V(0.014, -0.115, 0.085), re = V(0.14, -0.25, 0.47), lw = V(-0.03, -0.12, 0.075), le = V(-0.22, -0.25, 0.42);
    g.add(mesh([
      bx(0.012, 0.07, 0.045, 0.02, -0.075, 0.052, -0.2), bx(0.016, 0.07, 0.05, -0.024, -0.085, 0.045, -0.2), bx(0.03, 0.07, 0.022, 0, -0.085, 0.09, -0.12),
      cap(0.0092, 0.024, 0, -0.072, 0.011, 'x'), cap(0.0092, 0.024, 0, -0.091, 0.017, 'x'), cap(0.0092, 0.024, 0, -0.11, 0.023, 'x'),
      cap(0.0105, 0.03, -0.005, -0.078, 0, 'x'), cap(0.0105, 0.03, -0.005, -0.097, 0.006, 'x'), cap(0.0105, 0.03, -0.005, -0.116, 0.012, 'x'),
      cap(0.009, 0.034, -0.0205, -0.018, 0.018, 'z'), cap(0.009, 0.034, -0.0215, -0.034, -0.002, 'z'), cap(0.0085, 0.04, 0.0195, -0.02, -0.002, 'z'),
      cuff(rw, re), cuff(lw, le),
    ], M.glove));
    g.add(mesh([...arm(rw, re), ...arm(lw, le)], M.sleeve));
    const flash = mkFlash(0.14, 0, 0.02, -0.135);
    g.add(flash);
    return { group: g, mag: null, flash, slide, pump: null, charge: null };
  }

  const ar = buildAR(false), dmr = buildAR(true), shotgun = buildShotgun(), pistol = buildPistol();
  for (const w of [dmr, shotgun, pistol]) w.group.visible = false;
  rig.add(ar.group, dmr.group, shotgun.group, pistol.group);
  const light = new THREE.PointLight(0xffc070, 0, 3, 2);
  light.position.set(0.05, 0, -0.6);
  rig.add(light);
  return { rig, light, ar, dmr, shotgun, pistol, mats: M };
}

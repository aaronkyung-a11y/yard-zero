// 1인칭 총기 모델 4종 (돌격소총·지정사수 소총·산탄총·권총), 장갑 낀 손과 팔 포함. 총구는 -Z 방향.
// 옆모습 윤곽을 폭 방향으로 돌출하고 모서리를 깎아(bevel) 상자 조합보다 실물에 가까운 형태를 만든다.
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

export function buildViewmodel(T) {
  const M = {
    metal: new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.72, roughness: 0.44, envMapIntensity: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.88, roughness: 0.32, envMapIntensity: 0.85 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x141516, metalness: 0, roughness: 0.72, envMapIntensity: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a2c18, metalness: 0, roughness: 0.52, envMapIntensity: 0.7 }),
    slot: new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.9, envMapIntensity: 0.4 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x5a5b47, map: T.blotch, roughness: 0.95 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.8 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x9cc4e4, transparent: true, opacity: 0.07, roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.03, metalness: 0.9, side: THREE.DoubleSide }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false }),
    flash: new THREE.MeshBasicMaterial({ map: T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }),
  };
  const mesh = (geos, mat) => new THREE.Mesh(mergeGeometries(geos.map(NI)), mat);
  const mkFlash = (size, x, y, z) => {
    const a = new THREE.PlaneGeometry(size, size), b = new THREE.PlaneGeometry(size * 1.5, size * 0.7), c = new THREE.PlaneGeometry(size * 1.5, size * 0.7);
    b.rotateY(Math.PI / 2);
    c.rotateY(Math.PI / 2);
    c.rotateZ(Math.PI / 2);
    b.translate(0, 0, -size * 0.45);
    c.translate(0, 0, -size * 0.45);
    const f = new THREE.Mesh(mergeGeometries([a, b, c]), M.flash);
    f.position.set(x, y, z);
    f.visible = false;
    f.renderOrder = 10;
    return f;
  };
  const arm = (wrist, elbow) => [cylBetween(wrist, elbow, 0.034, 0.053)];
  const cuff = (wrist, elbow) => cylBetween(wrist, wrist.clone().lerp(elbow, 0.1), 0.037, 0.039);
  const rig = new THREE.Group();

  // ───── AR 계열 (돌격소총 / 지정사수 소총)
  function buildAR(dmr) {
    const g = new THREE.Group(), hgEnd = dmr ? -0.46 : -0.4, brl = dmr ? -0.69 : -0.55, mz = brl - 0.06, lh = dmr ? -0.3 : -0.27;
    const metal = [
      prof([[-0.095, -0.006], [0.125, -0.006], [0.125, 0.034], [0.02, 0.036], [-0.07, 0.036], [-0.095, 0.026]], 0.04, 0.003), // 상부 리시버
      prof([[-0.1, -0.004], [0.068, -0.004], [0.07, -0.07], [0.014, -0.078], [0.01, -0.048], [-0.045, -0.048], [-0.062, -0.04], [-0.105, -0.036]], 0.036, 0.003), // 하부 리시버 + 탄창 삽입구
      prof([[0.012, -0.076], [0.012, -0.082], [-0.05, -0.087], [-0.064, -0.05], [-0.057, -0.05], [-0.046, -0.081]], 0.012, 0), // 방아쇠울
      bx(0.006, 0.022, 0.007, 0, -0.062, 0.022, 0.25), // 방아쇠
      cylZ(0.0135, 0.095, 0.275, 0.012), // 완충관
      bx(0.021, 0.006, Math.abs(hgEnd) + 0.085, 0, 0.039, (hgEnd + 0.085) / 2), // 상부 레일 받침
      bx(0.05, 0.009, 0.022, 0, 0.03, 0.092), // 장전 손잡이
      bx(0.012, 0.012, 0.022, 0.024, 0.014, 0.062), // 노리쇠 전진기
      bx(0.01, 0.012, 0.014, 0.022, 0.016, 0.012), // 탄피 받이
      bx(0.004, 0.004, 0.062, 0.021, 0.002, -0.035),
      bx(0.004, 0.01, 0.012, 0.0195, -0.03, -0.045), bx(0.004, 0.02, 0.012, -0.0195, -0.012, -0.03),
      bx(0.016, 0.007, 0.03, 0, 0.0475, hgEnd + 0.025),
    ];
    for (let z = hgEnd + 0.008; z < 0.086; z += 0.0105) metal.push(bx(0.0215, 0.0035, 0.0055, 0, 0.0437, z));
    g.add(mesh(metal, M.metal));
    g.add(mesh([
      cylZ(0.009, hgEnd + 0.02, brl, 0.012), cylZ(0.0118, brl, mz, 0.012), cylZ(0.0132, brl - 0.002, brl - 0.01, 0.012), cylZ(0.0132, mz + 0.008, mz, 0.012),
    ], M.steel));
    g.add(mesh([
      tubeZ(0.044, 0.05, 0.012, -0.125, hgEnd, 0.012, 0.0045), // 총열 덮개
      prof([[-0.045, -0.044], [-0.082, -0.04], [-0.118, -0.13], [-0.082, -0.142], [-0.058, -0.09]], 0.03, 0.005), // 권총 손잡이
      prof([[-0.165, 0.032], [-0.29, 0.032], [-0.3, 0.02], [-0.305, -0.078], [-0.275, -0.082], [-0.24, -0.03], [-0.165, -0.012]], 0.04, 0.005), // 개머리판
    ], M.poly));
    const slots = [bx(0.002, 0.018, 0.06, 0.0205, 0.013, -0.035), bx(0.0238, 0.004, 0.012, 0, 0.012, mz + 0.03), bx(0.004, 0.0238, 0.012, 0, 0.012, mz + 0.03)];
    for (let z = -0.165; z > hgEnd + 0.02; z -= 0.05) slots.push(bx(0.0446, 0.007, 0.03, 0, 0.012, z), bx(0.007, 0.0506, 0.03, 0, 0.012, z));
    g.add(mesh(slots, M.slot));
    const mag = new THREE.Mesh(NI(dmr
      ? prof([[0.018, -0.062], [0.062, -0.06], [0.066, -0.12], [0.07, -0.155], [0.03, -0.16], [0.022, -0.12]], 0.024, 0.002)
      : prof([[0.018, -0.062], [0.062, -0.06], [0.07, -0.13], [0.088, -0.205], [0.044, -0.215], [0.026, -0.135]], 0.024, 0.002)), M.metal);
    g.add(mag);
    if (dmr) {
      // 조준경
      const tubes = [
        cylZ(0.015, 0.045, -0.13, 0.085), cylZ(0.024, -0.13, -0.165, 0.085, 0, 18, 0.015), cylZ(0.024, -0.165, -0.21, 0.085),
        cylZ(0.019, 0.085, 0.045, 0.085), cylZ(0.0215, 0.1, 0.085, 0.085),
        bx(0.028, 0.03, 0.018, 0, 0.062, 0.01), bx(0.028, 0.03, 0.018, 0, 0.062, -0.085),
      ];
      const t1 = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 12);
      t1.translate(0, 0.108, -0.04);
      const t2 = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 12);
      t2.rotateZ(Math.PI / 2);
      t2.translate(0.023, 0.085, -0.04);
      tubes.push(t1, t2);
      g.add(mesh(tubes, M.metal));
      const l1 = new THREE.Mesh(new THREE.CircleGeometry(0.0225, 20), M.glass);
      l1.position.set(0, 0.085, -0.2);
      const l2 = new THREE.Mesh(new THREE.CircleGeometry(0.0185, 20), M.glass);
      l2.position.set(0, 0.085, 0.098);
      g.add(l1, l2);
    } else {
      // 도트 사이트: 받침 + 얇은 테 + 발광부
      g.add(mesh([
        bx(0.03, 0.012, 0.045, 0, 0.0515, -0.03), tubeZ(0.042, 0.04, 0.006, -0.022, -0.038, 0.078, 0.0035), bx(0.02, 0.012, 0.02, 0, 0.064, -0.008),
        (() => { const c = new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12); c.rotateZ(Math.PI / 2); c.translate(0.026, 0.063, -0.03); return c; })(),
      ], M.metal));
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.033), M.lens);
      lens.position.set(0, 0.078, -0.03);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.00085, 12), M.dot);
      dot.position.set(0, 0.078, -0.0298);
      g.add(lens, dot);
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
    return { group: g, mag, flash, slide: null, pump: null };
  }

  // ───── 산탄총 (펌프 액션)
  function buildShotgun() {
    const g = new THREE.Group();
    g.add(mesh([
      prof([[-0.115, -0.03], [0.105, -0.03], [0.11, -0.012], [0.11, 0.034], [-0.09, 0.034], [-0.118, 0.01]], 0.042, 0.004), // 리시버
      prof([[-0.02, -0.029], [-0.02, -0.035], [-0.082, -0.066], [-0.108, -0.03], [-0.101, -0.03], [-0.08, -0.058]], 0.012, 0), // 방아쇠울
      bx(0.006, 0.02, 0.007, 0, -0.042, 0.06, 0.25),
      bx(0.012, 0.036, 0.012, 0, 0.006, -0.5), cylZ(0.0135, -0.53, -0.548, -0.008),
    ], M.metal));
    g.add(mesh([cylZ(0.0105, -0.11, -0.6, 0.02), cylZ(0.012, -0.11, -0.53, -0.008), cylZ(0.004, -0.59, -0.596, 0.035), bx(0.008, 0.004, 0.48, 0, 0.0325, -0.35)], M.steel));
    g.add(mesh([prof([[-0.11, 0.022], [-0.11, -0.028], [-0.2, -0.05], [-0.4, -0.105], [-0.412, -0.025], [-0.2, 0.0]], 0.04, 0.006)], M.wood)); // 개머리판
    g.add(mesh([bx(0.002, 0.02, 0.07, 0.0215, 0.012, -0.02), bx(0.03, 0.002, 0.07, 0, -0.0305, -0.04)], M.slot));
    // 펌프(앞손잡이)와 왼손은 함께 움직인다
    const pump = new THREE.Group();
    pump.add(mesh([tubeZ(0.044, 0.04, 0.014, -0.22, -0.39, -0.006)], M.wood));
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
      bx(0.014, 0.06, 0.06, 0.022, -0.016, 0.16, -0.25), cap(0.0095, 0.03, 0, 0.03, 0.152, 'x'),
      cap(0.0095, 0.026, 0, -0.05, 0.135, 'x'), cap(0.0095, 0.026, 0, -0.056, 0.155, 'x'), cap(0.0095, 0.026, 0, -0.063, 0.175, 'x'),
      cap(0.0085, 0.045, 0.0225, -0.022, 0.078, 'z'), cuff(rw, re),
    ], M.glove));
    g.add(mesh(arm(rw, re), M.sleeve));
    const flash = mkFlash(0.26, 0, 0.02, -0.64);
    g.add(flash);
    return { group: g, mag: null, flash, slide: null, pump };
  }

  // ───── 권총
  function buildPistol() {
    const g = new THREE.Group();
    const sl = [
      prof([[-0.086, 0.004], [-0.086, 0.034], [0.097, 0.034], [0.1, 0.029], [0.1, 0.004]], 0.026, 0.0025), // 슬라이드
      bx(0.007, 0.0065, 0.008, -0.0072, 0.0372, 0.075), bx(0.007, 0.0065, 0.008, 0.0072, 0.0372, 0.075), bx(0.004, 0.0065, 0.008, 0, 0.0372, -0.09),
      cylZ(0.0062, -0.098, -0.105, 0.02),
    ];
    for (let z = 0.045; z < 0.08; z += 0.0065) sl.push(bx(0.0268, 0.02, 0.0028, 0, 0.017, z));
    const slide = mesh(sl, M.steel);
    g.add(slide);
    g.add(mesh([bx(0.002, 0.012, 0.035, 0.0125, 0.024, -0.01)], M.slot));
    g.add(mesh([
      prof([[-0.088, 0.003], [0.1, 0.003], [0.1, -0.016], [0.05, -0.018], [0.048, -0.052], [0, -0.058], [-0.012, -0.058], [-0.032, -0.125], [-0.082, -0.118], [-0.09, -0.03], [-0.096, -0.008]],
        0.027, 0.003, [[[0.04, -0.022], [0.04, -0.046], [0.004, -0.05], [-0.004, -0.022]]]), // 프레임 + 손잡이 + 방아쇠울
      bx(0.005, 0.02, 0.006, 0, -0.034, -0.014, 0.3), bx(0.0275, 0.008, 0.05, 0, -0.126, 0.057, -0.12),
    ], M.poly));
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
    return { group: g, mag: null, flash, slide, pump: null };
  }

  const ar = buildAR(false), dmr = buildAR(true), shotgun = buildShotgun(), pistol = buildPistol();
  for (const w of [dmr, shotgun, pistol]) w.group.visible = false;
  rig.add(ar.group, dmr.group, shotgun.group, pistol.group);
  const light = new THREE.PointLight(0xffc070, 0, 3, 2);
  light.position.set(0.05, 0, -0.6);
  rig.add(light);
  return { rig, light, ar, dmr, shotgun, pistol };
}

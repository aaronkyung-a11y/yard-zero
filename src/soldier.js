// 적 병사: 관절 메시 + 2본 IK로 소총을 쥔 팔
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lerp } from './util.js';

const C = (hex) => new THREE.Color(hex);
function tint(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const bx = (w, h, d, x, y, z, c, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return c ? tint(g, c) : g;
};
const cy = (r1, r2, len, x, y, z, c, seg = 8) => {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.translate(x, y, z);
  return c ? tint(g, c) : g;
};

const VARIANTS = [
  { shirt: 0x4b5338, pants: 0x3d4430, vest: 0x1d1f1b, helmet: 0x2c3224 },
  { shirt: 0x5d584a, pants: 0x48443a, vest: 0x24221f, helmet: 0x3a372f },
];
let GEO = null, MAT = null;

export function initSoldierAssets(T) {
  const dark = C(0x121212), boot = C(0x1a1512), glove = C(0x101012);
  GEO = VARIANTS.map((v) => {
    const shirt = C(v.shirt), pants = C(v.pants), vest = C(v.vest), helmet = C(v.helmet);
    const sph = (r, x, y, z, c) => { const g = new THREE.SphereGeometry(r, 10, 8); g.translate(x, y, z); return tint(g, c); };
    const helm = new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
    helm.translate(0, 0.105, 0);
    tint(helm, helmet);
    return {
      pelvis: bx(0.36, 0.2, 0.22, 0, 0, 0, pants),
      torso: mergeGeometries([
        bx(0.4, 0.52, 0.23, 0, 0.28, 0, shirt),
        bx(0.43, 0.36, 0.27, 0, 0.27, 0, vest),
        bx(0.1, 0.12, 0.05, -0.12, 0.17, 0.155, vest), bx(0.1, 0.12, 0.05, 0, 0.17, 0.155, vest), bx(0.1, 0.12, 0.05, 0.12, 0.17, 0.155, vest),
        bx(0.26, 0.3, 0.09, 0, 0.3, -0.17, vest),
        cy(0.055, 0.06, 0.1, 0, 0.57, 0, dark),
        sph(0.078, -0.21, 0.46, 0, shirt), sph(0.078, 0.21, 0.46, 0, shirt),
      ]),
      head: mergeGeometries([sph(0.105, 0, 0.09, 0, dark), helm, bx(0.15, 0.045, 0.04, 0, 0.1, 0.092, C(0x050608))]),
      upper: cy(0.055, 0.048, 0.29, 0, -0.145, 0, shirt),
      fore: mergeGeometries([cy(0.046, 0.04, 0.27, 0, -0.135, 0, shirt), bx(0.07, 0.09, 0.075, 0, -0.3, 0, glove)]),
      thigh: cy(0.085, 0.068, 0.44, 0, -0.22, 0, pants),
      shin: mergeGeometries([cy(0.065, 0.052, 0.42, 0, -0.21, 0, pants), bx(0.1, 0.1, 0.05, 0, -0.03, 0.055, vest), bx(0.1, 0.1, 0.25, 0, -0.445, 0.045, boot)]),
    };
  });
  const barrel = new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0.01, 0.53);
  const brake = new THREE.CylinderGeometry(0.016, 0.016, 0.05, 6);
  brake.rotateX(Math.PI / 2);
  brake.translate(0, 0.01, 0.655);
  const gun = mergeGeometries([
    bx(0.05, 0.085, 0.26, 0, 0, 0.06), bx(0.052, 0.058, 0.25, 0, 0.005, 0.31), barrel, brake,
    bx(0.042, 0.1, 0.2, 0, -0.01, -0.17), bx(0.03, 0.15, 0.06, 0, -0.11, 0.1, null, -0.15), bx(0.035, 0.09, 0.042, 0, -0.075, -0.03, null, 0.25), bx(0.03, 0.04, 0.05, 0, 0.065, 0.08),
  ]);
  const f1 = new THREE.PlaneGeometry(0.42, 0.42), f2 = new THREE.PlaneGeometry(0.42, 0.42), f3 = new THREE.PlaneGeometry(0.42, 0.42);
  f2.rotateY(Math.PI / 2);
  f3.rotateX(Math.PI / 2);
  const flash = mergeGeometries([f1, f2, f3]);
  GEO.gun = gun;
  GEO.flash = flash;
  MAT = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, map: T.blotch, roughness: 0.9, metalness: 0 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.5, metalness: 0.7 }),
    flash: new THREE.MeshBasicMaterial({ map: T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  };
}

export function makeSoldier(variant) {
  const g = GEO[variant % GEO.length];
  const mesh = (geo, mat = MAT.body) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);
  hips.add(mesh(g.pelvis));
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  spine.add(mesh(g.torso));
  const head = new THREE.Group();
  head.position.y = 0.57;
  spine.add(head);
  head.add(mesh(g.head));
  const uL = mesh(g.upper), fL = mesh(g.fore), uR = mesh(g.upper), fR = mesh(g.fore);
  spine.add(uL, fL, uR, fR);
  const gun = new THREE.Group();
  spine.add(gun);
  gun.add(mesh(GEO.gun, MAT.gun));
  const flash = new THREE.Mesh(GEO.flash, MAT.flash);
  flash.position.set(0, 0.01, 0.78);
  flash.visible = false;
  gun.add(flash);
  const leg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, -0.05, 0);
    hips.add(hip);
    hip.add(mesh(g.thigh));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    knee.add(mesh(g.shin));
    return [hip, knee];
  };
  const [hipL, kneeL] = leg(0.095), [hipR, kneeR] = leg(-0.095);
  return { root, hips, spine, head, uL, fL, uR, fR, gun, flash, hipL, kneeL, hipR, kneeR };
}

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

function solveArm(S, T, l1, l2, pole, upper, fore) {
  _d.subVectors(T, S);
  let dist = _d.length();
  _d.normalize();
  dist = Math.min(Math.max(dist, 0.06), l1 + l2 - 0.002);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  _e.copy(S).addScaledVector(_d, a).addScaledVector(_p, h);
  upper.position.copy(S);
  _t.subVectors(_e, S).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _t);
  fore.position.copy(_e);
  _t.copy(S).addScaledVector(_d, dist).sub(_e).normalize();
  fore.quaternion.setFromUnitVectors(DOWN, _t);
}

export function makeGun() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const mesh = new THREE.Mesh(GEO.gun, MAT.gun);
  mesh.castShadow = true;
  group.add(mesh);
  const flash = new THREE.Mesh(GEO.flash, MAT.flash);
  flash.position.set(0, 0.01, 0.78);
  flash.visible = false;
  group.add(flash);
  return { group, flash };
}

const AIM_P = new THREE.Vector3(-0.09, 0.4, 0.2), LOW_P = new THREE.Vector3(-0.04, 0.22, 0.2);
const SH_R = new THREE.Vector3(-0.21, 0.46, 0), SH_L = new THREE.Vector3(0.21, 0.46, 0);
const POLE_R = new THREE.Vector3(-0.5, -1, -0.3), POLE_L = new THREE.Vector3(0.5, -1, -0.2);
const GRIP = new THREE.Vector3(0, -0.05, -0.03), FORE = new THREE.Vector3(0, -0.035, 0.24);
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3();

// aim: 0 = 총구를 내린 이동 자세, 1 = 견착 조준
export function poseSoldier(m, aim, aimPitch) {
  m.gun.position.lerpVectors(LOW_P, AIM_P, aim);
  m.gun.rotation.set(lerp(0.6, -aimPitch, aim), lerp(0.5, 0, aim), 0);
  m.gun.updateMatrix();
  _g1.copy(GRIP).applyMatrix4(m.gun.matrix);
  _g2.copy(FORE).applyMatrix4(m.gun.matrix);
  solveArm(SH_R, _g1, 0.29, 0.3, POLE_R, m.uR, m.fR);
  solveArm(SH_L, _g2, 0.29, 0.3, POLE_L, m.uL, m.fL);
}

// 모캡 모델을 쓸 수 없을 때의 예비 몸체 (코드로 만든 관절 인형)
export class PuppetBody {
  constructor(variant) {
    this.m = makeSoldier(variant);
    this.root = this.m.root;
    this.flash = this.m.flash;
    this.walk = Math.random() * 6;
    this.limp = null;
  }
  animate(e, dt) {
    const m = this.m, sp = e.speed;
    if (sp > 0.2) this.walk += dt * (3.2 + sp * 1.7);
    const A = sp > 0.2 ? Math.min(1, sp / 4.4) * 0.75 + 0.12 : 0, s = Math.sin(this.walk);
    m.hipL.rotation.x = -s * A;
    m.hipR.rotation.x = s * A;
    m.kneeL.rotation.x = Math.max(0, Math.sin(this.walk + 1.1)) * A * 1.5 + e.crouch * 1.2;
    m.kneeR.rotation.x = Math.max(0, Math.sin(this.walk + 1.1 + Math.PI)) * A * 1.5 + e.crouch * 1.2;
    m.hipL.rotation.x -= e.crouch * 0.9;
    m.hipR.rotation.x -= e.crouch * 0.9;
    m.hips.position.y = 0.98 - Math.abs(s) * 0.03 * A - e.crouch * 0.3;
    m.spine.rotation.x = -e.flinch * 0.35 + (sp > 3 ? 0.13 : 0.04);
    m.spine.rotation.z = e.flinchSide * e.flinch * 0.2;
    m.head.rotation.x = -e.aimPitch * 0.5 * e.aim;
    poseSoldier(m, e.aim, e.aimPitch);
    m.flash.visible = e.flashT > 0;
    m.root.position.set(e.pos.x, 0, e.pos.z);
    m.root.rotation.set(0, e.aimYaw, 0);
  }
  die(e) {
    const r = (a, b) => a + (b - a) * Math.random();
    this.limp = [r(-0.5, 0.3), r(0.1, 0.9), r(-0.5, 0.3), r(0.1, 0.9)];
    this.m.flash.visible = false;
    this.aim = e.aim;
  }
  animateDead(e, dt) {
    const m = this.m, t = Math.min(1, e.deadT / 0.55), k = Math.min(1, dt * 6);
    m.root.rotation.x = e.fall * (Math.PI / 2) * t * t;
    m.root.position.y = 0.13 * t * t - (e.deadT > 7 ? (e.deadT - 7) * 0.25 : 0);
    m.hipL.rotation.x = lerp(m.hipL.rotation.x, this.limp[0], k);
    m.kneeL.rotation.x = lerp(m.kneeL.rotation.x, this.limp[1], k);
    m.hipR.rotation.x = lerp(m.hipR.rotation.x, this.limp[2], k);
    m.kneeR.rotation.x = lerp(m.kneeR.rotation.x, this.limp[3], k);
    this.aim += (0 - this.aim) * Math.min(1, dt * 5);
    poseSoldier(m, this.aim, 0);
    return e.deadT > 9.5;
  }
  dispose(scene) {
    scene.remove(this.root);
  }
}

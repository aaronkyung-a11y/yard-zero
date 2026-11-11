// 모션캡처 병사: 리깅 모델(걷기·달리기·대기 클립) + 절차적 상체 조준·소총 파지 IK·앉기·쓰러짐
// 모델 출처: three.js 예제 Soldier.glb (Mixamo 캐릭터). 텍스처는 분리해 data URL로 직접 로드한다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import glbB64 from '../assets/soldier.glb';
import diffUrl from '../assets/soldier_diff.jpg';
import nrmUrl from '../assets/soldier_nrm.jpg';
import { makeGun } from './soldier.js';
import { clamp, lerp, angDiff } from './util.js';
import { colliders } from './world.js';
import { loadExtraClips } from './retarget.js';

export const MOCAP = { ready: false, failed: false, scene: null, clips: null, mats: null, visor: null, walkSpeed: 1.6, runSpeed: 4.2, flip: false };

const UP = new THREE.Vector3(0, 1, 0);
const L1 = 0.2316, L2 = 0.2407 + 0.06; // 위팔, 아래팔+손바닥 (m)
const THIGH = 0.4336, SHIN = 0.445;
const AIM_OFF = new THREE.Vector3(-0.1, 0.12, 0.25), LOW_OFF = new THREE.Vector3(-0.03, -0.1, 0.24);
const GRIP = new THREE.Vector3(0, -0.05, -0.03), FORE = new THREE.Vector3(0, -0.035, 0.2);
const _pq = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const _fl = new THREE.Vector3(), _fr = new THREE.Vector3(), _up = new THREE.Vector3(), _fql = new THREE.Quaternion(), _fqr = new THREE.Quaternion();
const _R = new THREE.Vector3(), _c = new THREE.Vector3(), _off = new THREE.Vector3(), _rt = new THREE.Vector3(), _fw = new THREE.Vector3(), _g = new THREE.Vector3(), _pole = new THREE.Vector3();

function tex(url, srgb) {
  const img = new Image(), t = new THREE.Texture(img);
  t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  img.onload = () => { t.needsUpdate = true; };
  img.src = url;
  return t;
}

// 클립의 실제 보행 속도: 발이 땅에 닿아 있는 동안 몸통 기준으로 뒤로 밀리는 속도
function measure(clip) {
  const obj = skClone(MOCAP.scene), mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const foot = obj.getObjectByName('mixamorigLeftFoot'), N = 48, pts = [];
  for (let i = 0; i < N; i++) {
    mixer.setTime((clip.duration * i) / N);
    obj.updateMatrixWorld(true);
    pts.push(foot.getWorldPosition(new THREE.Vector3()));
  }
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p.y);
  let sum = 0, n = 0;
  const dt = clip.duration / N;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    if (a.y < minY + 0.035 && b.y < minY + 0.035) { sum += (a.z - b.z) / dt; n++; }
  }
  mixer.stopAllAction();
  return n ? sum / n : 0;
}

export function loadMocap(done) {
  try {
    const bin = atob(glbB64), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    new GLTFLoader().parse(u8.buffer, '', (gltf) => {
      try {
        const map = tex(diffUrl, true), nrm = tex(nrmUrl, false);
        const mk = (c) => new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(1, -1), color: c, roughness: 0.86, metalness: 0 });
        MOCAP.mats = { rifle: mk(0xffffff), rifle2: mk(0xe0dccb), rusher: mk(0xc48f74), heavy: mk(0x6f7a66), sniper: mk(0x8b98aa) };
        MOCAP.visor = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.12, metalness: 0.7 });
        MOCAP.scene = gltf.scene;
        MOCAP.clips = {};
        for (const c of gltf.animations) MOCAP.clips[c.name] = c;
        if (!MOCAP.clips.Idle || !MOCAP.clips.Walk || !MOCAP.clips.Run) throw new Error('clips missing');
        const ws = measure(MOCAP.clips.Walk), rs = measure(MOCAP.clips.Run);
        MOCAP.flip = ws < 0;
        if (Math.abs(ws) > 0.5) MOCAP.walkSpeed = Math.abs(ws);
        if (Math.abs(rs) > 1.5) MOCAP.runSpeed = Math.abs(rs);
        MOCAP.ready = true;
        // 피격·사망·구르기 클립(CC0 팩)을 병사 골격으로 옮겨 붙인다. 실패해도 게임은 절차적 동작으로 계속된다
        loadExtraClips(skClone(MOCAP.scene)).then((r) => {
          Object.assign(MOCAP.clips, r.clips);
          MOCAP.extra = r.info;
          const d = r.info.Death;
          if (d) { MOCAP.deathYaw = Math.atan2(d.head[0], d.head[2]) + (MOCAP.flip ? Math.PI : 0); MOCAP.deathReach = Math.hypot(d.head[0], d.head[2]); }
        }).catch((e) => { MOCAP.extraErr = String((e && e.message) || e); console.warn('extra clips failed', e); });
      } catch (e) { MOCAP.failed = true; console.warn('mocap init failed', e); }
      if (done) done();
    }, (e) => { MOCAP.failed = true; console.warn('mocap parse failed', e); if (done) done(); });
  } catch (e) { MOCAP.failed = true; console.warn('mocap load failed', e); if (done) done(); }
}

// 뼈를 월드 기준 회전 qd 만큼 추가로 돌린다
function rotW(bone, qd) {
  bone.parent.getWorldQuaternion(_pq);
  _lq.copy(_pq).invert().multiply(qd).multiply(_pq).multiply(bone.quaternion);
  bone.quaternion.copy(_lq);
}
// 뼈의 길이 방향(+Y)이 월드 방향 dir을 향하게 한다
function aimBone(bone, dir, w) {
  bone.parent.getWorldQuaternion(_pq);
  _wq.copy(_pq).multiply(bone.quaternion);
  _ax.set(0, 1, 0).applyQuaternion(_wq);
  _dq.setFromUnitVectors(_ax, dir);
  _wq.premultiply(_dq);
  _lq.copy(_pq).invert().multiply(_wq);
  if (w >= 1) bone.quaternion.copy(_lq);
  else bone.quaternion.slerp(_lq, w);
}
// 2본 IK: upper→lower 사슬의 끝이 target에 닿도록, 관절은 pole 쪽으로 굽힌다
function limbIK(upper, lower, target, pole, l1, l2) {
  upper.getWorldPosition(_s);
  _d.subVectors(target, _s);
  let dist = _d.length();
  _d.normalize();
  dist = clamp(dist, 0.08, l1 + l2 - 0.004);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  _e.copy(_s).addScaledVector(_d, a).addScaledVector(_p, h);
  _t.subVectors(_e, _s).normalize();
  aimBone(upper, _t, 1);
  _t.copy(_s).addScaledVector(_d, dist).sub(_e).normalize();
  aimBone(lower, _t, 1);
}
function setWorldQuat(bone, wq) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(wq));
}

// ───────────────────────── 래그돌 (베를레 적분 + 거리 구속)
// 관절 15개를 질점으로 두고 뼈 길이를 구속한다. 사망 순간의 자세·속도·피격 충격에서 출발해 중력으로 무너진다.
const RJ = ['hips', 'spine2', 'head', 'lArm', 'lFore', 'lHand', 'rArm', 'rFore', 'rHand', 'lUp', 'lLeg', 'lFoot', 'rUp', 'rLeg', 'rFoot'];
const RR = [0.1, 0.11, 0.1, 0.06, 0.05, 0.045, 0.06, 0.05, 0.045, 0.09, 0.06, 0.05, 0.09, 0.06, 0.05];
const RC = [[0, 1], [1, 2], [1, 3], [1, 6], [3, 6], [3, 4], [4, 5], [6, 7], [7, 8], [0, 9], [0, 12], [9, 12], [9, 10], [10, 11], [12, 13], [13, 14],
  [3, 9], [6, 12], [3, 12], [6, 9], [1, 9], [1, 12], [2, 3], [2, 6]];
// 최소 거리 구속: [i, j, 값] (양수 = 초기 거리의 배수, 음수 = 절대 거리 m)
const RMIN = [[2, 0, 0.85], [10, 13, -0.16], [11, 14, -0.14], [11, 9, -0.3], [14, 12, -0.3], [5, 2, -0.14], [8, 2, -0.14], [4, 0, -0.2], [7, 0, -0.2]];
const RW = [0.5, 1, 0.8, 0.7, 0.3, 0.2, 0.7, 0.3, 0.2, 0.4, 0.2, 0.1, 0.4, 0.2, 0.1];
const RH = 1 / 90;
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion();

function basisQuat(out, p) {
  _bx.set(p[27] - p[36], p[28] - p[37], p[29] - p[38]).normalize(); // 왼쪽 골반 - 오른쪽 골반
  _by.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
  _by.addScaledVector(_bx, -_by.dot(_bx)).normalize();
  _bz.crossVectors(_bx, _by);
  return out.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
}

function ragInit(body, e, imp) {
  const N = RJ.length, p = new Float32Array(N * 3), q = new Float32Array(N * 3), b = body.b;
  body.root.updateMatrixWorld(true);
  for (let i = 0; i < N; i++) {
    b[RJ[i]].getWorldPosition(_s);
    p[i * 3] = _s.x; p[i * 3 + 1] = _s.y + (i === 2 ? 0.08 * body.sc : 0); p[i * 3 + 2] = _s.z;
  }
  const dir = imp.dir, pw = imp.power || 0, bl = imp.blast;
  for (let i = 0; i < N; i++) {
    let vx = e.vx, vy = 0, vz = e.vz;
    if (bl) {
      _d.set(p[i * 3] - bl.x, p[i * 3 + 1] - bl.y + 0.6, p[i * 3 + 2] - bl.z).normalize();
      const k = bl.power * (0.8 + Math.random() * 0.4);
      vx += _d.x * k; vy += _d.y * k; vz += _d.z * k;
    } else if (dir) {
      let w = RW[i];
      if (imp.part === 2) w = i === 2 ? 1.7 : i === 1 ? 0.7 : w;
      else if (imp.part === 0) w = i >= 9 ? 0.9 : w * 0.5;
      vx += dir.x * pw * w + (Math.random() - 0.5) * 0.5;
      vy += (dir.y || 0) * pw * w * 0.5 + (Math.random() - 0.5) * 0.3;
      vz += dir.z * pw * w + (Math.random() - 0.5) * 0.5;
    }
    q[i * 3] = p[i * 3] - vx * RH; q[i * 3 + 1] = p[i * 3 + 1] - vy * RH; q[i * 3 + 2] = p[i * 3 + 2] - vz * RH;
  }
  const dist = (i, j) => Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]);
  const rest = RC.map(([i, j]) => dist(i, j)), min = RMIN.map(([i, j, v]) => (v > 0 ? dist(i, j) * v : -v));
  b.hips.getWorldQuaternion(_wq);
  const off = basisQuat(new THREE.Quaternion(), p).invert().multiply(_wq);
  const cols = colliders.filter((c) => c.y1 > 0.2 && e.pos.x > c.x0 - 3.5 && e.pos.x < c.x1 + 3.5 && e.pos.z > c.z0 - 3.5 && e.pos.z < c.z1 + 3.5);
  return { p, q, rest, min, off, cols, t: 0, acc: 0, asleep: false };
}

function ragStep(R) {
  const { p, q, rest, min, cols } = R, N = RJ.length, g = 9.8 * RH * RH;
  for (let k = 0; k < N * 3; k++) {
    const v = (p[k] - q[k]) * 0.992;
    q[k] = p[k];
    p[k] += v;
  }
  for (let i = 0; i < N; i++) p[i * 3 + 1] -= g;
  for (let it = 0; it < 5; it++) {
    for (let c = 0; c < RC.length; c++) {
      const i = RC[c][0] * 3, j = RC[c][1] * 3, dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6) continue;
      const f = ((d - rest[c]) / d) * 0.5;
      p[i] += dx * f; p[i + 1] += dy * f; p[i + 2] += dz * f;
      p[j] -= dx * f; p[j + 1] -= dy * f; p[j + 2] -= dz * f;
    }
    for (let c = 0; c < RMIN.length; c++) {
      const i = RMIN[c][0] * 3, j = RMIN[c][1] * 3, dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= min[c] || d < 1e-6) continue;
      const f = ((d - min[c]) / d) * 0.5;
      p[i] += dx * f; p[i + 1] += dy * f; p[i + 2] += dz * f;
      p[j] -= dx * f; p[j + 1] -= dy * f; p[j + 2] -= dz * f;
    }
    for (let i = 0; i < N; i++) {
      const k = i * 3, r = RR[i];
      if (p[k + 1] < r) { // 바닥: 마찰로 미끄러짐을 줄인다
        p[k + 1] = r;
        q[k + 1] = r;
        q[k] = p[k] - (p[k] - q[k]) * 0.45;
        q[k + 2] = p[k + 2] - (p[k + 2] - q[k + 2]) * 0.45;
      }
      for (let n = 0; n < cols.length; n++) {
        const c = cols[n];
        if (p[k] <= c.x0 - r || p[k] >= c.x1 + r || p[k + 2] <= c.z0 - r || p[k + 2] >= c.z1 + r || p[k + 1] >= c.y1 + r || p[k + 1] <= c.y0 - r) continue;
        const ex0 = p[k] - (c.x0 - r), ex1 = c.x1 + r - p[k], ez0 = p[k + 2] - (c.z0 - r), ez1 = c.z1 + r - p[k + 2], ey = c.y1 + r - p[k + 1], m = Math.min(ex0, ex1, ez0, ez1, ey);
        if (m === ey) { p[k + 1] = c.y1 + r; q[k + 1] = p[k + 1]; q[k] = p[k] - (p[k] - q[k]) * 0.45; q[k + 2] = p[k + 2] - (p[k + 2] - q[k + 2]) * 0.45; }
        else if (m === ex0) { p[k] = c.x0 - r; q[k] = p[k]; }
        else if (m === ex1) { p[k] = c.x1 + r; q[k] = p[k]; }
        else if (m === ez0) { p[k + 2] = c.z0 - r; q[k + 2] = p[k + 2]; }
        else { p[k + 2] = c.z1 + r; q[k + 2] = p[k + 2]; }
      }
    }
  }
}

// 질점 위치 → 뼈 자세
function ragApply(body, R) {
  const b = body.b, p = R.p;
  const seg = (i, j) => _t.set(p[j * 3] - p[i * 3], p[j * 3 + 1] - p[i * 3 + 1], p[j * 3 + 2] - p[i * 3 + 2]).normalize();
  _wq.copy(basisQuat(_bq, p)).multiply(R.off);
  b.hips.parent.updateWorldMatrix(true, false);
  b.hips.position.copy(b.hips.parent.worldToLocal(_s.set(p[0], p[1], p[2])));
  setWorldQuat(b.hips, _wq);
  aimBone(b.neck, seg(1, 2), 1);
  aimBone(b.lArm, seg(3, 4), 1); aimBone(b.lFore, seg(4, 5), 1);
  aimBone(b.rArm, seg(6, 7), 1); aimBone(b.rFore, seg(7, 8), 1);
  aimBone(b.lUp, seg(9, 10), 1); aimBone(b.lLeg, seg(10, 11), 1);
  aimBone(b.rUp, seg(12, 13), 1); aimBone(b.rLeg, seg(13, 14), 1);
}

export class MocapBody {
  constructor(matKey, scale = 1) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    const obj = (this.obj = skClone(MOCAP.scene));
    if (MOCAP.flip) obj.rotation.y = Math.PI;
    obj.scale.setScalar(scale);
    this.sc = scale;
    this.root.add(obj);
    const mat = MOCAP.mats[matKey] || MOCAP.mats.rifle;
    obj.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = /visor/i.test(o.name) ? MOCAP.visor : mat;
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const B = (n) => obj.getObjectByName('mixamorig' + n);
    this.b = { hips: B('Hips'), spine: B('Spine'), spine1: B('Spine1'), spine2: B('Spine2'), neck: B('Neck'), head: B('Head'),
      lArm: B('LeftArm'), lFore: B('LeftForeArm'), lHand: B('LeftHand'), rArm: B('RightArm'), rFore: B('RightForeArm'), rHand: B('RightHand'),
      lUp: B('LeftUpLeg'), lLeg: B('LeftLeg'), lFoot: B('LeftFoot'), rUp: B('RightUpLeg'), rLeg: B('RightLeg'), rFoot: B('RightFoot') };
    for (const k in this.b) if (!this.b[k]) throw new Error('bone missing: ' + k);
    // 믹서는 값이 바뀐 트랙만 다시 쓰므로, 덧입힌 회전이 누적되지 않게 원본 값을 따로 기억한다
    this.ov = ['spine', 'spine1', 'spine2', 'lArm', 'lFore', 'rArm', 'rFore', 'lUp', 'lLeg', 'lFoot', 'rUp', 'rLeg', 'rFoot'].map((k) => ({ q: this.b[k].quaternion, base: this.b[k].quaternion.clone(), applied: this.b[k].quaternion.clone() }));
    this.hipBase = this.b.hips.position.clone();
    this.hipApplied = this.b.hips.position.clone();
    this.mixer = new THREE.AnimationMixer(obj);
    this.act = {};
    for (const k of ['Idle', 'Walk', 'Run']) {
      const a = this.mixer.clipAction(MOCAP.clips[k]);
      a.play();
      a.time = Math.random() * MOCAP.clips[k].duration;
      this.act[k] = a;
    }
    this.w = { Idle: 1, Walk: 0, Run: 0 };
    this.loco = 'Idle';
    const g = makeGun();
    this.gun = g.group;
    this.flash = g.flash;
    this.root.add(this.gun);
    this.dropped = false;
    this.gv = new THREE.Vector3();
    this.rag = null;
    this.ovl = null;
    this.deathClip = null;
  }

  // 한 번 재생하고 사라지는 덧입힘 클립 (피격·넉백·구르기). full이면 전신, 아니면 상체만
  playOver(name, opt = {}) {
    const clip = MOCAP.clips[name];
    if (!clip || this.rag || this.deathClip) return false;
    if (this.ovl && this.ovl.t < 0.12 && !opt.force) return false;
    if (this.ovl) this.ovl.a.stop();
    const rate = opt.rate || 1, a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = rate;
    a.setEffectiveWeight(0);
    a.play();
    this.ovl = { a, t: 0, dur: clip.duration / rate, tin: opt.tin ?? 0.07, tout: opt.tout ?? 0.16, peak: opt.peak ?? 1, full: !!opt.full, m: 0 };
    return true;
  }

  restore() {
    for (const o of this.ov) {
      if (o.q.equals(o.applied)) o.q.copy(o.base);
      else o.base.copy(o.q);
    }
    const hp = this.b.hips.position;
    if (hp.equals(this.hipApplied)) hp.copy(this.hipBase);
    else this.hipBase.copy(hp);
  }
  commit() {
    for (const o of this.ov) o.applied.copy(o.q);
    this.hipApplied.copy(this.b.hips.position);
  }

  animate(e, dt) {
    const w = this.w, act = this.act, s = e.speed;
    this.root.position.set(e.pos.x, 0, e.pos.z);
    this.root.rotation.set(0, e.bodyYaw, 0);
    if (this.loco === 'Idle') { if (s > 0.35) this.loco = s > 2.7 ? 'Run' : 'Walk'; }
    else if (s < 0.2) this.loco = 'Idle';
    else if (this.loco === 'Walk' && s > 2.7) this.loco = 'Run';
    else if (this.loco === 'Run' && s < 2.2) this.loco = 'Walk';
    const k = 1 - Math.exp(-dt * 9);
    let om = 0;
    const o = this.ovl;
    if (o) {
      o.t += dt;
      const rem = o.dur - o.t;
      if (rem <= 0) { o.a.stop(); this.ovl = null; }
      else {
        o.m = Math.min(1, o.t / o.tin, rem / o.tout) * o.peak;
        // 상체만 덮는 클립은 이동 클립과 겨루므로 가중치를 크게, 전신 클립은 이동 클립을 그만큼 줄인다
        o.a.setEffectiveWeight(o.full ? o.m : o.m * 4);
        if (o.full) om = o.m;
      }
    }
    for (const n in w) {
      w[n] += ((n === this.loco ? 1 : 0) - w[n]) * k;
      act[n].setEffectiveWeight(w[n] * (1 - om));
    }
    const dir = e.back ? -1 : 1;
    act.Walk.timeScale = dir * clamp(s / (MOCAP.walkSpeed * this.sc), 0.5, 1.9);
    act.Run.timeScale = dir * clamp(s / (MOCAP.runSpeed * this.sc), 0.6, 1.35);
    this.mixer.update(dt);
    this.restore();
    this.pose(e);
    this.flash.visible = e.flashT > 0;
  }

  // 모캡 포즈 위에 덧입히는 절차적 자세: 다리 IK(앉기), 상체 비틀기·기울임, 소총 위치와 반동, 팔 IK
  pose(e) {
    const ovm = this.ovl ? this.ovl.m : 0, flinch = e.flinch * (ovm > 0 ? 0.35 : 1);
    const b = this.b, root = this.root, sc = this.sc, aim = e.aim * (1 - 0.55 * Math.min(1, ovm)), crouch = e.crouch * (this.ovl && this.ovl.full ? 1 - Math.min(1, ovm) : 1), kick = e.kick || 0;
    _fw.set(0, 0, 1).applyQuaternion(root.quaternion);
    _R.set(1, 0, 0).applyQuaternion(root.quaternion);
    if (crouch > 0.01) {
      // 발은 제자리에 두고 골반만 내린 뒤 다리를 IK로 굽힌다
      root.updateMatrixWorld(true);
      b.lFoot.getWorldPosition(_fl);
      b.rFoot.getWorldPosition(_fr);
      b.lFoot.getWorldQuaternion(_fql);
      b.rFoot.getWorldQuaternion(_fqr);
      b.hips.position.z -= crouch * 40;
      limbIK(b.lUp, b.lLeg, _fl, _pole.copy(_fw).addScaledVector(_R, 0.3), THIGH * sc, SHIN * sc);
      limbIK(b.rUp, b.rLeg, _fr, _pole.copy(_fw).addScaledVector(_R, -0.3), THIGH * sc, SHIN * sc);
      setWorldQuat(b.lFoot, _fql);
      setWorldQuat(b.rFoot, _fqr);
    }
    const twist = clamp(angDiff(e.bodyYaw, e.aimYaw), -1.3, 1.3) * aim;
    const lean = -flinch * 0.3 - e.aimPitch * 0.25 * aim + crouch * 0.2 - kick * 0.035;
    if (Math.abs(twist) > 0.003 || Math.abs(lean) > 0.003) {
      _q.setFromAxisAngle(UP, twist / 3).multiply(_q2.setFromAxisAngle(_R, lean / 3));
      if (flinch > 0.01) _q.multiply(_q2.setFromAxisAngle(_fw, e.flinchSide * flinch * 0.1));
      rotW(b.spine, _q);
      rotW(b.spine1, _q);
      rotW(b.spine2, _q);
    }
    root.updateMatrixWorld(true);
    b.spine2.getWorldPosition(_c);
    root.worldToLocal(_c);
    _off.lerpVectors(LOW_OFF, AIM_OFF, aim);
    _off.z -= kick * 0.03;
    _off.multiplyScalar(sc).applyAxisAngle(UP, twist);
    this.gun.position.copy(_c).add(_off);
    this.gun.rotation.set(lerp(0.55, -e.aimPitch, aim) - kick * 0.045, twist + lerp(0.6, 0, aim), 0);
    this.gun.updateMatrixWorld(true);
    const A = e.bodyYaw + twist;
    _rt.set(-Math.cos(A), 0, Math.sin(A));
    _fw.set(Math.sin(A), 0, Math.cos(A));
    _g.copy(GRIP).applyMatrix4(this.gun.matrixWorld);
    limbIK(b.rArm, b.rFore, _g, _pole.copy(_rt).multiplyScalar(0.7).addScaledVector(UP, -1).addScaledVector(_fw, -0.25), L1 * sc, L2 * sc);
    _g.copy(FORE).applyMatrix4(this.gun.matrixWorld);
    limbIK(b.lArm, b.lFore, _g, _pole.copy(_rt).multiplyScalar(-0.6).addScaledVector(UP, -1), L1 * sc, L2 * sc);
    this.commit();
  }

  // imp: { dir, power, part } 또는 { blast: { x, y, z, power } }
  die(e, scene, imp) {
    for (const n in this.act) this.act[n].timeScale = 0;
    this.flash.visible = false;
    scene.attach(this.gun); // 총을 손에서 놓는다
    this.dropped = true;
    const d = imp.dir || { x: 0, z: 0 };
    this.gv.set(d.x * 1.5 + (Math.random() - 0.5) * 1.2 + e.vx, 1.4 + (imp.blast ? 3 : 0), d.z * 1.5 + (Math.random() - 0.5) * 1.2 + e.vz);
    if (this.ovl) { this.ovl.a.stop(); this.ovl = null; }
    if (imp.clip && MOCAP.clips[imp.clip]) { // 고정 클립으로 쓰러진다 (Death: 천천히 무너짐, Knockback: 뒤로 나가떨어짐)
      const a = this.mixer.clipAction(MOCAP.clips[imp.clip]);
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = imp.clip === 'Death' ? 1.25 : 1;
      a.setEffectiveWeight(0);
      a.play();
      this.deathClip = { a, fade: 0 };
    } else this.rag = ragInit(this, e, imp);
  }

  animateDead(e, dt) {
    const R = this.rag, t = e.deadT, dc = this.deathClip;
    if (dc) {
      dc.fade = Math.min(1, dc.fade + dt / 0.14);
      for (const n in this.w) this.act[n].setEffectiveWeight(this.w[n] * (1 - dc.fade));
      dc.a.setEffectiveWeight(dc.fade);
      this.mixer.update(dt);
      this.restore();
      if (t > 10) this.root.position.y -= dt * 0.25;
    } else if (!R.asleep) {
      R.acc += Math.min(dt, 0.05);
      for (let n = 0; R.acc >= RH && n < 5; n++) { ragStep(R); R.acc -= RH; }
      ragApply(this, R);
      R.t += dt;
      if (R.t > 6) R.asleep = true;
    } else if (t > 10) this.root.position.y -= dt * 0.25;
    const g = this.gun;
    if (g.position.y > 0.05) {
      this.gv.y -= 9.8 * dt;
      g.position.addScaledVector(this.gv, dt);
      g.rotation.x += dt * 3;
      g.rotation.y += dt * 1.5;
      if (g.position.y <= 0.05) {
        g.position.y = 0.05;
        g.rotation.x = 0;
        g.rotation.z = Math.PI / 2;
      }
    } else if (t > 10) g.position.y -= dt * 0.25;
    return t > 12.5;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.gun.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.obj);
    this.obj.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
  }
}

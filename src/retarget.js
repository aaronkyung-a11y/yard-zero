// CC0 애니메이션 팩(Quaternius Universal Animation Library 1·2)의 클립을 병사 골격(Mixamo)으로 옮긴다.
// 두 골격의 T자 자세를 기준으로, 원본 뼈의 월드 회전 변화량을 대상 뼈에 그대로 적용하는 방식.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import anim1 from '../assets/anim1.glb';
import anim2 from '../assets/anim2.glb';

const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const side = (m) => {
  const o = {};
  for (const k in m) {
    if (/Left/.test(m[k])) { o[k] = m[k]; o[k.replace(/L$/, 'R').replace(/_l$/, '_r')] = m[k].replace('Left', 'Right'); }
    else o[k] = m[k];
  }
  return o;
};
// GLTFLoader가 이름의 점을 지우므로 'DEF-spine.001' → 'DEF-spine001'
const MAP1 = side({ 'DEF-hips': 'Hips', 'DEF-spine001': 'Spine', 'DEF-spine002': 'Spine1', 'DEF-spine003': 'Spine2', 'DEF-neck': 'Neck', 'DEF-head': 'Head',
  'DEF-shoulderL': 'LeftShoulder', 'DEF-upper_armL': 'LeftArm', 'DEF-forearmL': 'LeftForeArm', 'DEF-handL': 'LeftHand',
  'DEF-thighL': 'LeftUpLeg', 'DEF-shinL': 'LeftLeg', 'DEF-footL': 'LeftFoot', 'DEF-toeL': 'LeftToeBase' });
const MAP2 = side({ pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase' });
const UPPER = /Spine|Neck|Head/;

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

function parse(b64) {
  return new Promise((res, rej) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    new GLTFLoader().parse(u8.buffer, '', res, rej);
  });
}

function retargetSet(gltf, MAP, tgt, want, out, info, tag) {
  const src = gltf.scene, sN = {}, tN = {};
  src.traverse((o) => { sN[o.name] = o; });
  tgt.traverse((o) => { if (o.name.startsWith('mixamorig')) tN[o.name.slice(9)] = o; });
  const inv = {};
  for (const k in MAP) inv[MAP[k]] = k;
  const pairs = ORDER.map((t) => (sN[inv[t]] && tN[t] ? { s: sN[inv[t]], t: tN[t], name: t } : null)).filter(Boolean);
  const P = {};
  for (const p of pairs) P[p.name] = p;
  if (!P.Hips || !P.LeftArm || !P.RightArm || !P.LeftFoot || !P.LeftForeArm) throw new Error('bones missing: ' + tag);
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  const mixer = new THREE.AnimationMixer(src);
  const setPose = (clip, time) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    mixer.setTime(Math.min(time, clip.duration - 1e-4));
    src.updateMatrixWorld(true);
  };
  const wp = (o, v) => o.getWorldPosition(v);
  // 기준 자세: A_TPose 클립에서 팔이 가장 수평인 시점
  const tp = clips.A_TPose;
  if (!tp) throw new Error('no T pose: ' + tag);
  let bestT = 0, bestY = 9;
  for (let i = 0; i <= 10; i++) {
    const t = (tp.duration * i) / 10;
    setPose(tp, t);
    const d = wp(P.LeftForeArm.s, _v).sub(wp(P.LeftArm.s, _v2)).normalize();
    if (Math.abs(d.y) < bestY) { bestY = Math.abs(d.y); bestT = t; }
  }
  setPose(tp, bestT);
  tgt.updateMatrixWorld(true);
  const tArm = wp(P.LeftForeArm.t, _v).sub(wp(P.LeftArm.t, _v2)).normalize().y;
  // 바라보는 방향 맞추기 (왼팔→오른팔 벡터의 방위각 차이)
  const yaw = (a, b) => { const d = wp(b, _v).sub(wp(a, _v2)); return Math.atan2(d.x, d.z); };
  const F = new THREE.Quaternion().setFromAxisAngle(Y, yaw(P.LeftArm.t, P.RightArm.t) - yaw(P.LeftArm.s, P.RightArm.s)), Fi = F.clone().invert();
  for (const p of pairs) {
    p.sRefInv = p.s.getWorldQuaternion(new THREE.Quaternion()).invert();
    p.tRef = p.t.getWorldQuaternion(new THREE.Quaternion());
    p.restLocal = p.t.quaternion.clone();
  }
  const sHip0 = wp(P.Hips.s, new THREE.Vector3()), tHip0 = wp(P.Hips.t, new THREE.Vector3());
  const sLeg = sHip0.y - wp(P.LeftFoot.s, _v).y, tLeg = tHip0.y - wp(P.LeftFoot.t, _v).y, scale = tLeg / sLeg;
  const hipRestLocal = P.Hips.t.position.clone();
  info[tag] = { refT: +bestT.toFixed(3), srcArmY: +bestY.toFixed(3), tgtArmY: +tArm.toFixed(3), scale: +scale.toFixed(3), pairs: pairs.length };
  for (const srcName in want) {
    const clip = clips[srcName];
    if (!clip) continue;
    const n = Math.max(2, Math.ceil(clip.duration * 30) + 1), times = new Float32Array(n);
    const qv = pairs.map(() => new Float32Array(n * 4)), hv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const time = Math.min(i / 30, clip.duration);
      times[i] = time;
      setPose(clip, time);
      for (let k = 0; k < pairs.length; k++) {
        const p = pairs[k];
        p.s.getWorldQuaternion(_q);
        _q.multiply(p.sRefInv).premultiply(F).multiply(Fi).multiply(p.tRef); // F·S·Sref⁻¹·F⁻¹·Tref
        p.t.parent.getWorldQuaternion(_pq);
        p.t.quaternion.copy(_pq.invert().multiply(_q));
        const a = qv[k], j = i * 4, tq = p.t.quaternion;
        if (i > 0 && a[j - 4] * tq.x + a[j - 3] * tq.y + a[j - 2] * tq.z + a[j - 1] * tq.w < 0) tq.set(-tq.x, -tq.y, -tq.z, -tq.w);
        a[j] = tq.x; a[j + 1] = tq.y; a[j + 2] = tq.z; a[j + 3] = tq.w;
        if (k === 0) {
          wp(p.s, _v).sub(sHip0).applyQuaternion(F).multiplyScalar(scale).add(tHip0);
          p.t.parent.updateWorldMatrix(true, false);
          p.t.parent.worldToLocal(_v);
          p.t.position.copy(_v);
          hv[i * 3] = _v.x; hv[i * 3 + 1] = _v.y; hv[i * 3 + 2] = _v.z;
        }
      }
      if (i === n - 1) { // 마지막 자세에서 머리가 놓이는 위치 (쓰러지는 방향 계산용)
        tgt.updateMatrixWorld(true);
        const h = wp(P.Head.t, new THREE.Vector3());
        info[want[srcName].replace(/^U:/, '')] = { dur: +clip.duration.toFixed(2), head: [+h.x.toFixed(2), +h.y.toFixed(2), +h.z.toFixed(2)], hipY: +wp(P.Hips.t, _v).y.toFixed(2) };
      }
    }
    const mk = (filter) => {
      const tracks = [];
      for (let k = 0; k < pairs.length; k++) {
        if (filter && !filter.test(pairs[k].name)) continue;
        tracks.push(new THREE.QuaternionKeyframeTrack(pairs[k].t.name + '.quaternion', times, qv[k]));
      }
      if (!filter) tracks.push(new THREE.VectorKeyframeTrack(P.Hips.t.name + '.position', times, hv));
      return tracks;
    };
    const name = want[srcName], key = name.replace(/^U:/, '');
    out[key] = new THREE.AnimationClip(key, clip.duration, mk(/^U:/.test(name) ? UPPER : null));
  }
  mixer.stopAllAction();
  for (const p of pairs) p.t.quaternion.copy(p.restLocal);
  P.Hips.t.position.copy(hipRestLocal);
}

// tgt: 기본 자세(T자)의 병사 복제본. 결과: { 이름: AnimationClip }, info: 점검용 수치
export async function loadExtraClips(tgt) {
  const out = {}, info = {};
  const [g1, g2] = await Promise.all([parse(anim1), parse(anim2)]);
  retargetSet(g1, MAP1, tgt, { Hit_Chest: 'U:HitChest', Hit_Head: 'U:HitHead', Death01: 'Death', Roll: 'Roll' }, out, info, 'ual1');
  retargetSet(g2, MAP2, tgt, { Hit_Knockback: 'Knockback' }, out, info, 'ual2');
  return { clips: out, info };
}

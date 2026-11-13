// YARD ZERO — 모바일 3D FPS (단일 HTML)
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { $, clamp, lerp, smooth, rad, TAU, rr, gauss, angDiff, damp } from './util.js';
import { makeTextures } from './textures.js';
import { colliders, buildWorld, buildNav, rayWorld, hit, losClear, collideMove, findPath, blockedAt, navLineClear, NAV, cellX, cellZ, START, B, WH, snapDown, WORLD, MAPS } from './world.js';
import * as SFX from './audio.js';
import { Particles, Decals, Tracers, Shells } from './fx.js';
import { initSoldierAssets, PuppetBody } from './soldier.js';
import { MOCAP, loadMocap, MocapBody } from './mocap.js';
import { buildViewmodel } from './viewmodel.js';
import { EPISODES, SQUAD } from './episodes.js';
import { NET, host as netHost, join as netJoin, sendEv, sendSt, close as netClose } from './net.js';

const VERSION = 'v0.7';
const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Vector3(), _mz = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1);

// ───────────────────────── 설정 저장
const store = {
  get(k, d) { try { const v = localStorage.getItem('yz.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('yz.' + k, JSON.stringify(v)); } catch (e) { /* 저장소 없음 */ } },
};
const opt = { sens: store.get('sens', 1), sound: store.get('sound', true), quality: store.get('quality', 'high'), rot: store.get('rot', false), autoFire: false };
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
opt.autoFire = store.get('auto', isTouchDevice);
function setInputMode(touch) {
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('mouse', !touch);
}
setInputMode(isTouchDevice);
// 화면 좌표: 90° 회전 모드에서는 논리적 가로·세로가 뷰포트와 뒤바뀐다
let LW = window.innerWidth, LH = window.innerHeight, ROT = false;
const lx = (t) => (ROT ? t.clientY : t.clientX), ly = (t) => (ROT ? window.innerWidth - t.clientX : t.clientY);

// ───────────────────────── 렌더러
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('err').hidden = false;
  $('menu').classList.add('hidden');
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.54;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene(), vmScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 900);
camera.rotation.order = 'YXZ';
const vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 6);
vmScene.add(vmCam);
let baseFov = 62, vmShiftX = 0;

// ───────────────────────── 하늘·조명: 환경 프리셋(낮·새벽·흐림·밤)을 맵마다 바꿔 쓴다
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, rad(90 - 24), rad(125)); // 직사광(해 또는 달) 방향
const skySun = new THREE.Vector3(); // 하늘 셰이더에 주는 해 위치 (밤에는 지평선 아래)
const sky = new Sky();
sky.scale.setScalar(10000);
const envScene = new THREE.Scene();
{
  const gd = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x4a4640 }));
  gd.rotation.x = -Math.PI / 2;
  gd.position.y = -1.2;
  envScene.add(gd);
  envScene.userData.gd = gd;
}
let SUN_I = 9;
const sun = new THREE.DirectionalLight(0xffe9c9, SUN_I);
scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
const hemi = new THREE.HemisphereLight(0xc4d6ff, 0x4d463c, 0.5);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xb9c1c8, 0.0036);
// 그림자 범위를 현재 맵 크기에 맞춘다
function fitShadow() {
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, R = Math.hypot(B.x1 - B.x0, B.z1 - B.z0) / 2 + 8, c = sun.shadow.camera;
  sun.target.position.set(cx, 0, cz);
  sun.position.copy(sunDir).multiplyScalar(150).add(sun.target.position);
  sun.target.updateMatrixWorld();
  c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 20; c.far = 320;
  c.updateProjectionMatrix();
}
// el: 고도(도), az: 방위(도), sky: [탁도, 레일리, 미 계수, 미 방향성]
const ENVS = {
  day: { label: '낮', el: 24, az: 125, sun: 0xffe9c9, sunI: 9, hemi: [0xc4d6ff, 0x4d463c, 0.5], fog: [0xb9c1c8, 0.0036], exp: 0.54, sky: [7, 1.6, 0.004, 0.82],
    cloud: { shade: [0.6, 0.65, 0.72], lit: [1.25, 1.12, 0.95], glow: [1.0, 0.86, 0.62], cover: 0.5, alpha: 0.85 }, glowN: 0, glow: 0.2 },
  dawn: { label: '새벽', el: 7, az: 100, sun: 0xffb27c, sunI: 7, hemi: [0xaab6dc, 0x4a3d36, 0.55], fog: [0xd2b3a0, 0.0048], exp: 0.62, sky: [9, 2.6, 0.006, 0.86],
    cloud: { shade: [0.5, 0.46, 0.56], lit: [1.5, 0.95, 0.68], glow: [1.0, 0.6, 0.36], cover: 0.46, alpha: 0.85 }, glowN: 0.16, glow: 0.3 },
  overcast: { label: '흐림·비', el: 55, az: 150, sun: 0xdde4ec, sunI: 2.6, hemi: [0xdfe6f2, 0x5a554e, 1.6], fog: [0xa3aab0, 0.0064], exp: 0.6, sky: [20, 0.6, 0.012, 0.7],
    cloud: { shade: [0.5, 0.53, 0.57], lit: [0.74, 0.77, 0.8], glow: [0, 0, 0], cover: 0.08, alpha: 0.97 }, glowN: 0.1, glow: 0.3, rain: true },
  night: { label: '밤', el: 42, az: 215, sun: 0x9db6ff, sunI: 1.7, hemi: [0x6681bd, 0x222834, 1.15], fog: [0x0b1320, 0.0064], exp: 0.9, sky: [4, 0.6, 0.002, 0.8], night: true,
    cloud: { shade: [0.03, 0.04, 0.065], lit: [0.11, 0.14, 0.21], glow: [0.5, 0.6, 0.9], cover: 0.5, alpha: 0.8 }, glowN: 0.75, glow: 0.6, stars: true },
};
let envName = '';
let cloudMat = null;
function addClouds(tex) {
  cloudMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, sunDir: { value: sunDir }, cShade: { value: new THREE.Vector3(0.6, 0.65, 0.72) }, cLit: { value: new THREE.Vector3(1.25, 1.12, 0.95) }, cGlow: { value: new THREE.Vector3(1.0, 0.86, 0.62) }, uCover: { value: 0.5 }, uAlpha: { value: 0.85 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime; uniform vec3 sunDir; uniform vec3 cShade; uniform vec3 cLit; uniform vec3 cGlow; uniform float uCover; uniform float uAlpha; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        if (d.y < 0.012) discard;
        vec2 uv = d.xz / (d.y + 0.18);
        float n = texture2D(map, uv * 0.11 + vec2(uTime * 0.0035, 0.0)).r * 0.65 + texture2D(map, uv * 0.31 + vec2(uTime * 0.006, 0.3)).r * 0.35;
        float dens = smoothstep(uCover, uCover + 0.26, n) * smoothstep(0.012, 0.2, d.y);
        float sd = max(dot(d, sunDir), 0.0);
        vec3 lit = mix(cShade, cLit, 0.35 + 0.65 * pow(sd, 3.0));
        vec3 col = mix(lit * 0.7, lit, smoothstep(0.55, 0.9, n));
        float glow = pow(sd, 28.0) * 0.2 + pow(sd, 420.0) * 1.5;
        float a = dens * uAlpha;
        gl_FragColor = vec4(col * a + cGlow * glow * (1.0 - a * 0.6), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, premultipliedAlpha: true,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), cloudMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
}
const vmSun = new THREE.DirectionalLight(0xffe9c9, SUN_I);
vmScene.add(vmSun, vmSun.target);
const vmHemi = new THREE.HemisphereLight(0xc4d6ff, 0x4d463c, 0.5);
vmScene.add(vmHemi);
const flashLight = new THREE.PointLight(0xffb060, 0, 16, 2);
scene.add(flashLight);

// ───────────────────────── 월드
const T = makeTextures();
const M = {
  asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ map: T.concrete.map, normalMap: T.concrete.normalMap, roughness: 0.95 }),
  container: new THREE.MeshStandardMaterial({ map: T.corrugated.map, normalMap: T.corrugated.normalMap, vertexColors: true, roughness: 0.55, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }),
  wood: new THREE.MeshStandardMaterial({ map: T.crate.map, normalMap: T.crate.normalMap, roughness: 0.85 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0a1016, roughness: 0.04, metalness: 0.9 }),
  paint: new THREE.MeshStandardMaterial({ color: 0xc8a21c, roughness: 0.85, alphaMap: T.worn, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  marks: new THREE.MeshStandardMaterial({ map: T.marks, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.7, metalness: 0.2 }),
  floor: new THREE.MeshStandardMaterial({ map: T.concrete.map, normalMap: T.concrete.normalMap, roughness: 0.8, color: 0xb4b7b9, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff2d6, toneMapped: false }),
  glow: new THREE.MeshBasicMaterial({ map: T.soft, color: 0xffd9a0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  glowN: new THREE.MeshBasicMaterial({ map: T.soft, color: 0xffd9a0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  water: new THREE.MeshStandardMaterial({ color: 0x0c1c25, roughness: 0.14, metalness: 0.5 }),
  ao: new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: T.ao, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  puddle: new THREE.MeshStandardMaterial({ color: 0x090a0b, roughness: 0.03, alphaMap: T.puddle, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
};
addClouds(T.cloud);
// 별 (밤에만)
const stars = (() => {
  const n = 420, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, y = 0.08 + Math.random() * 0.92, rr2 = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * rr2 * 700; pos[i * 3 + 1] = y * 700; pos[i * 3 + 2] = Math.sin(a) * rr2 * 700;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcdd7ff, size: 1.7, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
  m.frustumCulled = false;
  m.renderOrder = -2;
  m.visible = false;
  scene.add(m);
  return m;
})();
// 비: 카메라 주위 상자 안에서 떨어지는 빗줄기
const rain = (() => {
  const N = 700, R = 17, H = 20, pos = new Float32Array(N * 6), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 3] = Math.random() * 2 * R; seed[i * 3 + 1] = Math.random() * H; seed[i * 3 + 2] = Math.random() * 2 * R; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb4bec8, transparent: true, opacity: 0.3, depthWrite: false }));
  m.frustumCulled = false;
  m.visible = false;
  scene.add(m);
  return { m, pos, seed, N, R, H, on: false, t: 0 };
})();
function updateRain(dt) {
  if (!rain.on) return;
  rain.t += dt;
  const { pos, seed, N, R, H } = rain, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, fall = rain.t * 24;
  for (let i = 0; i < N; i++) {
    // 카메라를 따라 감싸며 반복: 세계 좌표에 고정된 것처럼 보인다
    const x = cx - R + ((((seed[i * 3] - cx) % (2 * R)) + 2 * R) % (2 * R)), z = cz - R + ((((seed[i * 3 + 2] - cz) % (2 * R)) + 2 * R) % (2 * R));
    const y = cy - 6 + ((((seed[i * 3 + 1] - fall - cy) % H) + H) % H), j = i * 6;
    pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
    pos[j + 3] = x + 0.07; pos[j + 4] = y + 0.75; pos[j + 5] = z + 0.03;
  }
  rain.m.geometry.attributes.position.needsUpdate = true;
}
function applyEnv(name) {
  const E = ENVS[name] || ENVS.day;
  envName = ENVS[name] ? name : 'day';
  sunDir.setFromSphericalCoords(1, rad(90 - E.el), rad(E.az));
  if (E.night) skySun.setFromSphericalCoords(1, rad(90 + 16), rad(E.az)); else skySun.copy(sunDir);
  const u = sky.material.uniforms;
  u.turbidity.value = E.sky[0]; u.rayleigh.value = E.sky[1]; u.mieCoefficient.value = E.sky[2]; u.mieDirectionalG.value = E.sky[3];
  u.sunPosition.value.copy(skySun);
  // 환경 반사맵을 새 하늘로 다시 굽는다
  const pm = new THREE.PMREMGenerator(renderer);
  envScene.userData.gd.material.color.setHex(E.night ? 0x0c0f14 : 0x4a4640);
  envScene.add(sky);
  const env = pm.fromScene(envScene, 0, 0.1, 200).texture;
  if (scene.environment) scene.environment.dispose();
  scene.environment = env;
  vmScene.environment = env;
  pm.dispose();
  scene.add(sky);
  SUN_I = E.sunI;
  sun.color.setHex(E.sun); sun.intensity = E.sunI;
  vmSun.color.setHex(E.sun);
  hemi.color.setHex(E.hemi[0]); hemi.groundColor.setHex(E.hemi[1]); hemi.intensity = E.hemi[2];
  vmHemi.color.setHex(E.hemi[0]); vmHemi.groundColor.setHex(E.hemi[1]);
  scene.fog.color.setHex(E.fog[0]); scene.fog.density = E.fog[1];
  renderer.toneMappingExposure = E.exp;
  if (cloudMat) {
    const cu = cloudMat.uniforms, c = E.cloud;
    cu.cShade.value.fromArray(c.shade); cu.cLit.value.fromArray(c.lit); cu.cGlow.value.fromArray(c.glow); cu.uCover.value = c.cover; cu.uAlpha.value = c.alpha;
  }
  M.glowN.opacity = E.glowN;
  M.glow.opacity = E.glow;
  stars.visible = !!E.stars;
  rain.on = !!E.rain;
  rain.m.visible = rain.on;
  SFX.setRain(rain.on);
}
// 맵과 환경을 바꾼다. 맵이 같으면 월드는 다시 만들지 않는다
function loadMap(id, env) {
  if (WORLD.id !== id) buildWorld(scene, M, id);
  if ((env || 'day') !== envName) applyEnv(env || 'day'); // 환경이 같으면 반사맵을 다시 굽지 않는다
  for (const m of WORLD.meshes) if (m.userData.list === 'glowN') m.visible = ENVS[envName].glowN > 0.01;
  fitShadow();
}
loadMap('yard', 'day');
initSoldierAssets(T);
loadMocap();

const dust = new Particles(scene, 420, false, T.soft), sparks = new Particles(scene, 160, true, T.soft);
const decals = new Decals(scene, T.hole, 110), tracers = new Tracers(scene, 20), shells = new Shells(scene, 24);
const scorch = new Decals(scene, T.scorch, 10);
shells.onBounce = (p) => SFX.playAt('casing', p.x, p.y, p.z, 0.5, rr(0.9, 1.15));

const VM = buildViewmodel(T);
vmCam.add(VM.rig);

// ───────────────────────── 상태
const player = {
  pos: new THREE.Vector3(START.x, 0, START.z), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
  grounded: true, crouch: false, crouchT: 0, eye: 1.62, bodyH: 1.78, hp: 100, alive: true, lastHurt: -99,
  hspeed: 0, stepAcc: 0, sprint: false, col: { grounded: true, landV: 0 },
};
const input = { mx: 0, mz: 0, fire: false, ads: false, jump: false, joySprint: false, lookDX: 0, lookDY: 0, lastTouch: isTouchDevice, keys: {} };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const W = {
  ar: { name: '돌격소총', auto: true, rpm: 680, mag: 30, ammo: 30, reserve: 150, cap: 240, give: 30, dmg: 26, range: 170, fall: [40, 200, 0.6], recoilV: 0.6, recoilH: 0.28, spreadHip: 1.0, spreadAds: 0.1,
    bloomPer: 0.2, bloomMax: 1.8, adsFov: 44, reload: 2.15, kick: 1, sound: 'shotAR', vol: 0.85, push: 3.2, hip: V3(0.095, -0.13, -0.33), ads: V3(0, -0.078, -0.14), hipRy: 0.045, lightZ: -0.6, gfx: VM.ar },
  shotgun: { name: '산탄총', auto: false, rpm: 68, mag: 6, ammo: 6, reserve: 24, cap: 36, give: 6, dmg: 13, pellets: 8, range: 45, fall: [8, 30, 0.25], recoilV: 3.0, recoilH: 0.9, spreadHip: 3.0, spreadAds: 2.3,
    bloomPer: 0, bloomMax: 0, adsFov: 52, reload: 0.55, shell: true, pump: true, kick: 2.6, sound: 'shotSG', vol: 1, push: 6.5, autoRange: 16, hip: V3(0.095, -0.125, -0.3), ads: V3(0, -0.048, -0.24), hipRy: 0.045, lightZ: -0.6, gfx: VM.shotgun },
  dmr: { name: '지정사수 소총', auto: false, rpm: 170, mag: 10, ammo: 10, reserve: 30, cap: 50, give: 5, dmg: 72, range: 260, fall: [80, 400, 0.7], recoilV: 2.0, recoilH: 0.5, spreadHip: 2.2, spreadAds: 0.02,
    bloomPer: 0.6, bloomMax: 1.5, adsFov: 13, reload: 2.4, kick: 1.8, sound: 'shotDMR', vol: 0.95, push: 5.5, scope: true, hip: V3(0.095, -0.135, -0.33), ads: V3(0, -0.085, -0.19), hipRy: 0.045, lightZ: -0.7, gfx: VM.dmr },
  pistol: { name: '권총', auto: false, rpm: 420, mag: 15, ammo: 15, reserve: Infinity, cap: Infinity, give: 0, dmg: 32, range: 100, fall: [25, 90, 0.6], recoilV: 1.2, recoilH: 0.4, spreadHip: 0.8, spreadAds: 0.2,
    bloomPer: 0.5, bloomMax: 2.2, adsFov: 52, reload: 1.55, kick: 1.5, sound: 'shotPistol', vol: 0.85, push: 2.6, hip: V3(0.085, -0.105, -0.4), ads: V3(0, -0.0405, -0.3), hipRy: 0.04, lightZ: -0.2, gfx: VM.pistol },
};
const ORDER = ['ar', 'shotgun', 'dmr', 'pistol'];
const vm = {
  cur: 'ar', adsT: 0, cool: 0, fireBuf: 0, reloadT: 0, reloadDur: 1, rs: 0, switchT: 0, switchTo: 'ar', bloom: 0, lastShot: -9,
  kz: 0, kzv: 0, kp: 0, kpv: 0, kr: 0, krv: 0, rp: 0, rpT: 0, ry: 0, ryT: 0, slideK: 0,
  bobPhase: 0, swayX: 0, swayY: 0, sprintT: 0, flashT: 0, lookVX: 0, lookVY: 0, shade: 1, shadeT: 0, pumpT: 0, throwT: 0, rlPose: 0, autoFiring: false,
};
const cam = { landDip: 0, roll: 0, hurtRoll: 0, shake: 0 };
const game = { state: 'menu', queue: [], time: 0, wave: 0, toSpawn: 0, spawnT: 0, between: 0, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0, dieT: 0, best: store.get('best', 0) };
const enemies = [], pickups = [];
let tokens = 0, aliveCount = 0, whizT = 0;
// 협동(네트워크) 상태. host: 내가 방장인가, pid: 내 번호(방장 0), players: 다른 플레이어(pid → RemotePlayer), en: 참가자 쪽 적(번호 → Enemy)
const coop = { on: false, host: false, started: false, pid: 0, players: new Map(), en: new Map(), roster: [], nextId: 0, seq: 0, snapSeq: -1, gen: 0, dead: new Set(), lastSend: 0, lastSnap: 0, stall: false, shots: [], myShots: 0, supplyT: 0, picked: new Set(), safeT: 0, downSec: -1, allDownT: 0, lost: '' };
const COOP_NAMES = ['알파', '브라보', '찰리', '델타'];
// 게임이 흘러가는 상태인가. 협동에서는 보급 선택·일시정지 화면을 띄워도 세계는 멈추지 않는다
const live = () => game.state === 'playing' || game.state === 'dying' || (coop.on && coop.started && (game.state === 'supply' || game.state === 'paused'));
const humans = () => (coop.on ? [player, ...coop.players.values()] : [player]); // 적이 상대하는 사람 플레이어
const nPlayers = () => (coop.on ? 1 + coop.players.size : 1);
const maxTokens = () => 1 + Math.floor(game.wave / 2) + allies.length;
const maxConc = () => Math.min(3 + Math.floor(game.wave / 2), 7) + (nPlayers() - 1) * 2;
const assist = { t: 0 };

// ───────────────────────── HUD
const el = {};
for (const id of ['coop', 'hudVer', 'obj', 'objT', 'objS', 'squad', 'sqOw', 'radio', 'radioN', 'radioT', 'mk', 'mkD', 'tags', 'eps', 'epdone', 'rl', 'rlFill', 'hint', 'supply', 'supplySub', 'sup0', 'sup1', 'sup2', 'hud', 'touch', 'bPause', 'menu', 'pause', 'over', 'hpFill', 'hpNum', 'waveTxt', 'enemyTxt', 'scoreTxt', 'feed', 'msg', 'msgT', 'msgS', 'ch', 'hm', 'dmgs', 'rl', 'rlFill', 'hint',
  'joy', 'knob', 'bAds', 'bCrouch', 'ammoN', 'ammoR', 'wName', 'hurt', 'bestTxt', 'sensTxt', 'sensTxt0', 'scope', 'grenN']) el[id] = $(id);
const cache = {};
const hudS = { hm: 0, hurt: 0, msg: 0 };
const dmgInd = [0, 1, 2, 3].map((i) => ({ x: 0, z: 0, t: 0, el: el.dmgs.children[i] }));
let dmgK = 0;
function setTxt(k, v) {
  if (cache[k] !== v) { cache[k] = v; el[k].textContent = v; }
}
function showMsg(t, s, dur) {
  el.msgT.textContent = t;
  el.msgS.textContent = s;
  el.msg.classList.add('show');
  hudS.msg = dur;
}
function feed(text, hs) {
  const s = document.createElement('span');
  s.textContent = text;
  if (hs) s.className = 'hs';
  el.feed.appendChild(s);
  while (el.feed.children.length > 4) el.feed.removeChild(el.feed.firstChild);
  setTimeout(() => s.remove(), 2300);
}
function curSpread() {
  const w = W[vm.cur], a = vm.adsT;
  let s = lerp(w.spreadHip, w.spreadAds, a) + vm.bloom * lerp(1, 0.35, a) + (player.hspeed / 4.3) * lerp(0.6, 0.2, a) + (player.grounded ? 0 : 3);
  if (player.crouch) s *= 0.75;
  return s;
}
function updateHud(dt) {
  const w = W[vm.cur], hp = clamp(player.hp / prog.maxHp, 0, 1);
  setTxt('hpNum', String(Math.max(0, Math.ceil(player.hp))));
  const hpk = Math.round(hp * 200);
  if (cache.hpk !== hpk) {
    cache.hpk = hpk;
    el.hpFill.style.transform = `scaleX(${hp.toFixed(3)})`;
    el.hpFill.classList.toggle('low', hp < 0.35);
  }
  setTxt('ammoN', String(w.ammo));
  const low = w.ammo <= w.mag * 0.25;
  if (cache.low !== low) { cache.low = low; el.ammoN.classList.toggle('low', low); }
  setTxt('ammoR', '/ ' + (w.reserve === Infinity ? '∞' : w.reserve));
  setTxt('wName', w.name);
  setTxt('waveTxt', camp.on ? `작전 ${camp.idx + 1} · ${Math.max(1, camp.si + 1)}/${camp.ep.stages.length}` : 'WAVE ' + Math.max(1, game.wave));
  setTxt('enemyTxt', '적 ' + (camp.on ? aliveCount : game.toSpawn + aliveCount));
  setTxt('scoreTxt', String(game.score));
  setTxt('grenN', String(gren.n));
  const scoped = !!w.scope && vm.adsT > 0.82 && player.alive;
  if (cache.scoped !== scoped) { cache.scoped = scoped; el.scope.classList.toggle('hidden', !scoped); }
  const focal = LH / 2 / Math.tan(rad(camera.fov) / 2);
  el.ch.style.setProperty('--g', clamp(Math.tan(rad(curSpread())) * focal, 3, 70).toFixed(1) + 'px');
  el.ch.style.opacity = (player.alive ? (1 - vm.adsT) * (1 - vm.sprintT * 0.8) * (vm.reloadT > 0 ? 0.4 : 1) : 0).toFixed(2);
  hudS.hm = Math.max(0, hudS.hm - dt);
  el.hm.style.opacity = Math.min(1, hudS.hm / 0.12).toFixed(2);
  hudS.hurt = Math.max(0, hudS.hurt - dt * 1.8);
  el.hurt.style.opacity = Math.min(1, clamp((1 - hp) * 0.75 - 0.15, 0, 0.7) + hudS.hurt * 0.6).toFixed(2);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  for (const d of dmgInd) {
    if (d.t <= 0) continue;
    d.t -= dt;
    const dx = d.x - player.pos.x, dz = d.z - player.pos.z;
    const ang = Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy);
    d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    d.el.style.opacity = clamp(d.t / 0.5, 0, 1).toFixed(2);
  }
  const rl = vm.reloadT > 0;
  if (cache.rl !== rl) { cache.rl = rl; el.rl.style.opacity = rl ? 1 : 0; }
  if (rl) el.rlFill.style.transform = `scaleX(${(1 - vm.reloadT / vm.reloadDur).toFixed(3)})`;
  const hint = rl ? '재장전' : w.ammo === 0 && w.reserve === 0 ? '탄약 없음 · 무기 교체' : w.ammo === 0 ? '재장전 필요' : '';
  if (cache.hint !== hint) { cache.hint = hint; el.hint.textContent = hint; el.hint.style.opacity = hint ? 1 : 0; }
  if (hudS.msg > 0) {
    hudS.msg -= dt;
    if (hudS.msg <= 0) el.msg.classList.remove('show');
  }
}

// ───────────────────────── 이펙트
function impactFx(x, y, z, nx, ny, nz, m, vol = 1, light = false) {
  decals.add(x, y, z, nx, ny, nz, rr(0.07, 0.11));
  const wood = m === 2, n = light ? 2 : m === 1 ? 3 : 6;
  for (let i = 0; i < n; i++) {
    dust.emit(x, y, z, nx * rr(0.4, 1.6) + rr(-0.6, 0.6), ny * rr(0.4, 1.6) + rr(-0.3, 0.9), nz * rr(0.4, 1.6) + rr(-0.6, 0.6), rr(0.45, 0.9), rr(0.08, 0.16),
      wood ? 0.5 : 0.56, wood ? 0.38 : 0.53, wood ? 0.24 : 0.49, 0.4, 0.6, 2.5, 0.55);
  }
  if (m === 1) {
    for (let i = 0; i < (light ? 3 : 7); i++) sparks.emit(x, y, z, nx * rr(2, 7) + rr(-3, 3), ny * rr(2, 7) + rr(-1, 4), nz * rr(2, 7) + rr(-3, 3), rr(0.12, 0.32), rr(0.02, 0.035), 1, 0.75, 0.35, 1, 9.8, 0.5);
  } else if (!light) {
    for (let i = 0; i < 4; i++) dust.emit(x, y, z, nx * rr(1, 3.5) + rr(-1.5, 1.5), ny * rr(1, 3.5) + rr(0, 2.5), nz * rr(1, 3.5) + rr(-1.5, 1.5), rr(0.4, 0.7), rr(0.018, 0.03), 0.2, 0.19, 0.18, 1, 9.8, 0.3);
  }
  if (vol > 0) SFX.playAt(m === 1 ? 'impactM' : 'impact', x, y, z, vol, rr(0.85, 1.2));
}
function bloodFx(x, y, z, d) {
  for (let i = 0; i < 8; i++) dust.emit(x, y, z, d.x * rr(0.5, 2.2) + rr(-1, 1), rr(-0.4, 1.6), d.z * rr(0.5, 2.2) + rr(-1, 1), rr(0.3, 0.55), rr(0.04, 0.08), 0.3, 0.02, 0.02, 0.85, 7, 1.5, 0.1);
}

// ───────────────────────── 사격
function rayEnemy(e, o, d, maxT) {
  let best = -1, part = 0;
  const dr = e.crouch * 0.37, top = 1.58 - dr, mid = 0.98 - dr * 0.75, ex = o.x - e.pos.x, ez = o.z - e.pos.z;
  { // 머리(구)
    const ey = o.y - (1.72 - dr), b = ex * d.x + ey * d.y + ez * d.z, c = ex * ex + ey * ey + ez * ez - 0.0256, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) { best = t; part = 2; maxT = t; } }
  }
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-8) {
    const b = ex * d.x + ez * d.z, base = ex * ex + ez * ez;
    let disc = b * b - a * (base - 0.0729); // 몸통 r=0.27
    if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / a, y = o.y + d.y * t; if (t > 0 && t < maxT && y >= mid && y <= top) { best = t; part = 1; maxT = t; } }
    disc = b * b - a * (base - 0.04); // 다리 r=0.2
    if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / a, y = o.y + d.y * t; if (t > 0 && t < maxT && y >= 0 && y < mid) { best = t; part = 0; } }
  }
  rayEnemy.part = part;
  return best;
}
function rayPlayer(ox, oy, oz, d, maxT) {
  const ex = ox - player.pos.x, ez = oz - player.pos.z, a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = ex * d.x + ez * d.z, disc = b * b - a * (ex * ex + ez * ez - 0.1156);
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a, y = oy + d.y * t;
  return t > 0 && t < maxT && y >= player.pos.y && y <= player.pos.y + player.bodyH ? t : -1;
}

// 적 탄이 카메라 가까이를 스치면 통과음
function whizNear(ox, oy, oz, d, tEnd) {
  _v.subVectors(camera.position, _w.set(ox, oy, oz));
  const tca = _v.dot(d);
  if (tca > 2 && tca < tEnd && _v.lengthSq() - tca * tca < 1.6 && game.time - whizT > 0.12) {
    whizT = game.time;
    SFX.play('whiz', 0.5, rr(0.85, 1.2), (Math.random() < 0.5 ? -1 : 1) * rr(0.3, 0.8));
  }
}

function ejectShell() {
  camera.getWorldDirection(_f);
  _r.crossVectors(_f, UP).normalize();
  _u.crossVectors(_r, _f);
  _v.copy(camera.position).addScaledVector(_r, 0.2).addScaledVector(_f, 0.55).addScaledVector(_u, -0.1);
  _w.copy(_r).multiplyScalar(rr(1.8, 2.8)).addScaledVector(_u, rr(1.4, 2.2)).addScaledVector(_f, rr(-0.3, 0.5)).add(player.vel);
  shells.spawn(_v, _w);
}

function shoot(w) {
  coop.myShots = (coop.myShots + 1) & 255;
  w.ammo--;
  vm.cool = 60 / w.rpm;
  vm.lastShot = game.time;
  vm.fireBuf = 0;
  game.shots++;
  const a = vm.adsT, spread = rad(curSpread()), g = w.gfx, o = camera.position, n = w.pellets || 1;
  camera.getWorldDirection(_f);
  _r.crossVectors(_f, UP).normalize();
  _u.crossVectors(_r, _f);
  g.flash.getWorldPosition(_mz);
  let anyHit = false, killed = false, headKill = false, headHit = false;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * TAU, rho = Math.tan(spread) * Math.sqrt(Math.random());
    _d.copy(_f).addScaledVector(_r, Math.cos(ang) * rho).addScaledVector(_u, Math.sin(ang) * rho).normalize();
    let tEnd = w.range, world = false, nx = 0, ny = 0, nz = 0, mat = 0;
    if (rayWorld(o.x, o.y, o.z, _d.x, _d.y, _d.z, w.range)) { tEnd = hit.t; world = true; nx = hit.nx; ny = hit.ny; nz = hit.nz; mat = hit.m; }
    let target = null, part = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      const t = rayEnemy(e, o, _d, tEnd);
      if (t >= 0) { tEnd = t; target = e; part = rayEnemy.part; }
    }
    // 조준 보조: 조준선이 적 바로 옆을 스치면 탄을 적 쪽으로 끌어 준다
    if (!target && i === 0 && (input.lastTouch || opt.autoFire) && aa.e && aa.vis && aa.ang < 0.04 && !aa.e.dead) {
      _m.set(aa.e.pos.x - o.x + rr(-0.1, 0.1), aa.y - o.y + rr(-0.12, 0.12), aa.e.pos.z - o.z + rr(-0.1, 0.1)).normalize();
      const t = rayEnemy(aa.e, o, _m, w.range), pt = rayEnemy.part;
      if (t >= 0 && !rayWorld(o.x, o.y, o.z, _m.x, _m.y, _m.z, t)) { _d.copy(_m); tEnd = t; target = aa.e; part = pt; world = false; }
    }
    const hx = o.x + _d.x * tEnd, hy = o.y + _d.y * tEnd, hz = o.z + _d.z * tEnd;
    if (target) {
      const dmg = w.dmg * (1 + 0.12 * prog.lv.ap) * (part === 2 ? target.T.headMul : part === 1 ? 1 : 0.7) * clamp(1 - (tEnd - w.fall[0]) / (w.fall[1] - w.fall[0]), w.fall[2], 1);
      if (i < 3) bloodFx(hx, hy, hz, _d);
      anyHit = true;
      if (part === 2) headHit = true;
      if (target.damage(dmg, part, _d, w.push)) { killed = true; headKill = part === 2; }
    } else if (world) impactFx(hx, hy, hz, nx, ny, nz, mat, i === 0 ? 0.8 : 0, i > 0);
    if (i < 3) tracers.spawn(_mz.x, _mz.y, _mz.z, hx, hy, hz);
  }
  if (anyHit) {
    game.hits++;
    hudS.hm = killed ? 0.3 : 0.16;
    el.hm.classList.toggle('kill', killed);
    SFX.play(headHit ? 'head' : 'hit', killed ? 0.6 : 0.45, rr(0.93, 1.07));
  }
  // 총구 연기·화염·조명
  dust.emit(_mz.x + _f.x * 0.1, _mz.y, _mz.z + _f.z * 0.1, _f.x * 1.5 + rr(-0.2, 0.2), rr(0.2, 0.6), _f.z * 1.5 + rr(-0.2, 0.2), rr(0.35, 0.6), w.pellets ? 0.12 : 0.07, 0.75, 0.74, 0.72, 0.16, -0.3, 2.5, 0.5);
  g.flash.visible = true;
  g.flash.rotation.z = Math.random() * TAU;
  g.flash.scale.setScalar(rr(0.75, 1.2) * lerp(1, 0.6, a));
  vm.flashT = 0.045;
  flashLight.position.copy(o).addScaledVector(_f, 1.2);
  flashLight.distance = 16;
  flashLight.intensity = w.pellets ? 90 : 60;
  VM.light.intensity = 2.5;
  if (w.pump) vm.pumpT = 0.6;
  else ejectShell();
  // 반동
  const rk = lerp(1, 0.72, a) * (player.crouch ? 0.85 : 1);
  vm.rpT = Math.min(vm.rpT + rad(w.recoilV) * rk, rad(9));
  vm.ryT += rad(w.recoilH) * rk * (Math.random() * 2 - 1);
  vm.kzv += 1.5 * w.kick * lerp(1, 0.6, a);
  vm.kpv += 2.4 * w.kick * lerp(1, 0.45, a);
  vm.krv += (Math.random() - 0.5) * 2.5 * w.kick;
  vm.slideK = 1;
  vm.bloom = Math.min(vm.bloom + w.bloomPer, w.bloomMax);
  SFX.play(w.sound, w.vol, rr(0.96, 1.04));
  for (const e of enemies) if (!e.dead && e.pos.distanceTo(player.pos) < 75) { e.lastKnown.copy(player.pos); if (e.state === 'hunt') e.repath = Math.min(e.repath, 0.3); }
}

// ── 진행: 가진 무기와 보급으로 얻는 강화 (한 판 동안 유지)
const prog = { owned: { ar: true, shotgun: false, dmr: false, pistol: true }, lv: { armor: 0, mag: 0, hands: 0, medkit: 0, ap: 0, gren: 0 }, maxHp: 100, picks: [], offer: [] };
for (const k of ORDER) W[k].mag0 = W[k].mag;
const SUPPLY = [
  { id: 'shotgun', t: '산탄총', d: '근거리 화력 · 산탄 8발 · 6발 장전', weapon: true },
  { id: 'dmr', t: '지정사수 소총', d: '조준경 · 피해 72 · 10발 탄창', weapon: true },
  { id: 'armor', t: '방탄판', d: '받는 피해 15% 감소', max: 3 },
  { id: 'mag', t: '확장 탄창', d: '모든 총의 탄창 30% 증가', max: 2 },
  { id: 'hands', t: '숙련된 손', d: '재장전과 무기 교체 20% 단축', max: 2 },
  { id: 'medkit', t: '의무 장비', d: '최대 체력 +25 · 체력 전부 회복', max: 3 },
  { id: 'ap', t: '철갑탄', d: '모든 총의 피해 12% 증가', max: 3 },
  { id: 'gren', t: '수류탄 꾸러미', d: '수류탄 2개 · 최대 소지 +1', max: 2 },
  { id: 'ammo', t: '탄약 상자', d: '가진 총의 예비 탄약을 가득 채움' },
];
function supplyOptions() {
  const avail = SUPPLY.filter((s) => (s.weapon ? !prog.owned[s.id] : !s.max || prog.lv[s.id] < s.max));
  const weapons = avail.filter((s) => s.weapon), rest = avail.filter((s) => !s.weapon), out = [];
  if (weapons.length) out.push(weapons[(Math.random() * weapons.length) | 0]); // 없는 무기가 있으면 한 칸은 무기
  while (out.length < 3 && rest.length) out.push(rest.splice((Math.random() * rest.length) | 0, 1)[0]);
  return out;
}
function openSupply() {
  prog.offer = supplyOptions();
  el.supplySub.textContent = camp.on ? `작전 ${camp.idx + 1} · ${camp.si + 1}단계 완료` : coop.on ? `웨이브 ${game.wave} 격퇴 · 각자 하나씩 · 다음 웨이브가 오면 닫힙니다` : `웨이브 ${game.wave} 격퇴`;
  for (let i = 0; i < 3; i++) {
    const b = el['sup' + i], s = prog.offer[i];
    b.classList.toggle('hidden', !s);
    if (!s) continue;
    b.querySelector('.sl').textContent = s.weapon ? '새 무기' : s.max ? `강화 ${prog.lv[s.id] + 1} / ${s.max}` : '소모품';
    b.querySelector('.st').textContent = s.t;
    b.querySelector('.sd').textContent = s.d;
  }
  setState('supply');
}
function applySupply(id) {
  if (id === 'shotgun' || id === 'dmr') {
    prog.owned[id] = true;
    W[id].ammo = W[id].mag;
    W[id].reserve = id === 'shotgun' ? 24 : 30;
    switchWeapon(id);
  } else if (id === 'ammo') {
    for (const k of ORDER) if (prog.owned[k] && W[k].cap !== Infinity) W[k].reserve = W[k].cap;
  } else {
    prog.lv[id]++;
    if (id === 'mag') for (const k of ORDER) W[k].mag = Math.round(W[k].mag0 * (1 + 0.3 * prog.lv.mag));
    if (id === 'medkit') { prog.maxHp += 25; player.hp = prog.maxHp; }
    if (id === 'gren') gren.n = Math.min(4 + prog.lv.gren, gren.n + 2);
  }
}
function pickSupply(i) {
  if (game.state !== 'supply') return;
  const s = prog.offer[i];
  if (!s) return;
  applySupply(s.id);
  prog.picks.push(s.id);
  feed('보급: ' + s.t);
  if (coop.on) coopPicked(coop.pid);
  else game.between = 3.5;
  setState('playing');
  last = performance.now();
}
function resetProg() {
  Object.assign(prog.owned, { ar: true, shotgun: false, dmr: false, pistol: true });
  for (const k in prog.lv) prog.lv[k] = 0;
  prog.maxHp = 100;
  prog.picks = [];
  for (const k of ORDER) W[k].mag = W[k].mag0;
}
const handK = () => 1 - 0.2 * prog.lv.hands;

function startReload() {
  const w = W[vm.cur];
  if (vm.reloadT > 0 || vm.switchT > 0 || vm.pumpT > 0.1 || w.ammo >= w.mag || w.reserve <= 0 || !player.alive) return;
  vm.reloadT = vm.reloadDur = w.reload * handK();
  vm.rs = 0;
}
function switchWeapon(to) {
  if (vm.switchT > 0 || !player.alive) return;
  const own = ORDER.filter((k) => prog.owned[k]);
  const next = to || own[(own.indexOf(vm.cur) + 1) % own.length];
  if (next === vm.cur || !prog.owned[next]) return;
  vm.reloadT = 0;
  vm.pumpT = 0;
  vm.switchT = 0.45 * handK();
  vm.switchTo = next;
}
function showWeapon() {
  for (const k of ORDER) W[k].gfx.group.visible = k === vm.cur;
  VM.light.position.z = W[vm.cur].lightZ;
}

function updateWeapon(dt) {
  const w = W[vm.cur];
  vm.cool -= dt;
  vm.fireBuf -= dt;
  const auto0 = opt.autoFire && aa.held > 0.07 && aa.d < (w.autoRange || w.range * 0.7);
  // 한 발씩 장전하는 중에 쏘려고 하면 장전을 멈춘다
  if (w.shell && vm.reloadT > 0 && w.ammo > 0 && (vm.fireBuf > 0 || auto0)) { vm.reloadT = 0; vm.cool = Math.max(vm.cool, 0.25); if (vm.fireBuf > 0) vm.fireBuf = 0.4; } // 누른 한 발은 장전을 멈춘 직후에 나간다
  const busy = vm.reloadT > 0 || vm.switchT > 0 || vm.throwT > 0.15;
  vm.adsT = clamp(vm.adsT + (input.ads && !busy && !player.sprint ? 1 : -1) * dt * 7.5, 0, 1);
  const auto = auto0 && !busy;
  vm.autoFiring = auto;
  const want = (w.auto ? input.fire || vm.fireBuf > 0 : vm.fireBuf > 0) || auto; // 연발총도 짧게 톡 누르면 한 발은 나간다
  if (want && !busy && vm.cool <= 0) {
    if (w.ammo > 0) {
      shoot(w);
      if (auto && !w.auto && !w.pump) vm.cool = Math.max(vm.cool, 0.26);
    } else {
      if (vm.fireBuf > 0) SFX.play('dry', 0.5);
      vm.fireBuf = 0;
      vm.cool = 0.25;
      startReload();
    }
  }
  if (w.ammo === 0 && !busy && w.reserve > 0 && game.time - vm.lastShot > (w.pump ? 0.75 : 0.25)) startReload();
  if (vm.reloadT > 0) {
    vm.reloadT -= dt;
    if (w.shell) {
      if (vm.reloadT <= 0) {
        w.ammo++;
        w.reserve--;
        SFX.play('shellIn', 0.55, rr(0.95, 1.08));
        if (w.ammo < w.mag && w.reserve > 0) vm.reloadT = vm.reloadDur = w.reload * 0.9 * handK();
        else vm.cool = Math.max(vm.cool, 0.3);
      }
    } else {
      const k = 1 - vm.reloadT / vm.reloadDur;
      const rl = w === W.pistol ? 'rlPistol' : 'rlAR';
      if (SFX.has(rl)) {
        if (k > 0.08 && !(vm.rs & 1)) { vm.rs |= 7; SFX.play(rl, 0.7, clamp((rl === 'rlAR' ? 1.42 : 1.5) / (vm.reloadDur * 0.88), 0.8, 1.3)); }
      }
      if (k > 0.18 && !(vm.rs & 1)) { vm.rs |= 1; SFX.play('magOut', 0.5); }
      if (k > 0.55 && !(vm.rs & 2)) { vm.rs |= 2; SFX.play('magIn', 0.55); }
      if (k > 0.85 && !(vm.rs & 4)) { vm.rs |= 4; SFX.play('bolt', 0.5); }
      if (vm.reloadT <= 0) {
        const take = Math.min(w.mag - w.ammo, w.reserve);
        w.ammo += take;
        if (w.reserve !== Infinity) w.reserve -= take;
      }
    }
  }
  if (vm.pumpT > 0) {
    const before = vm.pumpT;
    vm.pumpT -= dt;
    if (before > 0.42 && vm.pumpT <= 0.42) { SFX.play('pump', 0.6); ejectShell(); }
  }
  if (vm.switchT > 0) {
    const before = vm.switchT;
    vm.switchT -= dt;
    if (before > 0.2 && vm.switchT <= 0.2) { vm.cur = vm.switchTo; showWeapon(); if (SFX.has('equip')) SFX.play('equip', 0.5, rr(0.95, 1.05)); else SFX.play('magIn', 0.3, 1.3); }
  }
  if (vm.throwT > 0) vm.throwT -= dt;
  const idle = game.time - vm.lastShot > 0.12;
  vm.bloom = Math.max(0, vm.bloom - dt * (idle ? 5 : 1.2));
  if (idle) { vm.rpT = damp(vm.rpT, 0, 6, dt); vm.ryT = damp(vm.ryT, 0, 6, dt); }
  vm.rp = damp(vm.rp, vm.rpT, 24, dt);
  vm.ry = damp(vm.ry, vm.ryT, 24, dt);
}

const spring = (x, v, k, c, dt) => { const nv = v + (-k * x - c * v) * dt; return [x + nv * dt, nv]; };
function updateViewmodel(dt) {
  const w = W[vm.cur], g = w.gfx, a = smooth(vm.adsT);
  [vm.kz, vm.kzv] = spring(vm.kz, vm.kzv, 260, 24, dt);
  [vm.kp, vm.kpv] = spring(vm.kp, vm.kpv, 260, 22, dt);
  [vm.kr, vm.krv] = spring(vm.kr, vm.krv, 200, 18, dt);
  vm.sprintT = damp(vm.sprintT, player.sprint ? 1 : 0, 9, dt);
  const sp = player.hspeed;
  if (player.grounded && sp > 0.4) vm.bobPhase += dt * (3.6 + sp * 1.25);
  const amp = (player.grounded ? clamp(sp / 4.3, 0, 1.6) : 0) * (1 - a * 0.85);
  const bx = Math.cos(vm.bobPhase) * 0.007 * amp, by = -Math.abs(Math.sin(vm.bobPhase)) * 0.009 * amp + 0.0045 * amp;
  vm.swayX = damp(vm.swayX, clamp(vm.lookVX * 0.004, -0.016, 0.016), 10, dt);
  vm.swayY = damp(vm.swayY, clamp(-vm.lookVY * 0.004, -0.016, 0.016), 10, dt);
  let dipY = 0, rollZ = 0, pitchX = 0;
  if (vm.reloadT > 0 && !w.shell) {
    const k = 1 - vm.reloadT / vm.reloadDur, e = k < 0.15 ? smooth(k / 0.15) : k > 0.85 ? smooth((1 - k) / 0.15) : 1;
    dipY -= 0.055 * e; rollZ += 0.5 * e; pitchX += 0.22 * e;
    if (g.mag) {
      const mk = k < 0.18 ? 0 : k < 0.38 ? (k - 0.18) / 0.2 : k < 0.5 ? 1 : k < 0.7 ? 1 - (k - 0.5) / 0.2 : 0;
      g.mag.position.y = -0.2 * smooth(mk);
    }
  } else if (g.mag) g.mag.position.y = 0;
  vm.rlPose = damp(vm.rlPose, w.shell && vm.reloadT > 0 ? 1 : 0, 10, dt);
  if (vm.rlPose > 0.01) {
    const bump = vm.reloadT > 0 ? Math.sin(Math.PI * (1 - vm.reloadT / vm.reloadDur)) * 0.012 : 0;
    dipY -= 0.04 * vm.rlPose - bump; rollZ += 0.38 * vm.rlPose; pitchX += 0.16 * vm.rlPose;
  }
  if (g.pump) g.pump.position.z = vm.pumpT > 0 ? 0.075 * Math.sin(Math.PI * clamp((1 - vm.pumpT / 0.6 - 0.15) / 0.7, 0, 1)) : 0;
  if (vm.throwT > 0) {
    const e = Math.sin(Math.PI * clamp(1 - vm.throwT / 0.45, 0, 1));
    dipY -= 0.16 * e; pitchX -= 0.35 * e;
  }
  VM.rig.visible = !(w.scope && vm.adsT > 0.82);
  if (vm.switchT > 0) {
    const e = Math.sin(Math.PI * (1 - vm.switchT / 0.45));
    dipY -= 0.2 * e; pitchX -= 0.6 * e;
  }
  if (!player.alive) { dipY -= Math.min(0.5, game.dieT * 0.5); pitchX -= Math.min(0.8, game.dieT); }
  vm.slideK = Math.max(0, vm.slideK - dt * 16);
  if (g.slide) g.slide.position.z = vm.slideK * 0.028;
  const s = vm.sprintT * (1 - a), br = Math.sin(game.time * 1.4) * 0.0012 * (1 - a * 0.6);
  VM.rig.position.set(
    lerp(w.hip.x + vmShiftX, w.ads.x, a) + bx + vm.swayX - 0.03 * s,
    lerp(w.hip.y, w.ads.y, a) + by + vm.swayY + dipY - 0.035 * s + br - cam.landDip * 0.25,
    lerp(w.hip.z, w.ads.z, a) + vm.kz + 0.02 * s
  );
  VM.rig.rotation.set(vm.kp + pitchX - 0.18 * s + vm.swayY * 1.5, lerp(w.hipRy, 0, a) + 0.5 * s - vm.swayX * 2, rollZ + vm.kr * 0.4 - 0.15 * s + cam.roll * 0.5);
  vm.flashT -= dt;
  if (vm.flashT <= 0) g.flash.visible = false;
  VM.light.intensity *= Math.exp(-dt * 50);
  // 그늘에 들어가면 총에도 햇빛이 닿지 않는다
  vm.shadeT -= dt;
  if (vm.shadeT <= 0) {
    vm.shadeT = 0.15;
    const p = camera.position;
    vm.shadeTarget = rayWorld(p.x, p.y, p.z, sunDir.x, sunDir.y, sunDir.z, 80, false) ? 0.06 : 1;
  }
  vm.shade = damp(vm.shade, vm.shadeTarget ?? 1, 8, dt);
  vmSun.intensity = SUN_I * vm.shade;
  vmHemi.intensity = hemi.intensity * (ENVS[envName] && ENVS[envName].night ? 1.5 : 1);
}

// ───────────────────────── 플레이어
function hurtPlayer(dmg, from) {
  if (!player.alive || coop.safeT > 0) return;
  player.hp -= dmg * (1 - 0.15 * prog.lv.armor);
  player.lastHurt = game.time;
  const d = dmgInd[dmgK];
  dmgK = (dmgK + 1) % dmgInd.length;
  d.x = from.x; d.z = from.z; d.t = 1.1;
  hudS.hurt = 1;
  cam.hurtRoll += (Math.random() < 0.5 ? -1 : 1) * 0.035;
  SFX.play('hurt', 0.6, rr(0.9, 1.1));
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    game.state = 'dying';
    game.dieT = 0;
    el.touch.classList.add('hidden');
    el.bPause.classList.add('hidden');
    releaseInput();
  }
}

function updatePlayer(dt) {
  player.crouchT = damp(player.crouchT, player.crouch ? 1 : 0, 12, dt);
  player.eye = lerp(1.62, 1.02, player.crouchT);
  player.bodyH = lerp(1.78, 1.2, player.crouchT);
  let mx = input.mx, mz = input.mz;
  if (!input.lastTouch || joy.id === null) {
    const k = input.keys;
    const kx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), kz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    if (kx || kz) { mx = kx; mz = kz; }
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const wantSprint = (input.keys.ShiftLeft || input.keys.ShiftRight || input.joySprint) && mz > 0.6 && !input.fire && !input.ads && !vm.autoFiring;
  if (wantSprint && player.crouch) player.crouch = false;
  player.sprint = wantSprint && player.grounded;
  const sp = (player.sprint ? 6.4 : player.crouch ? 2.2 : 4.3) * lerp(1, 0.62, vm.adsT);
  const acc = player.grounded ? 16 : 3;
  player.vel.x = damp(player.vel.x, (-sy * mz + cy * mx) * sp, acc, dt);
  player.vel.z = damp(player.vel.z, (-cy * mz - sy * mx) * sp, acc, dt);
  // 낮은 장애물(방호벽·상자)에 막히면 자동으로 넘는다
  const wish = Math.hypot(mx, mz);
  if (player.grounded && wish > 0.55 && player.hspeed < sp * 0.35) player.blockT = (player.blockT || 0) + dt;
  else player.blockT = 0;
  if (player.blockT > 0.16) {
    player.blockT = -0.25;
    const wx = (-sy * mz + cy * mx) / wish, wz = (-cy * mz - sy * mx) / wish, p = player.pos;
    if (rayWorld(p.x, p.y + 0.25, p.z, wx, 0, wz, 0.8, false) && !rayWorld(p.x, p.y + 1.5, p.z, wx, 0, wz, 1.1, false)) input.jump = true;
  }
  if (input.jump && player.grounded) {
    player.vel.y = 5.6;
    player.crouch = false;
    SFX.play('step', 0.35, 0.8);
  }
  input.jump = false;
  player.vel.y -= 15 * dt;
  const was = player.grounded, py0 = player.pos.y, jumped = player.vel.y > 0;
  player.col.landV = 0;
  collideMove(player.pos, player.vel, dt, 0.32, player.bodyH, player.col);
  player.grounded = player.col.grounded;
  if (was && !player.grounded && !jumped && snapDown(player.pos, 0.32, 0.3, player.col)) { player.grounded = true; player.vel.y = 0; }
  if (was && player.grounded) { const sy = player.pos.y - py0; if (Math.abs(sy) > 0.02 && Math.abs(sy) < 0.45) player.yOff = clamp((player.yOff || 0) - sy, -0.5, 0.5); }
  player.yOff = damp(player.yOff || 0, 0, 13, dt);
  if (!was && player.grounded && player.col.landV < -3.5) {
    cam.landDip = Math.min(0.22, -player.col.landV * 0.022);
    SFX.play('step', 0.6, 0.7);
  }
  player.pos.x = clamp(player.pos.x, B.x0 + 0.35, B.x1 - 0.35);
  player.pos.z = clamp(player.pos.z, B.z0 + 0.35, B.z1 - 0.35);
  player.hspeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && player.hspeed > 1) {
    player.stepAcc += player.hspeed * dt;
    if (player.stepAcc > (player.crouch ? 0.95 : player.sprint ? 1.9 : 1.5)) {
      player.stepAcc = 0;
      SFX.play(player.col.gm === 1 ? 'stepM' : 'step', player.crouch ? 0.16 : player.sprint ? 0.55 : 0.4, rr(0.94, 1.06) * (player.col.gm === 2 ? 0.85 : 1));
    }
  }
  if (game.time - player.lastHurt > 4.5 && player.hp < prog.maxHp) player.hp = Math.min(prog.maxHp, player.hp + 10 * dt);
}

// ───────────────────────── 조준 보조·자동 사격용 표적 탐색
const aa = { e: null, ang: 9, d: 0, vis: false, y: 1.3, held: 0 };
const chestY = (e) => 1.3 - e.crouch * 0.3;
function scanTarget(dt) {
  camera.getWorldDirection(_f);
  const c = camera.position;
  let best = null, bc = 0.986, bd = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    _v.set(e.pos.x - c.x, chestY(e) - c.y, e.pos.z - c.z);
    const d = _v.length();
    if (d > 90 || d < 0.6) continue;
    const cos = _v.dot(_f) / d;
    if (cos > bc) { bc = cos; best = e; bd = d; }
  }
  aa.e = best;
  aa.d = bd;
  aa.vis = false;
  aa.ang = 9;
  if (best) {
    aa.y = chestY(best);
    aa.vis = losClear(c.x, c.y, c.z, best.pos.x, aa.y, best.pos.z);
    if (!aa.vis) {
      aa.y = 1.66 - best.crouch * 0.37; // 몸통이 가려졌으면 머리
      aa.vis = losClear(c.x, c.y, c.z, best.pos.x, aa.y, best.pos.z);
    }
    _v.set(best.pos.x - c.x, aa.y - c.y, best.pos.z - c.z).normalize();
    aa.ang = Math.acos(Math.min(1, _v.dot(_f)));
  }
  const on = aa.vis && aa.ang < Math.atan(0.3 / Math.max(aa.d, 1)) + 0.012;
  aa.held = on ? aa.held + dt : 0;
  const lock = on && (opt.autoFire || input.lastTouch);
  if (cache.lock !== lock) { cache.lock = lock; el.ch.classList.toggle('lock', lock); }
}

function handleLook(dt) {
  const zoom = Math.pow(Math.tan(rad(camera.fov) / 2) / Math.tan(rad(baseFov) / 2), 0.85);
  const dx = input.lookDX, dy = input.lookDY, touch = input.lastTouch;
  input.lookDX = input.lookDY = 0;
  let k = (touch ? 0.0072 : 0.0022) * opt.sens * zoom;
  if (touch) {
    // 빠르게 밀수록 더 많이 도는 가속 + 적 근처에서는 감속
    k *= 1 + clamp((Math.hypot(dx, dy) / dt - 250) / 900, 0, 1) * 0.55;
    if (aa.e && aa.vis && aa.ang < 0.07) k *= lerp(0.45, 1, aa.ang / 0.07);
  }
  const y0 = player.yaw, p0 = player.pitch;
  player.yaw -= dx * k;
  player.pitch = clamp(player.pitch - dy * k * (touch ? 0.78 : 1), -1.45, 1.45);
  // 표적 추적: 조준선이 적 근처에 있으면 적 쪽으로 부드럽게 끌린다 (정조준 직후에는 강하게)
  if (assist.t > 0) assist.t -= dt;
  if (touch && aa.e && aa.vis && aa.ang < (assist.t > 0 ? 0.16 : 0.09)) {
    const c = camera.position, ex = aa.e.pos.x - c.x, ey = aa.y - c.y, ez = aa.e.pos.z - c.z;
    const active = lookT.size > 0 || input.fire || player.hspeed > 0.5 || vm.autoFiring;
    const gain = assist.t > 0 ? 14 : (active ? 4.5 : 2.2) * (1 + vm.adsT * 0.4) * (1 - (aa.ang / 0.09) * 0.5);
    const f = Math.min(1, gain * dt);
    player.yaw += angDiff(player.yaw, Math.atan2(-ex, -ez) - vm.ry) * f;
    player.pitch = clamp(player.pitch + (Math.atan2(ey, Math.hypot(ex, ez)) - vm.rp - player.pitch) * f, -1.45, 1.45);
  }
  vm.lookVX = (player.yaw - y0) / dt;
  vm.lookVY = (player.pitch - p0) / dt;
}

function placeCamera(dt) {
  const amp = (player.grounded ? clamp(player.hspeed / 4.3, 0, 1.5) : 0) * (1 - vm.adsT * 0.7);
  const by = Math.sin(vm.bobPhase * 2) * 0.02 * amp, bx = Math.cos(vm.bobPhase) * 0.012 * amp;
  cam.landDip = damp(cam.landDip, 0, 9, dt);
  cam.hurtRoll = damp(cam.hurtRoll, 0, 7, dt);
  camera.position.set(player.pos.x + Math.cos(player.yaw) * bx, player.pos.y + (player.yOff || 0) + player.eye + by - cam.landDip, player.pos.z - Math.sin(player.yaw) * bx);
  cam.shake = damp(cam.shake, 0, 5, dt);
  const sh = cam.shake * 0.045;
  camera.rotation.set(player.pitch + vm.rp + (Math.random() - 0.5) * sh, player.yaw + vm.ry + (Math.random() - 0.5) * sh, cam.roll + cam.hurtRoll - input.mx * 0.012 * (player.alive ? 1 : 0) + (Math.random() - 0.5) * sh);
  const w = W[vm.cur];
  const fov = lerp(baseFov, baseFov * (w.adsFov / 62), smooth(vm.adsT)) + vm.sprintT * 3;
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  vmCam.position.copy(camera.position);
  vmCam.quaternion.copy(camera.quaternion);
  vmSun.position.copy(camera.position).addScaledVector(sunDir, 30);
  vmSun.target.position.copy(camera.position);
  vmSun.target.updateMatrixWorld();
  SFX.listener.x = camera.position.x; SFX.listener.y = camera.position.y; SFX.listener.z = camera.position.z;
  SFX.listener.rx = Math.cos(player.yaw); SFX.listener.rz = -Math.sin(player.yaw);
}

// ───────────────────────── 적
function cellNear(x, z, r) {
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
    if (!blockedAt(cx, cz)) return { x: cx, z: cz };
  }
  return null;
}

const runSpeed = () => (MOCAP.ready ? clamp(MOCAP.runSpeed, 3.6, 5.2) : 4.5);

// 적 종류: 소총병 / 돌격병(가볍고 빠름, 근접) / 중장병(느리고 단단함, 긴 점사) / 저격수(원거리, 조준선 예고 후 한 발)
const TYPES = {
  rifle: { key: 'rifle', label: '사살', score: 100, hp: 100, mat: 'rifle', puppet: 0, scale: 1, speed: 1, pref: [10, 24], burst: [3, 5], rof: 0.095, dmg: [5.5, 8.5], sig: 1, react: 1, headMul: 4, flinch: 1, kneel: 0.55, moveFire: 1.2 },
  rusher: { key: 'rusher', label: '돌격병 사살', score: 120, hp: 70, mat: 'rusher', puppet: 1, scale: 0.97, speed: 1.16, pref: [4, 9], burst: [4, 7], rof: 0.08, dmg: [4, 6.5], sig: 1.45, react: 0.7, headMul: 4, flinch: 1, kneel: 0, moveFire: 3.4 },
  heavy: { key: 'heavy', label: '중장병 사살', score: 250, hp: 260, mat: 'heavy', puppet: 0, scale: 1.1, speed: 0.6, pref: [12, 22], burst: [9, 15], rof: 0.085, dmg: [5, 7.5], sig: 1.3, react: 1.2, headMul: 2, flinch: 0.3, kneel: 0.15, moveFire: 1.5 },
  sniper: { key: 'sniper', label: '저격수 사살', score: 200, hp: 80, mat: 'sniper', puppet: 1, scale: 1, speed: 0.92, pref: [32, 48], burst: [1, 1], rof: 1, dmg: [42, 48], sig: 1, react: 1, headMul: 4, flinch: 1, kneel: 1, moveFire: 0, sniper: true },
};
const laserGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
laserGeo.translate(0, 0, 0.5);
const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2414, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

// ───────────────────────── 수류탄
const gren = { n: 2, list: [] };
const grenGeo = new THREE.SphereGeometry(0.045, 10, 8);
grenGeo.scale(1, 1.25, 1);
const grenMat = new THREE.MeshStandardMaterial({ color: 0x2c3620, roughness: 0.55, metalness: 0.35 });
function throwGrenade() {
  if (gren.n <= 0 || vm.throwT > 0 || vm.switchT > 0 || !player.alive || game.state !== 'playing') return;
  gren.n--;
  vm.throwT = 0.45;
  vm.reloadT = 0;
  camera.getWorldDirection(_f);
  _r.crossVectors(_f, UP).normalize();
  const mesh = new THREE.Mesh(grenGeo, grenMat);
  mesh.castShadow = true;
  scene.add(mesh);
  const c = camera.position, p = new THREE.Vector3().copy(c).addScaledVector(_f, 0.45).addScaledVector(_r, 0.18);
  p.y -= 0.12;
  if (!losClear(c.x, c.y, c.z, p.x, p.y, p.z)) p.copy(c);
  const v = new THREE.Vector3().copy(_f).multiplyScalar(13).add(player.vel);
  v.y += 3.6;
  gren.list.push({ mesh, p, v, fuse: 2.6, clinkT: -1, warnT: 0.4, seen: new Set() });
  SFX.play('whiz', 0.35, 0.55);
  if (coop.on && coop.started) coopSendGren(p, v, coop.pid);
}
// ghost: 다른 플레이어가 던진 수류탄. 연출만 하고 피해는 던진 사람의 폰이 계산한다
function explode(x, y, z, ghost) {
  sparks.emit(x, y + 0.5, z, 0, 0.5, 0, 0.14, 3.2, 1, 0.85, 0.55, 1, 0, 0, 6);
  for (let i = 0; i < 26; i++) sparks.emit(x, y + 0.2, z, rr(-7, 7), rr(1, 9), rr(-7, 7), rr(0.22, 0.55), rr(0.5, 1.1), 1, rr(0.45, 0.7), 0.18, 0.9, -1, 3.5, 1.6);
  for (let i = 0; i < 16; i++) dust.emit(x + rr(-0.4, 0.4), y + 0.3, z + rr(-0.4, 0.4), rr(-2.5, 2.5), rr(1.5, 5), rr(-2.5, 2.5), rr(1.3, 2.6), rr(0.5, 1.0), 0.16, 0.15, 0.14, 0.55, -0.5, 1.7, 1.5);
  for (let i = 0; i < 22; i++) dust.emit(x, y + 0.1, z, rr(-9, 9), rr(2, 10), rr(-9, 9), rr(0.5, 1.1), rr(0.02, 0.045), 0.16, 0.15, 0.14, 1, 9.8, 0.4);
  if (y < 1.2) scorch.add(x, 0, z, 0, 1, 0, rr(2.4, 3.2));
  flashLight.position.set(x, y + 0.7, z);
  flashLight.distance = 34;
  flashLight.intensity = 420;
  const c = camera.position, dp = Math.hypot(c.x - x, c.y - y, c.z - z);
  cam.shake = Math.max(cam.shake, clamp(1.7 - dp / 13, 0, 1.5));
  SFX.playAt('boom', x, y, z, 1.7, rr(0.9, 1.05));
  if (ghost) return;
  let hits = 0, kills = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.pos.x - x, 1.0 - y, e.pos.z - z);
    if (d > 7.5) continue;
    let dmg = 200 * (1 - d / 7.5);
    if (!losClear(x, y + 0.35, z, e.pos.x, 1.1, e.pos.z)) dmg *= 0.25;
    hits++;
    if (e.damage(dmg, 1, null, 0, { x, y, z, power: 2.5 + 4 * (1 - d / 7.5) })) kills++;
  }
  if (hits) {
    hudS.hm = kills ? 0.35 : 0.18;
    el.hm.classList.toggle('kill', kills > 0);
    SFX.play('hit', 0.5);
  }
  if (dp < 7.5 && player.alive) hurtPlayer(110 * (1 - dp / 7.5) * (losClear(x, y + 0.35, z, c.x, c.y - 0.3, c.z) ? 1 : 0.25), { x, z });
  for (const e of enemies) if (!e.dead && !e.puppet) e.lastKnown.copy(player.pos);
}
function updateGrenades(dt) {
  for (let i = gren.list.length - 1; i >= 0; i--) {
    const g = gren.list[i];
    g.fuse -= dt;
    g.v.y -= 9.8 * dt;
    let remain = dt;
    for (let it = 0; it < 3 && remain > 1e-4; it++) {
      const sp = g.v.length();
      if (sp < 0.02) break;
      const dist = sp * remain;
      _d.copy(g.v).multiplyScalar(1 / sp);
      if (rayWorld(g.p.x, g.p.y, g.p.z, _d.x, _d.y, _d.z, dist + 0.05)) {
        const t = Math.max(0, hit.t - 0.05), vn = g.v.x * hit.nx + g.v.y * hit.ny + g.v.z * hit.nz;
        g.p.addScaledVector(_d, t);
        g.v.x -= 1.42 * vn * hit.nx; g.v.y -= 1.42 * vn * hit.ny; g.v.z -= 1.42 * vn * hit.nz; // 반발 0.42
        g.v.multiplyScalar(0.72);
        if (Math.abs(vn) > 1.2 && game.time - g.clinkT > 0.1) { g.clinkT = game.time; SFX.playAt('clink', g.p.x, g.p.y, g.p.z, 0.9, rr(0.9, 1.15)); }
        if (hit.ny > 0.5 && Math.abs(g.v.y) < 0.7) g.v.y = 0;
        remain *= 1 - t / dist;
        if (t < 1e-4) break;
      } else {
        g.p.addScaledVector(_d, dist);
        remain = 0;
      }
    }
    if (g.p.y < 0.05) { g.p.y = 0.05; if (g.v.y < 0) g.v.y = 0; }
    g.mesh.position.copy(g.p);
    g.mesh.rotation.x += dt * (2 + g.v.length() * 3);
    g.mesh.rotation.z += dt * g.v.length();
    // 근처의 적은 수류탄을 보면 피한다
    g.warnT -= dt;
    if (g.warnT <= 0 && g.fuse < 1.3) {
      g.warnT = 0.25;
      for (const e of enemies) {
        if (e.dead || e.puppet || g.seen.has(e) || Math.hypot(e.pos.x - g.p.x, e.pos.z - g.p.z) > 6.5 || !losClear(e.pos.x, 1.6, e.pos.z, g.p.x, g.p.y + 0.2, g.p.z)) continue;
        g.seen.add(e);
        if (Math.random() < (e.T.key === 'heavy' ? 0.35 : 0.65)) e.fleeFrom(g.p);
      }
    }
    if (g.fuse <= 0) {
      explode(g.p.x, g.p.y, g.p.z, g.ghost);
      scene.remove(g.mesh);
      gren.list.splice(i, 1);
    }
  }
}

class Enemy {
  // nid: 협동에서 방장이 매기는 번호. 참가자 화면의 적(puppet)은 AI 없이 방장이 보낸 상태를 따라 움직인다
  constructor(x, z, type, nid = 0) {
    const T = (this.T = TYPES[type] || TYPES.rifle);
    this.nid = nid; this.puppet = false; this.net = null; this.hitN = 0;
    try { this.body = MOCAP.ready ? new MocapBody(T.key === 'rifle' && (nid ? nid % 2 === 0 : Math.random() < 0.5) ? 'rifle2' : T.mat, T.scale) : new PuppetBody(T.puppet); }
    catch (err) { this.body = new PuppetBody(T.puppet); }
    scene.add(this.body.root);
    this.pos = new THREE.Vector3(x, 0, z);
    this.aimYaw = this.bodyYaw = Math.atan2(player.pos.x - x, player.pos.z - z);
    this.back = false; this.vx = 0; this.vz = 0; this.crouch = 0; this.kneel = Math.random() < T.kneel; this.kick = 0; this.fleeT = 0;
    this.hp = T.hp;
    this.state = 'hunt';
    this.tg = player; this.tgT = Math.random(); // 표적: 플레이어 또는 아군
    this.path = null; this.pi = 0; this.repath = 0; this.goalX = x; this.goalZ = z; this.stuck = 0;
    this.lastKnown = new THREE.Vector3().copy(player.pos);
    this.canSee = false; this.seeT = Math.random() * 0.2; this.seenFor = 0; this.unseenFor = 0;
    this.react = 0; this.burst = 0; this.shotCd = 0; this.burstCd = rr(0.2, 0.8); this.mag = T.sniper ? 5 : T.key === 'heavy' ? 60 : 30; this.reload = 0; this.token = false;
    this.tactic = 0; this.speed = 0; this.flinch = 0; this.flinchSide = 1; this.aim = 0; this.aimPitch = 0; this.flashT = 0;
    this.dead = false; this.deadT = 0; this.fall = 1; this.gone = false;
    this.skill = 0.85 + (game.wave - 1) * 0.07;
    this.pref = rr(T.pref[0], T.pref[1]);
    this.aimT = 0; this.cool = 0; this.aimPt = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    this.laser = null;
    if (T.sniper) {
      this.laser = new THREE.Mesh(laserGeo, laserMat);
      this.laser.visible = false;
      this.laser.frustumCulled = false;
      scene.add(this.laser);
    }
    this.body.animate(this, 0.016);
  }
  remove() {
    this.body.dispose(scene);
    if (this.laser) { scene.remove(this.laser); this.laser = null; }
    this.gone = true;
  }
  setPath(x, z) {
    const p = findPath(this.pos.x, this.pos.z, x, z);
    if (p && p.length) { this.path = p; this.pi = p.length > 1 ? 1 : 0; this.goalX = x; this.goalZ = z; return true; }
    this.path = null;
    return false;
  }
  dropToken() {
    if (this.token) { tokens--; this.token = false; }
  }
  pickSpot() {
    const T = this.T, P = this.tg, needCover = this.reload > 0 || this.hp < T.hp * 0.35, px = P.pos.x, py = P.pos.y + P.eye, pz = P.pos.z;
    let best = null, bs = -1e9;
    for (let k = 0; k < 10; k++) {
      const c = cellNear(this.pos.x, this.pos.z, T.sniper ? 16 : 11);
      if (!c) continue;
      const dP = Math.hypot(c.x - px, c.z - pz);
      let s = -Math.abs(dP - this.pref) * 0.45 - Math.hypot(c.x - this.pos.x, c.z - this.pos.z) * 0.15;
      const vis = losClear(c.x, 1.7, c.z, px, py, pz);
      s += needCover ? (vis ? -5 : 5) : vis ? 5 : -2;
      if (dP < (T.key === 'rusher' ? 2.5 : 6)) s -= 6;
      for (const o of enemies) if (o !== this && !o.dead && Math.hypot(o.goalX - c.x, o.goalZ - c.z) < 2.5) s -= 3;
      if (s > bs) { bs = s; best = c; }
    }
    if (best) this.setPath(best.x, best.z);
    this.kneel = Math.random() < T.kneel;
  }
  fleeFrom(p) {
    let best = null, bd = 0;
    for (let k = 0; k < 8; k++) {
      const c = cellNear(this.pos.x, this.pos.z, 10);
      if (!c) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > bd) { bd = d; best = c; }
    }
    if (best && bd > 6 && this.setPath(best.x, best.z)) {
      this.fleeT = 1.9;
      this.burst = 0;
      this.dropToken();
      const t = this.path[Math.min(1, this.path.length - 1)], dx = t.x - this.pos.x, dz = t.z - this.pos.z, dl = Math.hypot(dx, dz);
      if (dl > 0.5) this.tryRoll(dx / dl, dz / dl);
    }
  }
  // 구르기: 그 방향으로 3.4m가 비어 있을 때만
  tryRoll(dx, dz) {
    if (this.rollT > 0 || game.time < (this.rollCd || 0) || !MOCAP.clips || !MOCAP.clips.Roll || !this.body.playOver || this.T.key === 'heavy' || this.T.sniper) return false;
    for (let d = 0.5; d <= 3.4; d += 0.4) if (blockedAt(this.pos.x + dx * d, this.pos.z + dz * d)) return false;
    if (!this.body.playOver('Roll', { full: true, rate: 1.25, tin: 0.1, tout: 0.2, force: true })) return false;
    this.rollDur = this.rollT = 1.47 / 1.25;
    this.rollX = dx; this.rollZ = dz;
    this.rollCd = game.time + 7;
    this.fleeT = Math.max(this.fleeT, this.rollT + 0.15);
    this.burst = 0;
    this.dropToken();
    return true;
  }
  // 가까운 표적 고르기: 플레이어를 조금 더 우선한다
  pickTarget() {
    let best = player, bs = player.alive ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) * (coop.on ? 1 : 0.8) : 1e9;
    for (const a of allies) {
      if (!a.alive) continue;
      const sc = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) - (this.tg === a ? 4 : 0);
      if (sc < bs) { bs = sc; best = a; }
    }
    if (best !== this.tg) { this.tg = best; this.seenFor = 0; this.react = Math.max(this.react, 0.3); this.aimT = 0; this.seeT = 0; }
  }
  fire() {
    const T = this.T, P = this.tg, drop = this.crouch * 0.37, ox = this.pos.x, oy = 1.48 - drop, oz = this.pos.z;
    if (T.sniper) _d.set(this.aimPt.x - ox, this.aimPt.y - oy, this.aimPt.z - oz);
    else _d.set(P.pos.x - ox, P.pos.y + P.eye * 0.72 - oy, P.pos.z - oz);
    const dist = _d.length();
    _d.multiplyScalar(1 / dist);
    const sig = T.sniper ? 0.005 : ((0.056 * T.sig) / this.skill) * (1 + Math.min(P.hspeed, 7) * 0.1) * (this.seenFor < 1 ? 1.5 : 1) * (P.crouch > 0.5 || P.crouch === true ? 0.9 : 1);
    _r.crossVectors(_d, UP).normalize();
    _u.crossVectors(_r, _d);
    _d.addScaledVector(_r, gauss() * sig).addScaledVector(_u, gauss() * sig).normalize();
    let tEnd = 170, world = false, nx = 0, ny = 0, nz = 0, mat = 0;
    if (rayWorld(ox, oy, oz, _d.x, _d.y, _d.z, 170)) { tEnd = hit.t; world = true; nx = hit.nx; ny = hit.ny; nz = hit.nz; mat = hit.m; }
    const tp = rayPlayer(ox, oy, oz, _d, tEnd);
    let hitAlly = null, tA = tp >= 0 ? tp : tEnd; // 탄 경로에 아군이 먼저 있으면 아군이 맞는다
    for (const a of allies) { if (a.gone) continue; const t = rayAlly(a, ox, oy, oz, _d, tA); if (t >= 0) { tA = t; hitAlly = a; } }
    let fl = 0; // 1: 지형에 맞음, 2: 사람이 맞음 (참가자 화면 표시용)
    if (hitAlly) {
      tEnd = tA;
      fl = 2;
      hitAlly.hurt(rr(T.dmg[0], T.dmg[1]) * (hitAlly.net && !T.sniper && dist > 45 ? 0.75 : 1), this);
    } else if (tp >= 0) {
      tEnd = tp;
      fl = 2;
      hurtPlayer(rr(T.dmg[0], T.dmg[1]) * (!T.sniper && dist > 45 ? 0.75 : 1), this.pos);
    } else {
      if (world) { fl = 1; impactFx(ox + _d.x * tEnd, oy + _d.y * tEnd, oz + _d.z * tEnd, nx, ny, nz, mat, 0.55); }
      whizNear(ox, oy, oz, _d, tEnd);
    }
    const ex = ox + _d.x * tEnd, ey = oy + _d.y * tEnd, ez = oz + _d.z * tEnd;
    this.shotFx(ex, ey, ez);
    if (coop.host && coop.shots.length < 48) coop.shots.push([this.nid, Math.round(ex * 10), Math.round(ey * 10), Math.round(ez * 10), fl]);
  }
  // 총구 화염·예광탄·총성. 참가자 화면에서는 방장이 알려 준 탄착점으로 그린다
  shotFx(ex, ey, ez) {
    const T = this.T, drop = this.crouch * 0.37, mx = this.pos.x + Math.sin(this.aimYaw) * 0.85, mz = this.pos.z + Math.cos(this.aimYaw) * 0.85, my = 1.47 - drop;
    tracers.spawn(mx, my, mz, ex, ey, ez);
    this.flashT = 0.05;
    this.kick = 1;
    this.body.flash.rotation.z = Math.random() * TAU;
    SFX.playAt(T.sniper ? 'shotDMR' : 'shotFar', mx, my, mz, T.sniper ? 1.3 : 0.95, T.key === 'heavy' ? rr(0.78, 0.86) : rr(0.93, 1.07));
  }
  // dir: 탄 진행 방향(없으면 폭발), power: 래그돌에 줄 충격, blast: 폭발 정보
  damage(d, part, dir, power, blast, src) {
    if (this.dead) return false;
    const T = this.T;
    if (this.puppet) { // 참가자: 명중을 방장에 보고하고, 움찔하는 반응만 미리 보여 준다. 사살 여부는 방장이 알려 준다
      coopSendHit(this, d, part, dir, power, blast);
      this.flinch = Math.max(this.flinch, T.flinch);
      this.flinchSide = Math.random() < 0.5 ? -1 : 1;
      this.localHitT = game.time;
      if (this.body.playOver && !blast) this.body.playOver(part === 2 ? 'HitHead' : 'HitChest', { peak: T.flinch >= 1 ? 1 : 0.45 });
      return false;
    }
    this.hitN = (this.hitN + 1) & 15;
    this.hp -= d;
    this.flinch = Math.max(this.flinch, T.flinch);
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
    if (this.hp > 0 && this.body.playOver && !blast) {
      this.body.playOver(part === 2 ? 'HitHead' : 'HitChest', { peak: T.flinch >= 1 ? 1 : 0.45 });
      // 맞으면 가끔 옆으로 몸을 던져 피한다
      if (dir && this.hp < T.hp * 0.8 && Math.random() < 0.3) { const sg = Math.random() < 0.5 ? -1 : 1, dl = Math.hypot(dir.x, dir.z) || 1; this.tryRoll((-dir.z / dl) * sg, (dir.x / dl) * sg) || this.tryRoll((dir.z / dl) * sg, (-dir.x / dl) * sg); }
    }
    if (dir && T.flinch > 0.5) { // 맞으면 휘청이며 밀리고 조준이 흐트러진다
      this.vx += dir.x * 1.4;
      this.vz += dir.z * 1.4;
      this.seenFor = Math.min(this.seenFor, 0.3);
      this.aimT *= 0.4;
      if (this.burst > 0 && Math.random() < 0.4) { this.burst = 0; this.dropToken(); this.burstCd = rr(0.4, 0.9); }
    }
    // 쏜 쪽으로 주의를 돌린다 (감시탑 지원 사격은 위치를 모른다)
    if (src && !src.ow) { if (src.alive && Math.random() < 0.6) { this.tg = src; this.tgT = rr(2, 3.5); } }
    else if (!src && this.tg !== player) { this.tg = player; this.tgT = rr(2, 3.5); }
    this.lastKnown.copy(src && !src.ow ? src.pos : src ? this.tg.pos : player.pos);
    this.unseenFor = 0;
    if (this.state !== 'combat') { this.state = 'combat'; this.react = 0.35; this.tactic = 0.2; }
    if (this.hp <= 0) { this.die(dir, part, power, blast, src); return true; }
    return false;
  }
  // 쓰러지는 연출. clip: 쓸 죽음 클립(없으면 래그돌). 참가자 화면에서는 방장이 고른 값을 그대로 쓴다
  kill(dir, part, power, blast, clip) {
    const T = this.T;
    this.dead = true;
    this.deadT = 0;
    this.dropToken();
    if (!(part === 2 && !blast) || Math.random() < 0.3) SFX.playAt('grunt', this.pos.x, 1.5, this.pos.z, 0.9, rr(0.92, 1.05) * (T.key === 'heavy' ? 0.86 : 1));
    if (this.laser) { scene.remove(this.laser); this.laser = null; }
    this.fall = dir && Math.sin(this.bodyYaw) * dir.x + Math.cos(this.bodyYaw) * dir.z > 0 ? 1 : -1;
    this.fallSnd = clip === 'Death' ? 0.95 : clip === 'Knockback' ? 0.35 : blast ? 0.8 : 0.5;
    this.deathKind = clip || 'ragdoll';
    this.body.die(this, scene, { dir: dir ? { x: dir.x, y: dir.y, z: dir.z } : null, power: power || 3, part, blast: blast || null, clip });
  }
  die(dir, part, power, blast, src) {
    const T = this.T;
    let clip = null;
    if (!blast && dir && part !== 2 && MOCAP.clips && MOCAP.clips.Death && this.body.playOver && this.crouch < 0.4 && !(this.rollT > 0) && Math.random() < 0.6) {
      // 클립은 뒤로 쓰러진다: 탄이 미는 방향과 비슷하고 그쪽이 비어 있을 때만 쓴다
      const a = this.bodyYaw + MOCAP.deathYaw, fx = Math.sin(a), fz = Math.cos(a), dl = Math.hypot(dir.x, dir.z) || 1;
      if ((fx * dir.x + fz * dir.z) / dl > 0.3 && !rayWorld(this.pos.x, 0.45, this.pos.z, fx, 0, fz, 2.3, false) && !rayWorld(this.pos.x, 1.2, this.pos.z, fx, 0, fz, 1.6, false)) clip = (power || 3) >= 5 ? 'Knockback' : 'Death';
    }
    this.kill(dir, part, power, blast, clip);
    const head = part === 2 && !blast, pts = T.score + (head ? 50 : 0);
    if (src && src.net) { // 협동: 다른 플레이어가 잡은 적. 점수는 팀이 함께 쌓는다
      src.kills++;
      game.score += pts;
      feed(`${src.def.name} · ${T.label}`);
    } else if (src) { // 팀원이 잡은 적
      game.teamKills++;
      feed(`${src.def.short} · ${T.label}`);
    } else {
      game.kills++;
      game.score += pts;
      if (head) game.headshots++;
      feed(head ? `헤드샷 +${pts}` : `${T.label} +${pts}`, head);
    }
    const rn = Math.random(), drop = rn < 0.38 ? 'ammo' : rn < 0.38 + (player.hp < 60 ? 0.3 : 0.1) ? 'med' : '';
    if (drop) addPickup(drop, this.pos.x, this.pos.z);
    if (coop.host) coopSendDie(this, part, dir, power, blast, clip, src && src.net ? src.pid : 0, drop, head);
  }
  update(dt) {
    if (this.dead) {
      this.deadT += dt;
      if (this.fallSnd > 0 && (this.fallSnd -= dt) <= 0) SFX.playAt('bodyfall', this.pos.x, 0.3, this.pos.z, 1.2, rr(0.9, 1.08));
      if (this.body.animateDead(this, dt)) this.remove();
      return;
    }
    if (this.puppet) { this.updatePuppet(dt); return; }
    this.tgT -= dt;
    if (this.tgT <= 0 || (this.tg !== player && !this.tg.alive)) { this.tgT = rr(1.2, 2); this.pickTarget(); }
    const T = this.T, P = this.tg, px = P.pos.x, pz = P.pos.z, dP = Math.hypot(px - this.pos.x, pz - this.pos.z), drop = this.crouch * 0.37, run = runSpeed() * T.speed;
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.16 + Math.random() * 0.1;
      this.canSee = P.alive && dP < 95 && losClear(this.pos.x, 1.7 - drop, this.pos.z, px, P.pos.y + P.eye, pz);
    }
    if (this.canSee) { this.lastKnown.copy(P.pos); this.seenFor += dt; this.unseenFor = 0; }
    else { this.unseenFor += dt; this.seenFor = Math.max(0, this.seenFor - dt * 2); }
    this.kick = damp(this.kick, 0, 22, dt);

    let speed = 0;
    if (this.fleeT > 0) { // 수류탄 회피 중
      this.fleeT -= dt;
      speed = run * 1.08;
      this.aimT = 0;
    } else {
      if (this.state === 'hunt') {
        if (this.canSee) { this.state = 'combat'; this.react = (rr(0.6, 1.1) * T.react) / this.skill; this.tactic = rr(0.3, 1.2); }
        else {
          this.repath -= dt;
          if (!this.path || this.pi >= this.path.length || this.repath <= 0) {
            let gx = this.lastKnown.x, gz = this.lastKnown.z;
            if (Math.hypot(gx - this.pos.x, gz - this.pos.z) < 3.5) {
              const c = cellNear(px, pz, 12);
              if (c) { gx = c.x; gz = c.z; this.lastKnown.set(gx, 0, gz); }
            }
            this.setPath(gx, gz);
            this.repath = rr(1.6, 2.6);
          }
          speed = run;
        }
      }
      if (this.state === 'combat') {
        if (this.unseenFor > 2.4) { this.state = 'hunt'; this.repath = 0; this.burst = 0; this.aimT = 0; this.dropToken(); }
        else {
          this.tactic -= dt;
          if (this.tactic <= 0) { this.pickSpot(); this.tactic = T.sniper ? rr(5, 9) : rr(2.6, 4.8); }
          speed = this.burst > 0 ? T.moveFire : run * 0.72;
          if (this.reload > 0) {
            this.reload -= dt;
            if (this.reload <= 0) this.mag = T.sniper ? 5 : T.key === 'heavy' ? 60 : 30;
          } else if (T.sniper) { // 저격수: 붉은 조준선으로 예고한 뒤 한 발
            if (this.cool > 0) { this.cool -= dt; this.aimT = 0; }
            else if (this.canSee) {
              this.react -= dt;
              if (this.react <= 0 && this.speed < 0.8) {
                this.aimT += dt;
                speed = 0;
                if (this.aimT >= 1.7) {
                  this.fire();
                  this.aimT = 0;
                  this.cool = 2.3;
                  if (--this.mag <= 0) this.reload = 2.6;
                  this.tactic = Math.min(this.tactic, 1.2);
                }
              }
            } else this.aimT = Math.max(0, this.aimT - dt * 2.5);
          } else if (this.canSee) {
            this.react -= dt;
            if (this.react <= 0) {
              if (this.burst > 0) {
                this.shotCd -= dt;
                if (this.shotCd <= 0) {
                  this.fire();
                  this.shotCd = T.rof;
                  this.burst--;
                  this.mag--;
                  if (this.burst <= 0 || this.mag <= 0) {
                    this.burst = 0;
                    this.dropToken();
                    this.burstCd = rr(0.7, 1.6) / this.skill;
                    if (this.mag <= 0) { this.reload = T.key === 'heavy' ? 3.4 : 2.4; this.tactic = 0; }
                  }
                }
              } else {
                this.burstCd -= dt;
                if (this.burstCd <= 0 && tokens < maxTokens()) { tokens++; this.token = true; this.burst = T.burst[0] + ((Math.random() * (T.burst[1] - T.burst[0] + 1)) | 0); this.shotCd = 0; }
              }
            }
          } else if (this.burst > 0) { this.burst = 0; this.dropToken(); }
        }
      }
    }

    // 경로 추종: 가감속이 있는 속도 + 다른 적과의 간격 유지
    if (this.back) speed = Math.min(speed, 2.2);
    let dvx = 0, dvz = 0;
    if (this.path && this.pi < this.path.length && speed > 0) {
      if (this.pi + 1 < this.path.length && navLineClear(this.pos.x, this.pos.z, this.path[this.pi + 1].x, this.path[this.pi + 1].z)) this.pi++;
      const t = this.path[this.pi], tx = t.x - this.pos.x, tz = t.z - this.pos.z, d = Math.hypot(tx, tz);
      if (d < 0.3) this.pi++;
      else {
        const sp = this.pi === this.path.length - 1 ? Math.min(speed, 1.2 + d * 3) : speed; // 목적지 앞에서 감속
        dvx = (tx / d) * sp; dvz = (tz / d) * sp;
      }
    }
    if (this.rollT > 0) { // 구르는 동안은 정해진 방향으로만 움직인다
      this.rollT -= dt;
      const sp = 1 - this.rollT / this.rollDur < 0.7 ? 4.4 : 1.2;
      dvx = this.rollX * sp; dvz = this.rollZ * sp;
    }
    const want = Math.hypot(dvx, dvz);
    this.vx = damp(this.vx, dvx, 8, dt);
    this.vz = damp(this.vz, dvz, 8, dt);
    let vx = this.vx, vz = this.vz;
    for (const o of enemies) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.8 && d2 > 1e-4) { const d = Math.sqrt(d2), k = (0.9 - d) * 3; vx += (ox / d) * k; vz += (oz / d) * k; }
    }
    const x0 = this.pos.x, z0 = this.pos.z, nx = x0 + vx * dt, nz = z0 + vz * dt;
    if (!blockedAt(nx, this.pos.z)) this.pos.x = nx; else this.vx = 0;
    if (!blockedAt(this.pos.x, nz)) this.pos.z = nz; else this.vz = 0;
    const moved = Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt;
    this.speed = damp(this.speed, moved, 10, dt);
    if (want > 0.5 && moved < 0.3) {
      this.stuck += dt;
      if (this.stuck > 1.2) { this.stuck = 0; this.repath = 0; this.tactic = 0; }
    } else this.stuck = 0;

    // 조준 방향(상체·총)과 진행 방향(하체)을 분리: 엄폐물로 뛰면서도 총구는 표적을 향한다
    const combat = this.state === 'combat' && this.fleeT <= 0, mv = Math.hypot(this.vx, this.vz);
    let ta = this.aimYaw;
    if (combat) ta = Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
    else if (mv > 0.3) ta = Math.atan2(this.vx, this.vz);
    this.aimYaw += clamp(angDiff(this.aimYaw, ta), -6.5 * dt, 6.5 * dt);
    this.present(dt, combat, mv, combat && mv < 0.5 && (this.reload > 0 || (this.kneel && this.canSee)), P, dP);
  }
  // 몸 방향·자세·발소리·애니메이션·조준선. AI(방장)와 꼭두각시(참가자)가 함께 쓴다
  present(dt, combat, mv, wantCrouch, P, dP) {
    const T = this.T, drop = this.crouch * 0.37;
    let tb = this.aimYaw, back = false;
    if (mv > 0.6) {
      const md = Math.atan2(this.vx, this.vz);
      if (Math.abs(angDiff(md, this.aimYaw)) <= (this.back ? 1.4 : 1.75)) tb = md;
      else { tb = md + Math.PI; back = true; } // 표적을 보며 뒷걸음
    }
    if (this.rollT > 0) { tb = Math.atan2(this.rollX, this.rollZ); back = false; }
    this.back = back;
    this.bodyYaw += clamp(angDiff(this.bodyYaw, tb), -9 * dt, 9 * dt);
    this.aim = damp(this.aim, combat ? 1 : 0, 7, dt);
    if (this.canSee && P) this.aimPitch = clamp(Math.atan2(P.pos.y + P.eye * 0.72 - (1.48 - drop), Math.max(dP, 1)), -0.6, 0.6);
    this.crouch = damp(this.crouch, wantCrouch ? 1 : 0, 6, dt);
    this.flinch = damp(this.flinch, 0, 9, dt);
    this.flashT -= dt;
    if (mv > 0.8) { // 발소리
      this.stepAcc = (this.stepAcc || 0) + mv * dt;
      if (this.stepAcc > (mv > 3 ? 1.75 : 1.35)) {
        this.stepAcc = 0;
        if (Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z) < 30) SFX.playAt('step', this.pos.x, 0.1, this.pos.z, T.key === 'heavy' ? 1.5 : 1.0, T.key === 'heavy' ? 0.84 : rr(0.95, 1.1));
      }
    }
    this.body.animate(this, dt);

    if (this.laser) {
      // 조준점은 표적을 조금 늦게 따라온다: 옆으로 계속 움직이면 빗나간다
      if (this.canSee && P) { const ty = P.pos.y + P.eye * 0.72; this.aimPt.x = damp(this.aimPt.x, P.pos.x, 3.2, dt); this.aimPt.y = damp(this.aimPt.y, ty, 3.2, dt); this.aimPt.z = damp(this.aimPt.z, P.pos.z, 3.2, dt); }
      const on = this.aimT > 0.15;
      this.laser.visible = on;
      if (on) {
        const ox = this.pos.x + Math.sin(this.aimYaw) * 0.8, oy = 1.47 - drop, oz = this.pos.z + Math.cos(this.aimYaw) * 0.8;
        _d.set(this.aimPt.x - ox, this.aimPt.y - oy, this.aimPt.z - oz);
        let len = _d.length();
        _d.multiplyScalar(1 / len);
        len = rayWorld(ox, oy, oz, _d.x, _d.y, _d.z, len + 25) ? hit.t : len + 25;
        this.laser.position.set(ox, oy, oz);
        this.laser.quaternion.setFromUnitVectors(ZAXIS, _d);
        this.laser.scale.z = len;
      }
    }
  }
  // 참가자 화면의 적: 방장이 보낸 상태를 조금 늦춰 부드럽게 따라간다
  updatePuppet(dt) {
    const n = this.net, s = sampleAt(n.buf, netNow() - 0.12), x0 = this.pos.x, z0 = this.pos.z;
    if (s) {
      const a = s.a, b = s.b, k = s.k;
      this.pos.x = lerp(a.x, b.x, k);
      this.pos.z = lerp(a.z, b.z, k);
      this.aimYaw = a.yaw + angDiff(a.yaw, b.yaw) * k;
      n.fl = b.fl;
    }
    const fl = n.fl | 0, ivx = (this.pos.x - x0) / dt, ivz = (this.pos.z - z0) / dt;
    this.vx = damp(this.vx, ivx, 10, dt);
    this.vz = damp(this.vz, ivz, 10, dt);
    this.speed = damp(this.speed, Math.hypot(ivx, ivz), 10, dt);
    this.kick = damp(this.kick, 0, 22, dt);
    if (fl & 4) { // 구르기 시작
      if (!n.roll && this.body.playOver && MOCAP.clips && MOCAP.clips.Roll) {
        const mv0 = Math.hypot(this.vx, this.vz) || 1;
        this.body.playOver('Roll', { full: true, rate: 1.25, tin: 0.1, tout: 0.2, force: true });
        this.rollT = 1.47 / 1.25; this.rollX = this.vx / mv0; this.rollZ = this.vz / mv0;
      }
      n.roll = true;
    } else n.roll = false;
    if (this.rollT > 0) this.rollT -= dt;
    const hn = (fl >> 7) & 15; // 다른 사람이 맞힌 반응
    if (n.hitN !== undefined && hn !== n.hitN && game.time - (this.localHitT || -9) > 0.35) {
      this.flinch = Math.max(this.flinch, this.T.flinch);
      if (this.body.playOver) this.body.playOver('HitChest', { peak: this.T.flinch >= 1 ? 1 : 0.45 });
    }
    n.hitN = hn;
    const P = coopEntity((fl >> 5) & 3), dP = P ? Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) : 30;
    this.tg = P || player;
    this.canSee = !!(fl & 16);
    this.aimT = fl & 8 ? 1 : 0;
    this.present(dt, !!(fl & 2), Math.hypot(this.vx, this.vz), !!(fl & 1), P, dP);
  }
}

function pickType() {
  if (game.queue.length) return game.queue.shift();
  const n = game.wave, r = Math.random(), cnt = (k) => enemies.reduce((a, e) => a + (!e.dead && e.T.key === k ? 1 : 0), 0);
  if (n >= 4 && r < 0.14 && cnt('sniper') < (n >= 7 ? 2 : 1)) return 'sniper';
  if (n >= 3 && r < 0.32 && cnt('heavy') < (n >= 6 ? 2 : 1)) return 'heavy';
  if (n >= 2 && r < 0.6) return 'rusher';
  return 'rifle';
}

function spawnEnemy(fx, fz, type) {
  const nid = coop.host ? ++coop.nextId : 0;
  if (fx !== undefined) { const e = new Enemy(fx, fz, type || 'rifle', nid); enemies.push(e); return e; }
  const kind = pickType(), hs = humans();
  let best = -1, bs = -1e9;
  for (let k = 0; k < 26; k++) {
    const c = NAV.free[(Math.random() * NAV.free.length) | 0], x = cellX(c), z = cellZ(c);
    let d = 1e9, seen = false; // 가장 가까운 사람까지의 거리, 누구에게든 보이는 자리인가
    for (const h of hs) {
      d = Math.min(d, Math.hypot(x - h.pos.x, z - h.pos.z));
      if (!seen && losClear(x, 1.7, z, h.pos.x, h.pos.y + h.eye, h.pos.z)) seen = true;
    }
    if (d < 24) continue;
    let s = Math.min(d, 46) + Math.random() * 6;
    if (seen) s -= 40;
    for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x - x, e.pos.z - z) < 3) s -= 20;
    if (s > bs) { bs = s; best = c; }
  }
  if (best < 0) { game.queue.unshift(kind); return null; }
  const e = new Enemy(cellX(best), cellZ(best), kind, nid);
  enemies.push(e);
  return e;
}

// ───────────────────────── 아군 팀원: 플레이어를 따라다니며 교전한다. 작전 스크립트로 합류·이탈·지점 고수
const allies = [];
const SLOTS = [[-3.2, 1.4], [3.2, 1.4], [0, 4.6]]; // 플레이어 기준 [오른쪽, 뒤] 자리
const radioQ = [];
let radioT = 0;
function radio(who, text) {
  const d = SQUAD[who];
  radioQ.push({ name: d ? d.name : who, text, ally: !!d });
}
function rayAlly(a, ox, oy, oz, d, maxT) {
  const ex = ox - a.pos.x, ez = oz - a.pos.z, q = d.x * d.x + d.z * d.z;
  if (q < 1e-8) return -1;
  const b = ex * d.x + ez * d.z, disc = b * b - q * (ex * ex + ez * ez - 0.1);
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / q, y = oy + d.y * t;
  return t > 0 && t < maxT && y >= a.pos.y && y <= a.pos.y + 1.78 - a.crouch * 0.5 ? t : -1;
}
const snapFree = (p) => (blockedAt(p.x, p.z) ? cellNear(p.x, p.z, 3.5) || { x: p.x, z: p.z } : { x: p.x, z: p.z });
class Ally {
  constructor(def, x, z) {
    this.def = def;
    try { this.body = MOCAP.ready ? new MocapBody(def.mat, 1) : new PuppetBody(0); }
    catch (err) { this.body = new PuppetBody(0); }
    scene.add(this.body.root);
    this.pos = new THREE.Vector3(x, 0, z);
    this.eye = 1.62; this.hspeed = 0;
    this.aimYaw = this.bodyYaw = Math.atan2(player.pos.x - x, player.pos.z - z);
    this.back = false; this.vx = 0; this.vz = 0; this.speed = 0; this.crouch = 0; this.kick = 0; this.flinch = 0; this.flinchSide = 1; this.aim = 0; this.aimPitch = 0; this.flashT = 0;
    this.hp = def.hp; this.lastHit = -99;
    this.state = 'follow'; this.order = 'follow'; this.holdAt = null; this.exit = null; this.leaveT = 0; this.downT = 0;
    this.path = null; this.pi = 0; this.repath = 0; this.goalX = x; this.goalZ = z; this.farT = 0;
    this.tgt = null; this.seeT = Math.random() * 0.2; this.react = 0; this.burst = 0; this.shotCd = 0; this.burstCd = rr(0.2, 0.6); this.kneel = false;
    this.gone = false; this.stepAcc = 0; this.shots = 0; this.kills = 0;
    let slot = 0;
    while (allies.some((a) => !a.gone && a.slot === slot)) slot++;
    this.slot = slot;
    this.tag = el.tags.children[slot % el.tags.children.length];
    this.tag.textContent = def.short;
    this.body.animate(this, 0.016);
  }
  get alive() { return !this.gone && this.state !== 'down'; }
  remove() {
    this.body.dispose(scene);
    this.gone = true;
    this.tag.classList.add('hidden');
  }
  setPath(x, z) {
    const p = findPath(this.pos.x, this.pos.z, x, z);
    if (p && p.length) { this.path = p; this.pi = p.length > 1 ? 1 : 0; return true; }
    this.path = null;
    return false;
  }
  hurt(dmg) {
    if (this.gone || this.state === 'down') return;
    this.hp -= dmg * 0.55;
    this.lastHit = game.time;
    this.flinch = 1;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
    if (this.body.playOver) this.body.playOver('HitChest', { peak: 0.9 });
    if (this.hp <= 0) { // 쓰러지지는 않고 잠시 빠진다
      this.hp = 0;
      this.state = 'down';
      this.downT = 9;
      this.tgt = null;
      this.burst = 0;
      this.path = null;
      radio(this.def.id, Math.random() < 0.5 ? '맞았다! 잠깐 빠진다.' : '부상! 엄폐한다.');
    }
  }
  fire() {
    const D = this.def, e = this.tgt, drop = this.crouch * 0.37, ox = this.pos.x, oy = 1.48 - drop, oz = this.pos.z, ty = chestY(e) + rr(-0.2, 0.3);
    _d.set(e.pos.x - ox, ty - oy, e.pos.z - oz);
    const dist = _d.length();
    _d.multiplyScalar(1 / dist);
    const mv = Math.hypot(this.vx, this.vz);
    let hitE = Math.random() < clamp(D.acc * (0.72 - dist * 0.011) * (mv > 1 ? 0.55 : 1) * (e.speed > 2.5 ? 0.75 : 1), 0.1, 0.82);
    if (!hitE) { // 빗나간 탄은 표적 옆으로
      _r.crossVectors(_d, UP).normalize();
      _d.addScaledVector(_r, (Math.random() < 0.5 ? -1 : 1) * rr(0.03, 0.08)).addScaledVector(UP, rr(-0.02, 0.05)).normalize();
    }
    let tEnd = hitE ? dist : 130;
    if (rayWorld(ox, oy, oz, _d.x, _d.y, _d.z, tEnd) && hit.t < tEnd - 0.4) {
      tEnd = hit.t;
      hitE = false;
      impactFx(ox + _d.x * tEnd, oy + _d.y * tEnd, oz + _d.z * tEnd, hit.nx, hit.ny, hit.nz, hit.m, 0.4);
    }
    const mx = ox + Math.sin(this.aimYaw) * 0.85, mz = oz + Math.cos(this.aimYaw) * 0.85, my = 1.47 - drop;
    tracers.spawn(mx, my, mz, ox + _d.x * tEnd, oy + _d.y * tEnd, oz + _d.z * tEnd);
    this.flashT = 0.05;
    this.kick = 1;
    this.shots++;
    this.body.flash.rotation.z = Math.random() * TAU;
    SFX.playAt(D.snd, mx, my, mz, 0.8, D.rate * rr(0.97, 1.03));
    if (hitE) {
      const head = Math.random() < 0.07;
      bloodFx(e.pos.x, ty, e.pos.z, _d);
      if (e.damage(rr(D.dmg[0], D.dmg[1]) * (head ? 2 : 1), head ? 2 : 1, _d, 3, null, this)) this.kills++;
    }
  }
  update(dt) {
    const D = this.def, drop = this.crouch * 0.37, run = runSpeed();
    this.kick = damp(this.kick, 0, 22, dt);
    this.flinch = damp(this.flinch, 0, 9, dt);
    this.flashT -= dt;
    if (this.state === 'down') {
      this.downT -= dt;
      this.hp = Math.min(D.hp * 0.6, this.hp + D.hp * 0.07 * dt);
      if (this.downT <= 0) { this.state = this.order; radio(D.id, '다시 움직인다.'); }
    } else if (game.time - this.lastHit > 5 && this.hp < D.hp) this.hp = Math.min(D.hp, this.hp + 7 * dt);
    const active = this.state !== 'down';
    // 표적: 보이는 적 가운데 가장 가까운 적
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.22 + Math.random() * 0.12;
      let best = null, bd = D.range;
      if (active && this.state !== 'leave') {
        for (const e of enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d < bd && losClear(this.pos.x, 1.6 - drop, this.pos.z, e.pos.x, chestY(e), e.pos.z)) { bd = d; best = e; }
        }
      }
      if (best !== this.tgt) { this.tgt = best; this.react = rr(0.25, 0.55); this.kneel = Math.random() < 0.4; }
    }
    if (this.tgt && this.tgt.dead) this.tgt = null;
    // 이동 목표
    let speed = 0;
    const dP = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (this.state === 'leave') {
      speed = run * 1.05;
      this.repath -= dt;
      if ((!this.path || this.pi >= this.path.length) && this.repath <= 0) { this.setPath(this.exit.x, this.exit.z); this.repath = 1.5; }
      this.leaveT -= dt;
      if (Math.hypot(this.exit.x - this.pos.x, this.exit.z - this.pos.z) < 2.2 || this.leaveT <= 0) { this.remove(); return; }
    } else if (active) {
      let ax, az;
      if (this.state === 'hold') { ax = this.holdAt.x; az = this.holdAt.z; }
      else {
        const o = SLOTS[this.slot % SLOTS.length], sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
        ax = player.pos.x + o[0] * cs + o[1] * sn;
        az = player.pos.z - o[0] * sn + o[1] * cs;
      }
      const dA = Math.hypot(ax - this.pos.x, az - this.pos.z), far = this.state !== 'hold' && dP > 13;
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = rr(0.5, 0.9);
        const idle = !this.path || this.pi >= this.path.length;
        if (dA > (this.tgt && !far ? 7 : 2.6) && (idle || Math.hypot(ax - this.goalX, az - this.goalZ) > 2)) {
          const c = blockedAt(ax, az) ? cellNear(ax, az, 3.5) : { x: ax, z: az };
          if (c && this.setPath(c.x, c.z)) { this.goalX = ax; this.goalZ = az; }
        }
      }
      if (this.path && this.pi < this.path.length) speed = far ? run * 1.12 : this.tgt ? run * 0.6 : dA > 6 ? run : 2.4;
      // 지형 때문에 따라오지 못하고 멀어지면 플레이어 근처로 옮긴다
      if (this.state !== 'hold' && dP > 50) {
        this.farT += dt;
        if (this.farT > 6) { const c = cellNear(player.pos.x, player.pos.z, 7); if (c) { this.pos.set(c.x, 0, c.z); this.path = null; } this.farT = 0; }
      } else this.farT = 0;
    }
    // 경로 추종
    if (this.back) speed = Math.min(speed, 2.2);
    let dvx = 0, dvz = 0;
    if (this.path && this.pi < this.path.length && speed > 0) {
      if (this.pi + 1 < this.path.length && navLineClear(this.pos.x, this.pos.z, this.path[this.pi + 1].x, this.path[this.pi + 1].z)) this.pi++;
      const t = this.path[this.pi], tx = t.x - this.pos.x, tz = t.z - this.pos.z, d = Math.hypot(tx, tz);
      if (d < 0.3) this.pi++;
      else {
        const sp = this.pi === this.path.length - 1 ? Math.min(speed, 1.2 + d * 3) : speed;
        dvx = (tx / d) * sp; dvz = (tz / d) * sp;
      }
    }
    this.vx = damp(this.vx, dvx, 8, dt);
    this.vz = damp(this.vz, dvz, 8, dt);
    let vx = this.vx, vz = this.vz;
    const push = (qx, qz, rad) => { // 서로·플레이어와 겹치지 않게
      const ox = this.pos.x - qx, oz = this.pos.z - qz, d2 = ox * ox + oz * oz;
      if (d2 < rad * rad && d2 > 1e-4) { const d = Math.sqrt(d2), k = (rad - d) * 3; vx += (ox / d) * k; vz += (oz / d) * k; }
    };
    for (const o of allies) if (o !== this && !o.gone) push(o.pos.x, o.pos.z, 1.0);
    push(player.pos.x, player.pos.z, 1.3);
    const x0 = this.pos.x, z0 = this.pos.z, nx = x0 + vx * dt, nz = z0 + vz * dt;
    if (!blockedAt(nx, this.pos.z)) this.pos.x = nx; else this.vx = 0;
    if (!blockedAt(this.pos.x, nz)) this.pos.z = nz; else this.vz = 0;
    this.speed = damp(this.speed, Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt, 10, dt);
    this.hspeed = this.speed;
    // 조준과 사격
    const mv = Math.hypot(this.vx, this.vz), fight = active && this.state !== 'leave' && this.tgt;
    let ta = this.aimYaw;
    if (fight) ta = Math.atan2(this.tgt.pos.x - this.pos.x, this.tgt.pos.z - this.pos.z);
    else if (mv > 0.3) ta = Math.atan2(this.vx, this.vz);
    else if (active && this.state === 'follow') ta = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
    this.aimYaw += clamp(angDiff(this.aimYaw, ta), -7 * dt, 7 * dt);
    let tb = this.aimYaw, back = false;
    if (mv > 0.6) {
      const md = Math.atan2(this.vx, this.vz);
      if (Math.abs(angDiff(md, this.aimYaw)) <= (this.back ? 1.4 : 1.75)) tb = md;
      else { tb = md + Math.PI; back = true; }
    }
    this.back = back;
    this.bodyYaw += clamp(angDiff(this.bodyYaw, tb), -9 * dt, 9 * dt);
    this.aim = damp(this.aim, fight ? 1 : 0, 7, dt);
    if (fight) {
      const e = this.tgt, de = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      this.aimPitch = clamp(Math.atan2(chestY(e) - (1.48 - drop), Math.max(de, 1)), -0.6, 0.6);
      if (Math.abs(angDiff(this.aimYaw, ta)) < 0.22) {
        this.react -= dt;
        if (this.react <= 0) {
          if (this.burst > 0) {
            this.shotCd -= dt;
            if (this.shotCd <= 0) {
              this.fire();
              this.shotCd = D.rof;
              if (--this.burst <= 0) this.burstCd = D.burst[1] === 1 ? D.rof : rr(0.7, 1.4);
            }
          } else {
            this.burstCd -= dt;
            if (this.burstCd <= 0) { this.burst = D.burst[0] + ((Math.random() * (D.burst[1] - D.burst[0] + 1)) | 0); this.shotCd = 0; }
          }
        }
      }
    } else this.burst = 0;
    this.crouch = damp(this.crouch, !active || (fight && mv < 0.5 && this.kneel) ? 1 : 0, 6, dt);
    if (mv > 0.8) {
      this.stepAcc += mv * dt;
      if (this.stepAcc > (mv > 3 ? 1.75 : 1.35)) { this.stepAcc = 0; if (dP < 30) SFX.playAt('step', this.pos.x, 0.1, this.pos.z, 0.8, rr(0.95, 1.1)); }
    }
    this.body.animate(this, dt);
  }
}
const squadGet = (id) => allies.find((a) => a.def.id === id && !a.gone);
function squadJoin(id, at, quiet) {
  if (squadGet(id) || !SQUAD[id]) return null;
  let c = at ? snapFree(at) : null;
  if (!c) { // 지점이 없으면 플레이어 뒤쪽
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    c = cellNear(player.pos.x - fx * 7, player.pos.z - fz * 7, 4) || cellNear(player.pos.x, player.pos.z, 6) || { x: player.pos.x, z: player.pos.z };
  }
  const a = new Ally(SQUAD[id], c.x, c.z);
  allies.push(a);
  if (!quiet) feed(`${a.def.name} 합류`);
  return a;
}
function squadLeave(id, to, quiet) {
  const a = squadGet(id);
  if (!a) return;
  if (quiet) { a.remove(); return; }
  a.state = 'leave';
  a.exit = snapFree(to || { x: START.x, z: START.z });
  a.leaveT = 18;
  a.path = null; a.repath = 0; a.tgt = null;
  feed(`${a.def.name} 이탈`);
}
function squadHold(id, at) {
  const a = squadGet(id);
  if (!a) return;
  a.order = 'hold';
  a.holdAt = snapFree(at);
  if (a.state !== 'down' && a.state !== 'leave') a.state = 'hold';
  a.path = null; a.repath = 0;
}
function squadFollow(id) {
  const a = squadGet(id);
  if (!a) return;
  a.order = 'follow';
  if (a.state !== 'down' && a.state !== 'leave') a.state = 'follow';
  a.repath = 0;
}
// 감시 지원: 높은 곳에서 일정 간격으로 한 발씩 지원 사격 (오 상병)
const overwatch = { on: false, pos: new THREE.Vector3(), cd: 0, body: null, ent: null, src: { def: SQUAD.oh, pos: new THREE.Vector3(), ow: true }, shots: 0, kills: 0 };
function setOverwatch(p) {
  if (overwatch.body) { overwatch.body.dispose(scene); overwatch.body = null; overwatch.ent = null; }
  const q = p === 'tower' ? WORLD.points.tower : p;
  overwatch.on = !!q;
  if (!q) return;
  overwatch.pos.set(q.x, (q.y || 0) + 1.25, q.z);
  overwatch.src.pos.copy(overwatch.pos);
  overwatch.cd = 3;
  if (MOCAP.ready) {
    try {
      const b = new MocapBody('ally', 1);
      scene.add(b.root);
      overwatch.body = b;
      overwatch.ent = { pos: new THREE.Vector3(q.x, 0, q.z), elev: q.y || 0, bodyYaw: 0, aimYaw: 0, aim: 1, crouch: 1, kick: 0, flinch: 0, flinchSide: 1, aimPitch: -0.2, speed: 0, back: false, flashT: 0 };
    } catch (err) { overwatch.body = null; }
  }
}
function updateOverwatch(dt) {
  if (!overwatch.on) return;
  const o = overwatch, en = o.ent;
  if (en) { en.kick = damp(en.kick, 0, 14, dt); en.flashT -= dt; }
  o.cd -= dt;
  if (o.cd <= 0) {
    o.cd = rr(5.5, 9);
    let best = null, bd = 1e9;
    for (const e of enemies) { // 탑에서 보이는 적 가운데 플레이어에게 가장 가까운 적
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bd && losClear(o.pos.x, o.pos.y, o.pos.z, e.pos.x, chestY(e), e.pos.z)) { bd = d; best = e; }
    }
    if (!best) o.cd = 1.2;
    else {
      const ty = chestY(best);
      _d.set(best.pos.x - o.pos.x, ty - o.pos.y, best.pos.z - o.pos.z);
      const dist = _d.length();
      _d.multiplyScalar(1 / dist);
      tracers.spawn(o.pos.x, o.pos.y, o.pos.z, best.pos.x, ty, best.pos.z);
      SFX.playAt('shotDMR', o.pos.x, o.pos.y, o.pos.z, 1.7, rr(0.9, 0.96));
      o.shots++;
      if (en) { en.aimYaw = en.bodyYaw = Math.atan2(_d.x, _d.z); en.aimPitch = clamp(Math.asin(_d.y), -0.6, 0.6); en.kick = 1; en.flashT = 0.06; }
      if (Math.random() < 0.8) {
        bloodFx(best.pos.x, ty, best.pos.z, _d);
        if (best.damage(rr(85, 120), Math.random() < 0.25 ? 2 : 1, _d, 5.5, null, o.src)) o.kills++;
      }
    }
  }
  if (o.body) o.body.animate(en, dt);
}
function clearSquad() {
  for (const a of allies) if (!a.gone) a.remove();
  allies.length = 0;
  setOverwatch(false);
  radioQ.length = 0;
  radioT = 0;
  el.radio.classList.add('hidden');
}

// ───────────────────────── 협동 생존(네트워크)
// 방장(번호 0)의 폰이 적 AI와 웨이브를 계산한다. 참가자는 자기 캐릭터만 직접 움직이고, 적은 방장이 보낸 상태로 그린다.
//  - 상태(초당 12~15회, 잃어도 되는 값): 플레이어 위치·방향, 적 위치·자세, 적의 사격 표시
//  - 사건(순서와 도착 보장): 입장·시작·웨이브·명중 보고·사살·피해·종료
const COOP_RESPAWN = 10; // 쓰러진 뒤 복귀까지(초)
const COOP_SPAWN = [[0, 0], [1.6, 0.8], [-1.6, 0.8], [0, 2]]; // 출발 지점 기준 자리 [x, z]
const TYPE_KEYS = Object.keys(TYPES);
const netNow = () => performance.now() / 1000;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
// 받은 표본을 조금 늦춰 두 표본 사이를 잇는다 (받은 시각 기준)
const _smp = { a: null, b: null, k: 0 };
function pushSample(buf, s) {
  s.t = netNow();
  buf.push(s);
  if (buf.length > 16) buf.shift();
}
function sampleAt(buf, t) {
  let i = buf.length - 1;
  if (i < 0) return null;
  if (t >= buf[i].t) { _smp.a = _smp.b = buf[i]; _smp.k = 0; return _smp; }
  while (i > 0 && buf[i - 1].t > t) i--;
  if (i === 0) { _smp.a = _smp.b = buf[0]; _smp.k = 0; return _smp; }
  _smp.a = buf[i - 1]; _smp.b = buf[i]; _smp.k = (t - _smp.a.t) / Math.max(1e-4, _smp.b.t - _smp.a.t);
  return _smp;
}

// 다른 사람이 조종하는 플레이어. 적이 조준할 수 있도록 allies 목록에 함께 넣는다(Ally와 같은 모양)
class RemotePlayer {
  constructor(pid) {
    this.net = true; this.pid = pid;
    const name = COOP_NAMES[pid] || '대원';
    this.def = { id: 'p' + pid, name, short: name, hp: 100, mat: 'ally' };
    try { this.body = MOCAP.ready ? new MocapBody(this.def.mat, 1) : new PuppetBody(0); }
    catch (err) { this.body = new PuppetBody(0); }
    scene.add(this.body.root);
    const o = COOP_SPAWN[pid] || COOP_SPAWN[0];
    this.pos = new THREE.Vector3(START.x + o[0], 0, START.z + o[1]);
    this.eye = 1.62; this.hspeed = 0; this.yaw = 0; this.elev = 0;
    this.aimYaw = this.bodyYaw = Math.PI; this.back = false; this.vx = 0; this.vz = 0; this.speed = 0; this.crouch = 0; this.kick = 0; this.flinch = 0; this.flinchSide = 1; this.aim = 1; this.aimPitch = 0; this.flashT = 0;
    this.hp = 100; this.up = true; this.crouchF = false; this.widx = 0; this.gone = false; this.state = 'follow';
    this.buf = []; this.raw = null; this.seq = -1; this.shotN = -1; this.pend = 0; this.shotCd = 0; this.kills = 0; this.stepAcc = 0;
    let slot = 0;
    while (allies.some((a) => !a.gone && a.slot === slot)) slot++;
    this.slot = slot;
    this.tag = el.tags.children[slot % el.tags.children.length];
    this.tag.textContent = name;
    this.body.animate(this, 0.016);
  }
  get alive() { return !this.gone && this.up; }
  remove() {
    this.body.dispose(scene);
    this.gone = true;
    this.tag.classList.add('hidden');
  }
  // p: [번호, x, y, z, 좌우 각, 상하 각, 플래그(1 앉음, 2 살아 있음, 4 정조준), 무기, 체력, 사격 횟수]
  push(p) {
    this.raw = p;
    pushSample(this.buf, { x: p[1], y: p[2], z: p[3], yaw: p[4], pitch: p[5] });
    const up = !!(p[6] & 2);
    this.crouchF = !!(p[6] & 1);
    this.widx = p[7];
    this.hp = p[8];
    if (up !== this.up) { this.up = up; feed(up ? `${this.def.name} 복귀` : `${this.def.name} 쓰러짐`); }
    if (this.shotN >= 0) this.pend = Math.min(6, this.pend + ((p[9] - this.shotN) & 255));
    this.shotN = p[9];
  }
  // 방장: 적의 탄이 이 플레이어에게 맞았다 → 그 사람의 폰에 알린다
  hurt(dmg, enemy) {
    if (!this.alive) return;
    this.flinch = 1;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
    if (this.body.playOver) this.body.playOver('HitChest', { peak: 0.7 });
    if (coop.host) coopSendHurt(this.pid, dmg, enemy.pos);
  }
  shotFx() {
    const w = W[ORDER[this.widx]] || W.ar, drop = this.crouch * 0.37, cp = Math.cos(this.aimPitch);
    const dx = Math.sin(this.aimYaw) * cp, dy = Math.sin(this.aimPitch), dz = Math.cos(this.aimYaw) * cp;
    const ox = this.pos.x, oy = this.pos.y + 1.5 - drop, oz = this.pos.z, t = rayWorld(ox, oy, oz, dx, dy, dz, 90) ? hit.t : 90;
    const mx = ox + Math.sin(this.aimYaw) * 0.85, mz = oz + Math.cos(this.aimYaw) * 0.85, my = this.pos.y + 1.47 - drop;
    tracers.spawn(mx, my, mz, ox + dx * t, oy + dy * t, oz + dz * t);
    this.flashT = 0.05;
    this.kick = 1;
    this.body.flash.rotation.z = Math.random() * TAU;
    SFX.playAt(w.sound, mx, my, mz, 0.8, rr(0.96, 1.04));
  }
  update(dt) {
    const s = sampleAt(this.buf, netNow() - 0.1), x0 = this.pos.x, z0 = this.pos.z;
    if (s) {
      const a = s.a, b = s.b, k = s.k;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 6) this.pos.set(b.x, b.y, b.z); // 복귀 같은 순간 이동은 잇지 않는다
      else this.pos.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
      this.yaw = a.yaw + angDiff(a.yaw, b.yaw) * k;
      this.aimPitch = clamp(lerp(a.pitch, b.pitch, k), -1.2, 1.2);
    }
    const jump = Math.hypot(this.pos.x - x0, this.pos.z - z0) > 3, ivx = jump ? 0 : (this.pos.x - x0) / dt, ivz = jump ? 0 : (this.pos.z - z0) / dt;
    this.vx = damp(this.vx, ivx, 12, dt);
    this.vz = damp(this.vz, ivz, 12, dt);
    this.speed = damp(this.speed, Math.hypot(ivx, ivz), 10, dt);
    this.hspeed = this.speed;
    this.elev = this.pos.y;
    this.aimYaw = this.yaw + Math.PI;
    const mv = Math.hypot(this.vx, this.vz);
    let tb = this.aimYaw, back = false;
    if (mv > 0.6) {
      const md = Math.atan2(this.vx, this.vz);
      if (Math.abs(angDiff(md, this.aimYaw)) <= (this.back ? 1.4 : 1.75)) tb = md;
      else { tb = md + Math.PI; back = true; }
    }
    this.back = back;
    this.bodyYaw += clamp(angDiff(this.bodyYaw, tb), -10 * dt, 10 * dt);
    this.aim = damp(this.aim, this.up ? 1 : 0, 7, dt);
    this.crouch = damp(this.crouch, !this.up || this.crouchF ? 1 : 0, 7, dt);
    this.eye = lerp(1.62, 1.02, this.crouch);
    this.kick = damp(this.kick, 0, 22, dt);
    this.flinch = damp(this.flinch, 0, 9, dt);
    this.flashT -= dt;
    this.state = this.up ? 'follow' : 'down';
    this.shotCd -= dt;
    if (this.pend > 0 && this.shotCd <= 0) { this.pend--; this.shotCd = 0.085; if (this.up) this.shotFx(); }
    if (mv > 0.8 && this.up) {
      this.stepAcc += mv * dt;
      if (this.stepAcc > (mv > 3 ? 1.75 : 1.35)) { this.stepAcc = 0; if (Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z) < 30) SFX.playAt('step', this.pos.x, this.pos.y + 0.1, this.pos.z, 0.8, rr(0.95, 1.1)); }
    }
    this.body.animate(this, dt);
  }
}
const coopEntity = (pid) => (pid === coop.pid ? player : coop.players.get(pid) || null);
function coopAddRemote(pid) {
  if (pid === coop.pid || coop.players.has(pid)) return;
  const r = new RemotePlayer(pid);
  coop.players.set(pid, r);
  allies.push(r);
}
function coopRemoveRemote(pid) {
  const r = coop.players.get(pid);
  if (!r) return;
  r.remove();
  coop.players.delete(pid);
}
const coopMyState = () => [coop.pid, r2(player.pos.x), r2(player.pos.y), r2(player.pos.z), r3(player.yaw), r3(player.pitch), (player.crouch ? 1 : 0) | (player.alive ? 2 : 0) | (vm.adsT > 0.5 ? 4 : 0), Math.max(0, ORDER.indexOf(vm.cur)), Math.max(0, Math.round(player.hp)), coop.myShots];

// ── 보내기
function coopSendSnapshot() { // 방장 → 참가자: 웨이브 정보, 모든 플레이어, 살아 있는 적, 그동안의 적 사격
  const pl = [coopMyState()], en = [];
  for (const r of coop.players.values()) if (r.raw) pl.push(r.raw);
  for (const e of enemies) {
    if (e.dead || !e.nid) continue;
    const tp = e.tg && e.tg.net ? e.tg.pid : 0;
    const fl = (e.crouch > 0.5 ? 1 : 0) | (e.state === 'combat' && e.fleeT <= 0 ? 2 : 0) | (e.rollT > 0 ? 4 : 0) | (e.aimT > 0.15 ? 8 : 0) | (e.canSee ? 16 : 0) | ((tp & 3) << 5) | (e.hitN << 7);
    en.push([e.nid, TYPE_KEYS.indexOf(e.T.key), Math.round(e.pos.x * 100), Math.round(e.pos.z * 100), Math.round(e.aimYaw * 100), fl]);
  }
  sendSt(['s', ++coop.seq, [game.wave, game.toSpawn, game.score, coop.gen], pl, en, coop.shots]);
  coop.shots = [];
}
function coopSendHit(e, d, part, dir, power, blast) { // 참가자 → 방장: 내 탄이 적에게 맞았다
  sendEv({ t: 'hit', i: e.nid, d: r2(d), p: part, v: dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : 0, w: power || 0, b: blast ? [r2(blast.x), r2(blast.y), r2(blast.z), r2(blast.power)] : 0 });
}
function coopSendDie(e, part, dir, power, blast, clip, by, drop, head) { // 방장 → 참가자: 적이 쓰러졌다
  sendEv({ t: 'die', i: e.nid, p: part, v: dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : 0, w: power || 3, b: blast ? [r2(blast.x), r2(blast.y), r2(blast.z), r2(blast.power)] : 0, c: clip || 0, by, dr: drop === 'ammo' ? 1 : drop === 'med' ? 2 : 0, h: head ? 1 : 0 });
}
function coopSendHurt(pid, dmg, pos) {
  const link = NET.links.find((l) => l.pid === pid);
  if (link) sendEv({ t: 'hurt', d: r2(dmg), x: r2(pos.x), z: r2(pos.z) }, link);
}
function coopSendGren(p, v, by) {
  const m = { t: 'gren', p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)], by };
  if (coop.host) { for (const l of NET.links) if (l.pid !== by) sendEv(m, l); }
  else sendEv(m);
}
function coopGhostGrenade(m) { // 다른 플레이어가 던진 수류탄: 날아가고 터지는 모습만
  const mesh = new THREE.Mesh(grenGeo, grenMat);
  mesh.castShadow = true;
  scene.add(mesh);
  gren.list.push({ mesh, p: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), v: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), fuse: 2.6, clinkT: -1, warnT: 0.4, seen: new Set(), ghost: true });
}
function coopPicked(pid) { // 보급을 고름. 방장은 모두 골랐으면 다음 웨이브를 앞당긴다
  if (!coop.host) { sendEv({ t: 'pick' }); return; }
  coop.picked.add(pid);
  let all = player.alive ? coop.picked.has(0) : true;
  for (const r of coop.players.values()) if (r.alive && !coop.picked.has(r.pid)) all = false;
  if (all && game.between > 3) game.between = 3;
}

// ── 흐름
function coopRespawn() {
  const o = COOP_SPAWN[coop.pid] || COOP_SPAWN[0];
  player.pos.set(START.x + o[0], 0, START.z + o[1]);
  player.vel.set(0, 0, 0);
  player.hp = prog.maxHp; player.alive = true; player.crouch = false; player.lastHurt = game.time; player.grounded = true; player.col.grounded = true; player.yOff = 0;
  cam.roll = 0; cam.hurtRoll = 0;
  coop.safeT = 2.5; coop.downSec = -1;
  const w = W[vm.cur];
  if (w.reserve !== Infinity && w.reserve < w.mag) giveAmmo();
  setState('playing');
  showMsg('복귀', '', 1.4);
}
function coopBegin(gen) { // 모든 폰에서 같은 판을 새로 시작한다. gen: 방장이 매긴 판 번호
  coop.gen = gen;
  coop.dead.clear();
  SFX.initAudio();
  SFX.setSound(opt.sound);
  SFX.suspend(false);
  camp.on = false;
  showMarks([]);
  clearSquad();
  coop.players.clear();
  coop.en.clear();
  loadMap('yard', 'day');
  resetGame();
  Object.assign(coop, { started: true, shots: [], snapSeq: -1, lastSnap: netNow(), stall: false, supplyT: 0, allDownT: 0, downSec: -1, safeT: 2, myShots: 0, lost: '' });
  coop.picked.clear();
  for (const pid of coop.roster) coopAddRemote(pid);
  const o = COOP_SPAWN[coop.pid] || COOP_SPAWN[0];
  player.pos.set(START.x + o[0], 0, START.z + o[1]);
  $('btnAgain').classList.remove('hidden');
  setState('playing');
  feed(`협동 생존 · ${nPlayers()}명`);
}
function coopHostStart() {
  if (!coop.on || !coop.host || !NET.code) return;
  const gen = coop.gen + 1;
  sendEv({ t: 'go', g: gen });
  coopBegin(gen);
}
function coopShowOver(eyebrow, m) {
  coop.started = false;
  const mine = m && m.k.find((q) => q[0] === coop.pid);
  $('oWave').textContent = m ? m.w : game.wave;
  $('oScore').textContent = m ? m.s : game.score;
  $('oKills').textContent = mine ? mine[1] : game.kills;
  $('oHead').textContent = game.headshots;
  $('oAcc').textContent = (game.shots ? Math.round((game.hits / game.shots) * 100) : 0) + '%';
  $('overEyebrow').textContent = eyebrow + (m ? ' · ' + m.k.map((q) => `${COOP_NAMES[q[0]]} ${q[1]}`).join(' / ') : '');
  $('btnAgain').textContent = coop.lost ? '다시 참가' : '다시 시작';
  $('btnAgain').classList.toggle('hidden', !coop.lost && !coop.host);
  $('btnOverList').textContent = '방 나가기';
  $('btnOverList').classList.remove('hidden');
  $('overNote').textContent = coop.lost ? '' : coop.host ? '' : '방장이 다시 시작하면 이어집니다.';
  setState('over');
}
function coopOver() { // 방장: 전원이 쓰러졌다
  const k = [[0, game.kills]];
  for (const r of coop.players.values()) k.push([r.pid, r.kills]);
  const m = { t: 'over', w: game.wave, s: game.score, k };
  sendEv(m);
  coopShowOver('전원 쓰러짐', m);
}
function coopAgain() { // 종료 화면의 큰 버튼: 끊긴 참가자는 다시 참가, 방장은 다시 시작
  if (coop.lost) coopJoin(coop.lost);
  else coopHostStart();
}
function coopEnd() { // 방을 떠난다
  netClose();
  Object.assign(coop, { on: false, host: false, started: false, pid: 0, roster: [], lost: '', stall: false, gen: 0 });
  coop.players.clear();
  coop.en.clear();
  $('btnAgain').classList.remove('hidden');
  $('btnOverList').textContent = '작전 목록';
  $('overNote').textContent = '';
  $('btnQuit').textContent = '메뉴로';
  $('btnRestart').classList.remove('hidden');
  setTxt('hudVer', VERSION);
}
function coopUpdate(dt) {
  if (coop.safeT > 0) coop.safeT -= dt;
  const t = netNow();
  if (coop.host) {
    if (t - coop.lastSend >= 1 / 12) { coop.lastSend = t; coopSendSnapshot(); }
    let anyUp = player.alive; // 전원이 동시에 쓰러져 있으면 끝
    for (const r of coop.players.values()) if (r.alive) anyUp = true;
    if (anyUp) coop.allDownT = 0;
    else if ((coop.allDownT += dt) > 1.5) coopOver();
    return;
  }
  if (t - coop.lastSend >= 1 / 15) { coop.lastSend = t; sendSt(['p', ++coop.seq, coopMyState()]); }
  if (coop.supplyT > 0 && (coop.supplyT -= dt) <= 0 && player.alive && game.state === 'playing') openSupply();
  const gap = t - coop.lastSnap;
  if (gap > 2.5 && !coop.stall) { coop.stall = true; showMsg('방장 응답 없음', '방장 폰의 화면이 꺼졌거나 연결이 불안정합니다', 4); }
  else if (gap < 1 && coop.stall) { coop.stall = false; showMsg('연결 회복', '', 1.5); }
  // 한동안 소식이 없는 적은 지운다 (방장이 판을 다시 시작한 경우 등)
  for (const [id, e] of coop.en) if (!e.dead && coop.snapSeq - e.net.seen > 30) { e.remove(); coop.en.delete(id); }
}

// ── 받기
function coopOnState(link, m) {
  if (!Array.isArray(m) || !coop.started) return;
  if (coop.host) { // 참가자의 위치·자세
    if (m[0] !== 'p' || !Array.isArray(m[2])) return;
    const r = coop.players.get(link.pid);
    if (!r || m[1] <= r.seq) return;
    r.seq = m[1];
    m[2][0] = link.pid;
    r.push(m[2]);
    return;
  }
  if (m[0] !== 's' || m[1] <= coop.snapSeq || m[2][3] !== coop.gen) return; // 뒤늦게 온 것, 지난 판의 것은 버린다
  coop.snapSeq = m[1];
  coop.lastSnap = netNow();
  game.wave = m[2][0]; game.toSpawn = m[2][1]; game.score = m[2][2];
  for (const p of m[3]) { const r = coop.players.get(p[0]); if (r) r.push(p); }
  for (const q of m[4]) {
    let e = coop.en.get(q[0]);
    if (!e) {
      if (coop.dead.has(q[0])) continue; // 쓰러졌다는 소식이 먼저 도착한 적
      e = new Enemy(q[2] / 100, q[3] / 100, TYPE_KEYS[q[1]], q[0]);
      e.puppet = true;
      e.net = { buf: [], fl: q[5], seen: 0, roll: false };
      e.aimYaw = e.bodyYaw = q[4] / 100;
      enemies.push(e);
      coop.en.set(q[0], e);
    }
    if (e.dead) continue;
    pushSample(e.net.buf, { x: q[2] / 100, z: q[3] / 100, yaw: q[4] / 100, fl: q[5] });
    e.net.seen = m[1];
  }
  for (const sh of m[5]) { // 적의 사격: 예광탄·총성·탄착
    const e = coop.en.get(sh[0]);
    if (!e || e.dead) continue;
    const ex = sh[1] / 10, ey = sh[2] / 10, ez = sh[3] / 10, ox = e.pos.x, oy = 1.48 - e.crouch * 0.37, oz = e.pos.z;
    _d.set(ex - ox, ey - oy, ez - oz);
    const len = _d.length();
    if (len > 0.5) {
      _d.multiplyScalar(1 / len);
      if (sh[4] & 1 && rayWorld(ox, oy, oz, _d.x, _d.y, _d.z, len + 0.8)) impactFx(ox + _d.x * hit.t, oy + _d.y * hit.t, oz + _d.z * hit.t, hit.nx, hit.ny, hit.nz, hit.m, 0.55);
      if (!(sh[4] & 2)) whizNear(ox, oy, oz, _d, len);
    }
    e.shotFx(ex, ey, ez);
  }
}
function coopOnEvent(link, m) {
  if (coop.host) {
    if (m.t === 'hi') {
      if (m.v !== VERSION) { sendEv({ t: 'ver', v: VERSION }, link); return; }
      if (link.pid > 0) return;
      let pid = 1;
      while (coop.roster.includes(pid)) pid++;
      link.pid = pid;
      coop.roster.push(pid);
      sendEv({ t: 'wel', pid, started: coop.started, g: coop.gen }, link);
      if (coop.started) { coopAddRemote(pid); feed(`${COOP_NAMES[pid]} 합류`); }
      coopRoster();
    } else if (m.t === 'hit') {
      const e = enemies.find((q) => q.nid === m.i && !q.dead), src = coop.players.get(link.pid);
      if (!e || !src) return;
      e.damage(clamp(+m.d || 0, 0, 400), m.p | 0, m.v ? _m.set(m.v[0], m.v[1], m.v[2]) : null, +m.w || 0, m.b ? { x: m.b[0], y: m.b[1], z: m.b[2], power: m.b[3] } : null, src);
    } else if (m.t === 'gren') {
      if (!coop.started) return;
      m.by = link.pid;
      coopGhostGrenade(m);
      coopSendGren({ x: m.p[0], y: m.p[1], z: m.p[2] }, { x: m.v[0], y: m.v[1], z: m.v[2] }, link.pid);
    } else if (m.t === 'pick') coopPicked(link.pid);
    return;
  }
  // 참가자
  if (m.t === 'wel') { coop.pid = m.pid; lobStatus('방장이 시작하기를 기다리는 중'); if (m.started) coopBegin(m.g); }
  else if (m.t === 'ros') {
    coop.roster = m.l.map((q) => q[0]);
    coop.info = m.l;
    if (coop.started) {
      for (const pid of coop.roster) if (pid !== coop.pid && !coop.players.has(pid)) { coopAddRemote(pid); feed(`${COOP_NAMES[pid]} 합류`); }
      for (const pid of [...coop.players.keys()]) if (!coop.roster.includes(pid)) { feed(`${COOP_NAMES[pid]} 나감`); coopRemoveRemote(pid); }
    }
    lobRender();
  } else if (m.t === 'go') coopBegin(m.g);
  else if (m.t === 'ver') coopFail(`버전이 다릅니다. 방장 ${m.v}, 이 폰 ${VERSION}. 두 폰 모두 앱을 닫았다 다시 열어 같은 판으로 맞추세요.`);
  else if (m.t === 'full') coopFail('방이 가득 찼습니다(최대 4명).');
  else if (!coop.started) return;
  else if (m.t === 'wave') {
    game.wave = m.n; game.toSpawn = m.c; coop.supplyT = 0;
    if (game.state === 'supply') setState('playing');
    showMsg('WAVE ' + m.n, `적 ${m.c}명 접근 중`, 2.6);
    SFX.play('wave', 0.6);
  } else if (m.t === 'clr') {
    if (!player.alive) coopRespawn();
    giveAmmo();
    gren.n = Math.min(4 + prog.lv.gren, gren.n + 1);
    showMsg('구역 확보', `웨이브 ${m.n} 격퇴 · 보너스 +${m.b}`, 2.4);
    coop.supplyT = 1.8;
  } else if (m.t === 'die') {
    const e = coop.en.get(m.i);
    coop.dead.add(m.i);
    if (!e || e.dead) return;
    coop.en.delete(m.i);
    e.kill(m.v ? _m.set(m.v[0], m.v[1], m.v[2]) : null, m.p, m.w, m.b ? { x: m.b[0], y: m.b[1], z: m.b[2], power: m.b[3] } : null, m.c || null);
    const pts = e.T.score + (m.h ? 50 : 0);
    if (m.by === coop.pid) {
      game.kills++;
      if (m.h) game.headshots++;
      feed(m.h ? `헤드샷 +${pts}` : `${e.T.label} +${pts}`, !!m.h);
      hudS.hm = 0.3;
      el.hm.classList.add('kill');
    } else feed(`${COOP_NAMES[m.by] || '대원'} · ${e.T.label}`);
    if (m.dr) addPickup(m.dr === 1 ? 'ammo' : 'med', e.pos.x, e.pos.z);
  } else if (m.t === 'hurt') hurtPlayer(+m.d || 0, { x: m.x, z: m.z });
  else if (m.t === 'gren') coopGhostGrenade(m);
  else if (m.t === 'over') coopShowOver('전원 쓰러짐', m);
}
function coopRoster() { // 방장: 명단(번호·핑·연결 경로)을 모두에게
  coop.info = [[0, -1, '']];
  for (const l of NET.links) if (l.pid > 0) coop.info.push([l.pid, Math.round(l.ping), l.route]);
  sendEv({ t: 'ros', l: coop.info });
  lobRender();
}

// ── 로비 화면: 방 만들기 / 코드로 참가 / 명단
const lob = { step: 'choose', entry: '', status: '' };
const NET_ERR = {
  noroom: '그 코드의 방을 찾지 못했습니다. 코드를 다시 확인하세요.',
  broker: '연결을 이어 주는 서버에 닿지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.',
  timeout: '연결하지 못했습니다. 두 폰이 서로 직접 닿지 못하는 통신망일 수 있습니다. 같은 와이파이에서 다시 시도해 보세요.',
  browser: '이 브라우저에서는 협동 연결을 쓸 수 없습니다.',
  webrtc: '연결에 실패했습니다. 다시 시도하세요.',
  unknown: '연결에 실패했습니다. 다시 시도하세요.',
};
function lobStatus(t) {
  lob.status = t;
  $('coStatus').textContent = t;
}
function lobShow(step) {
  lob.step = step;
  $('coChoose').classList.toggle('hidden', step !== 'choose');
  $('coPad').classList.toggle('hidden', step !== 'pad');
  $('coKeys').classList.toggle('hidden', step !== 'pad');
  $('coRoom').classList.toggle('hidden', step !== 'room');
  $('coSide').classList.toggle('hidden', step !== 'room');
  $('coHelp').classList.toggle('hidden', step === 'pad');
  if (step === 'pad') lobEntry();
  if (step === 'room') {
    $('coCode').textContent = NET.code || '·····';
    $('btnCoStart').classList.toggle('hidden', !coop.host);
    $('btnCoShare').classList.toggle('hidden', !coop.host || !/^https?:$/.test(location.protocol) || !(navigator.share || (navigator.clipboard && navigator.clipboard.writeText)));
    lobRender();
  }
}
function lobEntry() {
  $('coEntry').textContent = (lob.entry + '·····').slice(0, 5);
  $('btnCoGo').disabled = lob.entry.length !== 5;
}
function lobRender() {
  if (game.state !== 'coop' || lob.step !== 'room') return;
  const box = $('coList'), info = coop.info || [];
  box.textContent = '';
  for (const q of info) {
    const row = document.createElement('div'), b = document.createElement('b'), sp = document.createElement('span');
    row.className = 'corow';
    b.textContent = (COOP_NAMES[q[0]] || '대원') + (q[0] === coop.pid ? ' (나)' : '');
    sp.textContent = q[0] === 0 ? '방장' : (q[1] >= 0 ? `${q[1]}ms` : '측정 중') + (q[2] === 'relay' ? ' · 중계 연결' : q[2] === 'direct' ? ' · 직접 연결' : '');
    row.append(b, sp);
    box.appendChild(row);
  }
  $('btnCoStart').textContent = info.length > 1 ? `시작 (${info.length}명)` : '혼자 시작';
}
function openCoop() {
  SFX.initAudio(); // 이후 방장이 시작할 때 소리가 나도록 누른 김에 열어 둔다
  lobStatus('');
  $('coErr').textContent = '';
  lobShow('choose');
  setState('coop');
}
function coopFail(text) { // 연결 실패·끊김
  const code = NET.code, wasGuest = coop.on && !coop.host, inGame = coop.started || game.state === 'over';
  if (inGame && wasGuest) { // 게임 중에 끊김: 종료 화면에서 다시 참가할 수 있게
    netClose();
    coop.lost = code;
    coopShowOver(text, null);
    return;
  }
  const entry = wasGuest ? code : '';
  if (coop.on) coopEnd();
  if (game.state !== 'coop') { for (const e of enemies) e.remove(); enemies.length = 0; clearSquad(); SFX.suspend(true); setState('coop'); }
  $('coErr').textContent = text;
  lob.entry = entry;
  lobShow(entry ? 'pad' : 'choose');
}
function coopWire() { // 전송 계층의 알림을 게임에 잇는다
  NET.cb = {
    open(code) { lobStatus('친구에게 방 코드를 알려 주세요. 들어오면 아래 명단에 나타납니다.'); $('coCode').textContent = code; coopRoster(); lobShow('room'); },
    join(link) { if (!coop.host) { lobStatus('연결됨. 입장하는 중'); sendEv({ t: 'hi', v: VERSION }, link); } },
    leave(link) {
      if (!coop.on) return;
      if (!coop.host) { coopFail(coop.started || coop.pid > 0 ? '방장과의 연결이 끊겼습니다.' : NET_ERR.timeout); return; }
      if (link.pid > 0) {
        coop.roster = coop.roster.filter((p) => p !== link.pid);
        if (coop.players.has(link.pid)) { feed(`${COOP_NAMES[link.pid]} 나감`); coopRemoveRemote(link.pid); }
        coopRoster();
      }
    },
    ev: coopOnEvent,
    st: coopOnState,
    error(kind) { if (coop.on) coopFail(NET_ERR[kind] || NET_ERR.unknown); },
    info() { if (coop.on && coop.host) coopRoster(); },
  };
}
function coopHost() {
  SFX.initAudio();
  if (coop.on) coopEnd();
  Object.assign(coop, { on: true, host: true, started: false, pid: 0, roster: [0], info: [[0, -1, '']], lost: '' });
  $('coErr').textContent = '';
  coopWire();
  lobShow('room');
  lobStatus('방을 여는 중');
  netHost();
}
function coopJoin(code) {
  SFX.initAudio();
  if (coop.on) coopEnd();
  Object.assign(coop, { on: true, host: false, started: false, pid: -1, roster: [], info: [], lost: '' });
  $('coErr').textContent = '';
  coopWire();
  if (game.state !== 'coop') { for (const e of enemies) e.remove(); enemies.length = 0; clearSquad(); setState('coop'); }
  netJoin(code);
  lobShow('room');
  $('coCode').textContent = code;
  lobStatus('연결하는 중');
}
$('btnCoop').addEventListener('click', openCoop);
$('btnCoHost').addEventListener('click', coopHost);
$('btnCoJoin').addEventListener('click', () => { lob.entry = ''; $('coErr').textContent = ''; lobShow('pad'); });
$('btnCoBack').addEventListener('click', () => setState('menu'));
$('btnCoPadBack').addEventListener('click', () => lobShow('choose'));
$('btnCoGo').addEventListener('click', () => { if (lob.entry.length === 5) coopJoin(lob.entry); });
$('btnCoStart').addEventListener('click', coopHostStart);
$('btnCoLeave').addEventListener('click', () => { coopEnd(); lobShow('choose'); });
$('btnCoShare').addEventListener('click', () => {
  const url = location.origin + location.pathname + '#j=' + NET.code;
  if (navigator.share) navigator.share({ title: 'YARD ZERO 협동', text: `YARD ZERO 협동 생존 · 방 코드 ${NET.code}`, url }).catch(() => {});
  else navigator.clipboard.writeText(url).then(() => lobStatus('초대 링크를 복사했습니다. 친구에게 붙여 보내세요.')).catch(() => {});
});
for (const k of $('coKeys').querySelectorAll('[data-k]')) {
  k.addEventListener('click', () => {
    const v = k.dataset.k;
    if (v === 'del') lob.entry = lob.entry.slice(0, -1);
    else if (lob.entry.length < 5) lob.entry += v;
    lobEntry();
  });
}
window.addEventListener('keydown', (e) => { // 키보드로 코드 입력
  if (game.state !== 'coop' || lob.step !== 'pad') return;
  if (/^(Digit|Numpad)\d$/.test(e.code)) { if (lob.entry.length < 5) lob.entry += e.code.slice(-1); lobEntry(); }
  else if (e.code === 'Backspace') { lob.entry = lob.entry.slice(0, -1); lobEntry(); }
  else if (e.code === 'Enter' && lob.entry.length === 5) coopJoin(lob.entry);
});

// ───────────────────────── 작전 진행 (에피소드): 단계별 목표, 무전, 팀원 합류·이탈
const camp = { on: false, ep: null, idx: -1, si: -1, s: null, st: null, t: 0, epT: 0, next: null, boom: null, cp: null, mark: null };
const markMat = new THREE.MeshBasicMaterial({ color: 0xffb23a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const markGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
markGeo.translate(0, 0.5, 0);
const marks = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(markGeo, markMat); m.visible = false; m.frustumCulled = false; m.renderOrder = 4; scene.add(m); return m; });
function showMarks(list) { // list: [{x, y, z, r}]
  for (let i = 0; i < marks.length; i++) {
    const p = list[i], m = marks[i];
    m.visible = !!p;
    if (p) { m.position.set(p.x, p.y || 0, p.z); m.scale.set(p.r, p.h || 26, p.r); }
  }
}
function fireEvents(list, quiet) {
  if (!list) return;
  for (const e of list) {
    if (e.say) { if (!quiet) radio(e.say[0], e.say[1]); }
    else if (e.join) squadJoin(e.join, quiet ? null : e.at, quiet);
    else if (e.leave) squadLeave(e.leave, e.to, quiet);
    else if (e.hold) squadHold(e.hold, e.at);
    else if (e.follow) squadFollow(e.follow);
    else if ('overwatch' in e) setOverwatch(e.overwatch);
  }
}
// 단계의 모든 이벤트를 소리 없이 적용 (재도전 때 이전 단계의 분대 구성을 되살린다)
function replayStage(s) {
  const on = s.on || {};
  fireEvents(on.start, true);
  for (const t of on.t || []) fireEvents(t[1], true);
  for (const k in on.planted || {}) fireEvents(on.planted[k], true);
  fireEvents(on.end, true);
}
function spawnFor(type, s) {
  let best = null, bs = -1e9;
  const from = s && s.from ? s.from[(Math.random() * s.from.length) | 0] : null;
  for (let k = 0; k < 26; k++) {
    let x, z;
    if (from) { const c = cellNear(from.x, from.z, from.r || 8); if (!c) continue; x = c.x; z = c.z; }
    else { const c = NAV.free[(Math.random() * NAV.free.length) | 0]; x = cellX(c); z = cellZ(c); }
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (d < (from ? 13 : 22)) continue;
    let sc = Math.min(d, 46) + Math.random() * 6;
    if (losClear(x, 1.7, z, player.pos.x, player.pos.y + player.eye, player.pos.z)) sc -= 40;
    for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x - x, e.pos.z - z) < 3) sc -= 20;
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  if (!best) return null;
  const e = new Enemy(best.x, best.z, type);
  enemies.push(e);
  return e;
}
function startEpisode(i, fromStage = 0) {
  const ep = EPISODES[i];
  if (!ep) return;
  SFX.initAudio();
  SFX.setSound(opt.sound);
  SFX.suspend(false);
  const keep = fromStage > 0 && camp.on && camp.idx === i && camp.cp ? camp.cp : null; // 같은 작전의 단계 재도전
  loadMap(ep.map, ep.env);
  resetGame();
  clearSquad();
  Object.assign(camp, { on: true, ep, idx: i, si: fromStage - 1, s: null, st: null, t: 0, epT: keep ? keep.epT : 0, boom: null, mark: null, cp: keep, boomSites: keep ? camp.boomSites : null, plantHud: false });
  showMarks([]);
  game.wave = ep.level;
  game.between = 1e9;
  for (const k of ORDER) prog.owned[k] = ep.loadout.includes(k);
  if (!prog.owned[vm.cur]) { vm.cur = ep.loadout[0]; showWeapon(); }
  if (keep) { // 단계 시작 때의 장비·위치로
    Object.assign(prog.owned, keep.owned);
    Object.assign(prog.lv, keep.lv);
    prog.maxHp = keep.maxHp;
    for (const k of ORDER) W[k].mag = Math.round(W[k].mag0 * (1 + 0.3 * prog.lv.mag));
    player.hp = prog.maxHp;
    gren.n = Math.max(2, keep.gren);
    game.kills = keep.kills; game.teamKills = keep.teamKills; game.score = keep.score; game.shots = keep.shots; game.hits = keep.hits; game.headshots = keep.headshots;
    player.pos.set(keep.x, 0, keep.z);
    player.yaw = keep.yaw;
  } else if (ep.start) { player.pos.set(ep.start.x, 0, ep.start.z); player.yaw = ep.start.yaw || 0; }
  else player.yaw = START.yaw || 0;
  for (let k = 0; k < fromStage; k++) replayStage(ep.stages[k]);
  setState('playing');
  if (fromStage > 0) showMsg('재도전', ep.stages[fromStage].text, 2.4);
  else showMsg(`작전 ${i + 1} · ${ep.title}`, `${MAPS[ep.map]} · ${ENVS[ep.env].label}`, 3.6);
  camp.next = { k: fromStage, t: fromStage > 0 ? 1.4 : 3 };
  last = performance.now();
}
function beginStage(k) {
  const ep = camp.ep, s = ep.stages[k], on = s.on || {};
  camp.si = k; camp.s = s; camp.t = 0;
  camp.st = { gi: 0, queue: [], spawnT: 0.6, gap: 0, planted: 0, plantT: 0, holdT: s.time || 0, respawn: 1.5, trickT: 2,
    sites: s.sites ? s.sites.map((p) => ({ ...snapFree(p), done: false })) : null,
    timed: (on.t || []).map((e) => ({ at: e[0], ev: e[1], fired: false })) };
  camp.cp = { x: player.pos.x, z: player.pos.z, yaw: player.yaw, owned: { ...prog.owned }, lv: { ...prog.lv }, maxHp: prog.maxHp, gren: gren.n, epT: camp.epT,
    kills: game.kills, teamKills: game.teamKills, score: game.score, shots: game.shots, hits: game.hits, headshots: game.headshots };
  if (camp.cp.x === undefined || player.pos.y > 1) { const c = cellNear(player.pos.x, player.pos.z, 4); if (c) { camp.cp.x = c.x; camp.cp.z = c.z; } }
  fireEvents(on.start);
  for (const g of s.guards || []) { const c = snapFree({ x: g[0], z: g[1] }); enemies.push(new Enemy(c.x, c.z, g[2])); }
  if (s.type === 'sweep') camp.st.queue.push(...s.groups[0]);
  if (s.fuse) camp.boom = { t: s.fuse, sites: camp.boomSites || [], warn: false };
  if (s.type === 'reach') { camp.mark = { x: s.at.x, y: s.at.y || 0, z: s.at.z }; showMarks([{ x: s.at.x, y: s.at.y || 0, z: s.at.z, r: 0.7 }]); }
  else if (s.type === 'hold') { camp.mark = { x: s.at.x, y: s.at.y || 0, z: s.at.z }; showMarks([s.at.y ? { x: s.at.x, y: s.at.y, z: s.at.z, r: 0.7 } : { x: s.at.x, y: 0, z: s.at.z, r: Math.min(s.at.r, 9), h: 0.5 }]); }
  else if (s.type === 'plant') { camp.mark = null; showMarks(camp.st.sites.map((p) => ({ x: p.x, z: p.z, r: 0.6 }))); }
  else { camp.mark = null; showMarks([]); }
  SFX.play('equip', 0.5, 1.4);
}
function endStage() {
  const s = camp.s, on = s.on || {};
  fireEvents(on.end);
  if (s.type === 'plant') camp.boomSites = camp.st.sites.map((p) => ({ x: p.x, z: p.z }));
  if (s.boom !== undefined) camp.boom = { t: s.boom, sites: camp.boomSites || [], warn: true };
  else if (s.fuse && camp.boom) { camp.boom.t = Math.min(camp.boom.t, 0.9); camp.boom.warn = true; } // 빠져나오면 곧바로 터진다
  if (s.supply) game.supplyT = 1.6;
  camp.mark = null;
  showMarks([]);
  camp.s = null;
  camp.next = { k: camp.si + 1, t: s.supply ? 2 : 2.6 };
  SFX.play('pickup', 0.5, 1.1);
}
function completeEpisode() {
  camp.s = null;
  const i = camp.idx, t = Math.round(camp.epT);
  store.set('camp', Math.max(store.get('camp', 0), i + 1));
  $('edTitle').textContent = `작전 ${i + 1} · ${camp.ep.title}`;
  $('edTime').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('edKills').textContent = game.kills;
  $('edTeam').textContent = game.teamKills;
  $('edAcc').textContent = (game.shots ? Math.round((game.hits / game.shots) * 100) : 0) + '%';
  $('btnNextEp').classList.toggle('hidden', i + 1 >= EPISODES.length);
  $('edNote').textContent = i + 1 >= EPISODES.length ? '모든 작전을 마쳤습니다.' : `다음: 작전 ${i + 2} · ${EPISODES[i + 1].title}`;
  setState('epdone');
}
function updateCampaign(dt) {
  camp.epT += dt;
  if (camp.boom) { // 설치한 폭약
    const b = camp.boom;
    b.t -= dt;
    if (!b.warn && b.t < 8) { b.warn = true; radio('본부', '폭파가 임박했다. 폭약에서 떨어져라.'); }
    if (b.t <= 0) {
      for (const p of b.sites) { explode(p.x, 0.8, p.z); explode(p.x + rr(-2, 2), 2.2, p.z + rr(-2, 2)); }
      camp.boom = null;
    }
  }
  if (game.supplyT > 0) {
    game.supplyT -= dt;
    if (game.supplyT <= 0) openSupply();
    return;
  }
  if (camp.next) {
    camp.next.t -= dt;
    if (camp.next.t <= 0) {
      const k = camp.next.k;
      camp.next = null;
      if (k >= camp.ep.stages.length) completeEpisode(); else beginStage(k);
    }
    return;
  }
  const s = camp.s, st = camp.st;
  if (!s) return;
  camp.t += dt;
  for (const e of st.timed) if (!e.fired && camp.t >= e.at) { e.fired = true; fireEvents(e.ev); }
  if (st.queue.length) {
    st.spawnT -= dt;
    if (st.spawnT <= 0 && aliveCount < maxConc() + 1) {
      if (spawnFor(st.queue[0], s)) st.queue.shift();
      st.spawnT = rr(0.5, 1.0);
    }
  }
  if (s.trickle && !st.queue.length && aliveCount < s.trickle.keep) {
    st.trickT -= dt;
    if (st.trickT <= 0) { st.queue.push(s.trickle.types[(Math.random() * s.trickle.types.length) | 0]); st.trickT = s.trickle.every; }
  }
  const px = player.pos.x, pz = player.pos.z;
  if (s.type === 'sweep') {
    if (!st.queue.length && aliveCount === 0) {
      st.gap += dt;
      if (st.gap > 1.3) { st.gap = 0; if (++st.gi < s.groups.length) st.queue.push(...s.groups[st.gi]); else endStage(); }
    }
  } else if (s.type === 'reach') {
    if (Math.hypot(s.at.x - px, s.at.z - pz) < (s.at.r || 3) && (s.at.y === undefined || player.pos.y > s.at.y - 0.6)) endStage();
  } else if (s.type === 'hold') {
    const inside = Math.hypot(s.at.x - px, s.at.z - pz) < s.at.r && (s.at.y === undefined || player.pos.y > s.at.y - 0.6);
    st.inside = inside;
    if (inside) st.holdT -= dt;
    if (!st.queue.length && aliveCount < s.keep) {
      st.respawn -= dt;
      if (st.respawn <= 0) { st.queue.push(s.types[(Math.random() * s.types.length) | 0]); st.respawn = s.every || 2.5; }
    }
    if (st.holdT <= 0) endStage();
  } else if (s.type === 'plant') {
    let near = null;
    for (const p of st.sites) if (!p.done && Math.hypot(p.x - px, p.z - pz) < 1.9) near = p;
    st.near = near;
    if (near && player.pos.y < 1) {
      st.plantT += dt;
      if (st.plantT >= 2.6) {
        near.done = true;
        st.plantT = 0;
        st.planted++;
        SFX.play('equip', 0.7, 0.8);
        feed(`폭약 설치 ${st.planted}/${st.sites.length}`);
        showMarks(st.sites.filter((p) => !p.done).map((p) => ({ x: p.x, z: p.z, r: 0.6 })));
        fireEvents(s.on && s.on.planted && s.on.planted[st.planted]);
        if (s.groups && s.groups[st.planted - 1]) st.queue.push(...s.groups[st.planted - 1]);
        if (st.planted >= st.sites.length) endStage();
      }
    } else st.plantT = 0;
  }
}
// 작전 HUD: 목표 문구, 지점 표식, 분대 상태, 이름표, 무전
let campHudT = 0;
function updateCampHud(dt) {
  const on = (camp.on || coop.on) && live();
  el.obj.classList.toggle('hidden', !on || !camp.on || !camp.s);
  el.squad.classList.toggle('hidden', !on);
  if (!on) { el.mk.classList.add('hidden'); for (const t of el.tags.children) t.classList.add('hidden'); return; }
  // 무전: 한 줄씩 차례로
  if (radioT > 0) { radioT -= dt; if (radioT <= 0) el.radio.classList.add('hidden'); }
  else if (radioQ.length) {
    const r = radioQ.shift();
    el.radioN.textContent = r.name;
    el.radioN.className = r.ally ? 'ally' : '';
    el.radioT.textContent = r.text;
    el.radio.classList.remove('hidden');
    radioT = clamp(1.4 + r.text.length * 0.075, 2.4, 4.6);
    SFX.play('equip', 0.35, 1.7);
  }
  const s = camp.on ? camp.s : null, st = camp.st;
  campHudT -= dt;
  if (campHudT <= 0) {
    campHudT = 0.2;
    if (s) {
      setTxt('objT', s.text);
      let sub = '';
      if (s.type === 'sweep') sub = `남은 적 ${aliveCount + st.queue.length}`;
      else if (s.type === 'reach') sub = `${Math.round(Math.hypot(s.at.x - player.pos.x, s.at.z - player.pos.z))}m` + (camp.boom ? ` · 폭파까지 ${Math.max(0, Math.ceil(camp.boom.t))}초` : '');
      else if (s.type === 'hold') sub = st.inside === false ? '구역 밖 · 돌아가야 시간이 줄어듭니다' : `${Math.max(0, Math.ceil(st.holdT))}초`;
      else if (s.type === 'plant') sub = `${st.planted}/${st.sites.length}`;
      setTxt('objS', sub);
    }
    for (let i = 0; i < 3; i++) { // 분대 상태
      const row = el.squad.children[i], a = allies.find((q) => !q.gone && q.slot === i);
      row.classList.toggle('hidden', !a);
      if (a) {
        row.firstChild.textContent = a.def.name;
        row.lastChild.firstChild.style.width = Math.round(clamp(a.hp / a.def.hp, 0, 1) * 100) + '%';
        row.className = 'sq' + (a.state === 'down' ? ' down' : a.state === 'leave' ? ' leave' : a.state === 'hold' ? ' hold' : '');
      }
    }
    el.sqOw.classList.toggle('hidden', !overwatch.on);
    if (coop.on) setTxt('hudVer', VERSION + (coop.host ? ' · 방장' : NET.links[0] && NET.links[0].ping >= 0 ? ` · ${Math.round(NET.links[0].ping)}ms` : ''));
  }
  // 폭약 설치 진행
  if (s && s.type === 'plant' && st.near) {
    el.rl.style.opacity = 1;
    el.rlFill.style.transform = `scaleX(${clamp(st.plantT / 2.6, 0, 1)})`;
    el.hint.textContent = '폭약 설치 중';
    el.hint.style.opacity = 1;
    camp.plantHud = true;
  } else if (camp.plantHud) { camp.plantHud = false; el.rl.style.opacity = 0; el.hint.style.opacity = 0; }
  // 목표 지점 표식 (화면 밖이면 가장자리에)
  let m = camp.on ? camp.mark : null;
  if (!m && s && s.type === 'plant') { // 가장 가까운 미설치 지점
    let bd = 1e9;
    for (const p of st.sites) { if (p.done) continue; const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd) { bd = d; m = p; } }
  }
  if (m) {
    _v.set(m.x, (m.y || 0) + 1.5, m.z);
    const d = _v.distanceTo(camera.position);
    _w.copy(_v).applyMatrix4(camera.matrixWorldInverse);
    _v.project(camera);
    let sx = (_v.x * 0.5 + 0.5) * LW, sy = (-_v.y * 0.5 + 0.5) * LH;
    const behind = _w.z > 0, mg = 34;
    if (behind) { sx = _w.x > 0 ? LW - mg : mg; sy = LH * 0.5; }
    let cx = clamp(sx, mg, LW - mg), cy = clamp(sy, mg + 30, LH - mg - 60);
    const off = behind || cx !== sx || cy !== sy;
    if (off) cy = clamp(cy, 64, LH * 0.42); // 화면 밖 표식은 조작 버튼을 가리지 않게 위쪽 가장자리에
    el.mk.classList.remove('hidden');
    el.mk.classList.toggle('off', off);
    el.mk.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
    setTxt('mkD', Math.round(d) + 'm');
  } else el.mk.classList.add('hidden');
  // 팀원 이름표
  for (const a of allies) {
    if (a.gone) continue;
    _v.set(a.pos.x, 2.05 - a.crouch * 0.5, a.pos.z);
    const d = _v.distanceTo(camera.position);
    _w.copy(_v).applyMatrix4(camera.matrixWorldInverse);
    _v.project(camera);
    const vis = _w.z < 0 && d < 80 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    a.tag.classList.toggle('hidden', !vis);
    if (vis) {
      a.tag.style.transform = `translate(${((_v.x * 0.5 + 0.5) * LW).toFixed(1)}px,${((-_v.y * 0.5 + 0.5) * LH).toFixed(1)}px)`;
      a.tag.classList.toggle('down', a.state === 'down');
    }
  }
}
// 작전 선택 화면
function openEpisodes() {
  const done = store.get('camp', 0), box = $('epList');
  box.textContent = '';
  EPISODES.forEach((ep, i) => {
    const b = document.createElement('button'), locked = i > done;
    b.className = 'card ep' + (locked ? ' locked' : '');
    b.disabled = locked;
    b.id = 'ep' + i;
    const sl = document.createElement('span'), st = document.createElement('b'), sd = document.createElement('span'), sq = document.createElement('span');
    sl.className = 'sl'; st.className = 'st'; sd.className = 'sd'; sq.className = 'sq2';
    sl.textContent = `작전 ${i + 1} · ${locked ? '잠김' : i < done ? '완료' : '진행 가능'}`;
    st.textContent = ep.title;
    sd.textContent = `${MAPS[ep.map]} · ${ENVS[ep.env].label}`;
    sq.textContent = `팀: ${ep.squad}`;
    b.append(sl, st, sd, sq);
    b.addEventListener('click', () => startEpisode(i));
    box.appendChild(b);
  });
  setState('eps');
}
function quitToMenu() {
  if (coop.on) coopEnd();
  for (const e of enemies) e.remove();
  enemies.length = 0;
  clearSquad();
  camp.on = false;
  showMarks([]);
  SFX.suspend(true);
  setState('menu');
}

// ───────────────────────── 보급품
const pickGeo = new THREE.BoxGeometry(0.34, 0.2, 0.22);
const pickMat = {
  ammo: new THREE.MeshStandardMaterial({ map: T.ammoLabel, roughness: 0.7, emissive: 0x2a3310, emissiveIntensity: 0.6 }),
  med: new THREE.MeshStandardMaterial({ map: T.medLabel, roughness: 0.6, emissive: 0x3a3632, emissiveIntensity: 0.5 }),
};
function giveAmmo() {
  let any = false;
  for (const k of ORDER) {
    const w = W[k];
    if (prog.owned[k] && w.give && w.reserve < w.cap) { w.reserve = Math.min(w.cap, w.reserve + w.give); any = true; }
  }
  return any;
}
function addPickup(type, x, z) {
  const mesh = new THREE.Mesh(pickGeo, pickMat[type]);
  mesh.castShadow = true;
  mesh.position.set(x, 0.3, z);
  scene.add(mesh);
  pickups.push({ type, mesh, x, z, t: 0 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.mesh.position.y = 0.32 + Math.sin(p.t * 2.2) * 0.05;
    p.mesh.rotation.y += dt * 1.2;
    let take = false;
    if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 1.2 && player.pos.y < 1) {
      if (p.type === 'ammo' && giveAmmo()) { feed('탄약 보급'); take = true; }
      else if (p.type === 'med' && player.hp < prog.maxHp) { player.hp = Math.min(prog.maxHp, player.hp + 50); feed('체력 +50'); take = true; }
      if (take) SFX.play('pickup', 0.5);
    }
    if (take || p.t > 45) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
}

// ───────────────────────── 웨이브
function startWave(n) {
  const np = nPlayers();
  game.wave = n;
  game.toSpawn = Math.min(Math.round((4 + (n - 1) * 2) * (1 + 0.5 * (np - 1))), 18 + 6 * (np - 1)); // 사람이 늘면 적도 는다
  game.spawnT = 0.5;
  game.queue = n === 2 ? ['rusher'] : n === 3 ? ['heavy'] : n === 4 ? ['sniper'] : [];
  if (coop.on && game.state === 'supply') setState('playing'); // 보급을 고르지 못한 채 다음 웨이브가 시작됨
  showMsg('WAVE ' + n, `적 ${game.toSpawn}명 접근 중`, 2.6);
  SFX.play('wave', 0.6);
  if (coop.host) sendEv({ t: 'wave', n, c: game.toSpawn });
}
function updateWaves(dt) {
  if (game.supplyT > 0) { // 구역 확보 알림을 잠깐 보여 준 뒤 보급 선택
    game.supplyT -= dt;
    if (game.supplyT <= 0) { if (player.alive) openSupply(); else coop.picked.add(0); }
    if (!coop.on) return;
  }
  if (game.between > 0) {
    game.between -= dt;
    if (game.between <= 0) startWave(game.wave + 1);
    return;
  }
  if (game.toSpawn > 0 && aliveCount < maxConc()) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      if (spawnEnemy()) game.toSpawn--;
      game.spawnT = rr(0.9, 2.2);
    }
  }
  if (game.toSpawn === 0 && aliveCount === 0 && game.wave > 0) {
    const bonus = 250 * game.wave;
    game.score += bonus;
    giveAmmo();
    gren.n = Math.min(4 + prog.lv.gren, gren.n + 1);
    showMsg('구역 확보', `웨이브 ${game.wave} 격퇴 · 보너스 +${bonus}`, 2.4);
    if (coop.on && !player.alive) coopRespawn();
    game.between = coop.on ? 16 : 5; // 협동: 각자 보급을 고를 시간. 모두 고르면 바로 줄인다
    game.supplyT = 1.8;
    if (coop.host) { coop.picked.clear(); sendEv({ t: 'clr', n: game.wave, b: bonus }); }
  }
}

function resetGame() {
  for (const e of enemies) e.remove();
  for (const g of gren.list) scene.remove(g.mesh);
  gren.list.length = 0;
  gren.n = 2;
  resetProg();
  game.supplyT = 0;
  scorch.clear();
  enemies.length = 0;
  for (const p of pickups) scene.remove(p.mesh);
  pickups.length = 0;
  decals.clear();
  tokens = 0;
  aliveCount = 0;
  player.pos.set(START.x, 0, START.z);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0; player.hp = 100; player.alive = true; player.crouch = false; player.crouchT = 0; player.lastHurt = -99; player.grounded = true; player.col.grounded = true;
  W.ar.ammo = 30; W.ar.reserve = 150; W.shotgun.ammo = 6; W.shotgun.reserve = 24; W.dmr.ammo = 10; W.dmr.reserve = 30; W.pistol.ammo = 15;
  Object.assign(vm, { cur: 'ar', adsT: 0, cool: 0, fireBuf: 0, reloadT: 0, switchT: 0, bloom: 0, rp: 0, rpT: 0, ry: 0, ryT: 0, kz: 0, kzv: 0, kp: 0, kpv: 0, kr: 0, krv: 0, sprintT: 0, pumpT: 0, throwT: 0, rlPose: 0 });
  game.queue = [];
  cam.shake = 0;
  showWeapon();
  cam.roll = 0; cam.landDip = 0; cam.hurtRoll = 0;
  Object.assign(game, { time: 0, wave: 0, toSpawn: 0, between: 2.2, score: 0, kills: 0, teamKills: 0, headshots: 0, shots: 0, hits: 0, dieT: 0 });
  for (const d of dmgInd) { d.t = 0; d.el.style.opacity = 0; }
  hudS.hm = hudS.hurt = 0;
  el.feed.textContent = '';
  input.ads = false;
  el.bAds.classList.remove('on');
  el.bCrouch.classList.remove('on');
  showMsg('준비', ROT ? '휴대폰을 왼쪽으로 눕혀 잡으세요' : LH > LW ? '메뉴에서 가로로 돌려서 할 수 있습니다' : '엄폐물을 확보하세요', 2.6);
}

function updateDeath(dt) {
  game.dieT += dt;
  player.eye = damp(player.eye, 0.3, 4, dt);
  cam.roll = damp(cam.roll, 1.05, 3.5, dt);
  player.vel.x = damp(player.vel.x, 0, 6, dt);
  player.vel.z = damp(player.vel.z, 0, 6, dt);
  player.hspeed = 0;
  vm.adsT = Math.max(0, vm.adsT - dt * 6);
  if (coop.on) { // 협동: 끝나지 않고 잠시 뒤 출발 지점에서 복귀. 전원이 쓰러졌는지는 방장이 판정한다
    const left = Math.ceil(COOP_RESPAWN - game.dieT);
    if (left <= 0) coopRespawn();
    else if (left !== coop.downSec) { coop.downSec = left; showMsg('쓰러짐', `${left}초 뒤 출발 지점에서 복귀`, 1.3); }
    return;
  }
  if (game.dieT > 1.9) {
    if (!camp.on && game.score > game.best) { game.best = game.score; store.set('best', game.best); }
    $('oWave').textContent = game.wave;
    $('oScore').textContent = game.score;
    $('oKills').textContent = game.kills;
    $('oHead').textContent = game.headshots;
    $('oAcc').textContent = (game.shots ? Math.round((game.hits / game.shots) * 100) : 0) + '%';
    $('overEyebrow').textContent = camp.on ? `작전 ${camp.idx + 1} · ${camp.ep.title} 실패` : game.score >= game.best && game.score > 0 ? '최고 기록 갱신' : `최고 기록 ${game.best}점`;
    $('btnAgain').textContent = camp.on ? '이 단계부터 다시' : '다시 도전';
    $('btnOverList').classList.toggle('hidden', !camp.on);
    setState('over');
  }
}

// ───────────────────────── 상태 전환
// 게임 중에는 화면이 꺼지지 않게 한다 (협동에서 방장 폰의 화면이 꺼지면 모두 멈춘다). 지원하지 않는 브라우저에서는 아무 일도 하지 않는다
const wake = { want: false, lock: null };
function keepAwake(on) {
  wake.want = on;
  try {
    if (on) {
      if (!wake.lock && navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then((l) => { wake.lock = l; l.addEventListener('release', () => { if (wake.lock === l) wake.lock = null; }); if (!wake.want) keepAwake(false); }).catch(() => {});
    } else if (wake.lock) { const l = wake.lock; wake.lock = null; l.release().catch(() => {}); }
  } catch (e) { /* 미지원 */ }
}
function setState(s) {
  game.state = s;
  keepAwake(s === 'playing' || s === 'dying' || s === 'supply' || (coop.on && s !== 'menu'));
  el.menu.classList.toggle('hidden', s !== 'menu');
  el.pause.classList.toggle('hidden', s !== 'paused');
  el.over.classList.toggle('hidden', s !== 'over');
  el.supply.classList.toggle('hidden', s !== 'supply');
  el.eps.classList.toggle('hidden', s !== 'eps');
  el.epdone.classList.toggle('hidden', s !== 'epdone');
  el.coop.classList.toggle('hidden', s !== 'coop');
  el.hud.classList.toggle('hidden', s === 'menu' || s === 'over' || s === 'eps' || s === 'epdone' || s === 'coop');
  if (s !== 'playing' && s !== 'dying') updateCampHud(0);
  el.touch.classList.toggle('hidden', s !== 'playing');
  el.bPause.classList.toggle('hidden', s !== 'playing');
  if (s !== 'playing') {
    releaseInput();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  el.bestTxt.textContent = game.best;
}
function startGame() { // 생존 모드: 야드에서 끝없는 웨이브
  SFX.initAudio();
  SFX.setSound(opt.sound);
  SFX.suspend(false);
  camp.on = false;
  showMarks([]);
  clearSquad();
  loadMap('yard', 'day');
  resetGame();
  setState('playing');
}
function pauseGame() {
  if (game.state !== 'playing') return;
  $('pauseBrief').textContent = camp.on ? `작전 ${camp.idx + 1} · ${camp.ep.title}: ${camp.ep.brief}` : coop.on ? `협동 생존 · 방 ${NET.code} · ${nPlayers()}명. 이 화면을 띄워도 게임은 멈추지 않습니다.` : '';
  $('btnRestart').classList.toggle('hidden', coop.on && !coop.host);
  $('btnQuit').textContent = coop.on ? '방 나가기' : '메뉴로';
  setState('paused');
  if (!coop.on) SFX.suspend(true);
}
function resumeGame() {
  if (game.state !== 'paused') return;
  SFX.suspend(false);
  setState('playing');
  last = performance.now();
}

// ───────────────────────── 입력
const joy = { id: null, ox: 0, oy: 0 };
const lookT = new Map(), btnT = new Map();
function releaseInput() {
  input.fire = false; input.mx = 0; input.mz = 0; input.joySprint = false; input.jump = false; input.lookDX = 0; input.lookDY = 0;
  joy.id = null;
  lookT.clear();
  btnT.clear();
  el.joy.classList.remove('act', 'run');
  el.joy.style.left = el.joy.style.top = el.joy.style.bottom = '';
  el.knob.style.transform = '';
  for (const b of el.touch.querySelectorAll('.btn')) if (b.id !== 'bAds' && b.id !== 'bCrouch') b.classList.remove('on');
  for (const k in input.keys) input.keys[k] = false;
}
function pressBtn(name, down, node) {
  switch (name) {
    case 'fire':
      input.fire = down;
      if (down) vm.fireBuf = 0.18;
      node.classList.toggle('on', down);
      break;
    case 'ads':
      if (down) {
        input.ads = !input.ads;
        el.bAds.classList.toggle('on', input.ads);
        if (input.ads) assist.t = 0.22;
      }
      break;
    case 'reload': node.classList.toggle('on', down); if (down) startReload(); break;
    case 'jump': node.classList.toggle('on', down); if (down) input.jump = true; break;
    case 'crouch': if (down) { player.crouch = !player.crouch; el.bCrouch.classList.toggle('on', player.crouch); } break;
    case 'swap': if (down) switchWeapon(); break;
    case 'gren': node.classList.toggle('on', down); if (down) throwGrenade(); break;
  }
}
const joyR = () => el.joy.offsetWidth * 0.5 || 60;
el.touch.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (game.state !== 'playing') return;
  if (!input.lastTouch) { input.lastTouch = true; setInputMode(true); }
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i], x = lx(t), y = ly(t);
    const b = t.target.closest ? t.target.closest('[data-btn]') : null;
    if (b) {
      btnT.set(t.identifier, b);
      pressBtn(b.dataset.btn, true, b);
      if (b.dataset.btn === 'fire') lookT.set(t.identifier, { x, y });
    } else if (joy.id === null && x < LW * 0.42 && (LH <= LW || y > LH * 0.42)) {
      joy.id = t.identifier; joy.ox = x; joy.oy = y;
      const r = joyR();
      el.joy.style.left = x - r + 'px';
      el.joy.style.top = y - r + 'px';
      el.joy.style.bottom = 'auto';
      el.joy.classList.add('act');
    } else lookT.set(t.identifier, { x, y });
  }
}, { passive: false });
el.touch.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i], x = lx(t), y = ly(t);
    if (t.identifier === joy.id) {
      const r = joyR();
      let dx = x - joy.ox, dy = y - joy.oy;
      const len = Math.hypot(dx, dy);
      input.joySprint = len > r * 1.15 && -dy > len * 0.6;
      const dead = 0.1, m = Math.min(1, len / (r * 0.72)), k = m < dead ? 0 : (m - dead) / (1 - dead);
      input.mx = len > 0 ? (dx / len) * k : 0;
      input.mz = len > 0 ? (-dy / len) * k : 0;
      if (len > r) { dx *= r / len; dy *= r / len; }
      el.knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
      el.joy.classList.toggle('run', input.joySprint);
    } else {
      const l = lookT.get(t.identifier);
      if (l) {
        input.lookDX += x - l.x;
        input.lookDY += y - l.y;
        l.x = x; l.y = y;
      }
    }
  }
}, { passive: false });
const touchEnd = (e) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joy.id) {
      joy.id = null;
      input.mx = input.mz = 0;
      input.joySprint = false;
      el.joy.classList.remove('act', 'run');
      el.joy.style.left = el.joy.style.top = el.joy.style.bottom = '';
      el.knob.style.transform = '';
    }
    lookT.delete(t.identifier);
    const b = btnT.get(t.identifier);
    if (b) { btnT.delete(t.identifier); pressBtn(b.dataset.btn, false, b); }
  }
};
el.touch.addEventListener('touchend', touchEnd, { passive: false });
el.touch.addEventListener('touchcancel', touchEnd, { passive: false });

// 마우스·키보드
let mouseDown = 0;
el.touch.addEventListener('click', () => {
  if (game.state !== 'playing' || input.lastTouch || document.pointerLockElement) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 잠금 불가: 드래그 조준으로 대체 */ }
});
el.touch.addEventListener('mousedown', (e) => {
  if (game.state !== 'playing') return;
  if (input.lastTouch) { input.lastTouch = false; setInputMode(false); }
  mouseDown |= 1 << e.button;
  if (e.button === 0) { input.fire = true; vm.fireBuf = 0.18; }
  if (e.button === 2) input.ads = true;
});
window.addEventListener('mouseup', (e) => {
  mouseDown &= ~(1 << e.button);
  if (e.button === 0) input.fire = false;
  if (e.button === 2 && !input.lastTouch) input.ads = false;
});
window.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing' || input.lastTouch) return;
  if (document.pointerLockElement || mouseDown) { input.lookDX += e.movementX || 0; input.lookDY += e.movementY || 0; }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (game.state === 'playing') pauseGame(); else if (game.state === 'paused') resumeGame(); return; }
  if (game.state === 'supply') { if (/^Digit[1-3]$/.test(e.code)) pickSupply(+e.code.slice(5) - 1); return; }
  if (game.state !== 'playing') return;
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyC') player.crouch = !player.crouch;
  else if (e.code === 'KeyQ') switchWeapon();
  else if (e.code === 'KeyG') throwGrenade();
  else if (/^Digit[1-4]$/.test(e.code)) switchWeapon(ORDER[+e.code.slice(5) - 1]);
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else if (wake.want) keepAwake(true); });
window.addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });

// 메뉴 버튼
const QUAL = { high: { pr: 2, shadow: 2048, label: '높음' }, mid: { pr: 1.5, shadow: 1024, label: '중간' }, low: { pr: 1, shadow: 0, label: '낮음' } };
let prCap = 1, prCur = 1;
function applyQuality() {
  const q = QUAL[opt.quality] || QUAL.high;
  prCap = Math.min(window.devicePixelRatio || 1, q.pr);
  prCur = prCap;
  renderer.setPixelRatio(prCur);
  sun.castShadow = q.shadow > 0;
  if (q.shadow > 0 && sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  for (const id of ['btnQual', 'btnQual2']) $(id).querySelector('b').textContent = q.label;
}
function cycleQuality() {
  opt.quality = opt.quality === 'high' ? 'mid' : opt.quality === 'mid' ? 'low' : 'high';
  store.set('quality', opt.quality);
  applyQuality();
}
function toggleFull() {
  try {
    const d = document;
    if (!d.fullscreenElement) {
      const p = d.documentElement.requestFullscreen();
      if (p && p.then) p.then(() => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* 미지원 */ } }).catch(() => {});
    } else d.exitFullscreen().catch(() => {});
  } catch (e) { /* 전체 화면 미지원 */ }
}
function setSens(v) {
  opt.sens = clamp(Math.round(v * 10) / 10, 0.4, 3);
  store.set('sens', opt.sens);
  el.sensTxt.textContent = el.sensTxt0.textContent = opt.sens.toFixed(1);
}
function setSoundBtn() {
  $('btnSound').querySelector('b').textContent = opt.sound ? '켬' : '끔';
}
$('btnStart').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', () => (coop.on ? coopAgain() : camp.on ? startEpisode(camp.idx, Math.max(0, camp.si)) : startGame()));
$('btnRestart').addEventListener('click', () => (coop.on ? coopHostStart() : camp.on ? startEpisode(camp.idx) : startGame()));
$('btnCamp').addEventListener('click', openEpisodes);
$('btnEpBack').addEventListener('click', () => setState('menu'));
$('btnOverList').addEventListener('click', () => { const wasCoop = coop.on; quitToMenu(); if (!wasCoop) openEpisodes(); });
$('btnQuit').addEventListener('click', quitToMenu);
$('btnNextEp').addEventListener('click', () => startEpisode(camp.idx + 1));
$('btnEpList').addEventListener('click', () => { quitToMenu(); openEpisodes(); });
$('btnResume').addEventListener('click', resumeGame);
el.bPause.addEventListener('click', pauseGame);
$('btnQual').addEventListener('click', cycleQuality);
$('btnQual2').addEventListener('click', cycleQuality);
for (const id of ['btnSensDn', 'btnSensDn0']) $(id).addEventListener('click', () => setSens(opt.sens - 0.1));
for (const id of ['btnSensUp', 'btnSensUp0']) $(id).addEventListener('click', () => setSens(opt.sens + 0.1));
function setAutoBtn() {
  for (const id of ['btnAuto', 'btnAuto2']) $(id).querySelector('b').textContent = opt.autoFire ? '켬' : '끔';
  document.body.classList.toggle('auto', !!opt.autoFire); // 자동 사격 중에는 사격 버튼을 작게
}
for (const id of ['btnAuto', 'btnAuto2']) $(id).addEventListener('click', () => { opt.autoFire = !opt.autoFire; store.set('auto', opt.autoFire); setAutoBtn(); });
setAutoBtn();
for (let i = 0; i < 3; i++) $('sup' + i).addEventListener('click', () => pickSupply(i));
$('btnSound').addEventListener('click', () => { opt.sound = !opt.sound; store.set('sound', opt.sound); SFX.setSound(opt.sound); setSoundBtn(); });
if (document.documentElement.requestFullscreen && document.fullscreenEnabled) {
  $('btnFull').addEventListener('click', toggleFull);
  $('btnFull2').addEventListener('click', toggleFull);
} else { $('btnFull').classList.add('hidden'); $('btnFull2').classList.add('hidden'); }

// ───────────────────────── 화면 크기
const root = $('root');
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  ROT = opt.rot && vh > vw;
  LW = ROT ? vh : vw;
  LH = ROT ? vw : vh;
  root.style.width = ROT ? vh + 'px' : '';
  root.style.height = ROT ? vw + 'px' : '';
  document.body.classList.toggle('rot', ROT);
  document.body.classList.toggle('portrait', LH > LW);
  for (const id of ['btnRot', 'btnRot2']) {
    $(id).classList.toggle('hidden', vh <= vw);
    $(id).querySelector('b').textContent = opt.rot ? '켬' : '끔';
  }
  const a = LW / Math.max(1, LH);
  renderer.setSize(LW, LH, false);
  baseFov = clamp((2 * Math.atan(0.721 / a) * 180) / Math.PI, 62, 95);
  camera.aspect = a;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  vmCam.aspect = a;
  vmCam.fov = clamp((2 * Math.atan(0.625 / a) * 180) / Math.PI, 55, 70);
  vmShiftX = a < 1 ? -0.05 * clamp((1 - a) / 0.5, 0, 1) : 0;
  vmCam.updateProjectionMatrix();
}
function toggleRot() {
  opt.rot = !opt.rot;
  store.set('rot', opt.rot);
  resize();
}
$('btnRot').addEventListener('click', toggleRot);
$('btnRot2').addEventListener('click', toggleRot);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ───────────────────────── 루프
let last = performance.now(), ema = 16, dynT = 0, menuT = 0, slowN = 0;
const dbg = { noDyn: false };
function update(dt) {
  game.time += dt;
  if (player.alive) { scanTarget(dt); handleLook(dt); updatePlayer(dt); updateWeapon(dt); }
  else updateDeath(dt);
  aliveCount = 0;
  for (const e of enemies) { e.update(dt); if (!e.dead) aliveCount++; }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
  for (const a of allies) if (!a.gone) a.update(dt);
  for (let i = allies.length - 1; i >= 0; i--) if (allies[i].gone) allies.splice(i, 1);
  updateOverwatch(dt);
  if (camp.on) { if (player.alive) updateCampaign(dt); }
  else if (coop.on ? coop.host : player.alive) updateWaves(dt);
  if (player.alive) updatePickups(dt);
  if (coop.on) coopUpdate(dt);
  updateGrenades(dt);
  dust.update(dt); sparks.update(dt); tracers.update(dt); shells.update(dt);
  flashLight.intensity = flashLight.intensity < 0.05 ? 0 : flashLight.intensity * Math.exp(-dt * 55);
  placeCamera(dt);
  updateViewmodel(dt);
  updateHud(dt);
  updateCampHud(dt);
}
function render() {
  if (cloudMat) cloudMat.uniforms.uTime.value = performance.now() / 1000;
  if (stars.visible) stars.position.copy(camera.position);
  const us = renderer.domElement.height / (2 * Math.tan(rad(camera.fov) / 2));
  dust.mat.uniforms.uScale.value = us;
  sparks.mat.uniforms.uScale.value = us;
  renderer.clear();
  renderer.render(scene, camera);
  if (game.state !== 'menu' && game.state !== 'eps' && game.state !== 'coop') {
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last;
  last = now;
  const dt = clamp(raw / 1000, 0.001, 0.05);
  if (live()) update(dt);
  if (rain.on) updateRain(dt);
  else if (game.state === 'menu' || game.state === 'eps' || game.state === 'coop') {
    menuT += dt;
    const a = menuT * 0.035 + 0.9, mcx = (B.x0 + B.x1) / 2 - (WORLD.id === 'yard' ? 12 : 0), mcz = (B.z0 + B.z1) / 2;
    camera.position.set(mcx + Math.sin(a) * 31, 7.5, mcz + Math.cos(a) * 25);
    camera.lookAt(mcx + 4, 2.2, mcz - 2);
  }
  // 프레임 시간이 길어지면 렌더 해상도를 낮춰 프레임을 지킨다. 해상도를 바꾸면 캔버스가 비워지므로 그리기 전에 한다
  if (game.state === 'playing' && !dbg.noDyn) {
    ema += (Math.min(raw, 100) - ema) * 0.05;
    dynT += dt;
    if (dynT > 1.5) {
      dynT = 0;
      const lo = Math.max(0.6, prCap * 0.55);
      if (ema > 30 && prCur <= lo + 0.001 && opt.quality !== 'low') {
        if (++slowN >= 2) { slowN = 0; cycleQuality(); feed('그래픽 품질 자동 조정'); }
      } else slowN = 0;
      if (ema > 24 && prCur > lo) { prCur = Math.max(lo, prCur - prCap * 0.15); renderer.setPixelRatio(prCur); }
      else if (ema < 14 && prCur < prCap) { prCur = Math.min(prCap, prCur + prCap * 0.1); renderer.setPixelRatio(prCur); }
    }
  }
  render();
}

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pauseGame(); });
$('verTxt').textContent = `YARD ZERO ${VERSION}`;
$('verTop').textContent = VERSION;
$('hudVer').textContent = VERSION;
$('pauseVer').textContent = VERSION;
setSens(opt.sens);
setSoundBtn();
applyQuality();
resize();
showWeapon();
setState('menu');
{ const mj = /[#&]j=(\d{5})\b/.exec(location.hash); if (mj) { lobStatus(''); $('coErr').textContent = ''; lob.entry = mj[1]; lobShow('pad'); setState('coop'); } }
requestAnimationFrame(frame);

// 자동 검증용 훅
window.__yz = { step: (n, dt) => { for (let i = 0; i < n && live(); i++) update(dt); }, coop, NET, humans, coopHost, coopJoin, coopHostStart, coopEnd, lob, RemotePlayer, chestY, camp, allies, overwatch, EPISODES, SQUAD, startEpisode, squadJoin, squadLeave, squadHold, squadFollow, setOverwatch, openEpisodes, quitToMenu, radioQ, store, loadMap, applyEnv, ENVS, WORLD, B, START, rayWorld, losClear, blockedAt, findPath, prog, openSupply, pickSupply, applySupply, SFX, WH, dust, sparks, TYPES, gren, throwGrenade, explode, ORDER, MOCAP, aa, VM, scene, colliders, toggleRot, game, player, enemies, input, vm, W, opt, dbg, renderer, camera, pickups, spawnEnemy, startGame, hurtPlayer, switchWeapon, startReload, applyQuality, NAV };

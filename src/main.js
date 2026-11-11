// YARD ZERO — 모바일 3D FPS (단일 HTML)
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { $, clamp, lerp, smooth, rad, TAU, rr, gauss, angDiff, damp } from './util.js';
import { makeTextures } from './textures.js';
import { colliders, buildWorld, buildNav, rayWorld, hit, losClear, collideMove, findPath, blockedAt, navLineClear, NAV, cellX, cellZ, START, B, WH, snapDown } from './world.js';
import * as SFX from './audio.js';
import { Particles, Decals, Tracers, Shells } from './fx.js';
import { initSoldierAssets, PuppetBody } from './soldier.js';
import { MOCAP, loadMocap, MocapBody } from './mocap.js';
import { buildViewmodel } from './viewmodel.js';

const VERSION = 'v0.4';
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

// ───────────────────────── 하늘·조명 (저고도 태양, 대기 산란 하늘을 환경광으로 사용)
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, rad(90 - 24), rad(125));
const sky = new Sky();
sky.scale.setScalar(10000);
{
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(sky);
  const gd = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x4a4640 }));
  gd.rotation.x = -Math.PI / 2;
  gd.position.y = -1.2;
  es.add(gd);
  const env = pm.fromScene(es, 0, 0.1, 200).texture;
  scene.environment = env;
  vmScene.environment = env;
  pm.dispose();
  scene.add(sky);
}
const SUN_I = 9;
const sun = new THREE.DirectionalLight(0xffe9c9, SUN_I);
sun.target.position.set(12, 0, 0);
sun.position.copy(sunDir).multiplyScalar(140).add(sun.target.position);
scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
{
  const c = sun.shadow.camera;
  c.left = -72; c.right = 72; c.top = 58; c.bottom = -58; c.near = 30; c.far = 290; // 야드 + 창고
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
}
scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x4d463c, 0.5));
scene.fog = new THREE.FogExp2(0xb9c1c8, 0.0036);
let cloudMat = null;
function addClouds(tex) {
  cloudMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        if (d.y < 0.012) discard;
        vec2 uv = d.xz / (d.y + 0.18);
        float n = texture2D(map, uv * 0.11 + vec2(uTime * 0.0035, 0.0)).r * 0.65 + texture2D(map, uv * 0.31 + vec2(uTime * 0.006, 0.3)).r * 0.35;
        float dens = smoothstep(0.5, 0.76, n) * smoothstep(0.012, 0.2, d.y);
        float sd = max(dot(d, sunDir), 0.0);
        vec3 lit = mix(vec3(0.6, 0.65, 0.72), vec3(1.25, 1.12, 0.95), 0.35 + 0.65 * pow(sd, 3.0));
        vec3 col = mix(lit * 0.7, lit, smoothstep(0.55, 0.9, n));
        float glow = pow(sd, 28.0) * 0.2 + pow(sd, 420.0) * 1.5;
        float a = dens * 0.85;
        gl_FragColor = vec4(col * a + vec3(1.0, 0.86, 0.62) * glow * (1.0 - a * 0.6), a);
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
vmScene.add(new THREE.HemisphereLight(0xc4d6ff, 0x4d463c, 0.5));
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
  ao: new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: T.ao, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  puddle: new THREE.MeshStandardMaterial({ color: 0x090a0b, roughness: 0.03, alphaMap: T.puddle, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
};
addClouds(T.cloud);
buildWorld(scene, M);
buildNav();
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
const maxTokens = () => 1 + Math.floor(game.wave / 2);
const maxConc = () => Math.min(3 + Math.floor(game.wave / 2), 7);
const assist = { t: 0 };

// ───────────────────────── HUD
const el = {};
for (const id of ['supply', 'supplySub', 'sup0', 'sup1', 'sup2', 'hud', 'touch', 'bPause', 'menu', 'pause', 'over', 'hpFill', 'hpNum', 'waveTxt', 'enemyTxt', 'scoreTxt', 'feed', 'msg', 'msgT', 'msgS', 'ch', 'hm', 'dmgs', 'rl', 'rlFill', 'hint',
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
  setTxt('waveTxt', 'WAVE ' + Math.max(1, game.wave));
  setTxt('enemyTxt', '적 ' + (game.toSpawn + aliveCount));
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

function ejectShell() {
  camera.getWorldDirection(_f);
  _r.crossVectors(_f, UP).normalize();
  _u.crossVectors(_r, _f);
  _v.copy(camera.position).addScaledVector(_r, 0.2).addScaledVector(_f, 0.55).addScaledVector(_u, -0.1);
  _w.copy(_r).multiplyScalar(rr(1.8, 2.8)).addScaledVector(_u, rr(1.4, 2.2)).addScaledVector(_f, rr(-0.3, 0.5)).add(player.vel);
  shells.spawn(_v, _w);
}

function shoot(w) {
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
  el.supplySub.textContent = `웨이브 ${game.wave} 격퇴`;
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
  game.between = 3.5;
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
  const want = (w.auto ? input.fire : vm.fireBuf > 0) || auto;
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
}

// ───────────────────────── 플레이어
function hurtPlayer(dmg, from) {
  if (!player.alive) return;
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
}
function explode(x, y, z) {
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
  for (const e of enemies) if (!e.dead) e.lastKnown.copy(player.pos);
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
        if (e.dead || g.seen.has(e) || Math.hypot(e.pos.x - g.p.x, e.pos.z - g.p.z) > 6.5 || !losClear(e.pos.x, 1.6, e.pos.z, g.p.x, g.p.y + 0.2, g.p.z)) continue;
        g.seen.add(e);
        if (Math.random() < (e.T.key === 'heavy' ? 0.35 : 0.65)) e.fleeFrom(g.p);
      }
    }
    if (g.fuse <= 0) {
      explode(g.p.x, g.p.y, g.p.z);
      scene.remove(g.mesh);
      gren.list.splice(i, 1);
    }
  }
}

class Enemy {
  constructor(x, z, type) {
    const T = (this.T = TYPES[type] || TYPES.rifle);
    try { this.body = MOCAP.ready ? new MocapBody(T.key === 'rifle' && Math.random() < 0.5 ? 'rifle2' : T.mat, T.scale) : new PuppetBody(T.puppet); }
    catch (err) { this.body = new PuppetBody(T.puppet); }
    scene.add(this.body.root);
    this.pos = new THREE.Vector3(x, 0, z);
    this.aimYaw = this.bodyYaw = Math.atan2(player.pos.x - x, player.pos.z - z);
    this.back = false; this.vx = 0; this.vz = 0; this.crouch = 0; this.kneel = Math.random() < T.kneel; this.kick = 0; this.fleeT = 0;
    this.hp = T.hp;
    this.state = 'hunt';
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
    const T = this.T, needCover = this.reload > 0 || this.hp < T.hp * 0.35, px = player.pos.x, py = player.pos.y + player.eye, pz = player.pos.z;
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
  fire() {
    const T = this.T, drop = this.crouch * 0.37, ox = this.pos.x, oy = 1.48 - drop, oz = this.pos.z;
    if (T.sniper) _d.set(this.aimPt.x - ox, this.aimPt.y - oy, this.aimPt.z - oz);
    else _d.set(player.pos.x - ox, player.pos.y + player.eye * 0.72 - oy, player.pos.z - oz);
    const dist = _d.length();
    _d.multiplyScalar(1 / dist);
    const sig = T.sniper ? 0.005 : ((0.056 * T.sig) / this.skill) * (1 + Math.min(player.hspeed, 7) * 0.1) * (this.seenFor < 1 ? 1.5 : 1) * (player.crouch ? 0.9 : 1);
    _r.crossVectors(_d, UP).normalize();
    _u.crossVectors(_r, _d);
    _d.addScaledVector(_r, gauss() * sig).addScaledVector(_u, gauss() * sig).normalize();
    let tEnd = 170, world = false, nx = 0, ny = 0, nz = 0, mat = 0;
    if (rayWorld(ox, oy, oz, _d.x, _d.y, _d.z, 170)) { tEnd = hit.t; world = true; nx = hit.nx; ny = hit.ny; nz = hit.nz; mat = hit.m; }
    const tp = rayPlayer(ox, oy, oz, _d, tEnd);
    const mx = ox + Math.sin(this.aimYaw) * 0.85, mz = oz + Math.cos(this.aimYaw) * 0.85, my = 1.47 - drop;
    if (tp >= 0) {
      tEnd = tp;
      hurtPlayer(rr(T.dmg[0], T.dmg[1]) * (!T.sniper && dist > 45 ? 0.75 : 1), this.pos);
    } else {
      if (world) impactFx(ox + _d.x * tEnd, oy + _d.y * tEnd, oz + _d.z * tEnd, nx, ny, nz, mat, 0.55);
      // 근접 통과음
      _v.subVectors(camera.position, _w.set(ox, oy, oz));
      const tca = _v.dot(_d);
      if (tca > 2 && tca < tEnd && _v.lengthSq() - tca * tca < 1.6 && game.time - whizT > 0.12) {
        whizT = game.time;
        SFX.play('whiz', 0.5, rr(0.85, 1.2), (Math.random() < 0.5 ? -1 : 1) * rr(0.3, 0.8));
      }
    }
    tracers.spawn(mx, my, mz, ox + _d.x * tEnd, oy + _d.y * tEnd, oz + _d.z * tEnd);
    this.flashT = 0.05;
    this.kick = 1;
    this.body.flash.rotation.z = Math.random() * TAU;
    SFX.playAt(T.sniper ? 'shotDMR' : 'shotFar', mx, my, mz, T.sniper ? 1.3 : 0.95, T.key === 'heavy' ? rr(0.78, 0.86) : rr(0.93, 1.07));
  }
  // dir: 탄 진행 방향(없으면 폭발), power: 래그돌에 줄 충격, blast: 폭발 정보
  damage(d, part, dir, power, blast) {
    if (this.dead) return false;
    const T = this.T;
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
    this.lastKnown.copy(player.pos);
    this.unseenFor = 0;
    if (this.state !== 'combat') { this.state = 'combat'; this.react = 0.35; this.tactic = 0.2; }
    if (this.hp <= 0) { this.die(dir, part, power, blast); return true; }
    return false;
  }
  die(dir, part, power, blast) {
    const T = this.T;
    this.dead = true;
    this.deadT = 0;
    this.dropToken();
    if (!(part === 2 && !blast) || Math.random() < 0.3) SFX.playAt('grunt', this.pos.x, 1.5, this.pos.z, 0.9, rr(0.92, 1.05) * (T.key === 'heavy' ? 0.86 : 1));
    if (this.laser) { scene.remove(this.laser); this.laser = null; }
    this.fall = dir && Math.sin(this.bodyYaw) * dir.x + Math.cos(this.bodyYaw) * dir.z > 0 ? 1 : -1;
    let clip = null;
    if (!blast && dir && part !== 2 && MOCAP.clips && MOCAP.clips.Death && this.body.playOver && this.crouch < 0.4 && !(this.rollT > 0) && Math.random() < 0.6) {
      // 클립은 뒤로 쓰러진다: 탄이 미는 방향과 비슷하고 그쪽이 비어 있을 때만 쓴다
      const a = this.bodyYaw + MOCAP.deathYaw, fx = Math.sin(a), fz = Math.cos(a), dl = Math.hypot(dir.x, dir.z) || 1;
      if ((fx * dir.x + fz * dir.z) / dl > 0.3 && !rayWorld(this.pos.x, 0.45, this.pos.z, fx, 0, fz, 2.3, false) && !rayWorld(this.pos.x, 1.2, this.pos.z, fx, 0, fz, 1.6, false)) clip = (power || 3) >= 5 ? 'Knockback' : 'Death';
    }
    this.fallSnd = clip === 'Death' ? 0.95 : clip === 'Knockback' ? 0.35 : blast ? 0.8 : 0.5;
    this.deathKind = clip || 'ragdoll';
    this.body.die(this, scene, { dir: dir ? { x: dir.x, y: dir.y, z: dir.z } : null, power: power || 3, part, blast: blast || null, clip });
    game.kills++;
    const head = part === 2 && !blast, pts = T.score + (head ? 50 : 0);
    game.score += pts;
    if (head) game.headshots++;
    feed(head ? `헤드샷 +${pts}` : `${T.label} +${pts}`, head);
    const rn = Math.random();
    if (rn < 0.38) addPickup('ammo', this.pos.x, this.pos.z);
    else if (rn < 0.38 + (player.hp < 60 ? 0.3 : 0.1)) addPickup('med', this.pos.x, this.pos.z);
  }
  update(dt) {
    if (this.dead) {
      this.deadT += dt;
      if (this.fallSnd > 0 && (this.fallSnd -= dt) <= 0) SFX.playAt('bodyfall', this.pos.x, 0.3, this.pos.z, 1.2, rr(0.9, 1.08));
      if (this.body.animateDead(this, dt)) this.remove();
      return;
    }
    const T = this.T, px = player.pos.x, pz = player.pos.z, dP = Math.hypot(px - this.pos.x, pz - this.pos.z), drop = this.crouch * 0.37, run = runSpeed() * T.speed;
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.16 + Math.random() * 0.1;
      this.canSee = player.alive && dP < 95 && losClear(this.pos.x, 1.7 - drop, this.pos.z, px, player.pos.y + player.eye, pz);
    }
    if (this.canSee) { this.lastKnown.copy(player.pos); this.seenFor += dt; this.unseenFor = 0; }
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
    if (this.canSee) this.aimPitch = clamp(Math.atan2(player.pos.y + player.eye * 0.72 - (1.48 - drop), Math.max(dP, 1)), -0.6, 0.6);
    const wantCrouch = combat && mv < 0.5 && (this.reload > 0 || (this.kneel && this.canSee));
    this.crouch = damp(this.crouch, wantCrouch ? 1 : 0, 6, dt);
    this.flinch = damp(this.flinch, 0, 9, dt);
    this.flashT -= dt;
    if (mv > 0.8) { // 발소리
      this.stepAcc = (this.stepAcc || 0) + mv * dt;
      if (this.stepAcc > (mv > 3 ? 1.75 : 1.35)) {
        this.stepAcc = 0;
        if (dP < 30) SFX.playAt('step', this.pos.x, 0.1, this.pos.z, T.key === 'heavy' ? 1.5 : 1.0, T.key === 'heavy' ? 0.84 : rr(0.95, 1.1));
      }
    }
    this.body.animate(this, dt);

    if (this.laser) {
      // 조준점은 플레이어를 조금 늦게 따라온다: 옆으로 계속 움직이면 빗나간다
      const ty = player.pos.y + player.eye * 0.72;
      if (this.canSee) { this.aimPt.x = damp(this.aimPt.x, px, 3.2, dt); this.aimPt.y = damp(this.aimPt.y, ty, 3.2, dt); this.aimPt.z = damp(this.aimPt.z, pz, 3.2, dt); }
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
  if (fx !== undefined) { const e = new Enemy(fx, fz, type || 'rifle'); enemies.push(e); return e; }
  const kind = pickType();
  let best = -1, bs = -1e9;
  for (let k = 0; k < 26; k++) {
    const c = NAV.free[(Math.random() * NAV.free.length) | 0], x = cellX(c), z = cellZ(c), d = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (d < 24) continue;
    let s = Math.min(d, 46) + Math.random() * 6;
    if (losClear(x, 1.7, z, player.pos.x, player.pos.y + player.eye, player.pos.z)) s -= 40;
    for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x - x, e.pos.z - z) < 3) s -= 20;
    if (s > bs) { bs = s; best = c; }
  }
  if (best < 0) { game.queue.unshift(kind); return null; }
  const e = new Enemy(cellX(best), cellZ(best), kind);
  enemies.push(e);
  return e;
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
  game.wave = n;
  game.toSpawn = Math.min(4 + (n - 1) * 2, 18);
  game.spawnT = 0.5;
  game.queue = n === 2 ? ['rusher'] : n === 3 ? ['heavy'] : n === 4 ? ['sniper'] : [];
  showMsg('WAVE ' + n, `적 ${game.toSpawn}명 접근 중`, 2.6);
  SFX.play('wave', 0.6);
}
function updateWaves(dt) {
  if (game.supplyT > 0) { // 구역 확보 알림을 잠깐 보여 준 뒤 보급 선택
    game.supplyT -= dt;
    if (game.supplyT <= 0) openSupply();
    return;
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
    game.between = 5;
    game.supplyT = 1.8;
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
  Object.assign(game, { time: 0, wave: 0, toSpawn: 0, between: 2.2, score: 0, kills: 0, headshots: 0, shots: 0, hits: 0, dieT: 0 });
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
  if (game.dieT > 1.9) {
    if (game.score > game.best) { game.best = game.score; store.set('best', game.best); }
    $('oWave').textContent = game.wave;
    $('oScore').textContent = game.score;
    $('oKills').textContent = game.kills;
    $('oHead').textContent = game.headshots;
    $('oAcc').textContent = (game.shots ? Math.round((game.hits / game.shots) * 100) : 0) + '%';
    $('overEyebrow').textContent = game.score >= game.best && game.score > 0 ? '최고 기록 갱신' : `최고 기록 ${game.best}점`;
    setState('over');
  }
}

// ───────────────────────── 상태 전환
function setState(s) {
  game.state = s;
  el.menu.classList.toggle('hidden', s !== 'menu');
  el.pause.classList.toggle('hidden', s !== 'paused');
  el.over.classList.toggle('hidden', s !== 'over');
  el.supply.classList.toggle('hidden', s !== 'supply');
  el.hud.classList.toggle('hidden', s === 'menu' || s === 'over');
  el.touch.classList.toggle('hidden', s !== 'playing');
  el.bPause.classList.toggle('hidden', s !== 'playing');
  if (s !== 'playing') {
    releaseInput();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  el.bestTxt.textContent = game.best;
}
function startGame() {
  SFX.initAudio();
  SFX.setSound(opt.sound);
  SFX.suspend(false);
  resetGame();
  setState('playing');
}
function pauseGame() {
  if (game.state !== 'playing') return;
  setState('paused');
  SFX.suspend(true);
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
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
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
$('btnAgain').addEventListener('click', startGame);
$('btnRestart').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resumeGame);
el.bPause.addEventListener('click', pauseGame);
$('btnQual').addEventListener('click', cycleQuality);
$('btnQual2').addEventListener('click', cycleQuality);
for (const id of ['btnSensDn', 'btnSensDn0']) $(id).addEventListener('click', () => setSens(opt.sens - 0.1));
for (const id of ['btnSensUp', 'btnSensUp0']) $(id).addEventListener('click', () => setSens(opt.sens + 0.1));
function setAutoBtn() {
  for (const id of ['btnAuto', 'btnAuto2']) $(id).querySelector('b').textContent = opt.autoFire ? '켬' : '끔';
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
  if (player.alive) { updateWaves(dt); updatePickups(dt); }
  updateGrenades(dt);
  dust.update(dt); sparks.update(dt); tracers.update(dt); shells.update(dt);
  flashLight.intensity = flashLight.intensity < 0.05 ? 0 : flashLight.intensity * Math.exp(-dt * 55);
  placeCamera(dt);
  updateViewmodel(dt);
  updateHud(dt);
}
function render() {
  if (cloudMat) cloudMat.uniforms.uTime.value = performance.now() / 1000;
  const us = renderer.domElement.height / (2 * Math.tan(rad(camera.fov) / 2));
  dust.mat.uniforms.uScale.value = us;
  sparks.mat.uniforms.uScale.value = us;
  renderer.clear();
  renderer.render(scene, camera);
  if (game.state !== 'menu') {
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last;
  last = now;
  const dt = clamp(raw / 1000, 0.001, 0.05);
  if (game.state === 'playing' || game.state === 'dying') update(dt);
  else if (game.state === 'menu') {
    menuT += dt;
    const a = menuT * 0.035 + 0.9;
    camera.position.set(Math.sin(a) * 31, 7.5, Math.cos(a) * 25);
    camera.lookAt(4, 2.2, -2);
  }
  render();
  // 프레임 시간이 길어지면 렌더 해상도를 낮춰 프레임을 지킨다
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
}

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pauseGame(); });
$('verTxt').textContent = `YARD ZERO ${VERSION}`;
setSens(opt.sens);
setSoundBtn();
applyQuality();
resize();
showWeapon();
setState('menu');
requestAnimationFrame(frame);

// 자동 검증용 훅
window.__yz = { prog, openSupply, pickSupply, applySupply, SFX, WH, dust, sparks, TYPES, gren, throwGrenade, explode, ORDER, MOCAP, aa, VM, scene, colliders, toggleRot, game, player, enemies, input, vm, W, opt, dbg, renderer, camera, pickups, spawnEnemy, startGame, hurtPlayer, switchWeapon, startReload, applyQuality, NAV };

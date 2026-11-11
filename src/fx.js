// 파티클(먼지·불꽃·혈흔), 탄흔 데칼, 예광탄, 탄피
import * as THREE from 'three';

const VS = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=min(aSize*uScale/max(0.05,-mv.z),256.0); }`;
const FS = `
uniform sampler2D map; varying vec4 vColor;
void main(){ float a=texture2D(map,gl_PointCoord).a*vColor.a; if(a<0.004) discard; gl_FragColor=vec4(vColor.rgb,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, cap, additive, map) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 600 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 0, drag = 0, grow = 0) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0;
    else this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.life[i] = this.max[i] = life;
    this.size[i] = size;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.a0[i] = a;
  }

  update(dt) {
    let n = this.n;
    const { pos, vel, col, size, life, max, grav, drag, grow, a0 } = this;
    for (let i = 0; i < n; ) {
      life[i] -= dt;
      if (life[i] <= 0) {
        n--;
        if (i !== n) {
          const a = i * 3, b = n * 3, c = i * 4, d = n * 4;
          pos[a] = pos[b]; pos[a + 1] = pos[b + 1]; pos[a + 2] = pos[b + 2];
          vel[a] = vel[b]; vel[a + 1] = vel[b + 1]; vel[a + 2] = vel[b + 2];
          col[c] = col[d]; col[c + 1] = col[d + 1]; col[c + 2] = col[d + 2]; col[c + 3] = col[d + 3];
          size[i] = size[n]; life[i] = life[n]; max[i] = max[n]; grav[i] = grav[n]; drag[i] = drag[n]; grow[i] = grow[n]; a0[i] = a0[n];
        }
        continue;
      }
      const i3 = i * 3, k = Math.exp(-drag[i] * dt);
      vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - grav[i] * dt; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.015) {
        pos[i3 + 1] = 0.015;
        vel[i3 + 1] *= -0.3; vel[i3] *= 0.5; vel[i3 + 2] *= 0.5;
      }
      col[i * 4 + 3] = a0[i] * (life[i] / max[i]);
      size[i] += grow[i] * dt;
      i++;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

export class Decals {
  constructor(scene, map, cap = 96) {
    this.cap = cap;
    this.i = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1 }),
      cap
    );
    _m.makeScale(0, 0, 0);
    for (let k = 0; k < cap; k++) this.mesh.setMatrixAt(k, _m);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }
  add(x, y, z, nx, ny, nz, size) {
    _n.set(nx, ny, nz);
    _q.setFromUnitVectors(Z, _n);
    _q2.setFromAxisAngle(Z, Math.random() * 6.283);
    _q.multiply(_q2);
    _p.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    _s.set(size, size, 1);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(this.i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.i = (this.i + 1) % this.cap;
  }
  clear() {
    _m.makeScale(0, 0, 0);
    for (let k = 0; k < this.cap; k++) this.mesh.setMatrixAt(k, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Tracers {
  constructor(scene, n = 18) {
    const g = new THREE.BoxGeometry(0.028, 0.028, 1);
    g.translate(0, 0, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.42), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.list = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(g, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.list.push({ mesh, o: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, s: 0, on: false });
    }
    this.k = 0;
  }
  spawn(ax, ay, az, bx, by, bz) {
    const t = this.list[this.k];
    this.k = (this.k + 1) % this.list.length;
    t.o.set(ax, ay, az);
    t.d.set(bx - ax, by - ay, bz - az);
    t.len = t.d.length();
    if (t.len < 3) { t.on = false; t.mesh.visible = false; return; }
    t.d.multiplyScalar(1 / t.len);
    t.s = 1.5;
    t.on = true;
    t.mesh.quaternion.setFromUnitVectors(Z, t.d);
  }
  update(dt) {
    for (const t of this.list) {
      if (!t.on) continue;
      t.s += 280 * dt;
      const tail = Math.max(0, t.s - 9), head = Math.min(t.s, t.len);
      if (tail >= t.len) { t.on = false; t.mesh.visible = false; continue; }
      t.mesh.visible = true;
      t.mesh.position.copy(t.o).addScaledVector(t.d, tail);
      t.mesh.scale.z = Math.max(0.01, head - tail);
    }
  }
}

export class Shells {
  constructor(scene, cap = 24) {
    const g = new THREE.CylinderGeometry(0.0075, 0.0075, 0.042, 6);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.32 }), cap);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.cap = cap;
    this.k = 0;
    this.s = [];
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.s.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), rx: 0, rz: 0, wx: 0, wz: 0, life: 0, hit: false });
    }
    scene.add(this.mesh);
    this.onBounce = null;
  }
  spawn(p, v) {
    const s = this.s[this.k];
    this.k = (this.k + 1) % this.cap;
    s.p.copy(p);
    s.v.copy(v);
    s.rx = Math.random() * 6; s.rz = Math.random() * 6;
    s.wx = 12 + Math.random() * 20; s.wz = 8 + Math.random() * 16;
    s.life = 3.5;
    s.hit = false;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      const s = this.s[i];
      if (s.life <= 0) continue;
      any = true;
      s.life -= dt;
      if (s.life <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.008) {
        s.p.y = 0.008;
        if (s.v.y < -0.6) {
          s.v.y *= -0.35; s.v.x *= 0.55; s.v.z *= 0.55; s.wx *= 0.5; s.wz *= 0.5;
          if (!s.hit && this.onBounce) this.onBounce(s.p);
          s.hit = true;
        } else { s.v.set(0, 0, 0); s.wx = s.wz = 0; s.rz = 1.5708; }
      }
      s.rx += s.wx * dt; s.rz += s.wz * dt;
      _q.setFromAxisAngle(Z, s.rz);
      _q2.setFromAxisAngle(Y, s.rx);
      _q2.multiply(_q);
      _s.set(1, 1, 1);
      _m.compose(s.p, _q2, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

import * as THREE from 'three';

const OCEAN_COUNT = 5;
const POND_COUNT = 2;
const NEAR = 180;
const JUMP_LEN = 2.2;
const JUMP_UP = 1.05;
const JUMP_DUR = 0.72;

function makeFish() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x8fbfcf,
    roughness: 0.42,
    metalness: 0.08
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x6e9aab,
    roughness: 0.6,
    side: THREE.DoubleSide
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.35 });
  const profile = [
    new THREE.Vector2(0.001, 0.22),
    new THREE.Vector2(0.02, 0.16),
    new THREE.Vector2(0.05, 0.06),
    new THREE.Vector2(0.072, -0.02),
    new THREE.Vector2(0.05, -0.1),
    new THREE.Vector2(0.022, -0.18),
    new THREE.Vector2(0.01, -0.21)
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), bodyMat);
  body.rotation.x = -Math.PI / 2;
  group.add(body);
  const tailGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const tailL = new THREE.Mesh(tailGeo, finMat);
  tailL.position.set(-0.035, 0.012, -0.2);
  tailL.rotation.y = 0.65;
  tailL.rotation.z = 0.35;
  group.add(tailL);
  const tailR = tailL.clone();
  tailR.position.x = 0.035;
  tailR.rotation.y = -0.65;
  tailR.rotation.z = -0.35;
  group.add(tailR);
  const dorsal = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.07), finMat);
  dorsal.position.set(0, 0.07, 0.02);
  dorsal.rotation.y = Math.PI / 2;
  group.add(dorsal);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), eyeMat);
  eye.position.set(0.04, 0.015, 0.12);
  group.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = -0.04;
  group.add(eye2);
  group.visible = false;
  return group;
}

export class Fish {
  constructor(scene, terrain, audio) {
    this.scene = scene;
    this.terrain = terrain;
    this.audio = audio;
    this.time = 0;
    this.schools = [];
    this.rings = [];
    this.pending = [];
    this.jump = null;
    this.mesh = makeFish();
    this.rippleGeo = new THREE.RingGeometry(0.35, 0.55, 20);
    scene.add(this.mesh);

    const coast = terrain.coastRadius(Math.PI / 2);
    const channel = coast + 190;
    for (let i = 0; i < OCEAN_COUNT; i++) {
      const side = (i - (OCEAN_COUNT - 1) / 2) * 28;
      this.schools.push({
        kind: 'ocean',
        x: side,
        z: channel + (i % 2) * 36,
        heading: Math.random() * Math.PI * 2,
        ringIn: 1.5 + Math.random() * 3,
        jumpIn: 8 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
        asleep: false
      });
    }
    const lake = terrain.farLake;
    for (let i = 0; i < POND_COUNT; i++) {
      const a = i * 1.7;
      this.schools.push({
        kind: 'pond',
        x: lake ? lake.x + Math.cos(a) * 8 : 0,
        z: lake ? lake.z + Math.sin(a) * 6 : 0,
        heading: a,
        ringIn: 2 + Math.random() * 3,
        jumpIn: 1e9,
        phase: Math.random() * Math.PI * 2,
        asleep: false
      });
    }
  }

  offHome(x, z) {
    const dist = Math.hypot(x, z);
    const ang = dist > 0.001 ? Math.atan2(z, x) : 0;
    if (dist < this.terrain.coastRadius(ang) + 10) return false;
    return this.terrain.spitInside(x, z) < -6;
  }

  oceanOk(x, z) {
    if (!this.offHome(x, z)) return false;
    const dx = x - this.terrain.farX;
    const dz = z - this.terrain.farZ;
    const dist = Math.hypot(dx, dz);
    const ang = dist > 0.001 ? Math.atan2(dz, dx) : 0;
    if (dist < this.terrain.farCoastRadius(ang) - 2) return false;
    const water = this.terrain.waterAt(x, z);
    return water.kind === 'ocean' && water.depth > 0.35;
  }

  pondOk(x, z) {
    if (!this.terrain.farLake) return false;
    if (this.terrain.farLakeEllipse(x, z) > 0.7) return false;
    const water = this.terrain.waterAt(x, z);
    return water.kind === 'lake' && water.depth > 0.2;
  }

  relocate(school, focus) {
    if (school.kind === 'pond') {
      const lake = this.terrain.farLake;
      if (!lake || Math.hypot(focus.x - lake.x, focus.z - lake.z) > NEAR) {
        school.asleep = true;
        return;
      }
      school.asleep = false;
      if (!this.pondOk(school.x, school.z)) {
        school.x = lake.x;
        school.z = lake.z;
      }
      return;
    }
    const dist = Math.hypot(school.x - focus.x, school.z - focus.z);
    if (dist < NEAR && this.oceanOk(school.x, school.z)) {
      school.asleep = false;
      return;
    }
    for (let n = 0; n < 16; n++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 120;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      if (!this.oceanOk(x, z)) continue;
      school.x = x;
      school.z = z;
      school.asleep = false;
      return;
    }
    school.asleep = true;
  }

  queueRings(x, z, y, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.pending.push({
        x: x + Math.cos(a) * r,
        z: z + Math.sin(a) * r,
        y,
        delay: i * 0.12
      });
    }
  }

  spawnRing(x, z, y) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xd7f2ee,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ripple = new THREE.Mesh(this.rippleGeo, material);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(x, y + 0.05, z);
    ripple.renderOrder = 3;
    ripple.userData.life = 1.15;
    this.scene.add(ripple);
    this.rings.push(ripple);
    if (this.rings.length > 24) {
      const old = this.rings.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  startJump(school) {
    const water = this.terrain.waterAt(school.x, school.z);
    if (water.kind !== 'ocean') return;
    let heading = school.heading;
    let x1 = school.x + Math.sin(heading) * JUMP_LEN;
    let z1 = school.z + Math.cos(heading) * JUMP_LEN;
    if (!this.oceanOk(x1, z1)) {
      heading += Math.PI;
      x1 = school.x + Math.sin(heading) * JUMP_LEN;
      z1 = school.z + Math.cos(heading) * JUMP_LEN;
      if (!this.oceanOk(x1, z1)) return;
      school.heading = heading;
    }
    this.jump = {
      x0: school.x,
      z0: school.z,
      x1,
      z1,
      y: water.surface,
      heading,
      t: 0
    };
    this.mesh.visible = true;
  }

  update(delta, focus) {
    this.time += delta;
    for (let i = 0; i < this.schools.length; i++) {
      const school = this.schools[i];
      this.relocate(school, focus);
      if (school.asleep) continue;
      const step = 0.4 * delta;
      let nx = school.x + Math.sin(school.heading) * step;
      let nz = school.z + Math.cos(school.heading) * step;
      const ok = school.kind === 'pond' ? this.pondOk(nx, nz) : this.oceanOk(nx, nz);
      if (!ok) {
        if (school.kind === 'pond' && this.terrain.farLake) {
          school.heading = Math.atan2(this.terrain.farLake.x - school.x, this.terrain.farLake.z - school.z);
        } else {
          school.heading += 2.2;
        }
        nx = school.x;
        nz = school.z;
      }
      school.x = nx;
      school.z = nz;
      school.heading += Math.sin(this.time * 0.35 + school.phase) * 0.2 * delta;

      school.ringIn -= delta;
      if (school.ringIn <= 0) {
        const water = this.terrain.waterAt(school.x, school.z);
        const count = school.kind === 'pond' ? 2 : 2 + (Math.random() < 0.45 ? 1 : 0);
        const spread = school.kind === 'pond' ? 1.2 : 2.4;
        this.queueRings(school.x, school.z, water.surface, count, spread);
        school.ringIn = school.kind === 'pond' ? 6 + Math.random() * 4 : 4 + Math.random() * 4;
      }
      if (school.kind === 'ocean' && !this.jump) {
        school.jumpIn -= delta;
        if (school.jumpIn <= 0) {
          this.startJump(school);
          school.jumpIn = 16 + Math.random() * 12;
        }
      }
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      item.delay -= delta;
      if (item.delay > 0) continue;
      this.spawnRing(item.x, item.z, item.y);
      this.pending.splice(i, 1);
    }

    if (this.jump) {
      const jump = this.jump;
      jump.t += delta / JUMP_DUR;
      const t = Math.min(1, jump.t);
      const x = jump.x0 + (jump.x1 - jump.x0) * t;
      const z = jump.z0 + (jump.z1 - jump.z0) * t;
      const arc = Math.sin(t * Math.PI) * JUMP_UP;
      this.mesh.position.set(x, jump.y + arc, z);
      this.mesh.rotation.y = jump.heading;
      this.mesh.rotation.x = (t - 0.5) * 1.15;
      if (jump.t >= 1) {
        const water = this.terrain.waterAt(jump.x1, jump.z1);
        const y = water.depth > 0.05 ? water.surface : jump.y;
        this.queueRings(jump.x1, jump.z1, y, 1, 0);
        if (Math.hypot(jump.x1 - focus.x, jump.z1 - focus.z) < 40) this.audio.splash(0.35);
        this.mesh.visible = false;
        this.jump = null;
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ripple = this.rings[i];
      ripple.userData.life -= delta;
      const age = 1 - ripple.userData.life / 1.15;
      ripple.scale.setScalar(1 + Math.max(0, age) * 3.2);
      ripple.material.opacity = Math.max(0, ripple.userData.life / 1.15) * 0.5;
      if (ripple.userData.life <= 0) {
        this.scene.remove(ripple);
        ripple.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }
}

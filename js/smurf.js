import * as THREE from 'three';

const NOTICE = 8;
const FOLLOW_GAP = 2.5;
const WALK_SPEED = 8;
const RUN_SPEED = 16.5;
const WANDER_SPEED = 2.6;

export class Smurf {
  constructor(scene, terrain, mesh) {
    this.scene = scene;
    this.terrain = terrain;
    this.mesh = mesh;
    this.position = new THREE.Vector3();
    this.home = this.findHome();
    this.position.set(this.home.x, 0, this.home.z);
    this.yaw = Math.atan2(this.home.x, this.home.z);
    this.state = 'wander';
    this.goal = null;
    this.stuck = 0;
    this.avoidSide = 1;
    this.pose = 'walk';
    this.phase = 0;
    this.time = 0;
    this.depth = 0;
    this.swing = new THREE.Quaternion();
    this.dropTurn = new THREE.Quaternion();
    this.placeFeet();
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    this.scene.add(this.mesh);
  }

  findHome() {
    const park = this.terrain.beachPark();
    const len = Math.hypot(park.x, park.z) || 1;
    const dx = -park.x / len;
    const dz = -park.z / len;
    for (let dist = 8; dist <= 110; dist += 2) {
      const x = park.x + dx * dist;
      const z = park.z + dz * dist;
      const surface = this.terrain.getSurfaceAt(x, z);
      const water = this.terrain.waterAt(x, z);
      if (surface.kind !== 'forest') continue;
      if (surface.slope >= 0.4) continue;
      if (water.depth >= 0.08) continue;
      if (this.terrain.hitsSolid(x, z, 1.3)) continue;
      return { x, z };
    }
    return { x: park.x + dx * 40, z: park.z + dz * 40 };
  }

  forestSpot(x, z) {
    const surface = this.terrain.getSurfaceAt(x, z);
    if (surface.kind !== 'forest' || surface.canopyDist < 4) return false;
    if (surface.slope >= 0.45) return false;
    const water = this.terrain.waterAt(x, z);
    if (water.depth >= 0.08) return false;
    if (this.terrain.hitsSolid(x, z, 0.45)) return false;
    return true;
  }

  clearOfTrunks(x, z, pad) {
    const near = this.terrain.solidsNear(x, z, pad + 2);
    for (let i = 0; i < near.length; i++) {
      const solid = near[i];
      const dx = x - solid.x;
      const dz = z - solid.z;
      const keep = solid.r + pad;
      if (dx * dx + dz * dz < keep * keep) return false;
    }
    return true;
  }

  routeOpen(x, z) {
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = this.position.x + (x - this.position.x) * t;
      const pz = this.position.z + (z - this.position.z) * t;
      if (!this.clearOfTrunks(px, pz, 1.15)) return false;
    }
    return true;
  }

  pickWander() {
    let fallback = null;
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 16;
      const x = this.position.x + Math.cos(ang) * dist;
      const z = this.position.z + Math.sin(ang) * dist;
      if (!this.forestSpot(x, z)) continue;
      if (!fallback) fallback = { x, z };
      if (this.routeOpen(x, z)) return { x, z };
    }
    if (fallback) return fallback;
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 50;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      if (this.forestSpot(x, z)) return { x, z };
    }
    return { x: this.home.x, z: this.home.z };
  }

  waterPace(depth) {
    if (depth > 0.7) return 0.45;
    if (depth > 0.4) return 0.6;
    if (depth > 0.08) return 0.8;
    return 1;
  }

  placeFeet() {
    const slid = this.terrain.resolveSolid(this.position.x, this.position.z, 0.4);
    this.position.x = slid.x;
    this.position.z = slid.z;
    const water = this.terrain.waterAt(this.position.x, this.position.z);
    this.depth = water.depth;
    if (water.depth > 0.7) this.position.y = water.surface - 0.62;
    else this.position.y = water.bed;
  }

  steer(dx, dz, pad) {
    let vx = dx;
    let vz = dz;
    const len = Math.hypot(vx, vz) || 1;
    vx /= len;
    vz /= len;
    const near = this.terrain.solidsNear(this.position.x, this.position.z, pad + 2.4);
    for (let i = 0; i < near.length; i++) {
      const solid = near[i];
      const ox = this.position.x - solid.x;
      const oz = this.position.z - solid.z;
      const d = Math.hypot(ox, oz) || 0.001;
      const keep = solid.r + pad;
      if (d > keep + 1.1) continue;
      const nx = ox / d;
      const nz = oz / d;
      const into = -(vx * nx + vz * nz);
      if (into <= 0 && d >= keep) continue;
      vx += -nz * this.avoidSide * (0.9 + Math.max(0, into) * 1.4);
      vz += nx * this.avoidSide * (0.9 + Math.max(0, into) * 1.4);
      if (d < keep) {
        const push = (keep - d) / keep;
        vx += nx * (1.6 + push * 2);
        vz += nz * (1.6 + push * 2);
      }
    }
    const out = Math.hypot(vx, vz) || 1;
    return { x: vx / out, z: vz / out };
  }

  overlapsTrunk(x, z, pad) {
    const near = this.terrain.solidsNear(x, z, pad + 2);
    for (let i = 0; i < near.length; i++) {
      const solid = near[i];
      const dx = x - solid.x;
      const dz = z - solid.z;
      const keep = solid.r + pad;
      if (dx * dx + dz * dz < keep * keep) return true;
    }
    return false;
  }

  movesCloser(nx, nz, pad) {
    const near = this.terrain.solidsNear(nx, nz, pad + 2);
    for (let i = 0; i < near.length; i++) {
      const solid = near[i];
      const dx = nx - solid.x;
      const dz = nz - solid.z;
      const d = Math.hypot(dx, dz);
      if (d < solid.r + 0.42) return true;
      const keep = solid.r + pad;
      if (d >= keep) continue;
      const prev = Math.hypot(this.position.x - solid.x, this.position.z - solid.z);
      if (d < prev - 0.001) return true;
    }
    return false;
  }

  easeOut(pad, maxStep) {
    const near = this.terrain.solidsNear(this.position.x, this.position.z, pad + 2);
    let ox = 0;
    let oz = 0;
    for (let i = 0; i < near.length; i++) {
      const solid = near[i];
      const dx = this.position.x - solid.x;
      const dz = this.position.z - solid.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const keep = solid.r + pad;
      if (d >= keep) continue;
      ox += (dx / d) * (keep - d);
      oz += (dz / d) * (keep - d);
    }
    const len = Math.hypot(ox, oz);
    if (len < 0.001) return 0;
    const step = Math.min(len, maxStep);
    this.position.x += (ox / len) * step;
    this.position.z += (oz / len) * step;
    return step;
  }

  advance(dx, dz, limit, speed, delta, pad) {
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return 0;
    const step = Math.min(limit, speed * delta);
    const ox = this.position.x;
    const oz = this.position.z;
    if (this.overlapsTrunk(ox, oz, pad)) {
      const eased = this.easeOut(pad, step);
      if (eased > 0) {
        this.placeFeet();
        this.face(this.position.x - ox, this.position.z - oz, delta);
        return eased;
      }
    }
    const dir = this.steer(dx, dz, pad);
    let nx = ox + dir.x * step;
    let nz = oz + dir.z * step;
    if (this.movesCloser(nx, nz, pad)) {
      nx = ox - dir.z * this.avoidSide * step;
      nz = oz + dir.x * this.avoidSide * step;
      if (this.movesCloser(nx, nz, pad)) {
        this.face(dx, dz, delta);
        return 0;
      }
    }
    this.position.x = nx;
    this.position.z = nz;
    this.placeFeet();
    this.face(this.position.x - ox, this.position.z - oz, delta);
    return Math.hypot(this.position.x - ox, this.position.z - oz);
  }

  face(dx, dz, delta) {
    if (dx * dx + dz * dz < 1e-6) return;
    const target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, delta * 8);
  }

  follow(delta, player) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - FOLLOW_GAP;
    if (gap > 0.12 && dist > 0.001) {
      const run = dist > 5;
      const speed = (run ? RUN_SPEED : WALK_SPEED) * this.waterPace(this.depth);
      this.advance(dx, dz, gap, speed, delta, 0.85);
      this.pose = run ? 'run' : 'walk';
    } else {
      this.placeFeet();
      this.face(dx, dz, delta);
      this.pose = 'idle';
    }
  }

  returnToForest(delta) {
    const here = this.terrain.getSurfaceAt(this.position.x, this.position.z);
    if (here.kind === 'forest' && here.canopyDist > 8) {
      this.state = 'wander';
      this.goal = this.pickWander();
      this.stuck = 0;
      this.wander(delta);
      return;
    }
    if (!this.goal || !this.forestSpot(this.goal.x, this.goal.z)) this.goal = this.pickWander();
    const dx = this.goal.x - this.position.x;
    const dz = this.goal.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const moved = this.advance(dx, dz, dist, RUN_SPEED * this.waterPace(this.depth), delta, 1.2);
    this.stuck = moved < 0.02 ? this.stuck + delta : 0;
    if (this.stuck > 0.45) {
      this.avoidSide *= -1;
      this.goal = this.pickWander();
      this.stuck = 0;
    }
    this.pose = 'run';
  }

  wander(delta) {
    if (!this.goal || !this.forestSpot(this.goal.x, this.goal.z)) this.goal = this.pickWander();
    let dx = this.goal.x - this.position.x;
    let dz = this.goal.z - this.position.z;
    let dist = Math.hypot(dx, dz);
    if (dist < 1.4) {
      this.goal = this.pickWander();
      this.stuck = 0;
      dx = this.goal.x - this.position.x;
      dz = this.goal.z - this.position.z;
      dist = Math.hypot(dx, dz);
    }
    const moved = this.advance(dx, dz, Math.max(dist, 0.01), WANDER_SPEED * this.waterPace(this.depth), delta, 1.25);
    this.stuck = moved < 0.015 ? this.stuck + delta : 0;
    if (this.stuck > 0.45) {
      this.avoidSide *= -1;
      this.goal = this.pickWander();
      this.stuck = 0;
    }
    const surface = this.terrain.getSurfaceAt(this.position.x, this.position.z);
    if (surface.kind !== 'forest') this.goal = this.pickWander();
    this.pose = 'walk';
  }

  applyCycle(delta) {
    const rig = this.mesh.userData.smurfRig;
    if (!rig) return;
    const moving = this.pose !== 'idle';
    const run = this.pose === 'run';
    if (moving) this.phase += delta * (run ? 9.5 : 6.2);
    this.time += delta;

    const s = Math.sin(this.phase);
    const stride = run ? 0.72 : 0.48;
    const kneeAmp = run ? 0.95 : 0.6;
    const armAmp = run ? 0.6 : 0.38;
    const targets = {
      thighR: moving ? s * stride : 0,
      thighL: moving ? -s * stride : 0,
      shinR: moving ? Math.max(0, -s) * kneeAmp : 0,
      shinL: moving ? Math.max(0, s) * kneeAmp : 0,
      armR: moving ? -s * armAmp : 0,
      armL: moving ? s * armAmp : 0,
      foreR: moving ? Math.max(0, -s) * armAmp * 0.45 : 0,
      foreL: moving ? Math.max(0, s) * armAmp * 0.45 : 0,
      chest: Math.sin(this.time * 1.7) * (moving ? 0.03 : 0.06)
    };

    const blend = 1 - Math.exp(-10 * delta);
    for (const key of Object.keys(targets)) {
      const part = rig[key];
      if (!part) continue;
      part.angle = THREE.MathUtils.lerp(part.angle, targets[key], blend);
      this.dropTurn.setFromAxisAngle(part.dropAxis, part.drop);
      this.swing.setFromAxisAngle(part.axis, part.angle);
      part.joint.quaternion.copy(part.rest).multiply(this.dropTurn).multiply(this.swing);
    }
  }

  update(delta, player, onFoot) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const playerDist = Math.hypot(dx, dz);

    if (this.state === 'follow' && !onFoot) {
      this.state = 'return';
      this.goal = this.pickWander();
      this.stuck = 0;
    }
    if (onFoot && this.state !== 'follow' && playerDist < NOTICE) this.state = 'follow';

    if (this.state === 'follow') this.follow(delta, player);
    else if (this.state === 'return') this.returnToForest(delta);
    else this.wander(delta);

    this.placeFeet();
    const bob = this.pose === 'idle' ? 0 : Math.abs(Math.sin(this.phase * 2)) * (this.pose === 'run' ? 0.05 : 0.03);
    this.position.y += bob;
    this.applyCycle(delta);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }
}

import * as THREE from 'three';

const LIFE = 14;
const PRINT_LIFE = 16;

function makeSoleGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.15);
  shape.bezierCurveTo(0.06, -0.14, 0.075, -0.02, 0.055, 0.05);
  shape.bezierCurveTo(0.04, 0.12, 0.015, 0.145, 0, 0.145);
  shape.bezierCurveTo(-0.015, 0.145, -0.04, 0.12, -0.055, 0.05);
  shape.bezierCurveTo(-0.075, -0.02, -0.06, -0.14, 0, -0.15);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function gearPoint(aircraft, localX, localZ) {
  const heading = aircraft.heading;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return {
    x: aircraft.position.x + localX * cos + localZ * sin,
    z: aircraft.position.z - localX * sin + localZ * cos
  };
}

// Hub after pitch and yaw. Roll stays near zero while the tail is down.
function wheelBottom(aircraft, hubY, hubZ, radius) {
  const pitch = aircraft.pitch;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const y = hubY * c - hubZ * s;
  const z = hubY * s + hubZ * c;
  const heading = aircraft.heading;
  return {
    x: aircraft.position.x + z * Math.sin(heading),
    y: aircraft.position.y + y - radius,
    z: aircraft.position.z + z * Math.cos(heading)
  };
}

export class GroundFx {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.marks = [];
    this.prints = [];
    this.puffs = [];
    this.sincePuff = 0;
    this.lastGear = [null, null, null];
    this.puffGeo = new THREE.PlaneGeometry(0.7, 0.7);
    this.soleGeo = makeSoleGeometry();
    this.rippleGeo = new THREE.RingGeometry(0.28, 0.46, 18);
    this.stepCarry = 0;
    this.lastStep = null;
    this.footSide = 1;
    this.ripples = [];
  }

  surfaceTint(kind) {
    if (kind === 'sand') return [0.72, 0.62, 0.42];
    if (kind === 'gravel') return [0.45, 0.42, 0.38];
    if (kind === 'clearing') return [0.28, 0.28, 0.27];
    if (kind === 'river' || kind === 'lake' || kind === 'ocean') return [0.85, 0.92, 0.95];
    if (kind === 'forest') return [0.28, 0.4, 0.16];
    return [0.32, 0.4, 0.18];
  }

  layTrack(index, x, z, half = 0.16) {
    const last = this.lastGear[index];
    if (!last) {
      this.lastGear[index] = { x, z };
      return;
    }
    const dx = x - last.x;
    const dz = z - last.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.35) return;
    if (len > 3) {
      this.lastGear[index] = { x, z };
      return;
    }
    const surface = this.terrain.getSurfaceAt(x, z);
    if (surface.kind === 'ocean' || surface.kind === 'river' || surface.kind === 'lake') {
      this.lastGear[index] = null;
      return;
    }
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const y0 = this.terrain.getHeightAt(last.x, last.z) + 0.42;
    const y1 = surface.height + 0.42;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      last.x + nx, y0, last.z + nz,
      last.x - nx, y0, last.z - nz,
      x - nx, y1, z - nz,
      last.x + nx, y0, last.z + nz,
      x - nx, y1, z - nz,
      x + nx, y1, z + nz
    ], 3));
    const tint = this.surfaceTint(surface.kind);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint[0] * 0.28, tint[1] * 0.28, tint[2] * 0.24),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const mark = new THREE.Mesh(geometry, material);
    mark.renderOrder = 2;
    mark.userData.life = LIFE;
    mark.userData.wheel = index;
    this.scene.add(mark);
    this.marks.push(mark);
    this.lastGear[index] = { x, z };
    if (this.marks.length > 420) {
      const old = this.marks.shift();
      this.scene.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
  }

  stampFoot(player, side) {
    const yaw = player.mesh.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const lateral = 0.11 * side;
    const x = player.position.x + cos * lateral - sin * 0.06;
    const z = player.position.z - sin * lateral - cos * 0.06;
    const surface = this.terrain.getSurfaceAt(x, z);
    const water = this.terrain.waterAt(x, z);
    if (water.depth > 0.05 || surface.kind === 'ocean' || surface.kind === 'river' || surface.kind === 'lake') return;
    const tint = this.surfaceTint(surface.kind);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint[0] * 0.32, tint[1] * 0.3, tint[2] * 0.26),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    const print = new THREE.Mesh(this.soleGeo, material);
    print.position.set(x, surface.height + 0.06, z);
    print.rotation.y = yaw;
    print.renderOrder = 2;
    print.userData.life = PRINT_LIFE;
    this.scene.add(print);
    this.prints.push(print);
    if (this.prints.length > 180) {
      const old = this.prints.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  spawnRipple(x, z, surfaceY) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xd7f2ee,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ripple = new THREE.Mesh(this.rippleGeo, material);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(x, surfaceY + 0.06, z);
    ripple.renderOrder = 3;
    ripple.userData.life = 0.9;
    this.scene.add(ripple);
    this.ripples.push(ripple);
    if (this.ripples.length > 48) {
      const old = this.ripples.shift();
      this.scene.remove(old);
      old.material.dispose();
    }
  }

  updateFeet(player, moving, running) {
    if (!player || !moving || !player.active) {
      this.stepCarry = 0;
      this.lastStep = null;
      return;
    }
    const p = player.position;
    const water = this.terrain.waterAt(p.x, p.z);
    const wet = water.depth > 0.05;
    if (!this.lastStep) {
      this.lastStep = { x: p.x, z: p.z };
      return;
    }
    const len = Math.hypot(p.x - this.lastStep.x, p.z - this.lastStep.z);
    this.lastStep.x = p.x;
    this.lastStep.z = p.z;
    if (len > 2) {
      this.stepCarry = 0;
      return;
    }
    this.stepCarry += len;
    const stride = wet ? 0.62 : (running ? 1.15 : 0.78);
    if (this.stepCarry < stride) return;
    this.stepCarry -= stride;
    if (wet) this.spawnRipple(p.x, p.z, water.surface);
    else this.stampFoot(player, this.footSide);
    this.footSide *= -1;
  }

  spawnPuff(x, z, y, tint, rising) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint[0], tint[1], tint[2]),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const puff = new THREE.Mesh(this.puffGeo, material);
    puff.position.set(x, y, z);
    puff.userData.life = 0.85;
    puff.userData.rise = rising ? 1.4 : 0.6;
    this.scene.add(puff);
    this.puffs.push(puff);
  }

  update(delta, aircraft, onGround, camera) {
    const speed = aircraft.speed;
    const agl = aircraft.position.y - this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);

    if (onGround && speed > 0.8) {
      const left = gearPoint(aircraft, -0.85, 1.55);
      const right = gearPoint(aircraft, 0.85, 1.55);
      this.layTrack(0, left.x, left.z);
      this.layTrack(1, right.x, right.z);
      const tail = wheelBottom(aircraft, 1.122, -3.454, 0.09);
      const tailGround = this.terrain.getHeightAt(tail.x, tail.z);
      if (tail.y - tailGround < 0.35) this.layTrack(2, tail.x, tail.z, 0.07);
      else this.lastGear[2] = null;
    } else {
      this.lastGear[0] = null;
      this.lastGear[1] = null;
      this.lastGear[2] = null;
    }

    const low = agl < 9 && aircraft.throttle > 0.2 && (onGround || speed > 8);
    if (low) {
      this.sincePuff += delta;
      if (this.sincePuff > 0.045) {
        this.sincePuff = 0;
        const nose = gearPoint(aircraft, (Math.random() - 0.5) * 1.4, 2.2);
        const surface = this.terrain.getSurfaceAt(nose.x, nose.z);
        const tint = this.surfaceTint(surface.kind);
        const wet = surface.kind === 'river' || surface.kind === 'lake' || surface.kind === 'ocean';
        this.spawnPuff(
          nose.x,
          nose.z,
          Math.max(surface.height, 0.2) + 0.4,
          tint,
          wet
        );
      }
    }

    for (let i = this.prints.length - 1; i >= 0; i--) {
      const print = this.prints[i];
      print.userData.life -= delta;
      print.material.opacity = Math.max(0, print.userData.life / PRINT_LIFE) * 0.82;
      if (print.userData.life <= 0) {
        this.scene.remove(print);
        print.material.dispose();
        this.prints.splice(i, 1);
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];
      ripple.userData.life -= delta;
      const age = 1 - ripple.userData.life / 0.9;
      ripple.scale.setScalar(1 + age * 2.4);
      ripple.material.opacity = Math.max(0, ripple.userData.life / 0.9) * 0.5;
      if (ripple.userData.life <= 0) {
        this.scene.remove(ripple);
        ripple.material.dispose();
        this.ripples.splice(i, 1);
      }
    }

    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i];
      mark.userData.life -= delta;
      mark.material.opacity = Math.max(0, mark.userData.life / LIFE) * 0.9;
      if (mark.userData.life <= 0) {
        this.scene.remove(mark);
        mark.geometry.dispose();
        mark.material.dispose();
        this.marks.splice(i, 1);
      }
    }

    const heading = aircraft.heading;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.userData.life -= delta;
      puff.position.y += puff.userData.rise * delta;
      puff.position.x -= Math.sin(heading) * delta * 3;
      puff.position.z -= Math.cos(heading) * delta * 3;
      const s = 1 + (0.85 - puff.userData.life) * 1.4;
      puff.scale.setScalar(Math.max(0.2, s));
      puff.material.opacity = Math.max(0, puff.userData.life / 0.85) * 0.4;
      if (camera) puff.lookAt(camera.position);
      if (puff.userData.life <= 0) {
        this.scene.remove(puff);
        puff.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }
}

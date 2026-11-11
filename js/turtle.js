import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const COUNT = 3;
const SPEED = 0.55;
const NEAR = 180;
const MIN_DEPTH = 0.5;
const MAX_DEPTH = 2.2;
const BOB = 0.04;

export class Turtles {
  constructor(scene, terrain, model, swimClip, shellHeight) {
    this.scene = scene;
    this.terrain = terrain;
    this.time = 0;
    this.sink = Math.max(0.05, (shellHeight || 0.35) * 0.22);
    this.turtles = [];

    const park = terrain.beachPark();
    for (let i = 0; i < COUNT; i++) {
      const body = cloneSkeleton(model);
      const root = new THREE.Group();
      root.renderOrder = 3;
      root.add(body);
      body.traverse((child) => {
        if (!child.isMesh) return;
        child.frustumCulled = false;
        child.renderOrder = 3;
      });
      const mixer = new THREE.AnimationMixer(body);
      if (swimClip) {
        const action = mixer.clipAction(swimClip);
        action.play();
        mixer.setTime(Math.random() * Math.max(0.2, swimClip.duration || 1));
      }
      const turtle = {
        mesh: root,
        mixer,
        x: park.x,
        z: park.z,
        heading: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        asleep: true
      };
      const coast = this.terrain.coastRadius(Math.atan2(park.z, park.x));
      const away = Math.atan2(park.z, park.x);
      const spot = this.sampleOffshore(park.x, park.z, i) || {
        x: Math.cos(away) * (coast + 8) + (i - 1) * 6,
        z: Math.sin(away) * (coast + 8),
        heading: Math.atan2(Math.cos(away + Math.PI / 2), Math.sin(away + Math.PI / 2))
      };
      turtle.x = spot.x;
      turtle.z = spot.z;
      turtle.heading = spot.heading;
      turtle.asleep = false;
      this.turtles.push(turtle);
      scene.add(root);
      this.place(turtle);
    }
  }

  shallowOk(x, z) {
    const dx = x - this.terrain.farX;
    const dz = z - this.terrain.farZ;
    const far = Math.hypot(dx, dz);
    const farAng = far > 0.001 ? Math.atan2(dz, dx) : 0;
    if (far < this.terrain.farCoastRadius(farAng) + 2) return false;
    if (this.terrain.spitInside(x, z) > -4) return false;
    const home = Math.hypot(x, z);
    const homeAng = home > 0.001 ? Math.atan2(z, x) : 0;
    if (home < this.terrain.coastRadius(homeAng)) return false;
    const water = this.terrain.waterAt(x, z);
    return water.kind === 'ocean' && water.depth >= MIN_DEPTH && water.depth <= MAX_DEPTH;
  }

  sampleOffshore(x, z, salt) {
    const away = Math.atan2(z, x);
    for (let n = 0; n < 28; n++) {
      const a = away + (n - 8) * 0.09 + salt * 0.35;
      for (let r = 2; r <= 36; r += 2) {
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (this.shallowOk(px, pz)) return { x: px, z: pz, heading: Math.atan2(Math.cos(a), Math.sin(a)) };
      }
    }
    return null;
  }

  relocate(turtle, focus) {
    const dist = Math.hypot(turtle.x - focus.x, turtle.z - focus.z);
    if (dist < NEAR && this.shallowOk(turtle.x, turtle.z)) {
      turtle.asleep = false;
      return;
    }
    for (let n = 0; n < 16; n++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 70;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      if (!this.shallowOk(x, z)) continue;
      turtle.x = x;
      turtle.z = z;
      turtle.heading = Math.atan2(Math.cos(a), Math.sin(a));
      turtle.asleep = false;
      return;
    }
    turtle.asleep = true;
  }

  place(turtle) {
    const water = this.terrain.waterAt(turtle.x, turtle.z);
    const surface = water.depth > 0.05 ? water.surface : 0.05;
    const bob = Math.sin(this.time * 1.4 + turtle.phase) * BOB;
    turtle.mesh.position.set(turtle.x, surface - this.sink + bob, turtle.z);
    turtle.mesh.rotation.y = turtle.heading;
    turtle.mesh.visible = !turtle.asleep;
  }

  update(delta, focus) {
    this.time += delta;
    for (let i = 0; i < this.turtles.length; i++) {
      const turtle = this.turtles[i];
      this.relocate(turtle, focus);
      if (!turtle.asleep) {
        const step = SPEED * delta;
        let nx = turtle.x + Math.sin(turtle.heading) * step;
        let nz = turtle.z + Math.cos(turtle.heading) * step;
        if (!this.shallowOk(nx, nz)) {
          turtle.heading += 2.2;
          nx = turtle.x;
          nz = turtle.z;
        }
        turtle.x = nx;
        turtle.z = nz;
        turtle.heading += Math.sin(this.time * 0.35 + turtle.phase) * 0.25 * delta;
        turtle.mixer.update(delta);
      }
      this.place(turtle);
    }
  }
}

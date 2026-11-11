import * as THREE from 'three';
import { Tent } from './tent.js';

// A low-poly ring of stones, four crossed logs, and three flat flame cones.
// About 0.9 m across and 0.6 m tall, so it sits beside the pilot and the tent.
export function createCampfire() {
  const root = new THREE.Group();

  const ash = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 1 })
  );
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.02;
  ash.receiveShadow = true;
  root.add(ash);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8680, roughness: 0.95 });
  const stoneGeo = new THREE.IcosahedronGeometry(0.1, 0);
  for (let i = 0; i < 8; i++) {
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    const ang = (i / 8) * Math.PI * 2;
    stone.position.set(Math.cos(ang) * 0.36, 0.08, Math.sin(ang) * 0.36);
    stone.scale.set(1, 0.72, 0.85 + (i % 3) * 0.08);
    stone.rotation.y = ang;
    stone.castShadow = true;
    stone.receiveShadow = true;
    root.add(stone);
  }

  const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  const logGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.62, 5);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.1 + (i % 2) * 0.05;
    log.castShadow = true;
    root.add(log);
  }

  const flames = new THREE.Group();
  flames.name = 'flames';
  flames.visible = false;
  const cones = [
    { h: 0.5, r: 0.13, color: 0xff5a1f, y: 0.28 },
    { h: 0.34, r: 0.08, color: 0xff9a1f, y: 0.32 },
    { h: 0.22, r: 0.045, color: 0xffe14a, y: 0.36 }
  ];
  for (let i = 0; i < cones.length; i++) {
    const spec = cones[i];
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(spec.r, spec.h, 4),
      new THREE.MeshBasicMaterial({ color: spec.color })
    );
    flame.position.y = spec.y;
    flame.rotation.y = i * 0.6;
    flames.add(flame);
  }
  root.add(flames);

  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  smoke.visible = false;
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xb7b2ac, transparent: true, opacity: 0.28, depthWrite: false })
    );
    puff.userData.seed = i / 6;
    smoke.add(puff);
  }
  root.add(smoke);

  const light = new THREE.PointLight(0xff7a2a, 0, 8, 2);
  light.name = 'fireLight';
  light.position.y = 0.4;
  root.add(light);
  return root;
}

export class Campfire {
  constructor(scene, terrain) {
    this.placeable = new Tent(scene, terrain, createCampfire(), {
      place: 'Campfire',
      pack: 'Pack campfire',
      aim: 'the campfire'
    });
    this.lit = false;
    this.time = 0;
  }

  get placing() {
    return this.placeable.placing;
  }

  get packed() {
    return this.placeable.state === 'packed';
  }

  near(player) {
    return this.placeable.state === 'placed' && this.placeable.nearPlaced(player);
  }

  startPlacing(player) {
    this.placeable.startPlacing(player);
  }

  cancel() {
    this.placeable.cancel();
  }

  rotate(deltaY) {
    this.placeable.rotate(deltaY);
  }

  aim(player) {
    this.placeable.aim(player);
  }

  nudgeReach(pixels) {
    this.placeable.nudgeReach(pixels);
  }

  confirm() {
    const ok = this.placeable.confirm();
    if (ok) this.setLit(false);
    return ok;
  }

  setLit(on) {
    this.lit = on;
    const mesh = this.placeable.placed;
    if (!mesh) return;
    const flames = mesh.getObjectByName('flames');
    const light = mesh.getObjectByName('fireLight');
    if (flames) flames.visible = on;
    const smoke = mesh.getObjectByName('smoke');
    if (smoke) smoke.visible = on;
    if (light) light.intensity = on ? 12 : 0;
  }

  pack() {
    this.setLit(false);
    this.lit = false;
    this.placeable.pack();
  }

  update(delta) {
    if (!this.lit || !this.placeable.placed) return;
    this.time += delta;
    const flames = this.placeable.placed.getObjectByName('flames');
    if (flames) {
      for (let i = 0; i < flames.children.length; i++) {
        const sway = 0.88 + Math.sin(this.time * (7 + i * 1.7) + i) * 0.14;
        flames.children[i].scale.set(1.08 - sway * 0.15, sway, 1.08 - sway * 0.15);
      }
    }
    const light = this.placeable.placed.getObjectByName('fireLight');
    if (light) light.intensity = 12 + Math.sin(this.time * 11) * 2;
    const smoke = this.placeable.placed.getObjectByName('smoke');
    if (smoke) {
      for (let i = 0; i < smoke.children.length; i++) {
        const puff = smoke.children[i];
        const t = (this.time * 0.18 + puff.userData.seed) % 1;
        const sway = Math.sin(this.time * 0.7 + i);
        puff.position.set(sway * 0.06, 0.42 + t * 1.15, Math.cos(this.time * 0.6 + i) * 0.06);
        puff.scale.setScalar(0.55 + t * 1.5);
        puff.material.opacity = (1 - t) * 0.38;
      }
    }
  }
}

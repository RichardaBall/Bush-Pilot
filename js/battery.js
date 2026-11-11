import * as THREE from 'three';
import { Tent } from './tent.js';

const REACH = 12;

function createBattery() {
  const root = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.55, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), caseMat);
  body.position.y = 0.08;
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  const red = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: 0xb4332a, roughness: 0.45 })
  );
  red.position.set(-0.08, 0.18, 0);
  root.add(red);
  const black = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.45, metalness: 0.4 })
  );
  black.position.set(0.08, 0.18, 0);
  root.add(black);
  return root;
}

export class CarBattery {
  constructor(scene, terrain) {
    this.placeable = new Tent(scene, terrain, createBattery(), {
      place: 'Car battery',
      pack: 'Pack car battery',
      aim: 'the car battery'
    });
    this.charge = 100;
  }

  get placing() {
    return this.placeable.placing;
  }

  get packed() {
    return this.placeable.state === 'packed';
  }

  get placed() {
    return this.placeable.state === 'placed' && this.placeable.placed;
  }

  near(player) {
    return this.placed && this.placeable.nearPlaced(player);
  }

  nearPoint(x, z) {
    if (!this.placed) return false;
    const spot = this.placeable.placed.position;
    const dx = spot.x - x;
    const dz = spot.z - z;
    return dx * dx + dz * dz <= REACH * REACH;
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
    return this.placeable.confirm();
  }

  pack() {
    this.placeable.pack();
  }

  draw(amount) {
    const used = Math.min(Math.max(0, amount), this.charge);
    this.charge -= used;
    return used;
  }

  socket(target) {
    const spot = this.placeable.placed.position;
    target.set(spot.x, spot.y + 0.2, spot.z);
    return target;
  }
}

export function batteryCovers(list, x, z) {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].placed && list[i].nearPoint(x, z)) return true;
  }
  return false;
}

export function batteryBeside(list, position, reach) {
  if (!list || !position) return null;
  let best = null;
  let bestD = reach;
  for (let i = 0; i < list.length; i++) {
    const cell = list[i];
    if (!cell.placed || !cell.placeable.placed) continue;
    const spot = cell.placeable.placed.position;
    const dist = Math.hypot(position.x - spot.x, position.z - spot.z);
    if (dist <= bestD) {
      best = cell;
      bestD = dist;
    }
  }
  return best;
}

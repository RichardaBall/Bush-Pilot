import * as THREE from 'three';
import { Tent } from './tent.js';

const FILL_PER_SECOND = 3;
const DRINK = 20;
const WATER_BASE = 0.05;
const WATER_TOP = 0.56;
const WATER_HEIGHT = WATER_TOP - WATER_BASE;

function createBarrel() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e4b30, roughness: 0.86, side: THREE.DoubleSide });
  const band = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.4, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.58, 14, 1, true), wood);
  body.position.y = 0.32;
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 14),
    new THREE.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  root.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 16), band);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.6;
  rim.castShadow = true;
  root.add(rim);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.016, 6, 16), band);
  hoop.rotation.x = Math.PI / 2;
  hoop.position.y = 0.22;
  hoop.castShadow = true;
  root.add(hoop);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, WATER_HEIGHT, 14),
    new THREE.MeshStandardMaterial({ color: 0x3a8ea8, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.82 })
  );
  water.name = 'water';
  water.scale.y = 0.02;
  water.position.y = 0.08;
  water.visible = false;
  water.castShadow = false;
  root.add(water);
  return root;
}

export class WaterBarrel {
  constructor(scene, terrain) {
    this.placeable = new Tent(scene, terrain, createBarrel(), {
      place: 'Water barrel',
      pack: 'Pack water barrel',
      aim: 'the water barrel'
    });
    this.water = 0;
    this._disc = null;
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
    if (!this.placeable.confirm()) return false;
    this.water = 0;
    this._disc = this.placeable.placed.getObjectByName('water');
    this.syncDisc();
    return true;
  }

  pack() {
    this.water = 0;
    this._disc = null;
    this.placeable.pack();
  }

  takeDrink() {
    if (this.placeable.state !== 'placed' || this.water < DRINK) return false;
    this.water -= DRINK;
    this.syncDisc();
    return true;
  }

  update(delta, rain) {
    if (this.placeable.state !== 'placed') return;
    if (rain > 0.2) this.water = Math.min(100, this.water + delta * FILL_PER_SECOND);
    this.syncDisc();
  }

  syncDisc() {
    if (!this._disc) return;
    const level = this.water / 100;
    this._disc.visible = level >= 0.01;
    const scale = Math.max(0.02, level);
    this._disc.scale.y = scale;
    this._disc.position.y = WATER_BASE + (WATER_HEIGHT * scale) / 2;
  }
}

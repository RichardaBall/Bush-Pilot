import * as THREE from 'three';
import { Tent } from './tent.js';

const PLANE_REACH = 12;
const PLUG_REACH = 3.5;

function createPanel() {
  const root = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.06, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x16324a, roughness: 0.35, metalness: 0.45 })
  );
  const cell = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.02, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x2f6fbf, roughness: 0.25, metalness: 0.2, emissive: 0x102040, emissiveIntensity: 0.4 })
  );
  cell.position.y = 0.04;
  panel.add(cell);
  panel.rotation.x = -0.35;
  panel.position.y = 0.28;
  root.add(panel);
  return root;
}

export class SolarPanel {
  constructor(scene, terrain, aircraft) {
    this.scene = scene;
    this.aircraft = aircraft;
    this.placeable = new Tent(scene, terrain, createPanel(), {
      place: 'Solar panel',
      pack: 'Pack solar panel',
      aim: 'the solar panel'
    });
    this.lead = 'none';
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._socket = new THREE.Vector3();
    this.cable = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85, metalness: 0.05 })
    );
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.cable.castShadow = true;
    scene.add(this.cable);
  }

  get placing() {
    return this.placeable.placing;
  }

  get packed() {
    return this.placeable.state === 'packed';
  }

  get cabling() {
    return this.lead === 'cabling';
  }

  get connected() {
    return this.lead === 'connected';
  }

  get blocksPower() {
    return this.placeable.state !== 'packed';
  }

  near(player) {
    return this.placeable.state === 'placed' && this.placeable.nearPlaced(player);
  }

  spot() {
    return this.placeable.placed ? this.placeable.placed.position : null;
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

  nudgeReach(pixels) {
    this.placeable.nudgeReach(pixels);
  }

  aim(player) {
    this.placeable.aim(player);
    if (!this.placeable.valid) return;
    const parked = !this.aircraft.airborne && this.aircraft.speed < 0.8;
    if (!parked) {
      this.placeable.valid = false;
      this.placeable.reason = 'The aircraft has to be parked.';
      this.placeable.tint(false);
      return;
    }
    const ghost = this.placeable.ghost.position;
    const dx = ghost.x - this.aircraft.position.x;
    const dz = ghost.z - this.aircraft.position.z;
    if (dx * dx + dz * dz > PLANE_REACH * PLANE_REACH) {
      this.placeable.valid = false;
      this.placeable.reason = 'Too far from the aircraft.';
      this.placeable.tint(false);
    }
  }

  confirm() {
    return this.placeable.confirm();
  }

  startCable() {
    if (this.placeable.state !== 'placed' || this.lead !== 'none') return;
    this.lead = 'cabling';
  }

  cancelCable() {
    if (this.lead !== 'cabling') return;
    this.lead = 'none';
    this.cable.visible = false;
  }

  tryPlug(player) {
    if (this.lead !== 'cabling') return false;
    if (player.position.distanceTo(this.aircraft.position) > PLUG_REACH) return false;
    this.lead = 'connected';
    return true;
  }

  unplug() {
    if (this.lead !== 'connected') return;
    this.lead = 'none';
    this.cable.visible = false;
  }

  pack() {
    this.lead = 'none';
    this.cable.visible = false;
    this.placeable.pack();
  }

  inPlugRange(player) {
    return player.position.distanceTo(this.aircraft.position) <= PLUG_REACH;
  }

  socket() {
    const side = this.aircraft.heading + Math.PI / 2;
    this._socket.set(
      this.aircraft.position.x + Math.sin(side) * 0.5,
      this.aircraft.position.y + 0.9,
      this.aircraft.position.z + Math.cos(side) * 0.5
    );
    return this._socket;
  }

  update(player) {
    if (this.lead === 'none' || !this.placeable.placed) {
      this.cable.visible = false;
      return;
    }
    const mesh = this.placeable.placed;
    if (this.lead === 'connected') this.socket();
    else {
      const yaw = player.mesh.rotation.y;
      this._socket.set(
        player.position.x + Math.sin(yaw) * 0.7,
        player.position.y + 0.95,
        player.position.z + Math.cos(yaw) * 0.7
      );
    }
    const dx = this._socket.x - mesh.position.x;
    const dz = this._socket.z - mesh.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const half = Math.min(this.placeable.half, 0.7);
    this._from.set(
      mesh.position.x + (dx / len) * half,
      mesh.position.y + 0.22,
      mesh.position.z + (dz / len) * half
    );
    this._to.copy(this._socket);
    this.layCable(this._from, this._to);
  }

  layCable(from, to) {
    if (from.distanceTo(to) < 0.05) to.y += 0.05;
    this._mid.lerpVectors(from, to, 0.5);
    const dist = from.distanceTo(to);
    this._mid.y -= Math.min(0.85, Math.max(0.12, dist * 0.08));
    const curve = new THREE.CatmullRomCurve3([from, this._mid, to]);
    const next = new THREE.TubeGeometry(curve, 12, 0.018, 5, false);
    this.cable.geometry.dispose();
    this.cable.geometry = next;
    this.cable.visible = true;
  }
}

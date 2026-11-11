import * as THREE from 'three';
import { Tent } from './tent.js';
import { WIND_CALM } from './weather.js';
import { batteryBeside, batteryCovers } from './battery.js';

const REACH = 12;
const PLUG_REACH = 3.5;

function createTurbine() {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc5ccd4, roughness: 0.4, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.45, metalness: 0.6 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.35, metalness: 0.25 });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.55, 8), metal);
  mast.position.y = 0.78;
  root.add(mast);

  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.42), dark);
  nacelle.position.set(0, 1.62, 0.06);
  root.add(nacelle);

  const hub = new THREE.Group();
  hub.name = 'blades';
  hub.position.set(0, 1.62, 0.28);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.02), bladeMat);
    blade.position.y = 0.4;
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI * 2) / 3;
    arm.add(blade);
    hub.add(arm);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
  hub.add(nose);
  root.add(hub);
  return root;
}

export class WindTurbine {
  constructor(scene, terrain, aircraft, tent, tentPower) {
    this.scene = scene;
    this.aircraft = aircraft;
    this.tent = tent;
    this.tentPower = tentPower;
    this.placeable = new Tent(scene, terrain, createTurbine(), {
      place: 'Wind turbine',
      pack: 'Pack wind turbine',
      aim: 'the wind turbine'
    });
    this.lead = 'none';
    this.target = null;
    this.battery = null;
    this.batteries = null;
    this._blades = null;
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
    return false;
  }

  parked() {
    return !this.aircraft.airborne && this.aircraft.speed < 0.8;
  }

  near(player) {
    return this.placeable.state === 'placed' && this.placeable.nearPlaced(player);
  }

  spot() {
    return this.placeable.placed ? this.placeable.placed.position : null;
  }

  within(x, z, ox, oz) {
    const dx = x - ox;
    const dz = z - oz;
    return dx * dx + dz * dz <= REACH * REACH;
  }

  planeInReachAt(x, z) {
    return this.parked() && this.within(x, z, this.aircraft.position.x, this.aircraft.position.z);
  }

  tentInReachAt(x, z) {
    if (!this.tent || this.tent.state !== 'placed' || !this.tent.placed) return false;
    const spot = this.tent.placed.position;
    return this.within(x, z, spot.x, spot.z);
  }

  batteryInReachAt(x, z) {
    return batteryCovers(this.batteries, x, z);
  }

  planeInReach() {
    const spot = this.spot();
    return !!spot && this.planeInReachAt(spot.x, spot.z);
  }

  tentInReach() {
    const spot = this.spot();
    return !!spot && this.tentInReachAt(spot.x, spot.z);
  }

  chargesPlane() {
    if (this.lead !== 'connected' || !this.parked()) return false;
    if (this.target === 'plane') return true;
    return this.target === 'tent' && !!(this.tentPower && this.tentPower.connected && this.tentPower.target === 'plane');
  }

  chargesBattery() {
    if (this.lead !== 'connected') return false;
    if (this.target === 'battery') return !!(this.battery && this.battery.placed);
    return this.target === 'tent' && !!(this.tentPower && this.tentPower.connected && this.tentPower.target === 'battery' && this.tentPower.battery && this.tentPower.battery.placed);
  }

  fedCell() {
    if (this.target === 'battery') return this.battery;
    if (this.target === 'tent' && this.tentPower && this.tentPower.target === 'battery') return this.tentPower.battery;
    return null;
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
    const ghost = this.placeable.ghost.position;
    if (this.planeInReachAt(ghost.x, ghost.z) || this.tentInReachAt(ghost.x, ghost.z) || this.batteryInReachAt(ghost.x, ghost.z)) return;
    this.placeable.valid = false;
    const dx = ghost.x - this.aircraft.position.x;
    const dz = ghost.z - this.aircraft.position.z;
    const nearPlane = dx * dx + dz * dz <= REACH * REACH;
    this.placeable.reason = nearPlane && !this.parked()
      ? 'The aircraft has to be parked.'
      : 'Too far from the tent, the battery, or the aircraft.';
    this.placeable.tint(false);
  }

  confirm() {
    if (!this.placeable.confirm()) return false;
    this._blades = this.placeable.placed.getObjectByName('blades');
    return true;
  }

  startCable() {
    if (this.placeable.state !== 'placed' || this.lead !== 'none') return false;
    this.target = null;
    this.battery = null;
    this.lead = 'cabling';
    return true;
  }

  cancelCable() {
    if (this.lead !== 'cabling') return;
    this.drop();
  }

  tryPlug(player) {
    if (this.lead !== 'cabling') return false;
    if (this.target === 'battery') {
      const cell = batteryBeside(this.batteries, player.position, PLUG_REACH);
      if (!cell) return false;
      this.battery = cell;
    } else if (!this.inPlugRange(player)) {
      return false;
    }
    this.lead = 'connected';
    return true;
  }

  unplug() {
    if (this.lead !== 'connected') return;
    this.drop();
  }

  dropIfTent() {
    if (this.target === 'tent') this.drop();
  }

  drop() {
    this.lead = 'none';
    this.target = null;
    this.battery = null;
    this.cable.visible = false;
    if (this.tentPower) this.tentPower.fed = false;
  }

  pack() {
    this.drop();
    this._blades = null;
    this.placeable.pack();
  }

  inPlugRange(player) {
    if (this.target === 'tent') {
      if (!this.tent || !this.tent.placed) return false;
      return player.position.distanceTo(this.tent.placed.position) <= PLUG_REACH;
    }
    if (this.target === 'battery') {
      if (this.lead === 'connected') {
        return !!(this.battery && this.battery.placed && player.position.distanceTo(this.battery.placeable.placed.position) <= PLUG_REACH);
      }
      return !!batteryBeside(this.batteries, player.position, PLUG_REACH);
    }
    return player.position.distanceTo(this.aircraft.position) <= PLUG_REACH;
  }

  planeSocket() {
    const side = this.aircraft.heading + Math.PI / 2;
    this._socket.set(
      this.aircraft.position.x + Math.sin(side) * 0.5,
      this.aircraft.position.y + 0.9,
      this.aircraft.position.z + Math.cos(side) * 0.5
    );
    return this._socket;
  }

  tentSocket() {
    const mesh = this.tent.placed;
    const from = this.placeable.placed.position;
    const dx = mesh.position.x - from.x;
    const dz = mesh.position.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const half = Math.min(this.tent.half || 0.8, 1.1);
    this._socket.set(
      mesh.position.x - (dx / len) * half,
      mesh.position.y + 0.35,
      mesh.position.z - (dz / len) * half
    );
    return this._socket;
  }

  update(delta, player, rate, wind) {
    const blow = wind >= WIND_CALM ? wind : 0;
    if (this._blades && blow > 0) this._blades.rotation.z += delta * blow * (6 + rate * 70);

    if (this.lead !== 'none' && this.target === 'plane' && !this.parked()) this.drop();
    if (this.lead !== 'none' && this.target === 'tent' && (!this.tent || this.tent.state !== 'placed')) this.drop();
    if (this.lead === 'connected' && this.target === 'battery' && !(this.battery && this.battery.placed)) this.drop();

    if (this.tentPower) {
      this.tentPower.fed = blow > 0 && this.lead === 'connected' && this.target === 'tent' && !!this.placeable.placed;
    }

    if (this.lead === 'none' || !this.placeable.placed) {
      this.cable.visible = false;
      return;
    }
    const mesh = this.placeable.placed;
    if (this.lead === 'connected') {
      if (this.target === 'tent') this.tentSocket();
      else if (this.target === 'battery' && this.battery) this.battery.socket(this._socket);
      else this.planeSocket();
    } else {
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
    this._from.set(
      mesh.position.x + (dx / len) * 0.2,
      mesh.position.y + 1.55,
      mesh.position.z + (dz / len) * 0.2
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

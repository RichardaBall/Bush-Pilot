import * as THREE from 'three';

const PLANE_REACH = 12;
const PLUG_REACH = 3.5;
const DRAIN = 0.035;

export class TentPower {
  constructor(scene, tent, aircraft) {
    this.scene = scene;
    this.tent = tent;
    this.aircraft = aircraft;
    this.lead = 'none';
    this.fed = false;
    this.reason = '';
    this._from = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._socket = new THREE.Vector3();

    this.light = new THREE.PointLight(0xd7e8ff, 0, 7, 2);
    this.light.castShadow = false;
    scene.add(this.light);

    this.bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.015, 0.045),
      new THREE.MeshStandardMaterial({
        color: 0xd7e8ff,
        emissive: 0xd7e8ff,
        emissiveIntensity: 0,
        roughness: 0.3,
        metalness: 0.05
      })
    );
    this.bar.visible = false;
    this.bar.frustumCulled = false;
    scene.add(this.bar);

    this.cable = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85, metalness: 0.05 })
    );
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.cable.castShadow = true;
    scene.add(this.cable);
  }

  get cabling() {
    return this.lead === 'cabling';
  }

  get connected() {
    return this.lead === 'connected';
  }

  parked() {
    return !this.aircraft.airborne && this.aircraft.speed < 0.8;
  }

  placed() {
    return this.tent && this.tent.state === 'placed' && this.tent.placed;
  }

  inPlugRange(player) {
    return player.position.distanceTo(this.aircraft.position) <= PLUG_REACH;
  }

  withinReach() {
    if (!this.placed() || !this.parked()) return false;
    const spot = this.tent.placed.position;
    const dx = spot.x - this.aircraft.position.x;
    const dz = spot.z - this.aircraft.position.z;
    return dx * dx + dz * dz <= PLANE_REACH * PLANE_REACH;
  }

  startCable() {
    if (!this.placed() || this.lead !== 'none') return false;
    if (!this.parked()) {
      this.reason = 'The aircraft has to be parked.';
      return false;
    }
    if (!this.withinReach()) {
      this.reason = 'Too far from the aircraft.';
      return false;
    }
    this.reason = '';
    this.lead = 'cabling';
    return true;
  }

  cancelCable() {
    if (this.lead !== 'cabling') return;
    this.lead = 'none';
    this.cable.visible = false;
  }

  tryPlug(player) {
    if (this.lead !== 'cabling') return false;
    if (!this.inPlugRange(player)) return false;
    this.lead = 'connected';
    this.reason = '';
    return true;
  }

  unplug() {
    if (this.lead !== 'connected') return;
    this.lead = 'none';
    this.cable.visible = false;
    this.dark();
  }

  drop() {
    this.lead = 'none';
    this.cable.visible = false;
    this.dark();
  }

  dark() {
    this.light.intensity = 0;
    this.bar.visible = false;
    this.bar.material.emissiveIntensity = 0;
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

  update(delta, player, daylight) {
    if (!this.placed()) {
      this.drop();
      this.reason = '';
      return;
    }
    if (this.reason && (this.lead !== 'none' || this.withinReach())) this.reason = '';
    if (this.lead !== 'none' && !this.parked()) this.drop();
    if (this.lead === 'none') {
      this.cable.visible = false;
    } else {
      if (this.lead === 'connected') this.socket();
      else if (player) {
        const yaw = player.mesh.rotation.y;
        this._socket.set(
          player.position.x + Math.sin(yaw) * 0.7,
          player.position.y + 0.95,
          player.position.z + Math.cos(yaw) * 0.7
        );
      }
      this.layFromTent(this._socket);
    }

    const night = daylight < 0.2;
    const fromPlane = this.lead === 'connected' && this.parked() && night && this.aircraft.charge > 0;
    const fromWind = this.fed && night;
    if (!fromPlane && !fromWind) {
      this.dark();
      return;
    }
    const box = new THREE.Box3().setFromObject(this.tent.placed);
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.light.position.set(center.x, THREE.MathUtils.lerp(box.min.y, box.max.y, 0.58), center.z);
    this.bar.position.set(center.x, box.max.y - Math.min(0.12, (box.max.y - box.min.y) * 0.12), center.z);
    this.bar.rotation.y = this.tent.placed.rotation.y;
    this.bar.visible = true;
    this.bar.material.emissiveIntensity = 2.2;
    this.light.intensity = 6;
    if (fromPlane && !this.fed) this.aircraft.charge = Math.max(0, this.aircraft.charge - DRAIN * delta);
  }

  layFromTent(to) {
    const mesh = this.tent.placed;
    const dx = to.x - mesh.position.x;
    const dz = to.z - mesh.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const half = Math.min(this.tent.half || 0.8, 1.1);
    this._from.set(
      mesh.position.x + (dx / len) * half,
      mesh.position.y + 0.35,
      mesh.position.z + (dz / len) * half
    );
    this._to.copy(to);
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

import * as THREE from 'three';

const PLUG_REACH = 3.5;
const DRAIN = 0.28;
const LAMP_GAIN = 8;
const PLANE_COST = 1.2;

function findHand(root) {
  let hand = null;
  root.traverse((obj) => {
    if (hand || !obj.isBone) return;
    const name = obj.name.toLowerCase();
    if (!name.endsWith('righthand')) return;
    hand = obj;
  });
  if (hand) return hand;
  if (root.userData && root.userData.rightArmGroup) return root.userData.rightArmGroup;
  return root;
}

export class Lamp {
  constructor(scene, player, aircraft) {
    this.scene = scene;
    this.player = player;
    this.aircraft = aircraft;
    this.charge = 100;
    this.lit = false;
    this.charging = false;
    this._socket = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this._mid = new THREE.Vector3();

    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.034, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.65 })
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8),
      new THREE.MeshStandardMaterial({
        color: 0xd7e8ff,
        emissive: 0xd7e8ff,
        emissiveIntensity: 0.05,
        roughness: 0.25,
        metalness: 0.05
      })
    );
    lens.position.y = 0.1;
    body.position.y = 0.02;
    this.mesh.add(body);
    this.mesh.add(lens);
    this.lensMat = lens.material;
    this.mesh.frustumCulled = false;

    this.light = new THREE.PointLight(0xe8f4ff, 0, 10, 2);
    this.light.castShadow = false;
    scene.add(this.light);

    this.cable = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85, metalness: 0.05 })
    );
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.cable.castShadow = true;
    scene.add(this.cable);

    this.attach(player);
  }

  attach(player) {
    const hand = findHand(player.mesh);
    this.hand = hand;
    player.mesh.updateMatrixWorld(true);
    const worldScale = new THREE.Vector3();
    hand.getWorldScale(worldScale);
    const unit = Math.max(worldScale.x, worldScale.y, worldScale.z, 0.0001);
    this.mesh.scale.setScalar(1 / unit);
    if (hand.isBone) {
      this.mesh.position.set(0.02, 0.1, 0);
    } else if (player.mesh.userData && hand === player.mesh.userData.rightArmGroup) {
      this.mesh.position.set(0, -0.82, 0.08);
      this.mesh.rotation.x = 0.5;
    } else {
      this.mesh.position.set(-0.28, 1.05, 0.2);
    }
    hand.add(this.mesh);
  }

  parked() {
    return !this.aircraft.airborne && this.aircraft.speed < 0.8;
  }

  inPlugRange() {
    return this.player.position.distanceTo(this.aircraft.position) <= PLUG_REACH;
  }

  canCharge() {
    return this.charge < 99.5 && this.parked() && this.inPlugRange() && this.aircraft.charge > 0;
  }

  toggle() {
    if (this.charging) return false;
    if (this.lit) {
      this.lit = false;
      return true;
    }
    if (this.charge <= 0) return false;
    this.lit = true;
    return true;
  }

  douse() {
    this.lit = false;
  }

  startCharge() {
    if (!this.canCharge()) return false;
    this.charging = true;
    this.lit = false;
    return true;
  }

  stopCharge() {
    this.charging = false;
    this.cable.visible = false;
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

  handPoint() {
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(this._hand);
    return this._hand;
  }

  update(delta, onFoot) {
    if (!onFoot) {
      this.douse();
      this.stopCharge();
    } else if (this.charging) {
      const parked = this.parked() && this.inPlugRange();
      if (!parked || this.aircraft.charge <= 0 || this.charge >= 100) {
        this.stopCharge();
      } else {
        const gain = Math.min(LAMP_GAIN * delta, 100 - this.charge);
        const cost = gain * (PLANE_COST / LAMP_GAIN);
        const used = Math.min(cost, this.aircraft.charge);
        const got = cost > 0 ? gain * (used / cost) : 0;
        this.charge = Math.min(100, this.charge + got);
        this.aircraft.charge = Math.max(0, this.aircraft.charge - used);
        if (this.charge >= 99.5 || this.aircraft.charge <= 0) this.stopCharge();
        else this.layCable(this.socket(), this.handPoint());
      }
    } else {
      this.cable.visible = false;
    }

    if (this.lit && onFoot) {
      this.charge = Math.max(0, this.charge - DRAIN * delta);
      if (this.charge <= 0) this.douse();
    }

    this.light.intensity = this.lit ? 8 : 0;
    this.lensMat.emissiveIntensity = this.lit ? 1.8 : 0.05;
    this.light.position.copy(this.handPoint());
  }

  layCable(from, to) {
    const end = to.clone();
    if (from.distanceTo(end) < 0.05) end.y += 0.05;
    this._mid.lerpVectors(from, end, 0.5);
    const dist = from.distanceTo(end);
    this._mid.y -= Math.min(0.45, Math.max(0.08, dist * 0.12));
    const curve = new THREE.CatmullRomCurve3([from.clone(), this._mid.clone(), end]);
    const next = new THREE.TubeGeometry(curve, 8, 0.016, 5, false);
    this.cable.geometry.dispose();
    this.cable.geometry = next;
    this.cable.visible = true;
  }
}

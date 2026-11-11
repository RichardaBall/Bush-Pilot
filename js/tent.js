import * as THREE from 'three';

const REACH_MIN = 1.2;
const REACH_MAX = 8;
const BODY = 0.45;

function ghostFrom(template) {
    const clone = template.clone(true);
    clone.traverse((child) => {
      if (child.isLight) child.intensity = 0;
      if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      copy.transparent = true;
      copy.opacity = 0.48;
      copy.depthWrite = false;
      return copy;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
    child.castShadow = false;
    child.receiveShadow = false;
  });
  return clone;
}

export class Tent {
  constructor(scene, terrain, template, labels = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.template = template;
    this.placeLabel = labels.place || 'Tent';
    this.packLabel = labels.pack || 'Pack tent';
    this.aimLabel = labels.aim || 'the tent';
    this.state = 'packed';
    this.yaw = 0;
    this.valid = false;
    this.reason = '';
    this.ghost = ghostFrom(template);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.placed = null;
    this._ok = new THREE.Color(0x7dcea0);
    this._bad = new THREE.Color(0xe07a72);
    template.updateMatrixWorld(true);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(template).getSize(size);
    this.half = Math.max(size.x, size.z) * 0.5;
  }

  get placing() {
    return this.state === 'placing';
  }

  menuLine(player) {
    if (this.state === 'packed') return this.placeLabel;
    if (this.state === 'placed' && this.nearPlaced(player)) return this.packLabel;
    return '';
  }

  nearPlaced(player) {
    if (!this.placed) return false;
    const dx = player.position.x - this.placed.position.x;
    const dz = player.position.z - this.placed.position.z;
    const reach = this.half + 1.4;
    return dx * dx + dz * dz < reach * reach;
  }

  startPlacing(player) {
    if (this.state !== 'packed') return;
    this.yaw = player.mesh.rotation.y;
    this.reach = 4;
    this.state = 'placing';
  }

  cancel() {
    if (this.state !== 'placing') return;
    this.state = 'packed';
    this.ghost.visible = false;
  }

  rotate(deltaY) {
    if (this.state !== 'placing') return;
    this.yaw -= Math.sign(deltaY) * 0.12;
  }

  nudgeReach(pixels) {
    if (this.state !== 'placing') return;
    this.reach = THREE.MathUtils.clamp(this.reach - pixels * 0.02, REACH_MIN, REACH_MAX);
  }

  confirm() {
    if (this.state !== 'placing' || !this.valid) return false;
    const mesh = this.template.clone(true);
    mesh.position.copy(this.ghost.position);
    mesh.rotation.y = this.yaw;
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    this.scene.add(mesh);
    this.placed = mesh;
    this.ghost.visible = false;
    this.state = 'placed';
    return true;
  }

  pack() {
    if (this.state !== 'placed' || !this.placed) return;
    this.scene.remove(this.placed);
    this.placed = null;
    this.state = 'packed';
  }

  aim(player) {
    if (this.state !== 'placing') return;
    const yaw = player.mesh.rotation.y;
    const x = player.position.x + Math.sin(yaw) * this.reach;
    const z = player.position.z + Math.cos(yaw) * this.reach;
    const y = this.terrain.getHeightAt(x, z);
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = this.yaw;
    this.ghost.visible = true;
    this.reason = this.spotReason(x, z);
    this.valid = this.reason === '';
    this.tint(this.valid);
  }

  spotReason(x, z) {
    const pad = Math.max(0.4, this.half * 0.65);
    const offsets = [
      [0, 0],
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad]
    ];
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    for (let i = 0; i < offsets.length; i++) {
      const lx = offsets[i][0];
      const lz = offsets[i][1];
      const px = x + lx * cos + lz * sin;
      const pz = z - lx * sin + lz * cos;
      const reason = this.pointReason(px, pz);
      if (reason) return reason;
    }
    return '';
  }

  pointReason(x, z) {
    const water = this.terrain.waterAt(x, z);
    if (water.depth > 0.05 || this.terrain.getHeightAt(x, z) < 0) return 'Too wet.';
    if (this.terrain.slopeAt(x, z) > 0.55) return 'Too steep.';
    if (this.terrain.hitsSolid(x, z, BODY)) return 'Blocked.';
    return '';
  }

  tint(ok) {
    const tone = ok ? this._ok : this._bad;
    this.ghost.traverse((child) => {
      if (!child.isMesh) return;
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < list.length; i++) {
        const mat = list[i];
        if (!mat.color) continue;
        if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
        mat.color.copy(mat.userData.baseColor).lerp(tone, 0.72);
      }
    });
  }
}

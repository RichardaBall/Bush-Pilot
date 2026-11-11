import * as THREE from 'three';
import { Tent } from './tent.js';

export function cloneFish(template) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) child.material = child.material.map((mat) => (mat ? mat.clone() : mat));
    else if (child.material) child.material = child.material.clone();
    child.castShadow = true;
    child.frustumCulled = false;
  });
  return clone;
}

export function disposeFish(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry) child.geometry.dispose();
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of list) {
      if (mat) mat.dispose();
    }
  });
}

function createRod(templates) {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.9 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.35, 6), wood);
  stick.position.set(0, 0.58, 0.18);
  stick.rotation.x = 0.72;
  stick.castShadow = true;
  root.add(stick);

  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.y = 0.66;
  stick.add(tip);

  const cord = new THREE.MeshStandardMaterial({ color: 0xc4b49a, roughness: 0.8 });
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 12), cord);
  hoop.position.set(0.42, 0.16, 0.05);
  hoop.rotation.x = Math.PI / 2.4;
  hoop.castShadow = true;
  root.add(hoop);
  const bag = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.28, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd7c7a4, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  bag.position.set(0.42, 0.04, 0.05);
  bag.rotation.x = Math.PI;
  root.add(bag);

  const fish = new THREE.Group();
  fish.name = 'fish';
  fish.position.set(0.42, 0.08, 0.05);
  fish.rotation.y = 0.4;
  fish.visible = false;
  if (!templates || !templates.length) {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc47a45, roughness: 0.55 })
    );
    blob.name = 'fallback';
    blob.scale.set(1.5, 0.55, 0.7);
    blob.castShadow = true;
    fish.add(blob);
  }
  root.add(fish);
  return root;
}

export class FishingRod {
  constructor(scene, terrain, fishTemplates) {
    this.scene = scene;
    this.terrain = terrain;
    this.fishTemplates = fishTemplates && fishTemplates.length ? fishTemplates : null;
    this.kind = -1;
    this.placeable = new Tent(scene, terrain, createRod(this.fishTemplates), {
      place: 'Fishing rod',
      pack: 'Pack fishing rod',
      aim: 'the fishing rod'
    });
    this.caught = false;
    this.wait = 0;
    this._spot = null;
    this._tip = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this.bobber = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xd4553a, roughness: 0.4 })
    );
    this.bobber.visible = false;
    scene.add(this.bobber);

    this.line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 1, 4),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 })
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
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
    this.bobber.visible = false;
  }

  rotate(deltaY) {
    this.placeable.rotate(deltaY);
  }

  nudgeReach(pixels) {
    this.placeable.nudgeReach(pixels);
  }

  waterAhead(x, z, yaw) {
    for (let d = 1.2; d <= 7; d += 0.55) {
      const wx = x + Math.sin(yaw) * d;
      const wz = z + Math.cos(yaw) * d;
      const water = this.terrain.waterAt(wx, wz);
      if (water.depth > 0.2) return { x: wx, y: water.surface, z: wz };
    }
    return null;
  }

  aim(player) {
    this.placeable.aim(player);
    this.bobber.visible = false;
    if (!this.placeable.valid) return;
    const ghost = this.placeable.ghost.position;
    const spot = this.waterAhead(ghost.x, ghost.z, this.placeable.ghost.rotation.y);
    if (!spot) {
      this.placeable.valid = false;
      this.placeable.reason = 'Needs the shore.';
      this.placeable.tint(false);
      return;
    }
    this._spot = spot;
    this.bobber.visible = true;
    this.bobber.position.set(spot.x, spot.y, spot.z);
  }

  confirm() {
    if (!this._spot || !this.placeable.confirm()) return false;
    this.caught = false;
    this.kind = -1;
    this.wait = 16 + Math.random() * 34;
    const fish = this.placeable.placed.getObjectByName('fish');
    if (fish) fish.visible = false;
    this.line.visible = true;
    this.bobber.visible = true;
    return true;
  }

  pack() {
    const fish = this.placeable.placed && this.placeable.placed.getObjectByName('fish');
    if (fish) this.clearCatch(fish);
    this.caught = false;
    this.kind = -1;
    this._spot = null;
    this.line.visible = false;
    this.bobber.visible = false;
    this.placeable.pack();
  }

  clearCatch(fish) {
    for (let i = fish.children.length - 1; i >= 0; i--) {
      const child = fish.children[i];
      if (child.name === 'fallback') continue;
      fish.remove(child);
      disposeFish(child);
    }
  }

  landFish(root) {
    const fish = root.getObjectByName('fish');
    if (!fish) return;
    this.clearCatch(fish);
    if (this.fishTemplates) {
      this.kind = Math.floor(Math.random() * this.fishTemplates.length);
      fish.add(cloneFish(this.fishTemplates[this.kind]));
    } else {
      this.kind = -1;
    }
    fish.visible = true;
  }

  takeFish() {
    if (!this.caught) return false;
    const kind = this.fishTemplates ? this.kind : -1;
    this.caught = false;
    const fish = this.placeable.placed && this.placeable.placed.getObjectByName('fish');
    if (fish) {
      fish.visible = false;
      this.clearCatch(fish);
    }
    this.kind = -1;
    this.wait = 16 + Math.random() * 34;
    return kind;
  }

  update(delta) {
    const mesh = this.placeable.placed;
    if (this.placeable.state !== 'placed' || !mesh || !this._spot) {
      if (this.placeable.state !== 'placing') {
        this.line.visible = false;
        this.bobber.visible = false;
      }
      return;
    }
    if (!this.caught) {
      this.wait -= delta;
      if (this.wait <= 0) {
        this.caught = true;
        this.landFish(mesh);
      }
    }
    const tip = mesh.getObjectByName('tip');
    if (tip) tip.getWorldPosition(this._tip);
    else mesh.getWorldPosition(this._tip);
    const bob = this.caught ? this._spot.y - 0.04 : this._spot.y + Math.sin(performance.now() * 0.003) * 0.025;
    this._end.set(this._spot.x, bob, this._spot.z);
    this.bobber.position.copy(this._end);
    this.bobber.visible = true;
    this._mid.copy(this._tip).lerp(this._end, 0.5);
    this._dir.copy(this._end).sub(this._tip);
    const len = this._dir.length();
    if (len < 0.05) {
      this.line.visible = false;
      return;
    }
    this._dir.multiplyScalar(1 / len);
    this.line.visible = true;
    this.line.position.copy(this._mid);
    this.line.scale.y = len;
    this.line.quaternion.setFromUnitVectors(this._up, this._dir);
  }
}

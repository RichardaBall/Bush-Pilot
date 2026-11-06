import * as THREE from 'three';

export class FieldKit {
  constructor(scene, terrain, aircraft) {
    this.scene = scene;
    this.terrain = terrain;
    this.aircraft = aircraft;
    this.hunger = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.panelOut = false;
    this.cans = 0;

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
    panel.visible = false;
    this.panel = panel;
    scene.add(panel);
  }

  waterNearby(position) {
    const s = this.terrain.getSurfaceAt(position.x, position.z);
    if (s.kind === 'lake' || s.kind === 'river') return true;
    if (s.riverDist < 14 && s.height < 12) return true;
    return this.terrain.lakeEllipse(position.x, position.z) < 1.3 && s.height < this.terrain.lake.level + 2;
  }

  chargeRate() {
    const s = this.terrain.getSurfaceAt(this.aircraft.position.x, this.aircraft.position.z);
    if (s.kind === 'forest') return 0.018;
    if (s.kind === 'sand' || s.kind === 'clearing' || s.height > 36) return 0.085;
    return 0.05;
  }

  sunLabel() {
    return this.chargeRate() > 0.06 ? 'Panel charging in the open' : 'Panel charging in the shade';
  }

  collectWater() {
    this.thirst = Math.min(100, this.thirst + 34);
    if (this.aircraft.cargo <= 96) {
      this.aircraft.cargo += 16;
      this.cans += 1;
    }
  }

  togglePanel() {
    this.panelOut = !this.panelOut;
    this.panel.visible = this.panelOut;
  }

  placePanel() {
    if (!this.panelOut) return;
    const heading = this.aircraft.heading;
    const side = heading + Math.PI / 2;
    this.panel.position.set(
      this.aircraft.position.x + Math.sin(side) * 4.2,
      this.terrain.getHeightAt(this.aircraft.position.x, this.aircraft.position.z) + 0.45,
      this.aircraft.position.z + Math.cos(side) * 4.2
    );
    this.panel.rotation.set(-0.35, heading, 0);
  }

  update(delta, onFoot, moving) {
    if (onFoot) {
      this.thirst = Math.max(0, this.thirst - delta * 0.11);
      this.hunger = Math.max(0, this.hunger - delta * 0.06);
      if (moving) this.stamina = Math.max(0, this.stamina - delta * 7);
      else this.stamina = Math.min(100, this.stamina + delta * 10);
      if (this.thirst < 12 || this.hunger < 12) this.stamina = Math.max(0, this.stamina - delta * 4);
    }
    this.placePanel();
  }

  pace() {
    let pace = 0.42 + 0.58 * (this.stamina / 100);
    if (this.thirst < 15 || this.hunger < 15) pace *= 0.72;
    return pace;
  }
}

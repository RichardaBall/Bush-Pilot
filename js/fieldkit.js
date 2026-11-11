export class FieldKit {
  constructor(terrain) {
    this.terrain = terrain;
    this.hunger = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.daylight = 1;
  }

  chargeRate(x, z) {
    const s = this.terrain.getSurfaceAt(x, z);
    if (s.kind === 'forest') return 0.018;
    if (s.kind === 'sand' || s.kind === 'clearing' || s.height > 36) return 0.085;
    return 0.05;
  }

  sunLabel(x, z) {
    if (this.daylight < 0.04) return 'Panel idle after dark';
    return this.chargeRate(x, z) > 0.06 ? 'Panel charging in the open' : 'Panel charging in the shade';
  }

  windRate(x, z) {
    const s = this.terrain.getSurfaceAt(x, z);
    if (s.kind === 'forest') return 0.02;
    if (s.kind === 'sand' || s.kind === 'clearing' || s.height > 36) return 0.06;
    return 0.04;
  }

  windLabel(x, z) {
    return this.windRate(x, z) > 0.045 ? 'Turbine spinning in the open' : 'Turbine in the lee';
  }

  eat() {
    this.hunger = 100;
  }

  drink() {
    this.thirst = Math.min(100, this.thirst + 34);
  }

  eatFish() {
    this.hunger = Math.min(100, this.hunger + 40);
  }

  update(delta, onFoot, moving) {
    if (onFoot) {
      this.thirst = Math.max(0, this.thirst - delta * 0.11);
      this.hunger = Math.max(0, this.hunger - delta * 0.06);
      if (moving) this.stamina = Math.max(0, this.stamina - delta * 7);
      else this.stamina = Math.min(100, this.stamina + delta * 10);
      if (this.thirst < 12 || this.hunger < 12) this.stamina = Math.max(0, this.stamina - delta * 4);
    }
  }

  pace() {
    let pace = 0.42 + 0.58 * (this.stamina / 100);
    if (this.thirst < 15 || this.hunger < 15) pace *= 0.72;
    return pace;
  }
}

export class FieldKit {
  constructor(terrain, aircraft) {
    this.terrain = terrain;
    this.aircraft = aircraft;
    this.hunger = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.cans = 0;
    this.daylight = 1;
  }

  waterNearby(position) {
    const s = this.terrain.getSurfaceAt(position.x, position.z);
    if (s.kind === 'ocean' || s.kind === 'lake' || s.kind === 'river') return true;
    if (s.kind === 'sand' && s.shoreDist < 18) return true;
    if (s.riverDist < 14 && s.height < 12) return true;
    const lake = this.terrain.lake;
    if (!lake) return false;
    return this.terrain.lakeEllipse(position.x, position.z) < 1.3 && s.height < lake.level + 2;
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

  collectWater() {
    this.thirst = Math.min(100, this.thirst + 34);
    if (this.aircraft.cargo <= 96) {
      this.aircraft.cargo += 16;
      this.cans += 1;
    }
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

import * as THREE from 'three';

export class TaxiManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.active = false;
  }

  start(aircraft) {
    this.active = true;
    aircraft.speed = 0;
    aircraft.pitch = 0;
    aircraft.roll = 0;
  }

  update(delta, aircraft, keys) {
    if (!this.active) return;

    // Ground steering (yaw only)
    const turnRate = 1.2;
    if (keys['ArrowLeft'] || keys['KeyA']) {
      aircraft.heading += turnRate * delta;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
      aircraft.heading -= turnRate * delta;
    }

    // Ground throttle / brakes (Forward only, no reverse)
    if (keys['ArrowUp'] || keys['KeyW']) {
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 6, delta * 2.0);
    } else if (keys['ArrowDown'] || keys['KeyS']) {
      // Brakes: bring speed down to 0
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 0, delta * 4.0);
    } else {
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 0, delta * 2.5);
    }

    // Prevent any negative speed (no backing up)
    aircraft.speed = Math.max(0, aircraft.speed);

    aircraft.moveForward(delta);

    // Keep locked firmly to ground terrain
    const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
    aircraft.position.y = groundH + 0.2;
    aircraft.pitch = 0;
    aircraft.roll = 0;

    aircraft.applyTransformations(delta);
  }
}
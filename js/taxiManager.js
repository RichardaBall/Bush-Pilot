import * as THREE from 'three';
import { Aircraft } from './aircraft.js';

export class TaxiManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.active = false;
  }

  start(aircraft) {
    this.active = true;
    aircraft.speed = 0;
    aircraft.pitch = Aircraft.TAIL_DOWN_PITCH;
    aircraft.roll = 0;
    aircraft.throttle = 0.2;
  }

  update(delta, aircraft, keys) {
    if (!this.active) return;

    // Ground steering (yaw only)
    const turnRate = 0.9;
    if (keys['ArrowLeft'] || keys['KeyA']) {
      aircraft.heading += turnRate * delta;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
      aircraft.heading -= turnRate * delta;
    }

    const ground = this.terrain.groundRoll(aircraft.position.x, aircraft.position.z);
    const taxi = aircraft.specs.taxi * ground.accel / aircraft.loadFactor();

    // Ground throttle / brakes (Forward only, no reverse)
    if (keys['ArrowUp'] || keys['KeyW']) {
      aircraft.throttle = THREE.MathUtils.lerp(aircraft.throttle, 0.35, delta * 2.0);
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, taxi, delta * 1.4 * ground.accel);
    } else if (keys['ArrowDown'] || keys['KeyS']) {
      const bite = ground.soft && aircraft.speed > 4 ? 0.62 : 1;
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 0, delta * 4.0 * ground.brake * bite);
    } else {
      aircraft.throttle = THREE.MathUtils.lerp(aircraft.throttle, 0.2, delta * 1.5);
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 0, delta * 2.5 * ground.brake);
    }

    // Prevent any negative speed (no backing up)
    aircraft.speed = Math.max(0, aircraft.speed);

    aircraft.moveForward(delta);

    // Keep locked firmly to ground terrain
    const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
    aircraft.pitch = Aircraft.TAIL_DOWN_PITCH;
    aircraft.position.y = groundH + aircraft.groundOffset(aircraft.pitch);
    aircraft.roll = 0;

    aircraft.applyTransformations(delta);
  }
}
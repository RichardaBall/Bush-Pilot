import * as THREE from 'three';
import { Aircraft } from './aircraft.js';

export class LandingManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.active = false;
    this.stage = 'IDLE'; // 'LAND_GLIDE', 'LAND_ROLLOUT'
  }

  start(aircraft) {
    this.active = true;
    this.stage = 'LAND_GLIDE';
  }

  update(delta, aircraft, keys) {
    if (!this.active) return 'IDLE';

    const turnRate = 0.65;
    const specs = aircraft.specs;

    if (this.stage === 'LAND_GLIDE') {
      aircraft.updateManualFlight(delta, keys);

      const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
      const wheels = groundH + aircraft.groundOffset(aircraft.pitch);
      const settling = keys['ArrowDown'] && !keys['ArrowUp'] && !keys['KeyW'];
      if (settling && aircraft.position.y <= wheels + 0.35) {
        if (!this.terrain.isLandable(aircraft.position.x, aircraft.position.z)) {
          this.active = false;
          this.stage = 'IDLE';
          aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, Aircraft.CRUISE_PITCH, delta * 2.0);
          aircraft.applyTransformations(delta);
          return 'CRUISE';
        }
        aircraft.pitch = 0;
        aircraft.position.y = groundH + aircraft.groundOffset(0);
        aircraft.applyTransformations(delta);
        this.stage = 'LAND_ROLLOUT';
      }
    } else if (this.stage === 'LAND_ROLLOUT') {
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
      }
      aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 4.0);

      aircraft.throttle = THREE.MathUtils.lerp(aircraft.throttle, 0.15, delta * 1.5);
      const ground = this.terrain.groundRoll(aircraft.position.x, aircraft.position.z);
      const bite = ground.soft && aircraft.speed > 9 ? 0.65 : 1;
      aircraft.speed = Math.max(0, aircraft.speed - specs.brake * ground.brake * bite * delta);

      const settled = THREE.MathUtils.clamp(1 - aircraft.speed / specs.tailUp, 0, 1);
      let targetPitch = THREE.MathUtils.lerp(0, Aircraft.TAIL_DOWN_PITCH, settled);
      if (ground.soft && aircraft.speed > 8) targetPitch = 0.16;
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, targetPitch, delta * 3.0);
      aircraft.moveForward(delta);

      const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
      aircraft.position.y = groundH + aircraft.groundOffset(aircraft.pitch);
      aircraft.applyTransformations(delta);

      if (aircraft.speed < 0.3) {
        aircraft.speed = 0;
        aircraft.pitch = Aircraft.TAIL_DOWN_PITCH;
        aircraft.roll = 0;
        aircraft.throttle = 0.15;
        aircraft.position.y = groundH + aircraft.groundOffset(aircraft.pitch);
        aircraft.applyTransformations(delta);

        this.active = false;
        this.stage = 'IDLE';
        return 'PARKED';
      }
    }
    return 'LANDING';
  }
}
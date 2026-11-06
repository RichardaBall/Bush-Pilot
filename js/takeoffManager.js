import * as THREE from 'three';
import { Aircraft } from './aircraft.js';

export class TakeoffManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.active = false;
    this.stage = 'IDLE'; // 'TAKEOFF_ROLL', 'TAKEOFF_CLIMB'
    this.startPos = new THREE.Vector3();
  }

  start(aircraft) {
    this.active = true;
    this.stage = 'TAKEOFF_ROLL';
    this.startPos.copy(aircraft.position);
    aircraft.speed = 0;
    aircraft.pitch = Aircraft.TAIL_DOWN_PITCH;
    aircraft.roll = 0;
    aircraft.throttle = 0.35;
  }

  update(delta, aircraft, keys) {
    if (!this.active) return 'IDLE';

    const turnRate = 0.7;
    const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
    const specs = aircraft.specs;

    if (this.stage === 'TAKEOFF_ROLL') {
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
      }
      aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 4.0);

      aircraft.throttle = THREE.MathUtils.lerp(aircraft.throttle, 1, delta * 1.5);
      const ground = this.terrain.groundRoll(aircraft.position.x, aircraft.position.z);
      const gain = 0.32 * ground.accel * aircraft.powerFactor() / aircraft.loadFactor();
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, specs.liftoff + 2, delta * gain);

      const tailUp = THREE.MathUtils.clamp(
        (aircraft.speed - specs.tailUp) / (specs.tailLevel - specs.tailUp),
        0,
        1
      );
      const targetPitch = THREE.MathUtils.lerp(Aircraft.TAIL_DOWN_PITCH, 0, tailUp);
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, targetPitch, delta * 4.0);
      aircraft.position.y = groundH + aircraft.groundOffset(aircraft.pitch);

      aircraft.moveForward(delta);
      aircraft.applyTransformations(delta);

      if (aircraft.speed >= specs.liftoff && tailUp > 0.9) {
        this.stage = 'TAKEOFF_CLIMB';
      }
    } else if (this.stage === 'TAKEOFF_CLIMB') {
      const maxRoll = 0.4;
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, -maxRoll, delta * 2.5);
      } else if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, maxRoll, delta * 2.5);
      } else {
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 2.5);
      }

      aircraft.throttle = 1;
      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, specs.climb, delta * 0.6);
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, Aircraft.CLIMB_PITCH, delta * 2.2);
      aircraft.position.y += (specs.climbRate * 1.8 * aircraft.powerFactor() / aircraft.loadFactor()) * delta;

      aircraft.moveForward(delta);
      aircraft.applyTransformations(delta);

      if (aircraft.position.y >= groundH + 40) {
        this.active = false;
        this.stage = 'IDLE';
        return 'CRUISE';
      }
    }
    return 'TAKEOFF';
  }
}
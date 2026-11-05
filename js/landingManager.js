import * as THREE from 'three';

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

    const turnRate = 1.2;

    if (this.stage === 'LAND_GLIDE') {
      // In the air: Bank (roll) when turning
      const maxRoll = 0.4;
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, -maxRoll, delta * 4.0);
      } else if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, maxRoll, delta * 4.0);
      } else {
        aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 4.0);
      }

      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 16, delta * 1.5);
      aircraft.moveForward(delta);

      const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
      const descendingTo = aircraft.position.y - delta * 6;
      if (descendingTo <= groundH + 0.35) {
        if (!this.terrain.isLandable(aircraft.position.x, aircraft.position.z)) {
          this.active = false;
          this.stage = 'IDLE';
          aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, 0, delta * 3.0);
          aircraft.applyTransformations(delta);
          return 'CRUISE';
        }
        aircraft.position.y = groundH + 0.2;
        aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, 0.03, delta * 3.0);
        aircraft.applyTransformations(delta);
        this.stage = 'LAND_ROLLOUT';
      } else {
        aircraft.position.y = descendingTo;
        aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, -0.06, delta * 3.0);
        aircraft.applyTransformations(delta);
      }
    } else if (this.stage === 'LAND_ROLLOUT') {
      // On the ground: Yaw only, wings level (roll = 0)
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
      }
      aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 4.0);

      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 0, delta * 2.0);
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, 0.03, delta * 3.0);
      aircraft.moveForward(delta);

      const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
      aircraft.position.y = groundH + 0.2;
      aircraft.applyTransformations(delta);

      if (aircraft.speed < 0.2) {
        aircraft.speed = 0;
        aircraft.pitch = 0;
        aircraft.roll = 0;
        aircraft.position.y = groundH + 0.2;
        aircraft.applyTransformations(delta);

        this.active = false;
        this.stage = 'IDLE';
        return 'PARKED';
      }
    }
    return 'LANDING';
  }
}
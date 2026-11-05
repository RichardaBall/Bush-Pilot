import * as THREE from 'three';

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
    aircraft.pitch = -0.02;
    aircraft.roll = 0;
  }

  update(delta, aircraft, keys) {
    if (!this.active) return 'IDLE';

    const turnRate = 1.2;
    const groundH = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);

    if (this.stage === 'TAKEOFF_ROLL') {
      // On the ground: Yaw only, wings level (roll = 0)
      if (keys['ArrowLeft'] || keys['KeyA']) {
        aircraft.heading += turnRate * delta;
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        aircraft.heading -= turnRate * delta;
      }
      aircraft.roll = THREE.MathUtils.lerp(aircraft.roll, 0, delta * 4.0);

      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 30, delta * 1.5);
      aircraft.position.y = groundH + 0.2;
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, -0.02, delta * 3.0);

      aircraft.moveForward(delta);
      aircraft.applyTransformations(delta);

      const currentXZ = new THREE.Vector3(aircraft.position.x, 0, aircraft.position.z);
      const startXZ = new THREE.Vector3(this.startPos.x, 0, this.startPos.z);
      const distTraveled = currentXZ.distanceTo(startXZ);

      if (distTraveled >= 35 || aircraft.speed >= 25) {
        this.stage = 'TAKEOFF_CLIMB';
      }
    } else if (this.stage === 'TAKEOFF_CLIMB') {
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

      aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 32, delta * 1.5);
      aircraft.pitch = THREE.MathUtils.lerp(aircraft.pitch, 0.18, delta * 3.0);
      aircraft.position.y += delta * 8;

      aircraft.moveForward(delta);
      aircraft.applyTransformations(delta);

      if (aircraft.position.y >= groundH + 25) {
        this.active = false;
        this.stage = 'IDLE';
        aircraft.pitch = 0.05;
        return 'CRUISE';
      }
    }
    return 'TAKEOFF';
  }
}
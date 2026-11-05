import * as THREE from 'three';

export class Aircraft {
  constructor(scene, terrain, piperMesh) {
    this.scene = scene;
    this.terrain = terrain;
    this.mesh = piperMesh;

    const ground = terrain.getHeightAt(0, 150);
    this.position = new THREE.Vector3(0, ground + 0.2, 150);
    this.heading = 0; // Radians
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;

    // Grab propeller reference
    this.propeller = this.mesh.userData.propeller || null;

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  updateManualFlight(delta, keys) {
    // Throttle / Speed control
    if (keys['ArrowUp'] || keys['KeyW']) {
      this.speed = THREE.MathUtils.lerp(this.speed, 35, delta * 2.0);
    } else {
      this.speed = THREE.MathUtils.lerp(this.speed, 20, delta * 2.0);
    }

    // Steering & Banking
    const turnRate = 1.2;
    const maxRoll = 0.5;

    if (keys['ArrowLeft']) {
      this.heading += turnRate * delta;
      this.roll = THREE.MathUtils.lerp(this.roll, -maxRoll, delta * 4.0);
    } else if (keys['ArrowRight']) {
      this.heading -= turnRate * delta;
      this.roll = THREE.MathUtils.lerp(this.roll, maxRoll, delta * 4.0);
    } else {
      this.roll = THREE.MathUtils.lerp(this.roll, 0, delta * 4.0);
    }

    this.moveForward(delta);

    // Maintain safe flight altitude above terrain
    const groundH = this.terrain.getHeightAt(this.position.x, this.position.z);
    if (this.position.y < groundH + 30) {
      this.position.y = THREE.MathUtils.lerp(this.position.y, groundH + 30, delta * 2.0);
    }

    this.applyTransformations(delta);
  }

  moveForward(delta) {
    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;
  }

  applyTransformations(delta = 0.016) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotateX(this.pitch);
    this.mesh.rotateZ(this.roll);

    // Spin propeller whenever transformations are applied (manual flight, takeoff, or landing)
    if (this.propeller) {
      const spinSpeed = Math.max(15, this.speed * 4.0);
      this.propeller.rotation.z += spinSpeed * delta;
    }
  }
}
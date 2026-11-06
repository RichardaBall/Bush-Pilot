import * as THREE from 'three';

export class Player {
  constructor(scene, terrain, avatarMesh) {
    this.scene = scene;
    this.terrain = terrain;
    this.mesh = avatarMesh;
    
    const ground = terrain.getHeightAt(5, 150);
    this.position = new THREE.Vector3(5, ground, 150);
    this.speed = 8;
    this.walkCycleTime = 0;

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);

    this.active = true;
  }

  update(delta, keys) {
    if (!this.active) return;

    const moveDir = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) moveDir.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveDir.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveDir.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveDir.x += 1;

    const parts = this.mesh.userData;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      this.position.addScaledVector(moveDir, this.speed * (this.pace || 1) * delta);
      
      const groundH = this.terrain.getHeightAt(this.position.x, this.position.z);
      this.position.y = groundH;

      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);

      // Animate limbs walking cycle
      this.walkCycleTime += delta * 12;
      const swing = Math.sin(this.walkCycleTime) * 0.6;
      if (parts) {
        parts.leftArmGroup.rotation.x = swing;
        parts.rightArmGroup.rotation.x = -swing;
        parts.leftLegGroup.rotation.x = -swing;
        parts.rightLegGroup.rotation.x = swing;
      }
    } else {
      // Reset limbs to idle pose smoothly
      this.walkCycleTime = 0;
      if (parts) {
        parts.leftArmGroup.rotation.x = THREE.MathUtils.lerp(parts.leftArmGroup.rotation.x, 0, delta * 10);
        parts.rightArmGroup.rotation.x = THREE.MathUtils.lerp(parts.rightArmGroup.rotation.x, 0, delta * 10);
        parts.leftLegGroup.rotation.x = THREE.MathUtils.lerp(parts.leftLegGroup.rotation.x, 0, delta * 10);
        parts.rightLegGroup.rotation.x = THREE.MathUtils.lerp(parts.rightLegGroup.rotation.x, 0, delta * 10);
      }
    }
  }

  setActive(active) {
    this.active = active;
    this.mesh.visible = active;
  }
}
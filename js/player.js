import * as THREE from 'three';

export class Player {
  constructor(scene, terrain, avatarMesh) {
    this.scene = scene;
    this.terrain = terrain;
    this.mesh = avatarMesh;
    
    const park = terrain.beachPark();
    const ground = terrain.getHeightAt(park.x + 5.5, park.z);
    this.position = new THREE.Vector3(park.x + 5.5, ground, park.z);
    this.speed = 8;
    this.walkCycleTime = 0;
    this.lookPitch = 0;

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);

    this.mixer = null;
    this.actions = null;
    this.pose = 'idle';
    if (this.mesh.animations && this.mesh.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.mesh);
      this.actions = {};
      for (const name of ['idle', 'walk', 'run']) {
        const clip = THREE.AnimationClip.findByName(this.mesh.animations, name);
        if (!clip) continue;
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = false;
        this.actions[name] = action;
      }
      if (this.actions.idle) this.actions.idle.play();
    }

    this.active = true;
  }

  setPose(name) {
    if (!this.actions || !this.actions[name] || this.pose === name) return;
    const next = this.actions[name];
    const prev = this.actions[this.pose];
    next.reset().fadeIn(0.18).play();
    if (prev) prev.fadeOut(0.18);
    this.pose = name;
  }

  look(pixels) {
    this.mesh.rotation.y -= pixels * 0.0022;
  }

  lookUp(pixels) {
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + pixels * 0.0022, -1.15, 1.2);
  }

  update(delta, keys) {
    if (!this.active) return;

    let inputX = 0;
    let inputZ = 0;
    if (keys['KeyW'] || keys['ArrowUp']) inputZ += 1;
    if (keys['KeyS'] || keys['ArrowDown']) inputZ -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) inputX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) inputX += 1;

    const parts = this.mesh.userData;
    const moving = inputX !== 0 || inputZ !== 0;

    if (moving) {
      const yaw = this.mesh.rotation.y;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const moveDir = new THREE.Vector3(
        sin * inputZ - cos * inputX,
        0,
        cos * inputZ + sin * inputX
      ).normalize();
      const running = keys['ShiftLeft'] || keys['ShiftRight'];
      const pace = (this.pace || 1) * (running ? 1.85 : 1);
      this.position.addScaledVector(moveDir, this.speed * pace * delta);

      const groundH = this.terrain.getHeightAt(this.position.x, this.position.z);
      this.position.y = groundH;

      this.mesh.position.copy(this.position);
      this.setPose(running ? 'run' : 'walk');
    } else {
      this.walkCycleTime = 0;
      this.setPose('idle');
      if (parts && parts.leftArmGroup) {
        parts.leftArmGroup.rotation.x = THREE.MathUtils.lerp(parts.leftArmGroup.rotation.x, 0, delta * 10);
        parts.rightArmGroup.rotation.x = THREE.MathUtils.lerp(parts.rightArmGroup.rotation.x, 0, delta * 10);
        parts.leftLegGroup.rotation.x = THREE.MathUtils.lerp(parts.leftLegGroup.rotation.x, 0, delta * 10);
        parts.rightLegGroup.rotation.x = THREE.MathUtils.lerp(parts.rightLegGroup.rotation.x, 0, delta * 10);
      }
    }

    if (this.mixer) this.mixer.update(delta);
  }

  setActive(active) {
    this.active = active;
    this.mesh.visible = active;
  }
}
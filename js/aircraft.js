import * as THREE from 'three';

// Piper PA-18 Super Cub (150 hp). World units are meters.
// Positive pitch is nose-down: Three.js +X rotation drops the nose (+Z).
const MAIN_HUB = { y: 0.215, z: 1.699 };
const TAIL_HUB = { y: 1.122, z: -3.454 };
const MAIN_RADIUS = 0.25;
const TAIL_RADIUS = 0.09;

function contactHeight(pitch) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const mainY = MAIN_HUB.y * c - MAIN_HUB.z * s - MAIN_RADIUS;
  const tailY = TAIL_HUB.y * c - TAIL_HUB.z * s - TAIL_RADIUS;
  return Math.min(mainY, tailY);
}

// Nose-up angle that puts both tires on the same ground plane.
function solveTailDownPitch() {
  const dy = TAIL_HUB.y - MAIN_HUB.y;
  const dz = MAIN_HUB.z - TAIL_HUB.z;
  const extra = MAIN_RADIUS - TAIL_RADIUS;
  let c = 1;
  let pitch = 0;
  for (let i = 0; i < 6; i++) {
    const s = -(extra + dy * c) / dz;
    pitch = Math.asin(Math.max(-1, Math.min(1, s)));
    c = Math.cos(pitch);
  }
  return pitch;
}

export class Aircraft {
  static TAIL_DOWN_PITCH = solveTailDownPitch();
  static CLIMB_PITCH = -0.22;
  static CRUISE_PITCH = -0.04;

  constructor(scene, terrain, piperMesh) {
    this.scene = scene;
    this.terrain = terrain;
    this.mesh = piperMesh;

    // mph converted to m/s for the 150 hp Super Cub
    this.specs = {
      taxi: 5.5,
      tailUp: 12,
      tailLevel: 17,
      liftoff: 20.5,
      climb: 31,
      climbRate: 4.8,
      cruise: 46,
      maxSpeed: 51,
      approach: 25,
      slow: 18,
      brake: 3.2
    };

    this.heading = 0;
    this.pitch = Aircraft.TAIL_DOWN_PITCH;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.power = 0;
    this.airborne = false;
    this.cargo = 0;
    this.charge = 82;

    const ground = terrain.getHeightAt(0, 150);
    this.position = new THREE.Vector3(0, ground + this.groundOffset(this.pitch), 150);

    this.propeller = this.mesh.userData.propeller || null;

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
    this.applyTransformations(0);
  }

  loadFactor() {
    return 1 + this.cargo / 240;
  }

  powerFactor() {
    return Math.max(0.32, this.charge / 100);
  }

  // Keeps the lower tire planted when the fuselage rotates on the ground.
  groundOffset(pitch) {
    return 0.2 + contactHeight(0) - contactHeight(pitch);
  }

  // Up and down change engine power. Climb, level, and descent follow
  // that power. Nothing raises the nose to clear trees or ridges.
  updatePoweredFlight(delta, keys, blocked) {
    const up = keys['ArrowUp'] || keys['KeyW'];
    const down = keys['ArrowDown'] || (!this.airborne && keys['KeyS']);
    if (!(blocked && up)) {
      const command = (up ? 1 : 0) - (down ? 1 : 0);
      this.power = THREE.MathUtils.clamp(this.power + command * 0.28 * delta, 0, 1);
    }
    this.throttle = this.power;

    const turnRate = this.airborne ? 0.75 : 0.9;
    const maxRoll = 0.5;
    if (keys['ArrowLeft'] || keys['KeyA']) {
      this.heading += turnRate * delta;
      this.roll = THREE.MathUtils.lerp(this.roll, this.airborne ? -maxRoll : 0, delta * 2.5);
    } else if (keys['ArrowRight'] || keys['KeyD']) {
      this.heading -= turnRate * delta;
      this.roll = THREE.MathUtils.lerp(this.roll, this.airborne ? maxRoll : 0, delta * 2.5);
    } else {
      this.roll = THREE.MathUtils.lerp(this.roll, 0, delta * 2.5);
    }

    const specs = this.specs;
    const roll = this.terrain.groundRoll(this.position.x, this.position.z);
    const thrust = this.powerFactor() / this.loadFactor();
    const targetSpeed = this.airborne
      ? THREE.MathUtils.lerp(specs.slow, specs.maxSpeed, this.power) * thrust
      : this.power * specs.maxSpeed * roll.accel * thrust;
    const accel = (this.airborne ? 4.4 : 3.1 * roll.accel) * thrust;
    const brake = this.airborne ? 3.6 : 5.2 * roll.brake * (down && roll.soft ? 0.65 : 1);
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + accel * delta);
    else this.speed = Math.max(targetSpeed, this.speed - brake * delta);
    this.speed = Math.max(0, this.speed);

    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.moveForward(delta);

    const here = this.terrain.getHeightAt(this.position.x, this.position.z);
    const surface = Math.max(here, 0);
    let rejected = false;

    if (!this.airborne) {
      const tailUp = THREE.MathUtils.clamp((this.speed - specs.tailUp) / (specs.tailLevel - specs.tailUp), 0, 1);
      const noseOver = roll.soft && down && this.speed > 6;
      this.pitch = noseOver ? 0.16 : THREE.MathUtils.lerp(Aircraft.TAIL_DOWN_PITCH, 0, tailUp);
      this.position.y = here + this.groundOffset(this.pitch);
      const liftoff = specs.liftoff * (1 + (1 - roll.accel) * 0.35);
      if (!blocked && this.power > 0.62 && this.speed >= liftoff && tailUp > 0.85) this.airborne = true;
    } else {
      // Cruise power holds height. Below it the sink grows with how far
      // the throttle is closed. Above it the climb grows the same way.
      const cruisePower = 0.62;
      const excess = this.power - cruisePower;
      const vertical = excess >= 0
        ? (excess / (1 - cruisePower)) * 7.2
        : (excess / cruisePower) * 6.4;
      let y = this.position.y + vertical * delta;
      const ceiling = this.terrain.flightCeiling();
      if (y > ceiling) y = ceiling;
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, delta * 2.4);

      const wheels = here + this.groundOffset(0);
      if (vertical <= 0 && y <= wheels + 0.45) {
        if (this.terrain.isLandable(this.position.x, this.position.z)) {
          this.airborne = false;
          this.pitch = 0;
          this.position.y = wheels;
        } else {
          this.position.y = Math.max(wheels, surface + 0.8);
          rejected = true;
        }
      } else {
        this.position.y = y;
      }

      if (this.airborne && this.terrain.blocksFlight(this.position.x, this.position.z, this.position.y)) {
        this.position.x = prevX;
        this.position.z = prevZ;
      }
    }

    this.applyTransformations(delta);
    return rejected;
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
    if (this.propeller && delta > 0) {
      const rpm = 500 + this.throttle * 1900;
      this.propeller.rotation.z += (rpm * Math.PI / 30) * delta;
    }
  }
}
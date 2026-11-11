import * as THREE from 'three';

export const WIND_CALM = 0.18;

const STREAKS = 380;
const SPREAD = 28;

function rollDry() {
  if (Math.random() < 0.25) return 720;
  return 300 + Math.random() * 300;
}

export class Weather {
  constructor(scene) {
    this.amount = 0;
    this.wind = 0.45;
    this._windTarget = 0.45;
    this._windHold = 40 + Math.random() * 40;
    this._raining = false;
    this._rainLeft = 0;
    this._dryLeft = rollDry();

    const positions = new Float32Array(STREAKS * 3);
    for (let i = 0; i < STREAKS; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = Math.random() * 16;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd5e4ea,
      size: 0.07,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  get calm() {
    return this.wind < WIND_CALM;
  }

  update(delta, camera) {
    if (this._raining) {
      this._rainLeft -= delta;
      if (this._rainLeft <= 0) {
        this._raining = false;
        this._dryLeft = rollDry();
      }
    } else {
      this._dryLeft -= delta;
      if (this._dryLeft <= 0) {
        this._raining = true;
        this._rainLeft = 40;
      }
    }
    const rainTarget = this._raining ? 1 : 0;
    this.amount += (rainTarget - this.amount) * Math.min(1, delta * 1.4);

    this._windHold -= delta;
    if (this._windHold <= 0) {
      this._windHold = 60 + Math.random() * 60;
      this._windTarget = Math.random() < 1 / 3 ? 0 : 0.28 + Math.random() * 0.72;
    }
    this.wind += (this._windTarget - this.wind) * Math.min(1, delta * 0.35);
    if (this.wind < 0) this.wind = 0;

    const fall = delta * (12 + this.amount * 10);
    const pos = this.points.geometry.attributes.position;
    const arr = pos.array;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= fall;
      const below = arr[i + 1] < cy - 4;
      const far = Math.abs(arr[i] - cx) > SPREAD || Math.abs(arr[i + 2] - cz) > SPREAD;
      if (below || far) {
        arr[i] = cx + (Math.random() - 0.5) * SPREAD;
        arr[i + 1] = cy + 6 + Math.random() * 10;
        arr[i + 2] = cz + (Math.random() - 0.5) * SPREAD;
      }
    }
    pos.needsUpdate = true;
    this.points.visible = this.amount > 0.04;
    this.points.material.opacity = this.amount * 0.55;
  }
}

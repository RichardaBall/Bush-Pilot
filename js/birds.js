import * as THREE from 'three';

const COUNT = 8;
const CAMP_COUNT = 2;
const FLEE_FOOT = 12;
const FLEE_PLANE = 30;
const HEAR = 40;
const NIGHT = 0.32;

function makeBird(bodyMat, wingMat, beakMat, wingGeo) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), bodyMat);
  body.scale.set(0.7, 0.55, 1.35);
  group.add(body);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.2, 0.02, 0);
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0.2, 0.02, 0);
  group.add(wingR);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), beakMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0, 0.16);
  group.add(beak);
  return { group, wingL, wingR };
}

export class Birds {
  constructor(scene, terrain, audio) {
    this.scene = scene;
    this.terrain = terrain;
    this.audio = audio;
    this.time = 0;
    this.chirpIn = 2.4;
    this.birds = [];

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.72 });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xc5c8cc,
      roughness: 0.82,
      side: THREE.DoubleSide
    });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xe2a04a, roughness: 0.55 });
    const wingGeo = new THREE.PlaneGeometry(0.38, 0.14);

    const park = terrain.beachPark();
    const base = Math.atan2(park.z, park.x);
    for (let i = 0; i < COUNT; i++) {
      const spot = this.sampleShore(base + (i - (COUNT - 1) / 2) * 0.16, i)
        || { x: park.x + (i - 3.5) * 5, z: park.z };
      const parts = makeBird(bodyMat, wingMat, beakMat, wingGeo);
      const bird = {
        i,
        mesh: parts.group,
        wingL: parts.wingL,
        wingR: parts.wingR,
        homeX: spot.x,
        homeZ: spot.z,
        cx: spot.x,
        cz: spot.z,
        x: spot.x,
        z: spot.z,
        yaw: 0,
        phase: Math.random() * Math.PI * 2,
        orbit: Math.random() * Math.PI * 2,
        spin: i % 2 === 0 ? 1 : -1,
        rad: 10 + (i % 3) * 2.4,
        alt: 3.4 + (i % 4) * 0.45,
        vx: 0,
        vz: 0,
        yawRate: 0,
        state: 'loiter',
        flee: 0,
        fleeAlt: 4,
        camp: i < CAMP_COUNT
      };
      this.birds.push(bird);
      scene.add(parts.group);
    }
  }

  sampleShore(ang, salt) {
    for (let k = 0; k < 10; k++) {
      const a = ang + (k - 4) * 0.045;
      const canopy = this.terrain.canopyRadius(a);
      const coast = this.terrain.coastRadius(a);
      const along = 0.28 + (salt % 4) * 0.1;
      const r = canopy + (coast - canopy) * along;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const surface = this.terrain.getSurfaceAt(x, z);
      const water = this.terrain.waterAt(x, z);
      if (water.depth > 0.15) continue;
      const edge = surface.kind === 'forest' && surface.canopyDist < 10;
      if (surface.kind !== 'sand' && !edge) continue;
      if (this.terrain.hitsSolid(x, z, 0.8)) continue;
      return { x, z };
    }
    return null;
  }

  shiftHome(bird, tx, tz) {
    const ang = Math.atan2(bird.homeZ, bird.homeX);
    const away = Math.atan2(bird.homeZ - tz, bird.homeX - tx);
    const step = Math.sin(away - ang) >= 0 ? 0.14 : -0.14;
    const spot = this.sampleShore(ang + step, bird.i + 1);
    if (!spot) return;
    bird.homeX = spot.x;
    bird.homeZ = spot.z;
  }

  planeLow(aircraft) {
    if (!aircraft || aircraft.speed < 1) return false;
    const ground = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
    return aircraft.position.y - ground < 16;
  }

  creep(bird, tx, tz, speed, delta) {
    const dx = tx - bird.cx;
    const dz = tz - bird.cz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) return;
    const step = Math.min(dist, speed * delta);
    bird.cx += (dx / dist) * step;
    bird.cz += (dz / dist) * step;
  }

  steer(bird, gx, gz, maxSpeed, delta, mode) {
    const dx = gx - bird.x;
    const dz = gz - bird.z;
    const dist = Math.hypot(dx, dz);
    const ease = dist < 2 ? dist / 2 : 1;
    const wantVx = dist > 0.05 ? (dx / dist) * maxSpeed * ease : 0;
    const wantVz = dist > 0.05 ? (dz / dist) * maxSpeed * ease : 0;
    const t = Math.min(1, delta * (mode === 'flee' ? 1.15 : 0.7));
    bird.vx += (wantVx - bird.vx) * t;
    bird.vz += (wantVz - bird.vz) * t;
    const speed = Math.hypot(bird.vx, bird.vz);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      bird.vx *= scale;
      bird.vz *= scale;
    }
    bird.x += bird.vx * delta;
    bird.z += bird.vz * delta;
    if (speed < 0.15) {
      bird.yawRate = 0;
      return;
    }
    const target = Math.atan2(bird.vx, bird.vz);
    let diff = Math.atan2(Math.sin(target - bird.yaw), Math.cos(target - bird.yaw));
    const maxTurn = delta * (mode === 'flee' ? 1.4 : 0.8);
    diff = THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
    bird.yaw += diff;
    bird.yawRate = diff / Math.max(delta, 0.001);
  }

  fireSpot(fire) {
    if (!fire || !fire.lit || !fire.placeable || fire.placeable.state !== 'placed' || !fire.placeable.placed) {
      return null;
    }
    return fire.placeable.placed.position;
  }

  update(delta, focus, onFoot, daylight, rain, fire, aircraft) {
    this.time += delta;
    const night = daylight < NIGHT;
    const wet = Math.min(1, Math.max(0, rain || 0));
    const campAt = night ? null : this.fireSpot(fire);
    const low = this.planeLow(aircraft);
    let nearestD = HEAR;
    let heard = false;

    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      const listenD = Math.hypot(bird.x - focus.x, bird.z - focus.z);
      const footClose = onFoot && listenD < FLEE_FOOT;
      let planeClose = false;
      if (low) {
        const px = aircraft.position.x;
        const pz = aircraft.position.z;
        planeClose = Math.hypot(bird.x - px, bird.z - pz) < FLEE_PLANE;
      }
      if ((footClose || planeClose) && bird.state !== 'flee') {
        bird.state = 'flee';
        bird.flee = 6;
        bird.fleeAlt = Math.min(6.2, bird.alt + 1.6);
        const tx = planeClose ? aircraft.position.x : focus.x;
        const tz = planeClose ? aircraft.position.z : focus.z;
        this.shiftHome(bird, tx, tz);
      }
      if (bird.state === 'flee') {
        bird.flee -= delta;
        if (bird.flee <= 0) bird.state = 'loiter';
      }

      const mode = bird.state === 'flee'
        ? 'flee'
        : night
          ? 'roost'
          : bird.camp && campAt
            ? 'camp'
            : 'loiter';
      const drop = 1 - wet * 0.35;
      let centerX = bird.homeX;
      let centerZ = bird.homeZ;
      let centerSpeed = 1.1;
      let wantR = 10 + (bird.i % 3) * 2.4;
      let wantA = (3.4 + (bird.i % 4) * 0.45) * drop;
      let maxSpeed = 2.2;
      if (mode === 'camp') {
        centerX = campAt.x;
        centerZ = campAt.z;
        centerSpeed = 1.4;
        wantR = 12;
        wantA = 4.2 * drop;
      } else if (mode === 'roost') {
        centerSpeed = 0.35;
        wantR = 1.2;
        wantA = 1.15;
        maxSpeed = 0.45;
      } else if (mode === 'flee') {
        centerSpeed = 4.2;
        wantA = bird.fleeAlt;
        maxSpeed = 4.4;
      }
      this.creep(bird, centerX, centerZ, centerSpeed, delta);
      bird.rad += (wantR - bird.rad) * Math.min(1, delta * 0.18);
      bird.alt += (wantA - bird.alt) * Math.min(1, delta * (mode === 'flee' ? 0.4 : 0.22));

      let goalX;
      let goalZ;
      if (mode === 'flee') {
        goalX = bird.homeX;
        goalZ = bird.homeZ;
      } else {
        const spin = mode === 'roost' ? 0.08 : mode === 'camp' ? 0.09 : 0.11;
        bird.orbit += delta * spin * bird.spin;
        goalX = bird.cx + Math.cos(bird.orbit) * bird.rad;
        goalZ = bird.cz + Math.sin(bird.orbit) * bird.rad;
      }
      const wetGoal = this.terrain.waterAt(goalX, goalZ);
      if (wetGoal.depth > 0.3) {
        goalX = bird.cx;
        goalZ = bird.cz;
      }
      this.steer(bird, goalX, goalZ, maxSpeed, delta, mode);

      const water = this.terrain.waterAt(bird.x, bird.z);
      const here = water.depth > 0.05 ? water.surface : this.terrain.getHeightAt(bird.x, bird.z);
      const bob = Math.sin(this.time * 1.3 + bird.phase) * (mode === 'roost' ? 0.02 : 0.05);
      bird.mesh.position.set(bird.x, here + bird.alt + bob, bird.z);
      bird.mesh.rotation.y = bird.yaw;
      bird.mesh.rotation.z = THREE.MathUtils.clamp(-bird.yawRate * 0.45, -0.35, 0.35);

      const beating = mode === 'flee' || mode === 'roost' || Math.sin(this.time * 0.32 + bird.phase) > -0.25;
      const rate = mode === 'flee' ? 5.2 : mode === 'roost' ? 1.1 : 2.5;
      const amp = beating ? (mode === 'flee' ? 0.5 : 0.28) : 0.04;
      const lift = Math.sin(this.time * rate + bird.phase) * amp;
      const rest = beating ? 0.12 : 0.28;
      bird.wingL.rotation.z = rest + lift;
      bird.wingR.rotation.z = -rest - lift;

      if (mode !== 'roost' && listenD < nearestD) {
        nearestD = listenD;
        heard = true;
      }
    }

    if (!heard || daylight <= NIGHT) return;
    this.chirpIn -= delta;
    if (this.chirpIn > 0) return;
    const quiet = (1 - nearestD / HEAR) * (1 - wet * 0.7);
    this.audio.chirp(Math.max(0.08, quiet), Math.max(0.4, 1 - wet * 0.6));
    this.chirpIn = 3.2 + Math.random() * 3.6;
  }
}

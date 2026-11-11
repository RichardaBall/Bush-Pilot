import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AssetLoader } from './loaders.js';
import { Terrain } from './terrain.js';
import { Player } from './player.js';
import { Smurf } from './smurf.js';
import { Aircraft } from './aircraft.js';
import { FieldKit } from './fieldkit.js';
import { GroundFx } from './groundfx.js';
import { Soundscape } from './audio.js';
import { Tent } from './tent.js';
import { Campfire } from './campfire.js';
import { SolarPanel } from './solar.js';
import { WindTurbine } from './turbine.js';
import { Lamp } from './lamp.js';
import { TentPower } from './tentpower.js';
import { WaterBarrel } from './barrel.js';
import { Weather } from './weather.js';
import { FishingRod, cloneFish, disposeFish } from './rod.js';
import { CarBattery } from './battery.js';
import { Birds } from './birds.js';
import { Fish } from './fish.js';
import { Turtles } from './turtle.js';

const FISH_ROT = 90;
const FISH_PICK = 1.5;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiControls = document.getElementById('controls-info');
    this.uiState = document.getElementById('state-info');
    this.uiPrompt = document.getElementById('prompt-overlay');
    this.uiMeters = document.getElementById('meters');
    this.uiBuild = document.getElementById('build-menu');
    this.uiBag = document.getElementById('inventory');

    this.mode = 'ON_FOOT'; // 'ON_FOOT' | 'IN_AIRCRAFT'
    this.aircraftState = 'PARKED'; // 'PARKED' | 'CRUISE' | 'TAKEOFF' | 'LANDING'
    this.keys = {};
    this.keyJustPressed = {};
    this.landingHint = 0;
    this.planeLookYaw = 0;
    this.planeLookPitch = 0;
    this.planeLookIdle = 0;

    this.sunOffset = new THREE.Vector3(210, 120, 60);
    this.lightOffset = this.sunOffset.clone();
    this.dayLength = 720;
    this.dayTime = 90;
    this.daylight = 1;
    this.sunPitch = 0;
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initSky();
    this.initPost();
    this.initInputs();

    this.clock = new THREE.Clock();
    this.audio = new Soundscape();
    this.wasAirborne = false;
    this.buildOpen = false;
    this.buildIndex = 0;
    this.wire = null;
    this.wireNote = '';
    this.boot();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb7dce6);
    this.scene.fog = new THREE.FogExp2(0xb7dce6, 0.0011);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.3, 12000);
    this.camera.layers.enable(1);
    this.camera.position.set(0, 25, 30);
  }

  initLights() {
    const hemi = new THREE.HemisphereLight(0xc5e4ee, 0x4a5340, 0.55);
    this.scene.add(hemi);
    this.hemi = hemi;
    this._dayHemi = new THREE.Color(0xc5e4ee);
    this._nightHemi = new THREE.Color(0x1a2744);

    const ambientLight = new THREE.AmbientLight(0xfff1dd, 0.18);
    this.scene.add(ambientLight);
    this.ambient = ambientLight;
    this._dayAmbient = new THREE.Color(0xfff1dd);
    this._nightAmbient = new THREE.Color(0x223044);
    this._daySun = new THREE.Color(0xffd7a1);
    this._duskSun = new THREE.Color(0xff7a3a);
    this._moon = new THREE.Color(0x9eb6d8);

    const dirLight = new THREE.DirectionalLight(0xffd7a1, 2.6);
    dirLight.position.copy(this.sunOffset);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 700;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.15;

    const d = 220;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.updateProjectionMatrix();

    this.dirLight = dirLight;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);
  }

  initSky() {
    const sunDir = this.sunOffset.clone().normalize();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSun: { value: sunDir },
        uZenith: { value: new THREE.Color(0x3c7ec4) },
        uHorizon: { value: new THREE.Color(0xd4e8f6) },
        uWarm: { value: new THREE.Color(0xf0d2a8) },
        uDay: { value: 1 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDir = normalize(world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uWarm;
        uniform float uDay;
        varying vec3 vDir;
        float skyHash(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float skyNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
                     mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * skyNoise(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          float horizonMix = pow(1.0 - h, 1.6);
          vec3 col = mix(uZenith, uHorizon, horizonMix);
          col = mix(col, uWarm, smoothstep(0.18, 0.0, dir.y) * 0.45 * pow(max(dot(dir, uSun), 0.0), 2.0));
          float sun = pow(max(dot(dir, uSun), 0.0), 380.0);
          float glow = pow(max(dot(dir, uSun), 0.0), 8.0);
          col += vec3(1.6, 1.15, 0.7) * sun;
          col += uWarm * glow * 0.35;
          float night = 1.0 - smoothstep(-0.18, 0.08, uSun.y);
          float star = step(0.997, skyHash(floor(dir.xz * 500.0 + dir.y * 220.0)));
          col += vec3(0.9, 0.93, 1.0) * star * night * smoothstep(0.0, 0.25, dir.y);
          vec2 cloudUv = dir.xz / max(dir.y, 0.08) * 0.35;
          float clouds = fbm(cloudUv);
          float cloudMask = smoothstep(0.52, 0.72, clouds) * smoothstep(0.08, 0.28, dir.y);
          vec3 cloudCol = mix(vec3(0.12, 0.15, 0.22), vec3(0.96, 0.97, 0.98), uDay);
          col = mix(col, cloudCol, cloudMask * 0.82);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyMat = material;
    this._sunDir = sunDir;
    this._dayZenith = new THREE.Color(0x3c7ec4);
    this._duskZenith = new THREE.Color(0x1a2744);
    this._nightZenith = new THREE.Color(0x070b18);
    this._dayHorizon = new THREE.Color(0xd4e8f6);
    this._duskHorizon = new THREE.Color(0xe08050);
    this._nightHorizon = new THREE.Color(0x1a2438);
    this._dayWarm = new THREE.Color(0xf0d2a8);
    this._duskWarm = new THREE.Color(0xff7a3a);
    this._nightWarm = new THREE.Color(0x1a2438);
    this._zenith = new THREE.Color();
    this._horizon = new THREE.Color();
    this._fogColor = new THREE.Color();
    this._rainTint = new THREE.Color(0x7d8a90);
    this._warm = new THREE.Color();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 20), material);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
  }

  initPost() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      samples: 4,
      type: THREE.HalfFloatType
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.16, 0.45, 0.9));
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 graded = mix(col * vec3(0.9, 0.96, 1.06), col * vec3(1.07, 1.02, 0.92), smoothstep(0.12, 0.65, luma));
          vec2 q = vUv - 0.5;
          graded *= 1.0 - dot(q, q) * 0.28;
          gl_FragColor = vec4(graded, 1.0);
        }
      `
    }));
    this.composer.addPass(new OutputPass());
  }

  initInputs() {
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.code === 'Escape') {
        this.buildOpen = false;
        if (this.tent && this.tent.placing) this.tent.cancel();
        if (this.fire && this.fire.placing) this.fire.cancel();
        if (this.solar && this.solar.placing) this.solar.cancel();
        if (this.solar && this.solar.cabling) this.solar.cancelCable();
        if (this.turbine && this.turbine.placing) this.turbine.cancel();
        if (this.turbine && this.turbine.cabling) this.turbine.cancelCable();
        if (this.barrel && this.barrel.placing) this.barrel.cancel();
        if (this.rod && this.rod.placing) this.rod.cancel();
        const placingCell = this.placingBattery();
        if (placingCell) placingCell.cancel();
        if (this.tentPower && this.tentPower.cabling) this.tentPower.cancelCable();
        if (this.wire) this.clearWire();
        if (this.lamp && this.lamp.charging) this.lamp.stopCharge();
      }
      if (!this.keys[e.code]) {
        this.keyJustPressed[e.code] = true;
      }
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keyJustPressed[e.code] = false;
    });

    this.walkZoom = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      if (e.button === 1) {
        e.preventDefault();
        this.onMiddleClick();
        return;
      }
      if (e.button !== 0) return;
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
        return;
      }
      this.onLeftClick();
    });
    this.canvas.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'ON_FOOT') return;
      e.preventDefault();
      if (this.tent && this.tent.placing) {
        this.tent.rotate(e.deltaY);
        return;
      }
      if (this.fire && this.fire.placing) {
        this.fire.rotate(e.deltaY);
        return;
      }
      if (this.solar && this.solar.placing) {
        this.solar.rotate(e.deltaY);
        return;
      }
      if (this.turbine && this.turbine.placing) {
        this.turbine.rotate(e.deltaY);
        return;
      }
      if (this.barrel && this.barrel.placing) {
        this.barrel.rotate(e.deltaY);
        return;
      }
      if (this.rod && this.rod.placing) {
        this.rod.rotate(e.deltaY);
        return;
      }
      const placingCell = this.placingBattery();
      if (placingCell) {
        placingCell.rotate(e.deltaY);
        return;
      }
      if (this.buildOpen) {
        const count = this.bagSize();
        if (count) {
          const step = e.deltaY > 0 ? 1 : -1;
          this.buildIndex = (this.buildIndex + step + count) % count;
        }
        return;
      }
      const step = Math.sign(e.deltaY) * 0.1;
      this.walkZoom = Math.min(1, Math.max(0, this.walkZoom - step));
    }, { passive: false });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (this.mode === 'ON_FOOT' && this.player) {
        this.player.look(e.movementX);
        const placingItem = this.activePlaceable();
        if (placingItem) placingItem.nudgeReach(e.movementY);
        else this.player.lookUp(e.movementY);
      } else if (this.mode === 'IN_AIRCRAFT') {
        this.planeLookYaw -= e.movementX * 0.0022;
        this.planeLookPitch = THREE.MathUtils.clamp(this.planeLookPitch + e.movementY * 0.0018, -0.5, 0.7);
        this.planeLookIdle = 0;
      }
    });
  }

  async boot() {
    this.terrain = new Terrain(this.scene);
    const loader = new AssetLoader();
    const [piperMesh, natureScene, grassScene, cliffScene, stoneScene, cloudScene] = await Promise.all([
      loader.loadPiperModel(),
      loader.loadPack('./models/tropicalPack.glb'),
      loader.loadPack('./models/grassPack.glb'),
      loader.loadPack('./models/cliffPack.glb'),
      loader.loadPack('./models/stonePack.glb'),
      loader.loadPack('./models/cloudPack.glb')
    ]);
    const packs = { grass: grassScene, cliff: cliffScene, stone: stoneScene };
    if (natureScene) this.terrain.scatterNature(natureScene, packs);
    else this.terrain.initProps();
    this.terrain.scatterClouds(cloudScene);
    this.birds = new Birds(this.scene, this.terrain, this.audio);
    this.fishLife = new Fish(this.scene, this.terrain, this.audio);
    const [humanMesh, smurfMesh, campMesh, fishTemplates, turtleAsset] = await Promise.all([
      loader.loadHuman().catch(() => loader.createHumanAvatar()),
      loader.loadSmurf().catch((err) => {
        console.warn('Smurf failed to load', err);
        return null;
      }),
      loader.loadCamp(),
      loader.loadFishPack(),
      loader.loadTurtle().catch((err) => {
        console.warn('Turtle failed to load', err);
        return null;
      })
    ]);

    this.player = new Player(this.scene, this.terrain, humanMesh);
    this.smurf = smurfMesh ? new Smurf(this.scene, this.terrain, smurfMesh) : null;
    this.aircraft = new Aircraft(this.scene, this.terrain, piperMesh);
    const camTarget = this.player.position;
    const yaw = this.player.mesh.rotation.y;
    this.camera.position.set(
      camTarget.x - Math.sin(yaw) * 20,
      camTarget.y + 24,
      camTarget.z - Math.cos(yaw) * 20
    );
    this.camera.lookAt(camTarget.x, camTarget.y + 0.8, camTarget.z);
    this.tent = campMesh ? new Tent(this.scene, this.terrain, campMesh) : null;
    this.fire = new Campfire(this.scene, this.terrain);
    this.solar = new SolarPanel(this.scene, this.terrain, this.aircraft);
    this.lamp = new Lamp(this.scene, this.player, this.aircraft);
    this.tentPower = this.tent ? new TentPower(this.scene, this.tent, this.aircraft) : null;
    this.turbine = new WindTurbine(this.scene, this.terrain, this.aircraft, this.tent, this.tentPower);
    this.field = new FieldKit(this.terrain);
    this.barrel = new WaterBarrel(this.scene, this.terrain);
    this.fishTemplates = fishTemplates;
    this.turtles = turtleAsset
      ? new Turtles(this.scene, this.terrain, turtleAsset.model, turtleAsset.swim, turtleAsset.shellHeight)
      : null;
    this.rod = new FishingRod(this.scene, this.terrain, fishTemplates);
    this.heldFish = false;
    this.heldKind = -1;
    this.fishCarry = new THREE.Group();
    this.fishCarry.position.set(0.11, 0.04, 0.02);
    this.fishCarry.rotation.z = 0.6;
    this.fishCarry.frustumCulled = false;
    this.fishCarry.visible = false;
    this.lamp.mesh.add(this.fishCarry);
    this.fishShape = new THREE.SphereGeometry(0.07, 8, 6);
    this.groundFish = [];
    this.batteries = [new CarBattery(this.scene, this.terrain)];
    this.carried = { tent: 1, fire: 1, solar: 1, turbine: 1, barrel: 1, rod: 1, battery: 1 };
    if (this.lamp) this.lamp.batteries = this.batteries;
    if (this.solar) this.solar.batteries = this.batteries;
    if (this.turbine) this.turbine.batteries = this.batteries;
    if (this.tentPower) this.tentPower.batteries = this.batteries;
    this.wireLead = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85 })
    );
    this.wireLead.frustumCulled = false;
    this.wireLead.visible = false;
    this.scene.add(this.wireLead);
    this._wireFrom = new THREE.Vector3();
    this._wireTo = new THREE.Vector3();
    this._wireMid = new THREE.Vector3();
    this.weather = new Weather(this.scene);
    this.groundFx = new GroundFx(this.scene, this.terrain);
    this.groundFx.audio = this.audio;
    this.groundShadow = this.createGroundShadow();
    this.animate();
  }

  createGroundShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.16)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    shadow.frustumCulled = false;
    this.scene.add(shadow);
    return shadow;
  }

  updateGroundShadow() {
    const aircraft = this.aircraft;
    const ground = this.terrain.getHeightAt(aircraft.position.x, aircraft.position.z);
    const surface = Math.max(ground, 0);
    const agl = Math.max(0, aircraft.position.y - surface);
    const climb = THREE.MathUtils.clamp(agl / 80, 0, 1);
    const radius = 6.5 + climb * 20;
    this.groundShadow.position.set(aircraft.position.x, surface + 0.4, aircraft.position.z);
    this.groundShadow.scale.setScalar(radius);
    this.groundShadow.material.opacity = 0.9 - climb * 0.4;
  }

  updateCamera(delta) {
    const inPlane = this.mode === 'IN_AIRCRAFT';
    const targetPos = inPlane ? this.aircraft.position : this.player.position;

    const zoom = inPlane ? 0 : (this.walkZoom || 0);
    const near = !inPlane && zoom > 0.55 ? 0.25 : 1.5;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    if (inPlane) {
      this.planeLookIdle += delta;
      if (this.planeLookIdle > 3.5) {
        const settle = 1 - Math.exp(-1.6 * delta);
        this.planeLookYaw = THREE.MathUtils.lerp(this.planeLookYaw, 0, settle);
        this.planeLookPitch = THREE.MathUtils.lerp(this.planeLookPitch, 0, settle);
      }
      const yaw = this.aircraft.heading + this.planeLookYaw;
      const orbit = THREE.MathUtils.clamp(0.6 + this.planeLookPitch, 0.1, 1.2);
      const dist = 30;
      const horiz = Math.cos(orbit) * dist;
      const height = Math.sin(orbit) * dist;
      this.camera.position.set(
        targetPos.x - Math.sin(yaw) * horiz,
        targetPos.y + height,
        targetPos.z - Math.cos(yaw) * horiz
      );
      this.camera.lookAt(
        targetPos.x + Math.sin(yaw) * 12,
        targetPos.y + 2,
        targetPos.z + Math.cos(yaw) * 12
      );
      return;
    }

    const yaw = this.player.mesh.rotation.y;
    const back = 20 + (0.28 - 20) * zoom;
    const height = 24 + (1.62 - 24) * zoom;
    const ahead = 6 + (12 - 6) * zoom;
    const lookH = 0.6 + (1.55 - 0.6) * zoom;
    const pitchBlend = THREE.MathUtils.smoothstep(zoom, 0.45, 0.85);
    const pitch = (this.player.lookPitch || 0) * pitchBlend;
    this.camera.position.set(
      targetPos.x - Math.sin(yaw) * back,
      targetPos.y + height,
      targetPos.z - Math.cos(yaw) * back
    );
    const look = new THREE.Vector3(
      targetPos.x + Math.sin(yaw) * ahead,
      targetPos.y + lookH,
      targetPos.z + Math.cos(yaw) * ahead
    );
    if (pitchBlend > 0) {
      const pitched = this.camera.position.clone().add(new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        -Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      ).multiplyScalar(12));
      look.lerp(pitched, pitchBlend);
    }
    if (this.player.inWater) {
      const floorY = this.player.waterSurface + 0.6;
      if (this.camera.position.y < floorY) this.camera.position.y = floorY;
      if (look.y < this.player.waterSurface + 0.25) look.y = this.player.waterSurface + 0.25;
    }
    this.camera.lookAt(look);
    if (this.player.active) this.player.mesh.visible = zoom < 0.72;
  }

  handleStateTransitions() {
    const dist = this.player.position.distanceTo(this.aircraft.position);
    const panelOut = this.solar && this.solar.blocksPower;
    const packPrompt = (cockpit) => `Pack the solar panel${cockpit ? ' [G]' : ''} before adding power`;

    if (this.mode === 'ON_FOOT') {
      const placing = !!this.activePlaceable();
      const parked = this.aircraftState === 'PARKED';
      const nearPlane = parked && dist < 8;
      if (this.lamp && !placing && !this.buildOpen && !this.lamp.charging && this.keyJustPressed['KeyL']) {
        if (this.lamp.toggle()) this.audio.click();
      }
      if (placing) {
        // Prompt is written after the ghost is aimed.
      } else if (this.solar && this.solar.cabling) {
        const atPlug = this.solar.inPlugRange(this.player);
        const name = this.solar.target === 'battery' ? 'battery' : 'fuselage';
        this.uiPrompt.innerText = atPlug
          ? `Click to plug the cable into the ${name}`
          : `Walk the cable to the ${name} and click to plug it in`;
      } else if (this.tentPower && this.tentPower.cabling) {
        const atPlug = this.tentPower.inPlugRange(this.player);
        const name = this.tentPower.target === 'battery' ? 'battery' : 'fuselage';
        this.uiPrompt.innerText = atPlug
          ? `Click to plug the tent cable into the ${name}`
          : `Walk the tent cable to the ${name} and click to plug it in`;
      } else if (this.turbine && this.turbine.cabling) {
        const atPlug = this.turbine.inPlugRange(this.player);
        const name = this.turbine.target === 'tent' ? 'tent' : (this.turbine.target === 'battery' ? 'battery' : 'fuselage');
        this.uiPrompt.innerText = atPlug
          ? `Click to plug the cable into the ${name}`
          : `Walk the cable to the ${name} and click to plug it in`;
      } else if (this.lamp && this.lamp.charging && this.lamp.source !== 'seek') {
        this.uiPrompt.innerText = 'Charging the lamp. Middle mouse cancels.';
      } else if (this.nearestCatch() && !this.heldFish && (!this.closestGear(true) || this.nearestCatch().d < this.closestGear(true).d)) {
        this.uiPrompt.innerText = 'Press [E] to pick up the fish.';
      } else if (this.closestGear(true)) {
        const here = this.closestGear(true);
        const extra = this.heldFish && here.kind !== 'fire' ? ' Click drops the raw fish.' : '';
        this.uiPrompt.innerText = this.gearPrompt(here) + extra;
      } else if (this.heldFish) {
        this.uiPrompt.innerText = 'Raw fish in hand. Click a lit campfire to cook it. Any other click drops it.';
      } else if (this.canDrinkPond()) {
        this.uiPrompt.innerText = 'Press [E] to drink.';
      } else if (nearPlane && panelOut) {
        this.uiPrompt.innerText = packPrompt(false);
      } else if (this.lamp && this.lamp.charge <= 0) {
        this.uiPrompt.innerText = 'Lamp is flat. Charge it at the plane.';
      } else if (this.lamp && !this.lamp.lit && this.daylight < 0.45) {
        this.uiPrompt.innerText = 'L lamp';
      } else {
        this.uiPrompt.innerText = '';
      }
      if (!placing && this.keyJustPressed['KeyF']) this.packHere();
      if (!placing && this.keyJustPressed['KeyE']) this.useHere();
      if (this.wire) this.uiPrompt.innerText = this.wireNote || 'Left click the other end. E cancels.';
    } else if (this.mode === 'IN_AIRCRAFT') {
      if (this.aircraftState === 'PARKED') {
        this.uiPrompt.innerText = panelOut
          ? packPrompt(true)
          : 'Hold [W] to add power and take off. [S] reduces power. [E] Exit';
        if (this.keyJustPressed['KeyG'] && panelOut && this.solar) {
          this.solar.pack();
          this.keepGear('solar');
          this.audio.flap();
        }
        if (this.keyJustPressed['KeyE']) {
          this.audio.click();
          this.mode = 'ON_FOOT';
          this.player.position.copy(this.aircraft.position).add(new THREE.Vector3(3, 0, 0));
          this.player.setActive(true);
          this.uiPrompt.innerText = '';
        }
      } else {
        this.uiPrompt.innerText = this.landingHint > 0
          ? 'Too steep or wet. Add power and find gentler ground.'
          : 'W climbs. S descends. Cruise power holds this height. The climb stops at the ceiling.';
      }
    }

    const charge = Math.round(this.aircraft.charge);
    const rain = this.weather && this.weather.amount > 0.35 ? ' | Rain' : '';
    this.uiState.innerText = `State: ${this.mode} | Aircraft: ${this.aircraftState} | Charge ${charge}% | ${this.timeLabel()}${rain}`;
    this.uiControls.innerText = this.mode === 'ON_FOOT'
      ? 'Click to look. Mouse looks. Scroll zooms. W forward, S back, A/D strafe, Shift runs. Middle mouse places. [E] Use  [F] Unplug or pack  [L] Lamp'
      : 'Click to look. Mouse looks. W adds power, S reduces it, A/D turn. [E] Exit';
    if (this.uiBuild) this.uiBuild.innerText = '';
    this.paintBag();
    const kit = this.field;
    const barrelLine = this.barrel && !this.barrel.packed ? `<br><b>Barrel</b> ${Math.round(this.barrel.water)}` : '';
    const nearCell = this.batteryNear();
    const cellLine = nearCell ? `<br><b>Battery</b> ${Math.round(nearCell.charge)}` : '';
    const fishLine = this.heldFish ? '<br><b>Fish</b> 1' : '';
    this.uiMeters.innerHTML = this.mode === 'ON_FOOT'
      ? `<b>Hunger</b> ${Math.round(kit.hunger)}<br><b>Thirst</b> ${Math.round(kit.thirst)}<br><b>Stamina</b> ${Math.round(kit.stamina)}<br><b>Lamp</b> ${Math.round(this.lamp ? this.lamp.charge : 0)}${barrelLine}${cellLine}${fishLine}`
      : '';
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.updateDay(delta);

    const onFoot = this.mode === 'ON_FOOT';
    const moving = onFoot && (this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD'] || this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']);
    if (this.field) {
      this.field.update(delta, onFoot, moving);
      this.player.pace = this.field.pace();
      const spot = this.solar && this.solar.connected ? this.solar.spot() : null;
      const sun = spot ? delta * this.field.chargeRate(spot.x, spot.z) * this.daylight : 0;
      if (spot && this.solar.target === 'battery' && this.solar.battery && this.solar.battery.placed) {
        this.solar.battery.charge = Math.min(100, this.solar.battery.charge + sun);
      } else if (!this.aircraft.airborne && spot && this.solar.target === 'plane') {
        this.aircraft.charge = Math.min(100, this.aircraft.charge + sun);
      }
      if (this.aircraft.airborne || this.aircraft.speed > 6) {
        this.aircraft.charge = Math.max(0, this.aircraft.charge - delta * 0.07);
      }
      const gust = this.weather && !this.weather.calm ? this.weather.wind : 0;
      if (gust > 0 && this.turbine && this.turbine.chargesPlane()) {
        const windSpot = this.turbine.spot();
        if (windSpot) {
          this.aircraft.charge = Math.min(100, this.aircraft.charge + delta * this.field.windRate(windSpot.x, windSpot.z) * gust);
        }
      }
      const windCell = this.turbine && this.turbine.fedCell ? this.turbine.fedCell() : null;
      if (gust > 0 && windCell && this.turbine.chargesBattery()) {
        const windSpot = this.turbine.spot();
        if (windSpot) {
          windCell.charge = Math.min(100, windCell.charge + delta * this.field.windRate(windSpot.x, windSpot.z) * gust);
        }
      }
    }
    if (this.barrel) this.barrel.update(delta, this.weather ? this.weather.amount : 0);
    const placingTent = this.tent && this.tent.placing;
    const placingFire = this.fire && this.fire.placing;
    const placingSolar = this.solar && this.solar.placing;
    const placingTurbine = this.turbine && this.turbine.placing;
    const placingBarrel = this.barrel && this.barrel.placing;
    const placingRod = this.rod && this.rod.placing;
    const placingCell = !!this.placingBattery();
    if (this.player) this.player.placing = !!((placingTent || placingFire || placingSolar || placingTurbine || placingBarrel || placingRod || placingCell) && onFoot);
    this.player.update(delta, this.keys);
    if (this.rod) this.rod.update(delta);
    this.ageFish(delta);
    this.drawLooseWire();
    if (this.smurf) this.smurf.update(delta, this.player, onFoot);
    if (this.groundFx && this.player) {
      const running = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
      this.groundFx.updateFeet(this.player, onFoot && moving, running);
      if (this.smurf) {
        const smurfMoving = this.smurf.pose !== 'idle';
        this.groundFx.updateFeet(this.smurf, smurfMoving, this.smurf.pose === 'run', 'smurf', 0.58);
      }
    }
    if (this.groundFx && this.aircraft) {
      const groundY = this.terrain.getHeightAt(this.aircraft.position.x, this.aircraft.position.z);
      const rolling = this.mode === 'IN_AIRCRAFT' && this.aircraft.position.y - groundY < 1.6;
      this.groundFx.update(delta, this.aircraft, rolling, this.camera);
      const heading = this.aircraft.heading;
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      const ax = this.aircraft.position.x;
      const az = this.aircraft.position.z;
      const lx = rolling ? ax + -0.85 * cos + 1.55 * sin : 1e5;
      const lz = rolling ? az - -0.85 * sin + 1.55 * cos : 1e5;
      const rx = rolling ? ax + 0.85 * cos + 1.55 * sin : 1e5;
      const rz = rolling ? az - 0.85 * sin + 1.55 * cos : 1e5;
      const dir = this.player.moveDir;
      this.terrain.setGrassContact(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z,
        dir ? dir.x : 0,
        dir ? dir.z : 0,
        onFoot,
        lx,
        lz,
        rx,
        rz,
        rolling
      );
    }

    if (this.mode === 'IN_AIRCRAFT' && this.aircraft) {
      const gearOut = !!(this.solar && this.solar.blocksPower);
      const rejected = this.aircraft.updatePoweredFlight(delta, this.keys, gearOut);
      if (rejected && this.landingHint <= 0) this.audio.scrape();
      if (rejected) this.landingHint = 3;
      this.aircraftState = !this.aircraft.airborne && this.aircraft.speed < 0.8 ? 'PARKED' : 'FLYING';
    }
    if (this.aircraft) {
      if (this.wasAirborne === false && this.aircraft.airborne) this.audio.liftoff();
      if (this.wasAirborne === true && !this.aircraft.airborne) this.audio.touchdown();
      this.wasAirborne = this.aircraft.airborne;
      const surface = this.player
        ? this.terrain.getSurfaceAt(this.player.position.x, this.player.position.z)
        : null;
      let wind = 0;
      if (onFoot && surface) {
        const open = 1 - Math.min(1, Math.max(0, surface.canopyDist) / 18);
        const coast = 1 - Math.min(1, Math.max(0, surface.shoreDist) / 50);
        wind = 0.25 + open * 0.35 + coast * 0.4;
      }
      this.audio.wind(wind);
      this.audio.prop(this.aircraft.power, this.aircraft.speed, this.aircraft.airborne);
    }

    if (this.landingHint > 0) this.landingHint -= delta;
    this.updateGroundShadow();
    const focus = this.mode === 'ON_FOOT' ? this.player.position : this.aircraft.position;
    const wide = this.mode === 'ON_FOOT' && (this.walkZoom || 0) === 0;
    this.terrain.update(delta, focus.x, focus.z, focus.y + 1.1, wide);
    this.updateShadowFocus();

    this.handleStateTransitions();
    this.updateCamera(delta);
    if (this.weather) {
      this.weather.update(delta, this.camera);
      this.audio.rain(this.weather.amount);
    }
    const placing = this.activePlaceable();
    if (placing && onFoot) {
      placing.aim(this.player);
      const spot = placing.placeable || placing;
      const name = spot.aimLabel;
      this.uiPrompt.innerText = spot.valid
        ? `Aim ${name}. Mouse forward and back sets distance. Scroll rotates. Click to place.`
        : `Aim ${name}. Mouse forward and back sets distance. Scroll rotates. Click to place. ${spot.reason}`;
    }
    if (this.fire) this.fire.update(delta);
    if (this.birds && this.player && this.aircraft) {
      const focus = onFoot ? this.player.position : this.aircraft.position;
      const rain = this.weather ? this.weather.amount : 0;
      this.birds.update(delta, focus, onFoot, this.daylight, rain, this.fire, this.aircraft);
      if (this.fishLife) this.fishLife.update(delta, focus);
      if (this.turtles) this.turtles.update(delta, focus);
    }
    if (this.solar && this.player) this.solar.update(this.player);
    if (this.turbine && this.player) {
      const windSpot = this.turbine.spot();
      const rate = windSpot && this.field ? this.field.windRate(windSpot.x, windSpot.z) : 0;
      const gust = this.weather ? this.weather.wind : 0;
      this.turbine.update(delta, this.player, rate, gust);
    }
    if (this.lamp && this.player) this.lamp.update(delta, onFoot);
    if (this.tentPower && this.player) this.tentPower.update(delta, this.player, this.daylight);

    this.keyJustPressed = {};

    this.composer.render();
  }

  updateDay(delta) {
    this.dayTime = (this.dayTime + delta) % this.dayLength;
    const pitch = (this.dayTime / this.dayLength) * Math.PI * 2;
    this.sunPitch = pitch;
    const horiz = Math.cos(pitch);
    this.sunOffset.set(210 * horiz, Math.sin(pitch) * 160, 60 * horiz);

    const sunDir = this._sunDir;
    sunDir.copy(this.sunOffset).normalize();
    const elev = sunDir.y;
    const daylight = THREE.MathUtils.smoothstep(elev, -0.02, 0.18);
    this.daylight = daylight;
    if (this.field) this.field.daylight = daylight;

    const dayBlend = THREE.MathUtils.smoothstep(elev, 0.05, 0.35);
    const nightBlend = 1 - THREE.MathUtils.smoothstep(elev, -0.2, -0.02);
    this._zenith.copy(this._duskZenith).lerp(this._dayZenith, dayBlend).lerp(this._nightZenith, nightBlend);
    this._horizon.copy(this._duskHorizon).lerp(this._dayHorizon, dayBlend).lerp(this._nightHorizon, nightBlend);
    this._warm.copy(this._duskWarm).lerp(this._dayWarm, dayBlend).lerp(this._nightWarm, nightBlend);

    const sky = this.skyMat.uniforms;
    sky.uZenith.value.copy(this._zenith);
    sky.uHorizon.value.copy(this._horizon);
    sky.uWarm.value.copy(this._warm);
    sky.uDay.value = daylight;

    this.scene.background.copy(this._horizon);
    this._fogColor.copy(this._horizon);
    const rainDim = this.weather ? this.weather.amount : 0;
    if (rainDim > 0) this._fogColor.lerp(this._rainTint, rainDim * 0.45);
    this.scene.fog.color.copy(this._fogColor);

    this.hemi.intensity = THREE.MathUtils.lerp(0.07, 0.55, daylight);
    this.hemi.color.copy(this._nightHemi).lerp(this._dayHemi, daylight);
    this.ambient.intensity = THREE.MathUtils.lerp(0.035, 0.18, daylight);
    this.ambient.color.copy(this._nightAmbient).lerp(this._dayAmbient, daylight);

    const sunUp = elev > 0.02;
    this.dirLight.castShadow = sunUp;
    if (sunUp) {
      this.dirLight.color.copy(this._duskSun).lerp(this._daySun, daylight);
      this.dirLight.intensity = THREE.MathUtils.lerp(0.45, 2.6, daylight);
      this.lightOffset.copy(this.sunOffset);
    } else {
      this.dirLight.color.copy(this._moon);
      this.dirLight.intensity = 0.22;
      this.lightOffset.set(-this.sunOffset.x, Math.max(40, -this.sunOffset.y), -this.sunOffset.z);
    }

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.55, 1.05, daylight) * (1 - (this.weather ? this.weather.amount : 0) * 0.28);
    if (this.terrain) this.terrain.setDaylight(sunDir, daylight);
  }

  timeLabel() {
    const elev = this._sunDir.y;
    const pitch = this.sunPitch;
    if (elev < -0.04) return 'Night';
    if (elev < 0.22) return Math.cos(pitch) > 0 ? 'Morning' : 'Dusk';
    if (pitch < 1.2) return 'Morning';
    return 'Day';
  }

  updateShadowFocus() {
    const focus = this.mode === 'ON_FOOT' ? this.player.position : this.aircraft.position;
    const texel = (220 * 2) / this.dirLight.shadow.mapSize.width;
    const sx = Math.round(focus.x / texel) * texel;
    const sy = Math.round(focus.y / texel) * texel;
    const sz = Math.round(focus.z / texel) * texel;
    this.dirLight.position.set(sx + this.lightOffset.x, sy + this.lightOffset.y, sz + this.lightOffset.z);
    this.dirLight.target.position.set(sx, sy, sz);
    this.dirLight.target.updateMatrixWorld();
  }

  campLines() {
    const lines = [];
    if (this.lamp && this.lamp.charge < 99.5 && this.lamp.source !== 'seek' && !(this.solar && this.solar.cabling) && !(this.tentPower && this.tentPower.cabling) && !(this.turbine && this.turbine.cabling)) {
      lines.push('Attach wire');
    }
    return lines;
  }

  spotDist(mesh) {
    const spot = mesh && mesh.position ? mesh.position : mesh;
    if (!spot || !this.player) return 999;
    return Math.hypot(this.player.position.x - spot.x, this.player.position.z - spot.z);
  }

  closestGear(includePlane) {
    const items = [];
    if (this.rod && this.rod.near(this.player)) items.push({ kind: 'rod', d: this.spotDist(this.rod.placeable.placed) });
    if (this.barrel && this.barrel.near(this.player)) items.push({ kind: 'barrel', d: this.spotDist(this.barrel.placeable.placed) });
    if (this.fire && this.fire.near(this.player)) items.push({ kind: 'fire', d: this.spotDist(this.fire.placeable.placed) });
    if (this.solar && this.solar.near(this.player)) items.push({ kind: 'solar', d: this.spotDist(this.solar.spot()) });
    if (this.turbine && this.turbine.near(this.player)) items.push({ kind: 'turbine', d: this.spotDist(this.turbine.spot()) });
    if (this.tent && this.tent.state === 'placed' && this.tent.nearPlaced(this.player)) items.push({ kind: 'tent', d: this.spotDist(this.tent.placed) });
    if (this.batteries) {
      for (let i = 0; i < this.batteries.length; i++) {
        const cell = this.batteries[i];
        if (!cell.near(this.player) || !cell.placeable.placed) continue;
        items.push({ kind: 'battery', d: this.spotDist(cell.placeable.placed), cell });
      }
    }
    if (includePlane && this.aircraft && !this.aircraft.airborne && this.aircraft.speed < 0.8) {
      const planeD = this.player.position.distanceTo(this.aircraft.position);
      if (planeD < 4.5) items.push({ kind: 'plane', d: planeD });
    }
    items.sort((a, b) => a.d - b.d);
    return items[0] || null;
  }

  gearWired(here) {
    if (!here) return false;
    if (here.kind === 'solar') return !!(this.solar && this.solar.connected);
    if (here.kind === 'turbine') return !!(this.turbine && this.turbine.connected);
    if (here.kind === 'tent') {
      if (this.tentPower && this.tentPower.connected) return true;
      return !!(this.turbine && this.turbine.connected && this.turbine.target === 'tent');
    }
    if (here.kind === 'battery' && here.cell) {
      const cell = here.cell;
      if (this.solar && this.solar.connected && this.solar.battery === cell) return true;
      if (this.turbine && this.turbine.connected && this.turbine.battery === cell) return true;
      if (this.tentPower && this.tentPower.connected && this.tentPower.battery === cell) return true;
      if (this.lamp && this.lamp.charging && this.lamp.source === 'battery' && this.lamp.battery === cell) return true;
    }
    return false;
  }

  gearPrompt(here) {
    const pack = this.gearWired(here) ? 'Press [F] to unplug.' : 'Press [F] to pack.';
    if (here.kind === 'rod') {
      if (this.rod.caught && this.heldFish) return 'A fish is in the net. Your hand is full. Press [F] to pack the rod.';
      return this.rod.caught
        ? 'A fish is in the net. Press [E] to take it. Press [F] to pack the rod.'
        : 'The line is in the water. Press [F] to pack the rod.';
    }
    if (here.kind === 'barrel') {
      const level = Math.round(this.barrel.water);
      return level >= 20
        ? `Barrel ${level}. Press [E] to drink. ${pack}`
        : `Barrel ${level}. It fills when it rains. ${pack}`;
    }
    if (here.kind === 'fire') {
      if (this.heldFish && this.fire.lit) return `Click to cook and eat the fish. Press [E] to put the fire out. ${pack}`;
      if (this.heldFish) return `The fire is out. Click drops the fish. Press [E] to light it. ${pack}`;
      return this.fire.lit
        ? `Press [E] to put the fire out. ${pack}`
        : `Press [E] to light the fire. ${pack}`;
    }
    if (here.kind === 'solar') {
      const spot = this.solar.spot();
      const sun = spot ? `${this.field.sunLabel(spot.x, spot.z)}. ` : '';
      return this.solar.connected ? `${sun}${pack}` : `Press [E] to attach a wire. ${pack}`;
    }
    if (here.kind === 'turbine') {
      const calm = this.weather && this.weather.calm;
      const spot = this.turbine.spot();
      const label = calm ? 'The air is still' : (spot ? this.field.windLabel(spot.x, spot.z) : 'Wind');
      return this.turbine.connected ? `${label}. ${pack}` : `${label}. Press [E] to attach a wire. ${pack}`;
    }
    if (here.kind === 'tent') {
      const hungry = this.field.hunger < 99.5;
      const power = this.tentPower;
      const open = power && !power.connected;
      const use = hungry ? 'Press [E] to eat.' : (open ? 'Press [E] to attach a wire.' : '');
      const cell = power && power.supply === 'battery' ? ' The battery is running the light.' : '';
      return `${use} ${pack}${cell}`.trim();
    }
    if (here.kind === 'battery') {
      return `Battery ${Math.round(here.cell.charge)}. Press [E] to attach a wire. ${pack}`;
    }
    if (here.kind === 'plane') return 'Press [E] to enter the aircraft';
    return '';
  }

  useHere() {
    if (this.wire) {
      this.clearWire();
      return;
    }
    const here = this.closestGear(true);
    const lying = this.nearestCatch();
    if (lying && !this.heldFish && (!here || lying.d < here.d)) {
      this.pickupFish(lying.item);
      return;
    }
    if (!here) {
      if (this.canDrinkPond()) this.drinkPond();
      return;
    }
    this.wireNote = '';
    if (here.kind === 'rod' && this.rod.caught && !this.heldFish) {
      const kind = this.rod.takeFish();
      if (kind === false) return;
      this.heldFish = true;
      this.showHeldFish(kind);
      this.audio.click();
      return;
    }
    if (here.kind === 'barrel' && this.barrel.takeDrink()) {
      this.field.drink();
      this.audio.pour();
      return;
    }
    if (here.kind === 'fire') {
      this.fire.setLit(!this.fire.lit);
      this.audio.click();
      return;
    }
    if (here.kind === 'solar' && !this.solar.connected && this.solar.startCable()) {
      this.wire = { from: 'solar' };
      return;
    }
    if (here.kind === 'turbine' && !this.turbine.connected && this.turbine.startCable()) {
      this.wire = { from: 'turbine' };
      return;
    }
    if (here.kind === 'battery') {
      this.wire = { from: 'battery', cell: here.cell };
      return;
    }
    if (here.kind === 'tent' && this.tentPower) {
      if (this.field.hunger < 99.5) {
        this.field.eat();
        this.audio.click();
        return;
      }
      if (!this.tentPower.connected && this.tentPower.startCable()) this.wire = { from: 'tent' };
      return;
    }
    if (here.kind === 'plane') {
      this.audio.click();
      this.mode = 'IN_AIRCRAFT';
      this.planeLookYaw = 0;
      this.planeLookPitch = 0;
      this.planeLookIdle = 1;
      this.player.setActive(false);
      this.aircraft.airborne = false;
      this.buildOpen = false;
    }
  }

  canDrinkPond() {
    if (!this.player || !this.terrain || !this.field || this.field.thirst >= 99) return false;
    const yaw = this.player.mesh.rotation.y;
    const spots = [
      [this.player.position.x, this.player.position.z],
      [this.player.position.x + Math.sin(yaw) * 1.2, this.player.position.z + Math.cos(yaw) * 1.2]
    ];
    for (let i = 0; i < spots.length; i++) {
      const water = this.terrain.waterAt(spots[i][0], spots[i][1]);
      if (water.kind === 'lake' && water.depth > 0.12) return true;
    }
    return false;
  }

  drinkPond() {
    this.field.drink();
    this.audio.pour();
  }

  cookFish() {
    if (!this.heldFish) return;
    this.heldFish = false;
    this.clearHeldFish();
    this.field.eatFish();
    this.audio.click();
  }

  showHeldFish(kind) {
    this.clearHeldFish();
    this.heldKind = kind;
    const templates = this.fishTemplates;
    if (kind >= 0 && templates && templates[kind]) {
      this.fishCarry.add(cloneFish(templates[kind]));
    } else {
      const mesh = new THREE.Mesh(
        this.fishShape,
        new THREE.MeshStandardMaterial({ color: 0xc47a45, roughness: 0.55 })
      );
      mesh.scale.set(1.6, 0.5, 0.7);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.fishCarry.add(mesh);
    }
    this.fishCarry.visible = true;
  }

  clearHeldFish() {
    while (this.fishCarry.children.length) {
      const child = this.fishCarry.children[0];
      this.fishCarry.remove(child);
      if (child.geometry === this.fishShape) child.material.dispose();
      else disposeFish(child);
    }
    this.fishCarry.visible = false;
    this.heldKind = -1;
  }

  dropFish() {
    if (!this.heldFish) return;
    const kind = this.heldKind;
    this.heldFish = false;
    this.clearHeldFish();
    const yaw = this.player.mesh.rotation.y;
    const x = this.player.position.x + Math.sin(yaw) * 0.7;
    const z = this.player.position.z + Math.cos(yaw) * 0.7;
    const templates = this.fishTemplates;
    let mesh;
    let lift = 0.05;
    if (kind >= 0 && templates && templates[kind]) {
      mesh = cloneFish(templates[kind]);
      mesh.rotation.y = yaw;
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (!box.isEmpty()) lift = -box.min.y;
    } else {
      mesh = new THREE.Mesh(
        this.fishShape,
        new THREE.MeshStandardMaterial({ color: 0xc47a45, roughness: 0.7 })
      );
      mesh.scale.set(1.6, 0.5, 0.7);
      mesh.rotation.y = yaw;
      mesh.castShadow = true;
    }
    mesh.position.set(x, this.terrain.getHeightAt(x, z) + lift, z);
    this.scene.add(mesh);
    this.groundFish.push({ mesh, life: FISH_ROT, kind });
  }

  nearestCatch() {
    if (!this.groundFish || !this.player) return null;
    let best = null;
    let bestD = FISH_PICK;
    for (let i = 0; i < this.groundFish.length; i++) {
      const item = this.groundFish[i];
      const d = Math.hypot(this.player.position.x - item.mesh.position.x, this.player.position.z - item.mesh.position.z);
      if (d <= bestD) {
        best = { item, d };
        bestD = d;
      }
    }
    return best;
  }

  pickupFish(item) {
    const index = this.groundFish.indexOf(item);
    if (index < 0 || this.heldFish) return;
    this.groundFish.splice(index, 1);
    this.scene.remove(item.mesh);
    if (item.kind >= 0) disposeFish(item.mesh);
    else item.mesh.material.dispose();
    this.heldFish = true;
    this.showHeldFish(item.kind);
    this.audio.click();
  }

  darkenFish(root, fresh) {
    const gain = 0.45 + fresh * 0.55;
    root.traverse((child) => {
      if (!child.isMesh) return;
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of list) {
        if (!mat || !mat.color) continue;
        if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
        mat.color.copy(mat.userData.baseColor).multiplyScalar(gain);
      }
    });
  }

  ageFish(delta) {
    if (!this.groundFish) return;
    for (let i = this.groundFish.length - 1; i >= 0; i--) {
      const item = this.groundFish[i];
      item.life -= delta;
      const fresh = Math.max(0, item.life / FISH_ROT);
      if (item.kind >= 0) this.darkenFish(item.mesh, fresh);
      else item.mesh.material.color.setRGB(0.35 + fresh * 0.42, 0.22 + fresh * 0.26, 0.12 + fresh * 0.15);
      if (item.life > 0) continue;
      this.scene.remove(item.mesh);
      if (item.kind >= 0) disposeFish(item.mesh);
      else item.mesh.material.dispose();
      this.groundFish.splice(i, 1);
    }
  }

  packHere() {
    const here = this.closestGear(false);
    if (!here || here.kind === 'plane') return;
    if (this.releaseWires(here)) {
      this.audio.click();
      return;
    }
    this.stowGear(here);
  }

  releaseWires(here) {
    let cut = false;
    if (here.kind === 'solar' && this.solar && this.solar.connected) {
      this.solar.unplug();
      cut = true;
    }
    if (here.kind === 'turbine' && this.turbine && this.turbine.connected) {
      this.turbine.unplug();
      cut = true;
    }
    if (here.kind === 'tent') {
      if (this.tentPower && this.tentPower.connected) {
        this.tentPower.unplug();
        cut = true;
      }
      if (this.turbine && this.turbine.connected && this.turbine.target === 'tent') {
        this.turbine.unplug();
        cut = true;
      }
    }
    if (here.kind === 'battery' && here.cell) {
      const cell = here.cell;
      if (this.solar && this.solar.connected && this.solar.battery === cell) {
        this.solar.unplug();
        cut = true;
      }
      if (this.turbine && this.turbine.connected && this.turbine.battery === cell) {
        this.turbine.unplug();
        cut = true;
      }
      if (this.tentPower && this.tentPower.connected && this.tentPower.battery === cell) {
        this.tentPower.unplug();
        cut = true;
      }
      if (this.lamp && this.lamp.charging && this.lamp.battery === cell) {
        this.lamp.stopCharge();
        cut = true;
      }
    }
    if (cut && this.wire && (this.wire.from === here.kind || (here.cell && this.wire.cell === here.cell))) this.clearWire();
    return cut;
  }

  stowGear(here) {
    if (this.wire && (this.wire.from === here.kind || (here.cell && this.wire.cell === here.cell))) this.clearWire();
    if (here.kind === 'tent' && this.tent) {
      this.tent.pack();
      this.keepGear('tent');
      if (this.tentPower) this.tentPower.drop();
      if (this.turbine) this.turbine.dropIfTent();
    } else if (here.kind === 'fire' && this.fire) {
      this.fire.pack();
      this.keepGear('fire');
    } else if (here.kind === 'solar' && this.solar) {
      this.solar.pack();
      this.keepGear('solar');
    } else if (here.kind === 'turbine' && this.turbine) {
      this.turbine.pack();
      this.keepGear('turbine');
    } else if (here.kind === 'barrel' && this.barrel) {
      this.barrel.pack();
      this.keepGear('barrel');
    } else if (here.kind === 'rod' && this.rod) {
      this.rod.pack();
      this.keepGear('rod');
    } else if (here.kind === 'battery' && here.cell) {
      here.cell.pack();
      this.keepGear('battery');
    } else {
      return;
    }
    this.audio.click();
  }

  clearWire() {
    this.wire = null;
    this.wireNote = '';
    if (this.solar && this.solar.cabling) this.solar.cancelCable();
    if (this.turbine && this.turbine.cabling) this.turbine.cancelCable();
    if (this.tentPower && this.tentPower.cabling) this.tentPower.cancelCable();
    if (this.lamp && this.lamp.source === 'seek') this.lamp.stopCharge();
    if (this.wireLead) this.wireLead.visible = false;
  }

  closestEnd() {
    const p = this.player.position;
    const reach = 3.5;
    const ends = [];
    const from = this.wire && this.wire.from;
    if (this.aircraft && !this.aircraft.airborne && this.aircraft.speed < 0.8) {
      const d = p.distanceTo(this.aircraft.position);
      if (d <= reach && from !== 'plane') ends.push({ kind: 'plane', d });
    }
    const cell = this.batteries ? this.batteries.find((item) => item.placed && item.placeable.placed && p.distanceTo(item.placeable.placed.position) <= reach) : null;
    if (cell && !(from === 'battery' && this.wire.cell === cell)) {
      ends.push({ kind: 'battery', cell, d: p.distanceTo(cell.placeable.placed.position) });
    }
    if (this.solar && !this.solar.packed && this.solar.near(this.player) && from !== 'solar') {
      const spot = this.solar.spot();
      ends.push({ kind: 'solar', d: Math.hypot(p.x - spot.x, p.z - spot.z) });
    }
    if (this.turbine && !this.turbine.packed && this.turbine.near(this.player) && from !== 'turbine') {
      const spot = this.turbine.spot();
      ends.push({ kind: 'turbine', d: Math.hypot(p.x - spot.x, p.z - spot.z) });
    }
    if (this.tent && this.tent.state === 'placed' && this.tent.nearPlaced(this.player) && from !== 'tent') {
      const spot = this.tent.placed.position;
      ends.push({ kind: 'tent', d: Math.hypot(p.x - spot.x, p.z - spot.z) });
    }
    ends.sort((a, b) => a.d - b.d);
    return ends[0] || null;
  }

  joinWire(end) {
    const from = this.wire.from;
    const kind = end.kind;
    const pair = from < kind ? `${from}-${kind}` : `${kind}-${from}`;
    const cell = from === 'battery' ? this.wire.cell : end.cell;
    if (pair === 'battery-solar' && this.solar && !this.solar.packed && this.solar.lead !== 'connected') {
      this.solar.target = 'battery';
      this.solar.battery = cell;
      this.solar.lead = 'connected';
      return true;
    }
    if (pair === 'plane-solar' && this.solar && !this.solar.packed && this.solar.lead !== 'connected') {
      this.solar.target = 'plane';
      this.solar.battery = null;
      this.solar.lead = 'connected';
      return true;
    }
    if (pair === 'battery-turbine' && this.turbine && !this.turbine.packed && this.turbine.lead !== 'connected') {
      this.turbine.target = 'battery';
      this.turbine.battery = cell;
      this.turbine.lead = 'connected';
      return true;
    }
    if (pair === 'plane-turbine' && this.turbine && !this.turbine.packed && this.turbine.lead !== 'connected') {
      this.turbine.target = 'plane';
      this.turbine.battery = null;
      this.turbine.lead = 'connected';
      return true;
    }
    if (pair === 'tent-turbine' && this.turbine && !this.turbine.packed && this.turbine.lead !== 'connected' && this.tent && this.tent.state === 'placed') {
      this.turbine.target = 'tent';
      this.turbine.battery = null;
      this.turbine.lead = 'connected';
      return true;
    }
    if (pair === 'battery-tent' && this.tentPower && this.tent && this.tent.state === 'placed' && this.tentPower.lead !== 'connected') {
      this.tentPower.target = 'battery';
      this.tentPower.battery = cell;
      this.tentPower.lead = 'connected';
      return true;
    }
    if (pair === 'plane-tent' && this.tentPower && this.tent && this.tent.state === 'placed' && this.tentPower.lead !== 'connected') {
      this.tentPower.target = 'plane';
      this.tentPower.battery = null;
      this.tentPower.lead = 'connected';
      return true;
    }
    if (pair === 'battery-lamp' && this.lamp && cell && cell.charge > 0 && this.lamp.charge < 99.5 && this.lamp.source === 'seek') {
      this.lamp.battery = cell;
      this.lamp.source = 'battery';
      this.lamp.charging = true;
      this.lamp.lit = false;
      return true;
    }
    if (pair === 'lamp-plane' && this.lamp && this.lamp.canChargePlane() && this.lamp.source === 'seek') {
      this.lamp.source = 'plane';
      this.lamp.charging = true;
      this.lamp.lit = false;
      return true;
    }
    return false;
  }

  landWire() {
    const end = this.closestEnd();
    if (!end || !this.joinWire(end)) {
      if (end || (this.fire && this.fire.near(this.player)) || (this.barrel && this.barrel.near(this.player)) || (this.rod && this.rod.near(this.player))) {
        this.wireNote = "That doesn't take this cable.";
      }
      return;
    }
    if (this.lamp && this.lamp.source === 'seek') this.lamp.stopCharge();
    this.wire = null;
    this.wireNote = '';
    this.audio.click();
  }

  drawLooseWire() {
    if (!this.wireLead) return;
    if (!this.wire || this.wire.from !== 'battery' || !this.wire.cell || !this.wire.cell.placed || !this.player) {
      this.wireLead.visible = false;
      return;
    }
    const yaw = this.player.mesh.rotation.y;
    this._wireTo.set(
      this.player.position.x + Math.sin(yaw) * 0.7,
      this.player.position.y + 0.95,
      this.player.position.z + Math.cos(yaw) * 0.7
    );
    this.wire.cell.socket(this._wireFrom);
    this._wireMid.lerpVectors(this._wireFrom, this._wireTo, 0.5);
    const dist = this._wireFrom.distanceTo(this._wireTo);
    this._wireMid.y -= Math.min(0.85, Math.max(0.12, dist * 0.08));
    const curve = new THREE.CatmullRomCurve3([this._wireFrom, this._wireMid, this._wireTo]);
    const next = new THREE.TubeGeometry(curve, 12, 0.018, 5, false);
    this.wireLead.geometry.dispose();
    this.wireLead.geometry = next;
    this.wireLead.visible = true;
  }

  gearIcon(id) {
    const paths = {
      tent: '<path d="M6 28 L18 6 L30 28 Z" fill="none" stroke="currentColor" stroke-width="2"/>',
      fire: '<path d="M18 30c6 0 8-5 6-10-3 2-4 2-5-2 0 0-7 4-7 12 0 4 2 6 6 6z" fill="currentColor"/>',
      solar: '<rect x="6" y="10" width="24" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17h24M14 10v14M22 10v14" stroke="currentColor"/>',
      turbine: '<path d="M18 30V14M18 14l-8 4M18 14l8 4M18 14V6" fill="none" stroke="currentColor" stroke-width="2"/>',
      barrel: '<path d="M12 8h12v20H12z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16h12" stroke="currentColor"/>',
      rod: '<path d="M8 28 L26 8" stroke="currentColor" stroke-width="2"/><circle cx="27" cy="8" r="2" fill="currentColor"/>',
      battery: '<rect x="8" y="12" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 12V8M22 12V8" stroke="currentColor" stroke-width="2"/>'
    };
    return `<svg viewBox="0 0 36 36" aria-hidden="true">${paths[id] || ''}</svg>`;
  }

  gearSlots() {
    const rows = [
      ['tent', 'Tent', this.tent && this.tent.state === 'packed'],
      ['fire', 'Fire', this.fire && this.fire.packed],
      ['solar', 'Solar', this.solar && this.solar.packed],
      ['turbine', 'Turbine', this.turbine && this.turbine.packed],
      ['barrel', 'Barrel', this.barrel && this.barrel.packed],
      ['rod', 'Rod', this.rod && this.rod.packed],
      ['battery', 'Battery', true]
    ];
    const slots = [];
    for (let i = 0; i < rows.length; i++) {
      const count = this.carried ? this.carried[rows[i][0]] : 0;
      if (count > 0 && rows[i][2]) slots.push({ id: rows[i][0], label: rows[i][1], count });
    }
    return slots;
  }

  bagSize() {
    return this.gearSlots().length + this.campLines().length;
  }

  placingBattery() {
    if (!this.batteries) return null;
    for (let i = 0; i < this.batteries.length; i++) {
      if (this.batteries[i].placing) return this.batteries[i];
    }
    return null;
  }

  batteryNear() {
    if (!this.batteries || !this.player) return null;
    for (let i = 0; i < this.batteries.length; i++) {
      if (this.batteries[i].near(this.player)) return this.batteries[i];
    }
    return null;
  }

  placeFromBag(id) {
    if (!this.carried || this.carried[id] <= 0) return false;
    if (id === 'battery') {
      let cell = null;
      for (let i = 0; i < this.batteries.length; i++) {
        if (this.batteries[i].packed) cell = this.batteries[i];
      }
      if (!cell) {
        cell = new CarBattery(this.scene, this.terrain);
        this.batteries.push(cell);
      }
      cell.startPlacing(this.player);
      return true;
    }
    const gear = { tent: this.tent, fire: this.fire, solar: this.solar, turbine: this.turbine, barrel: this.barrel, rod: this.rod };
    const piece = gear[id];
    if (!piece || !piece.startPlacing) return false;
    piece.startPlacing(this.player);
    return true;
  }

  spendGear(id) {
    if (this.carried && this.carried[id] > 0) this.carried[id] -= 1;
  }

  keepGear(id) {
    if (!this.carried) return;
    this.carried[id] += 1;
  }

  paintBag() {
    if (!this.uiBag) return;
    if (!this.buildOpen || this.mode !== 'ON_FOOT') {
      this.uiBag.innerHTML = '';
      return;
    }
    const slots = this.gearSlots();
    const lines = this.campLines();
    if (!slots.length && !lines.length) {
      this.uiBag.innerHTML = '';
      return;
    }
    const icons = slots.map((slot, i) => (
      `<div class="slot${i === this.buildIndex ? ' on' : ''}">${this.gearIcon(slot.id)}<span>${slot.label}</span><b>${slot.count}</b></div>`
    )).join('');
    const acts = lines.map((line, i) => (
      `<div class="act${slots.length + i === this.buildIndex ? ' on' : ''}">${line}</div>`
    )).join('');
    this.uiBag.innerHTML = `<div class="bag-row">${icons}</div><div class="bag-row">${acts}</div>`;
  }

  activePlaceable() {
    if (this.tent && this.tent.placing) return this.tent;
    if (this.fire && this.fire.placing) return this.fire;
    if (this.solar && this.solar.placing) return this.solar;
    if (this.turbine && this.turbine.placing) return this.turbine;
    if (this.barrel && this.barrel.placing) return this.barrel;
    if (this.rod && this.rod.placing) return this.rod;
    if (this.placingBattery()) return this.placingBattery();
    return null;
  }

  onMiddleClick() {
    if (this.mode !== 'ON_FOOT') return;
    if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
    if (this.tent && this.tent.placing) {
      this.tent.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.fire && this.fire.placing) {
      this.fire.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.solar && this.solar.placing) {
      this.solar.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.turbine && this.turbine.placing) {
      this.turbine.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.barrel && this.barrel.placing) {
      this.barrel.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.rod && this.rod.placing) {
      this.rod.cancel();
      this.buildOpen = false;
      return;
    }
    const placingCell = this.placingBattery();
    if (placingCell) {
      placingCell.cancel();
      this.buildOpen = false;
      return;
    }
    if (this.wire || (this.solar && this.solar.cabling)) {
      this.clearWire();
      this.buildOpen = false;
      return;
    }
    if (this.turbine && this.turbine.cabling) {
      this.turbine.cancelCable();
      this.buildOpen = false;
      return;
    }
    if (this.tentPower && this.tentPower.cabling) {
      this.tentPower.cancelCable();
      this.buildOpen = false;
      return;
    }
    if (this.lamp && this.lamp.charging) {
      this.lamp.stopCharge();
      this.buildOpen = false;
      return;
    }
    if (this.buildOpen) {
      this.buildOpen = false;
      return;
    }
    if (this.bagSize()) {
      this.buildIndex = 0;
      this.buildOpen = true;
    }
  }

  onLeftClick() {
    if (this.mode !== 'ON_FOOT') return;
    if (this.tent && this.tent.placing) {
      if (this.tent.confirm()) {
        this.spendGear('tent');
        this.audio.click();
      }
      return;
    }
    if (this.fire && this.fire.placing) {
      if (this.fire.confirm()) {
        this.spendGear('fire');
        this.audio.click();
      }
      return;
    }
    if (this.solar && this.solar.placing) {
      if (this.solar.confirm()) {
        this.spendGear('solar');
        this.audio.click();
      }
      return;
    }
    if (this.turbine && this.turbine.placing) {
      if (this.turbine.confirm()) {
        this.spendGear('turbine');
        this.audio.click();
      }
      return;
    }
    if (this.barrel && this.barrel.placing) {
      if (this.barrel.confirm()) {
        this.spendGear('barrel');
        this.audio.click();
      }
      return;
    }
    if (this.rod && this.rod.placing) {
      if (this.rod.confirm()) {
        this.spendGear('rod');
        this.audio.click();
      }
      return;
    }
    const placingCell = this.placingBattery();
    if (placingCell) {
      if (placingCell.confirm()) {
        this.spendGear('battery');
        this.audio.click();
      }
      return;
    }
    if (this.wire) {
      this.landWire();
      return;
    }
    if (this.heldFish && !this.buildOpen) {
      if (this.fire && this.fire.lit && this.fire.near(this.player)) this.cookFish();
      else this.dropFish();
      return;
    }
    if (!this.buildOpen) return;
    const slots = this.gearSlots();
    if (this.buildIndex < slots.length) {
      if (this.placeFromBag(slots[this.buildIndex].id)) {
        this.buildOpen = false;
        this.audio.click();
      }
      return;
    }
    const lines = this.campLines();
    const line = lines[this.buildIndex - slots.length];
    if (line === 'Tent' && this.tent) {
      this.tent.startPlacing(this.player);
    } else if (line === 'Pack tent' && this.tent) {
      this.tent.pack();
      this.keepGear('tent');
      if (this.tentPower) this.tentPower.drop();
      if (this.turbine) this.turbine.dropIfTent();
    } else if (line === 'Unplug tent' && this.tentPower && this.tentPower.connected && this.tent && this.tent.nearPlaced(this.player)) {
      this.tentPower.unplug();
    } else if (line === 'Campfire' && this.fire) {
      this.fire.startPlacing(this.player);
    } else if (line === 'Light fire' && this.fire) {
      this.fire.setLit(true);
    } else if (line === 'Put out fire' && this.fire) {
      this.fire.setLit(false);
    } else if (line === 'Pack campfire' && this.fire) {
      this.fire.pack();
      this.keepGear('fire');
    } else if (line === 'Solar panel' && this.solar) {
      this.solar.startPlacing(this.player);
    } else if (line === 'Unplug panel' && this.solar && this.solar.connected && this.solar.near(this.player)) {
      this.solar.unplug();
    } else if (line === 'Pack solar panel' && this.solar) {
      this.solar.pack();
      this.keepGear('solar');
    } else if (line === 'Wind turbine' && this.turbine) {
      this.turbine.startPlacing(this.player);
    } else if (line === 'Unplug turbine' && this.turbine && this.turbine.connected && this.turbine.near(this.player)) {
      this.turbine.unplug();
    } else if (line === 'Pack wind turbine' && this.turbine) {
      this.turbine.pack();
      this.keepGear('turbine');
    } else if (line === 'Water barrel' && this.barrel) {
      this.barrel.startPlacing(this.player);
    } else if (line === 'Pack water barrel' && this.barrel) {
      this.barrel.pack();
      this.keepGear('barrel');
    } else if (line === 'Fishing rod' && this.rod) {
      this.rod.startPlacing(this.player);
    } else if (line === 'Pack fishing rod' && this.rod) {
      this.rod.pack();
      this.keepGear('rod');
    } else if (line === 'Pack car battery') {
      const cell = this.batteryNear();
      if (!cell) return;
      if (this.solar && this.solar.battery === cell) this.solar.unplug();
      if (this.turbine && this.turbine.battery === cell) this.turbine.unplug();
      if (this.tentPower && this.tentPower.battery === cell) this.tentPower.drop();
      if (this.lamp && this.lamp.battery === cell) this.lamp.stopCharge();
      cell.pack();
      this.keepGear('battery');
    } else if (line === 'Attach wire' && this.lamp) {
      if (!this.lamp.startCharge('seek')) return;
      this.wire = { from: 'lamp' };
    } else {
      return;
    }
    this.buildOpen = false;
    this.audio.click();
  }

  onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
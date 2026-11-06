import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AssetLoader } from './loaders.js';
import { Terrain } from './terrain.js';
import { Airport } from './airport.js';
import { Player } from './player.js';
import { Aircraft } from './aircraft.js';
import { FieldKit } from './fieldkit.js';
import { GroundFx } from './groundfx.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiControls = document.getElementById('controls-info');
    this.uiState = document.getElementById('state-info');
    this.uiPrompt = document.getElementById('prompt-overlay');
    this.uiMeters = document.getElementById('meters');

    this.mode = 'ON_FOOT'; // 'ON_FOOT' | 'IN_AIRCRAFT'
    this.aircraftState = 'PARKED'; // 'PARKED' | 'CRUISE' | 'TAKEOFF' | 'LANDING'
    this.keys = {};
    this.keyJustPressed = {};
    this.landingHint = 0;
    this.chaseView = false;

    this.sunOffset = new THREE.Vector3(210, 120, 60);
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initSky();
    this.initPost();
    this.initInputs();

    this.clock = new THREE.Clock();
    this.boot();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd4e8f6);
    this.scene.fog = new THREE.FogExp2(0xd4e8f6, 0.00034);

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
    const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x6d8f45, 0.55);
    this.scene.add(hemi);

    const ambientLight = new THREE.AmbientLight(0xfff1dd, 0.18);
    this.scene.add(ambientLight);

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
        uWarm: { value: new THREE.Color(0xf0d2a8) }
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
          vec2 cloudUv = dir.xz / max(dir.y, 0.08) * 0.35;
          float clouds = fbm(cloudUv);
          float cloudMask = smoothstep(0.52, 0.72, clouds) * smoothstep(0.08, 0.28, dir.y);
          col = mix(col, vec3(0.96, 0.97, 0.98), cloudMask * 0.82);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
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
      if (!this.keys[e.code]) {
        this.keyJustPressed[e.code] = true;
      }
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keyJustPressed[e.code] = false;
    });
  }

  async boot() {
    this.terrain = new Terrain(this.scene);
    this.airport = new Airport(this.scene, this.terrain);
    const loader = new AssetLoader();
    const [piperMesh, natureScene, grassScene, cliffScene, stoneScene, cloudScene] = await Promise.all([
      loader.loadPiperModel(),
      loader.loadPack('./naturePack.glb'),
      loader.loadPack('./grassPack.glb'),
      loader.loadPack('./cliffPack.glb'),
      loader.loadPack('./stonePack.glb'),
      loader.loadPack('./cloudPack.glb')
    ]);
    const packs = { grass: grassScene, cliff: cliffScene, stone: stoneScene };
    if (natureScene) this.terrain.scatterNature(natureScene, packs);
    else this.terrain.initProps();
    this.terrain.scatterClouds(cloudScene);
    const humanMesh = loader.createHumanAvatar();

    this.player = new Player(this.scene, this.terrain, humanMesh);
    this.aircraft = new Aircraft(this.scene, this.terrain, piperMesh);
    this.field = new FieldKit(this.scene, this.terrain, this.aircraft);
    this.groundFx = new GroundFx(this.scene, this.terrain);
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
    let desiredCamPos;
    let lookAt = targetPos;

    if (inPlane && this.chaseView) {
      const heading = this.aircraft.heading;
      const back = 26;
      desiredCamPos = new THREE.Vector3(
        targetPos.x - Math.sin(heading) * back,
        targetPos.y + 18,
        targetPos.z - Math.cos(heading) * back
      );
      const ahead = 48;
      lookAt = new THREE.Vector3(
        targetPos.x + Math.sin(heading) * ahead,
        targetPos.y + 2,
        targetPos.z + Math.cos(heading) * ahead
      );
    } else {
      const targetD = inPlane ? 35 : 14;
      if (this.currentD === undefined) this.currentD = targetD;
      this.currentD = THREE.MathUtils.lerp(this.currentD, targetD, 0.05);

      const offset = inPlane
        ? new THREE.Vector3(0, 22, 35)
        : new THREE.Vector3(0, 12, 16);
      desiredCamPos = targetPos.clone().add(offset);
    }

    const follow = 1 - Math.exp(-8 * Math.max(0.001, delta));
    this.camera.position.lerp(desiredCamPos, this.chaseView && inPlane ? Math.min(1, follow * 1.4) : follow);
    this.camera.lookAt(lookAt);
  }

  handleStateTransitions() {
    const dist = this.player.position.distanceTo(this.aircraft.position);

    if (this.mode === 'ON_FOOT') {
      const parked = this.aircraftState === 'PARKED';
      const nearPlane = parked && dist < 8;
      const atWater = this.field.waterNearby(this.player.position);
      if (dist < 4.5 && parked) {
        this.uiPrompt.innerText = 'Press [E] to Enter Aircraft';
        if (this.keyJustPressed['KeyE']) {
          this.mode = 'IN_AIRCRAFT';
          this.player.setActive(false);
          this.aircraft.airborne = false;
          this.uiPrompt.innerText = '';
        }
      } else if (atWater) {
        this.uiPrompt.innerText = 'Press [F] to collect water';
      } else if (nearPlane) {
        this.uiPrompt.innerText = this.field.panelOut
          ? `${this.field.sunLabel()}. Press [G] to stow the panel`
          : 'Press [G] to lay out the solar panel';
      } else {
        this.uiPrompt.innerText = '';
      }
      if (atWater && this.keyJustPressed['KeyF']) this.field.collectWater();
      if (nearPlane && this.keyJustPressed['KeyG']) this.field.togglePanel();
    } else if (this.mode === 'IN_AIRCRAFT') {
      if (this.aircraftState !== 'PARKED' && this.keyJustPressed['KeyS']) {
        this.chaseView = !this.chaseView;
      }

      if (this.aircraftState === 'PARKED') {
        this.uiPrompt.innerText = this.field.panelOut
          ? 'Stow the solar panel [G] before adding power'
          : 'Hold [UP] to add power and take off. [DOWN] reduces power. [E] Exit';
        if (this.keyJustPressed['KeyG'] && this.field.panelOut) this.field.togglePanel();
        if (this.keyJustPressed['KeyE']) {
          this.mode = 'ON_FOOT';
          this.player.position.copy(this.aircraft.position).add(new THREE.Vector3(3, 0, 0));
          this.player.setActive(true);
          this.uiPrompt.innerText = '';
        }
      } else {
        this.uiPrompt.innerText = this.landingHint > 0
          ? 'Too steep or wet. Add power and find gentler ground.'
          : 'Up climbs. Down descends. Cruise power holds this height. The climb stops at the ceiling.';
      }
    }

    const charge = Math.round(this.aircraft.charge);
    const load = Math.round(this.aircraft.cargo);
    this.uiState.innerText = `State: ${this.mode} | Aircraft: ${this.aircraftState} | Charge ${charge}% | Load ${load} kg`;
    const chase = this.chaseView ? 'Chase view on' : 'S = Chase view';
    this.uiControls.innerText = this.mode === 'ON_FOOT'
      ? 'On-Foot: WASD / Arrows. [E] Aircraft  [F] Water  [G] Solar panel'
      : `Up adds power. Down reduces it. Left and right turn. ${chase}`;
    const kit = this.field;
    this.uiMeters.innerHTML = this.mode === 'ON_FOOT'
      ? `<b>Hunger</b> ${Math.round(kit.hunger)}<br><b>Thirst</b> ${Math.round(kit.thirst)}<br><b>Stamina</b> ${Math.round(kit.stamina)}<br><b>Water cans</b> ${kit.cans}`
      : '';
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    const onFoot = this.mode === 'ON_FOOT';
    const moving = onFoot && (this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD'] || this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']);
    if (this.field) {
      this.field.update(delta, onFoot, moving);
      this.player.pace = this.field.pace();
      if (!this.aircraft.airborne && this.field.panelOut) {
        this.aircraft.charge = Math.min(100, this.aircraft.charge + delta * this.field.chargeRate());
      } else if (this.aircraft.airborne || this.aircraft.speed > 6) {
        this.aircraft.charge = Math.max(0, this.aircraft.charge - delta * 0.07);
      }
    }
    this.player.update(delta, this.keys);
    if (this.groundFx && this.aircraft) {
      const groundY = this.terrain.getHeightAt(this.aircraft.position.x, this.aircraft.position.z);
      const rolling = this.mode === 'IN_AIRCRAFT' && this.aircraft.position.y - groundY < 1.6;
      this.groundFx.update(delta, this.aircraft, rolling, this.camera);
    }

    if (this.mode === 'IN_AIRCRAFT' && this.aircraft) {
      const rejected = this.aircraft.updatePoweredFlight(delta, this.keys, this.field && this.field.panelOut);
      if (rejected) this.landingHint = 3;
      this.aircraftState = !this.aircraft.airborne && this.aircraft.speed < 0.8 ? 'PARKED' : 'FLYING';
    }

    if (this.landingHint > 0) this.landingHint -= delta;
    this.updateGroundShadow();
    const focus = this.mode === 'ON_FOOT' ? this.player.position : this.aircraft.position;
    this.terrain.update(delta, focus.x, focus.z);
    this.updateShadowFocus();

    this.handleStateTransitions();
    this.updateCamera(delta);

    this.keyJustPressed = {};

    this.composer.render();
  }

  updateShadowFocus() {
    const focus = this.mode === 'ON_FOOT' ? this.player.position : this.aircraft.position;
    const texel = (220 * 2) / this.dirLight.shadow.mapSize.width;
    const sx = Math.round(focus.x / texel) * texel;
    const sy = Math.round(focus.y / texel) * texel;
    const sz = Math.round(focus.z / texel) * texel;
    this.dirLight.position.set(sx + this.sunOffset.x, sy + this.sunOffset.y, sz + this.sunOffset.z);
    this.dirLight.target.position.set(sx, sy, sz);
    this.dirLight.target.updateMatrixWorld();
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
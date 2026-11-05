import * as THREE from 'three';
import { AssetLoader } from './loaders.js';
import { Terrain } from './terrain.js';
import { Airport } from './airport.js';
import { Player } from './player.js';
import { Aircraft } from './aircraft.js';
import { TakeoffManager } from './takeoffManager.js';
import { LandingManager } from './landingManager.js';
import { TaxiManager } from './taxiManager.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiControls = document.getElementById('controls-info');
    this.uiState = document.getElementById('state-info');
    this.uiPrompt = document.getElementById('prompt-overlay');

    this.mode = 'ON_FOOT'; // 'ON_FOOT' | 'IN_AIRCRAFT'
    this.aircraftState = 'PARKED'; // 'PARKED' | 'CRUISE' | 'TAKEOFF' | 'LANDING'
    this.keys = {};
    this.keyJustPressed = {};
    this.landingHint = 0;

    this.initScene();
    this.initCamera();
    this.initLights();
    this.initInputs();

    this.clock = new THREE.Clock();
    this.boot();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.00016);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.3, 12000);
    this.camera.position.set(0, 25, 30);
  }

  initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(100, 150, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 520;
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
    this.takeoffManager = new TakeoffManager(this.terrain);
    this.landingManager = new LandingManager(this.terrain);
    this.taxiManager = new TaxiManager(this.terrain);

    const loader = new AssetLoader();
    const piperMesh = await loader.loadPiperModel();
    const humanMesh = loader.createHumanAvatar();

    this.player = new Player(this.scene, this.terrain, humanMesh);
    this.aircraft = new Aircraft(this.scene, this.terrain, piperMesh);

    this.animate();
  }

  updateCamera() {
    const targetPos = this.mode === 'ON_FOOT' 
      ? this.player.position 
      : this.aircraft.position;

    const targetD = this.mode === 'ON_FOOT' ? 14 : 35;
    const aspect = window.innerWidth / window.innerHeight;
    
    if (this.currentD === undefined) this.currentD = targetD;
    this.currentD = THREE.MathUtils.lerp(this.currentD, targetD, 0.05);

    const offset = this.mode === 'ON_FOOT' 
      ? new THREE.Vector3(0, 12, 16) 
      : new THREE.Vector3(0, 22, 35);

    const desiredCamPos = targetPos.clone().add(offset);
    this.camera.position.lerp(desiredCamPos, 0.1);
    this.camera.lookAt(targetPos);
  }

  handleStateTransitions() {
    const dist = this.player.position.distanceTo(this.aircraft.position);

    if (this.mode === 'ON_FOOT') {
      if (dist < 4.5 && this.aircraftState === 'PARKED') {
        this.uiPrompt.innerText = 'Press [E] to Enter Aircraft';
        if (this.keyJustPressed['KeyE']) {
          this.mode = 'IN_AIRCRAFT';
          this.player.setActive(false);
          this.taxiManager.start(this.aircraft);
          this.uiPrompt.innerText = '';
        }
      } else {
        this.uiPrompt.innerText = '';
      }
    } else if (this.mode === 'IN_AIRCRAFT') {
      if (this.aircraftState === 'PARKED') {
        this.uiPrompt.innerText = 'WASD/Arrows to Taxi | [SPACE] Take Off | [E] Exit Aircraft';
        
        if (this.keyJustPressed['Space']) {
          this.takeoffManager.start(this.aircraft);
          this.aircraftState = 'TAKEOFF';
        } else if (this.keyJustPressed['KeyE']) {
          this.mode = 'ON_FOOT';
          this.player.position.copy(this.aircraft.position).add(new THREE.Vector3(3, 0, 0));
          this.player.setActive(true);
          this.uiPrompt.innerText = '';
        }
      } else if (this.aircraftState === 'CRUISE') {
        this.uiPrompt.innerText = this.landingHint > 0
          ? 'Too steep or wet to land. Use a beach, river bar, or clearing.'
          : 'Press [SPACE] to Land — beaches, river bars, and clearings';

        if (this.keyJustPressed['Space']) {
          this.landingManager.start(this.aircraft);
          this.aircraftState = 'LANDING';
        }
      } else if (this.aircraftState === 'TAKEOFF') {
        this.uiPrompt.innerText = 'Takeoff climb in progress... Press [SPACE] to Abort';
        if (this.keyJustPressed['Space']) {
          this.aircraftState = 'CRUISE';
          this.takeoffManager.active = false;
        }
      } else if (this.aircraftState === 'LANDING') {
        this.uiPrompt.innerText = 'Landing glide & rollout in progress... Press [SPACE] to Abort';
        if (this.keyJustPressed['Space']) {
          this.aircraftState = 'CRUISE';
          this.landingManager.active = false;
        }
      }
    }

    this.uiState.innerText = `State: ${this.mode} | Aircraft: ${this.aircraftState}`;
    this.uiControls.innerText = this.mode === 'ON_FOOT'
      ? 'On-Foot: WASD / Arrows to Move. [E] Enter Aircraft near plane.'
      : 'Flight: Up Arrow / W = Fly Forward | Left/Right Arrows = Turn & Bank | Space = Take Off / Land';
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.player.update(delta, this.keys);

    if (this.mode === 'IN_AIRCRAFT') {
      if (this.aircraftState === 'PARKED') {
        this.taxiManager.update(delta, this.aircraft, this.keys);
      } else if (this.aircraftState === 'CRUISE') {
        this.aircraft.updateManualFlight(delta, this.keys);
      } else if (this.aircraftState === 'TAKEOFF') {
        const result = this.takeoffManager.update(delta, this.aircraft, this.keys);
        if (result === 'CRUISE') this.aircraftState = 'CRUISE';
      } else if (this.aircraftState === 'LANDING') {
        const result = this.landingManager.update(delta, this.aircraft, this.keys);
        if (result === 'PARKED') this.aircraftState = 'PARKED';
        if (result === 'CRUISE') {
          this.aircraftState = 'CRUISE';
          this.landingHint = 4;
        }
      }
    }

    if (this.landingHint > 0) this.landingHint -= delta;
    this.terrain.update(delta);
    this.updateShadowFocus();

    this.handleStateTransitions();
    this.updateCamera();

    this.keyJustPressed = {};

    this.renderer.render(this.scene, this.camera);
  }

  updateShadowFocus() {
    const focus = this.mode === 'ON_FOOT' ? this.player.position : this.aircraft.position;
    this.dirLight.position.set(focus.x + 90, focus.y + 180, focus.z + 50);
    this.dirLight.target.position.set(focus.x, focus.y, focus.z);
    this.dirLight.target.updateMatrixWorld();
  }

  onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
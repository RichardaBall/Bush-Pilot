import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');
    this.loader.setDRACOLoader(draco);
  }

  loadPack(url) {
    return new Promise((resolve) => {
      this.loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    });
  }

  loadNaturePack() {
    return this.loadPack('./naturePack.glb');
  }

  loadPiperModel() {
    return new Promise((resolve) => {
      this.loader.load(
        './piper.glb',
        (gltf) => {
          // Look for an existing propeller in the GLTF model or add one at the nose
          let prop = gltf.scene.getObjectByName('Propeller') || gltf.scene.getObjectByName('prop');
          if (!prop) {
            const propGeo = new THREE.BoxGeometry(1.2, 0.15, 0.05);
            const propMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            prop = new THREE.Mesh(propGeo, propMat);
            prop.position.set(0, 0, 1.8);
            gltf.scene.add(prop);
          }
          gltf.scene.userData.propeller = prop;
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = false;
            }
          });
          resolve(gltf.scene);
        },
        undefined,
        () => {
          // Fallback procedural airplane mesh if piper.glb is not yet provided
          const planeGroup = new THREE.Group();
          
          const bodyGeo = new THREE.ConeGeometry(0.8, 3.5, 8);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.rotation.x = Math.PI / 2;
          planeGroup.add(body);

          const wingGeo = new THREE.BoxGeometry(6, 0.1, 1);
          const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
          const wings = new THREE.Mesh(wingGeo, wingMat);
          wings.position.set(0, 0.3, 0.2);
          planeGroup.add(wings);

          const tailGeo = new THREE.BoxGeometry(1.8, 0.1, 0.6);
          const tail = new THREE.Mesh(tailGeo, wingMat);
          tail.position.set(0, 0.3, -1.4);
          planeGroup.add(tail);

          // Procedural propeller at the nose
          const propGeo = new THREE.BoxGeometry(1.2, 0.15, 0.05);
          const propMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
          const propeller = new THREE.Mesh(propGeo, propMat);
          propeller.position.set(0, 0.3, 1.8);
          planeGroup.add(propeller);
          planeGroup.userData.propeller = propeller;

          planeGroup.castShadow = true;
          planeGroup.traverse((child) => {
            if (child.isMesh) child.castShadow = true;
          });

          resolve(planeGroup);
        }
      );
    });
  }

  createHumanAvatar() {
    const humanGroup = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfde047 });

    // Torso
    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.2, 1.1, 8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    humanGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    humanGroup.add(head);

    // Limbs pivot groups for animation
    const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.8, 6);
    armGeo.translate(0, -0.4, 0);

    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.9, 6);
    legGeo.translate(0, -0.45, 0);

    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(0.32, 1.25, 0);
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArmGroup.add(leftArm);
    humanGroup.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(-0.32, 1.25, 0);
    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArmGroup.add(rightArm);
    humanGroup.add(rightArmGroup);

    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(0.13, 0.45, 0);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLegGroup.add(leftLeg);
    humanGroup.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(-0.13, 0.45, 0);
    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLegGroup.add(rightLeg);
    humanGroup.add(rightLegGroup);

    humanGroup.userData = { leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup };

    humanGroup.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });

    return humanGroup;
  }
}
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');
    this.loader.setDRACOLoader(draco);
    this.fbx = new FBXLoader();
  }

  loadFbx(url) {
    return new Promise((resolve, reject) => {
      this.fbx.load(url, resolve, undefined, reject);
    });
  }

  loadPack(url) {
    return new Promise((resolve) => {
      this.loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    });
  }

  loadNaturePack() {
    return this.loadPack('./models/tropicalPack.glb');
  }

  loadPiperModel() {
    return new Promise((resolve) => {
      this.loader.load(
        './models/piper.glb',
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

  loadHuman() {
    return Promise.all([
      this.loadFbx('./models/Idle.fbx'),
      this.loadFbx('./models/Walking.fbx'),
      this.loadFbx('./models/Running.fbx')
    ]).then(([model, walkFile, runFile]) => {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.001, box.max.y - box.min.y);
      model.scale.setScalar(1.8 / height);

      const prepare = (clip, name) => {
        const track = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
        if (track) {
          const values = track.values;
          const x = values[0];
          const z = values[2];
          for (let i = 0; i < values.length; i += 3) {
            values[i] = x;
            values[i + 2] = z;
          }
        }
        clip.name = name;
        return clip;
      };

      model.animations = [
        prepare(model.animations[0], 'idle'),
        prepare(walkFile.animations[0], 'walk'),
        prepare(runFile.animations[0], 'run')
      ];

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        const source = Array.isArray(child.material) ? child.material : [child.material];
        const next = source.map((mat) => {
          if (!mat) return mat;
          const standard = new THREE.MeshStandardMaterial({
            map: mat.map || null,
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            roughness: 0.72,
            metalness: 0,
            normalMap: mat.normalMap || null,
            transparent: !!mat.transparent,
            opacity: mat.opacity === undefined ? 1 : mat.opacity,
            alphaTest: mat.alphaTest || (mat.transparent ? 0.4 : 0),
            side: mat.side
          });
          if (standard.map) standard.map.colorSpace = THREE.SRGBColorSpace;
          return standard;
        });
        child.material = Array.isArray(child.material) ? next : next[0];
      });

      return model;
    });
  }

  loadSmurf() {
    return this.loadFbx('./models/Smurf.fbx').then((model) => {
      model.traverse((child) => {
        if (child.isLight || child.isCamera) {
          child.visible = false;
          return;
        }
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        const source = Array.isArray(child.material) ? child.material : [child.material];
        const next = source.map((mat) => {
          if (!mat) return mat;
          const standard = new THREE.MeshStandardMaterial({
            map: mat.map || null,
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            roughness: 0.72,
            metalness: 0,
            normalMap: mat.normalMap || null,
            transparent: !!mat.transparent,
            opacity: mat.opacity === undefined ? 1 : mat.opacity,
            alphaTest: mat.alphaTest || (mat.transparent ? 0.4 : 0),
            side: mat.side
          });
          if (standard.map) standard.map.colorSpace = THREE.SRGBColorSpace;
          return standard;
        });
        child.material = Array.isArray(child.material) ? next : next[0];
      });

      const skinned = [];
      model.traverse((obj) => {
        if (obj.isSkinnedMesh) skinned.push(obj);
      });
      const bodyMesh = skinned.find((mesh) => mesh.name === 'body') || skinned[0];
      const skeleton = bodyMesh ? bodyMesh.skeleton : null;
      if (skeleton) {
        for (const mesh of skinned) {
          if (mesh.skeleton !== skeleton) mesh.bind(skeleton, mesh.bindMatrix);
        }
        const keep = new Set(skeleton.bones);
        for (const bone of skeleton.bones) {
          let parent = bone.parent;
          while (parent) {
            keep.add(parent);
            parent = parent.parent;
          }
        }
        const extra = [];
        model.traverse((obj) => {
          if (obj.isBone && !keep.has(obj)) extra.push(obj);
        });
        for (const bone of extra) {
          if (bone.parent) bone.parent.remove(bone);
        }
      }

      const stray = [];
      model.traverse((obj) => {
        if (obj.isMesh && !obj.isSkinnedMesh) stray.push(obj);
      });
      for (const mesh of stray) {
        if (mesh.parent) mesh.parent.remove(mesh);
      }

      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.001, box.max.y - box.min.y);
      model.scale.setScalar(1.1 / height);

      const boneByName = (name) => (skeleton ? skeleton.bones.find((bone) => bone.name === name) : null);
      const hip = boneByName('Bone001');
      const toeR = boneByName('Bone026');
      const toeL = boneByName('Bone047');
      model.updateMatrixWorld(true);
      if (hip && toeR && toeL) {
        const hipPos = new THREE.Vector3();
        const toe = new THREE.Vector3();
        const other = new THREE.Vector3();
        hip.getWorldPosition(hipPos);
        toeR.getWorldPosition(toe);
        toeL.getWorldPosition(other);
        toe.add(other).multiplyScalar(0.5).sub(hipPos);
        toe.y = 0;
        if (toe.lengthSq() > 1e-6) model.rotation.y = -Math.atan2(toe.x, toe.z);
      }

      model.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(model);
      model.position.y -= fitted.min.y;
      model.updateMatrixWorld(true);

      const limbs = {
        thighR: 'Bone023',
        thighL: 'Bone050',
        shinR: 'Bone024',
        shinL: 'Bone045',
        armR: 'Bone004',
        armL: 'Bone027',
        foreR: 'Bone005',
        foreL: 'Bone028',
        chest: 'Bone002'
      };
      const drops = { armR: -1.15, armL: 1.15, foreR: -0.3, foreL: 0.3 };
      const rig = {};
      for (const key of Object.keys(limbs)) {
        const bone = boneByName(limbs[key]);
        if (!bone) continue;
        const joint = bone.parent && bone.parent.isBone && bone.parent.name === bone.name ? bone.parent : bone;
        const rest = joint.quaternion.clone();
        const worldQ = new THREE.Quaternion();
        joint.getWorldQuaternion(worldQ);
        const inv = worldQ.clone().invert();
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize();
        const dropAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQ.clone().invert()).normalize();
        rig[key] = { joint, rest, axis, dropAxis, drop: drops[key] || 0, angle: 0 };
      }

      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.userData.smurfRig = rig;
      return pivot;
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
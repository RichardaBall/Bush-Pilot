import * as THREE from 'three';

export class LandingAid {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.rotation = 0;
    
    this.initGizmo();
  }

  initGizmo() {
    this.group = new THREE.Group();

    // Outline Frame
    const geo = new THREE.PlaneGeometry(16, 70);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    
    this.outline = new THREE.LineSegments(edges, mat);
    this.outline.rotation.x = -Math.PI / 2;
    this.group.add(this.outline);

    // Direction arrow
    const dirGeo = new THREE.ConeGeometry(2, 6, 3);
    const dirMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const dirMesh = new THREE.Mesh(dirGeo, dirMat);
    dirMesh.rotation.x = Math.PI / 2;
    dirMesh.position.z = -30;
    this.group.add(dirMesh);

    this.group.visible = false;
    this.scene.add(this.group);
  }

  show(position) {
    this.visible = true;
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.position.y += 0.5;
  }

  hide() {
    this.visible = false;
    this.group.visible = false;
  }

  updatePosition(position) {
    if (!this.visible) return;
    this.group.position.x = position.x;
    this.group.position.z = position.z;
    this.group.position.y = position.y + 0.5;
  }

  rotate(amount) {
    this.rotation += amount;
    this.group.rotation.y = this.rotation;
  }

  getTarget() {
    return {
      position: this.group.position.clone(),
      heading: this.rotation
    };
  }
}
import * as THREE from 'three';

export class Airport {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

    const ground = terrain.getHeightAt(0, 150);
    this.position = new THREE.Vector3(0, ground + 0.08, 150);
    this.width = 24;
    this.length = 120;

    this.initAirport();
  }

  initAirport() {
    const group = new THREE.Group();

    // Tarmac Surface
    const runwayGeo = new THREE.PlaneGeometry(this.width, this.length);
    const runwayMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8
    });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.copy(this.position);
    runway.receiveShadow = true;
    group.add(runway);

    // Centerline Stripes
    const stripeGeo = new THREE.PlaneGeometry(1.2, 8);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    for (let z = -this.length / 2 + 10; z < this.length / 2 - 10; z += 16) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(this.position.x, this.position.y + 0.02, this.position.z + z);
      group.add(stripe);
    }

    this.scene.add(group);
  }
}
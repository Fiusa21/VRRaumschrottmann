import * as THREE from 'three';

export class Platform {
  constructor() {
    this.radius = 18;
    this.mesh = new THREE.Group();
    this.mesh.name = 'Platform';
    this.#buildLayers();
  }

  #buildLayers() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius, this.radius, 1.2, 48),
      new THREE.MeshStandardMaterial({
        color: '#0b1220',
        metalness: 0.4,
        roughness: 0.6,
      })
    );
    base.receiveShadow = true;
    this.mesh.add(base);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius * 0.95, 0.4, 16, 64),
      new THREE.MeshStandardMaterial({
        color: '#0a2a3d',
        emissive: '#2fd7ff',
        emissiveIntensity: 0.35,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7;
    this.mesh.add(ring);

    const holo = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius * 0.2, this.radius * 0.22, 0.1, 32),
      new THREE.MeshStandardMaterial({
        color: '#06212c',
        emissive: '#59f6ff',
        emissiveIntensity: 0.6,
      })
    );
    holo.position.y = 0.85;
    this.mesh.add(holo);
  }
}


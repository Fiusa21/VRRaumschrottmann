import * as THREE from 'three';

export class CollectorPit {
  constructor() {
    this.radius = 2.6;
    this.group = new THREE.Group();
    this.group.position.set(0, 0.6, 0);

    this.#build();
  }

  animate(delta) {
    this.vortex.rotation.z += delta * 1.3;
    const pulse = 0.45 + Math.sin(performance.now() * 0.003) * 0.15;
    this.glow.material.opacity = pulse;
  }

  checkCapture(meshes, onCollect) {
    const now = performance.now();
    const throwCooldown = 500; // 500ms before thrown objects can be collected
    for (const mesh of meshes) {
      // Skip objects being pulled, held, or just thrown - only collect floating or settled thrown objects
      if (!mesh.visible || mesh.userData.state === 'respawning' || mesh.userData.state === 'pulled' || mesh.userData.state === 'held' || mesh.userData.state === 'thrown') continue;
      
      // Don't collect floating objects that were just thrown (within cooldown period)
      if (mesh.userData.state === 'floating' && mesh.userData.thrownTime && (now - mesh.userData.thrownTime) < throwCooldown) {
        continue;
      }
      
      const distance = Math.hypot(mesh.position.x, mesh.position.z);
      if (distance < this.radius && mesh.position.y < 1.2) {
        console.log('COLLECTING mesh at distance:', distance, 'y:', mesh.position.y, 'state:', mesh.userData.state);
        onCollect(mesh);
      }
    }
  }

  #build() {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius, this.radius, 0.4, 48, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#0f1723',
        metalness: 0.5,
        roughness: 0.35,
        side: THREE.DoubleSide,
      })
    );
    this.group.add(rim);

    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius * 0.9, 32),
      new THREE.MeshBasicMaterial({
        color: '#67f9ff',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      })
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = -0.2;
    this.group.add(this.glow);

    this.vortex = new THREE.Mesh(
      new THREE.RingGeometry(this.radius * 0.1, this.radius * 0.95, 48),
      new THREE.MeshBasicMaterial({
        color: '#00dcff',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      })
    );
    this.vortex.rotation.x = -Math.PI / 2;
    this.vortex.position.y = -0.19;
    this.group.add(this.vortex);
  }
}


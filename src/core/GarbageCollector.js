import * as THREE from 'three';

export class GarbageCollector {
  constructor(position = new THREE.Vector3()) {
    this.position = position;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    
    this.collectionRadius = 1.2;
    this.orbitRadius = Math.sqrt(position.x ** 2 + position.z ** 2);
    this.orbitAngle = Math.atan2(position.z, position.x);
    this.centerY = position.y;
    
    this.#build();
  }

  #build() {
    // Main collector body - a glowing box
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({
        color: '#ff6b35',
        emissive: '#ff6b35',
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.3,
      })
    );
    this.group.add(body);

    // Glow around it
    const glowGeom = new THREE.SphereGeometry(this.collectionRadius, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#ff6b35',
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    this.group.add(glow);

    // Rotation animation
    this.group.userData.spinSpeed = (Math.random() - 0.5) * 2;
  }

  animate(delta, difficultyScale = 1) {
    // Gentle bobbing up and down
    const time = performance.now() * 0.001;
    const bobbing = Math.sin(time * 1.5) * 0.3;
    
    // Orbit around center with difficulty scaling speed
    const orbitSpeed = 0.3 * difficultyScale;
    this.orbitAngle += delta * orbitSpeed;
    
    const newX = Math.cos(this.orbitAngle) * this.orbitRadius;
    const newZ = Math.sin(this.orbitAngle) * this.orbitRadius;
    
    this.group.position.set(newX, this.centerY + bobbing, newZ);
    
    // Slow rotation
    this.group.rotation.x += delta * 0.3;
    this.group.rotation.y += delta * 0.5;
  }

  checkCollision(mesh) {
    // Check if thrown object is within collection radius
    const distance = this.group.position.distanceTo(mesh.position);
    return distance < this.collectionRadius;
  }
}

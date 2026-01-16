import * as THREE from 'three';

export class GarbageField {
  constructor(scene) {
    this.scene = scene;
    this.innerRadius = 2.6;
    this.meshes = [];
    this.count = 18;
    this.tempVec = new THREE.Vector3();
    this.#createTextures();
  }

  #createTextures() {
    // Load external PNG textures
    const textureLoader = new THREE.TextureLoader();
    this.textures = [];
    let loadedCount = 0;
    
    const textureFiles = [
      'textures/garbage1.jpg',
      'textures/garbage2.jpg',
      'textures/garbage3.jpg',
    ];
    
    for (const file of textureFiles) {
      textureLoader.load(
        file,
        (texture) => {
          // Successfully loaded
          this.textures.push(texture);
          loadedCount++;
          // Once all textures are loaded, populate the field
          if (loadedCount === textureFiles.length) {
            this.#populate();
          }
        },
        undefined,
        (error) => {
          // If texture fails to load, skip it
          console.warn(`Failed to load texture: ${file}`, error);
          loadedCount++;
          if (loadedCount === textureFiles.length && this.meshes.length === 0) {
            // If all failed, populate without textures
            this.#populate();
          }
        }
      );
    }
  }

  update(delta) {
    const time = performance.now() * 0.001;
    const platformTop = 0.6; // Top of the 1.2 thick base
    const platformRadius = 18;
    const floorNormal = new THREE.Vector3(0, 1, 0); // Pointing up

    for (const mesh of this.meshes) {
      const data = mesh.userData;
      // Skip ONLY respawning, pulled, and held objects - thrown objects need to be processed
      if (data.state === 'respawning' || data.state === 'pulled' || data.state === 'held') {
        continue;
      }

      const distFromCenter = Math.sqrt(mesh.position.x ** 2 + mesh.position.z ** 2);

      // 1. STATE & GRAVITY LOGIC
      if (distFromCenter < this.innerRadius) {
        // OVER THE PIT: Apply Gravity and Vortex (but not if recently thrown)
        if (data.state !== 'thrown') {
          data.state = 'falling';
          if (data.state !== 'falling') {
            console.log('Setting to falling - uuid:', mesh.uuid, 'state was:', data.state, 'distance:', distFromCenter, 'innerRadius:', this.innerRadius);
          }
        }
        data.velocity.y -= delta * 30; // Gravity
        this.tempVec.set(-mesh.position.x, 0, -mesh.position.z).normalize();
        data.velocity.addScaledVector(this.tempVec, 15 * delta); // Vortex
      } else {
        // OVER THE PLATFORM: No gravity (unless you want a "thrown" arc)
        if (data.state === 'floating') {
          // Just gentle bob up and down, don't pull toward baseHeight
          data.velocity.y = Math.sin(time + data.floatOffset) * 0.5;
          data.velocity.multiplyScalar(0.95); // Minimal friction
        } else if (data.state === 'thrown') {
          // Thrown objects: just apply minimal drag to preserve momentum
          data.velocity.multiplyScalar(0.99); // Very low drag to preserve momentum
          
          // Once velocity is low, transition back to floating
          if (data.velocity.length() < 0.1) {  // Threshold to settle
            console.log('Thrown object settling, changing to floating - uuid:', mesh.uuid, 'thrownTime:', data.thrownTime);
            data.state = 'floating';
            data.baseHeight = mesh.position.y;
          }
        } else if (data.state === 'falling') {
          // If it was "thrown" but isn't over the pit yet,
          // let it travel in a straight line or return to floating
          if (data.velocity.length() < 0.5) {
            data.state = 'floating'; // Return to float if it slows down
          }
        }
      }

      // 2. APPLY MOVEMENT
      mesh.position.addScaledVector(data.velocity, delta);

      // 3. BOUNCE LOGIC (Impact angle = Outbound angle)
      // Only check if over the solid part of the platform
      if (distFromCenter > this.innerRadius && distFromCenter < platformRadius) {
        if (mesh.position.y < platformTop) {
          mesh.position.y = platformTop; // Prevent sinking

          // REFLECT: This handles the outbound angle perfectly
          // We reflect the velocity vector against the upward floor normal
          data.velocity.reflect(floorNormal);

          // Damping: Reduce energy so it doesn't bounce forever (0.7 = 70% retention)
          data.velocity.multiplyScalar(0.7);

          // Give it a little spin variation on impact for realism
          data.spin.x += (Math.random() - 0.5) * 2;
        }
      }

      // --- Rotations ---
      mesh.rotation.x += delta * 0.4 * data.spin.x;
      mesh.rotation.y += delta * 0.6 * data.spin.y;

      // 4. PIT DISPOSAL
      if (mesh.position.y < -15) {
        this.respawn(mesh);
      }
    }
  }

  //either respawn or remove it
  respawn(mesh) {
    console.log('RESPAWNING mesh - position was:', mesh.position.y, 'state was:', mesh.userData.state);
    mesh.userData.state = 'respawning';
    setTimeout(() => {
      const position = this.#randomPosition();
      mesh.position.copy(position);
      mesh.userData.velocity.set(0, 0, 0);
      mesh.userData.baseHeight = position.y;
      mesh.userData.state = 'floating';
      mesh.visible = true;
    }, 300);
  }

  // Add this method to your GarbageField class
  removeMesh(mesh) {
    // 1. Remove from the Three.js scene
    this.scene.remove(mesh);

    // 2. Remove from the internal array so checkCapture stops seeing it
    this.meshes = this.meshes.filter(m => m !== mesh);

    // 3. Proper memory cleanup
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  reset() {
    // Remove existing meshes and dispose resources
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes = [];
    // Repopulate using existing textures if loaded
    this.#populate();
  }

  moveAll(delta) {
    for (const mesh of this.meshes) {
      mesh.position.add(delta);
    }
  }

  #populate() {
    for (let i = 0; i < this.count; i += 1) {
      const mesh = this.#createDebris();
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  #createDebris() {
    const palette = ['#74f7ff', '#f4f6ff', '#16c4ff', '#ff8ff0'];
    const geometries = [
      new THREE.BoxGeometry(0.7, 0.4, 0.9),
      new THREE.OctahedronGeometry(0.5),
      new THREE.CylinderGeometry(0.25, 0.36, 1, 12),
    ];
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    
    const materialProps = {
      color: '#ffffff', // White so texture colors show through
      metalness: 0.7,
      roughness: 0.3,
      emissive: '#03111a',
    };
    
    // Only add texture if textures are loaded
    if (this.textures && this.textures.length > 0) {
      const texture = this.textures[Math.floor(Math.random() * this.textures.length)];
      materialProps.map = texture;
    } else {
      // Use palette colors only if no textures
      materialProps.color = palette[Math.floor(Math.random() * palette.length)];
    }
    
    const material = new THREE.MeshStandardMaterial(materialProps);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.copy(this.#randomPosition());
    mesh.userData = {
      floatOffset: Math.random() * Math.PI * 2,
      floatAmp: 0.4 + Math.random() * 0.8,
      baseHeight: mesh.position.y,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1),
      state: 'floating',
    };
    return mesh;
  }

  #randomPosition() {
    const radius = this.innerRadius + 3 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 6 + Math.random() * 6; // Increased from 2-6 to 6-12
    return new THREE.Vector3(x, y, z);
  }
}


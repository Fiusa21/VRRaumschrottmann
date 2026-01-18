import * as THREE from 'three';

export class LaserTool {
  constructor({ player, garbageField, controller = null }) {
    this.player = player;
    this.garbageField = garbageField;
    this.xrController = controller;

    this.raycaster = new THREE.Raycaster();
    this.tempVec = new THREE.Vector3();
    this.tempDir = new THREE.Vector3();
    this.active = false;
    this.currentTarget = null;
    this.beamContainer = null;

    this.#createBeam();
    this.#bind();
  }

  setXRController(controller) {
    this.xrController = controller;
    // Attach beam and pistol model to controller when in VR
    if (this.beam && this.beam.parent) {
      this.beam.parent.remove(this.beam);
    }
    if (this.pistolModel && this.pistolModel.parent) {
      this.pistolModel.parent.remove(this.pistolModel);
    }
    if (controller) {
      this.beamContainer = controller;
      this.beamContainer.add(this.beam);
      this.beamContainer.add(this.pistolModel);
      this.beam.position.set(0, 0, 0);
    } else {
      this.beamContainer = this.player.handAnchor;
      this.beamContainer.add(this.beam);
      this.beamContainer.add(this.pistolModel);
    }
  }

  update(delta) {
    this.beam.scale.y = THREE.MathUtils.lerp(
      this.beam.scale.y,
      this.active ? 1 : 0,
      delta * 10
    );

    if (!this.active) return;

    // Use XR controller for aiming in VR, camera center for desktop
    if (this.xrController) {
      // Get controller world position and direction using proper Three.js methods
      const controllerPos = new THREE.Vector3();
      this.xrController.getWorldPosition(controllerPos);
      
      // Get world direction (forward direction of the controller)
      const controllerDir = new THREE.Vector3(0, 0, -1);
      controllerDir.applyMatrix4(this.xrController.matrixWorld);
      controllerDir.sub(controllerPos).normalize();
      
      // Add small offset from controller for better visibility
      const rayOrigin = controllerPos.clone().addScaledVector(controllerDir, 0.1);
      this.raycaster.set(rayOrigin, controllerDir);
    } else {
      // Desktop camera aiming
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.player.camera);
    }

    const hits = this.raycaster.intersectObjects(this.garbageField.meshes);

    if (!this.currentTarget && hits.length) {
      const target = hits[0].object;
      // Don't target objects that are already held
      if (target.userData.state !== 'held') {
        this.currentTarget = target;
        this.currentTarget.userData.velocity.set(0, 0, 0);
        this.currentTarget.userData.state = 'pulled';
      }
    }

    if (this.currentTarget && this.currentTarget.userData?.state === 'respawning') {
      this.#releaseTarget();
    }

    let aimPoint = null;

    if (this.currentTarget) {
      // Only pull if object is in 'pulled' state, not if it's already held
      if (this.currentTarget.userData.state === 'pulled') {
        this.#pullTowardsHand(delta);
      }
      if (this.currentTarget) {
        aimPoint = this.currentTarget.position.clone();
      }
    }

    if (!aimPoint && hits.length) {
      aimPoint = hits[0].point;
    }

    if (!aimPoint) {
      if (this.xrController) {
        // VR: use controller direction
        const controllerPos = new THREE.Vector3();
        this.xrController.getWorldPosition(controllerPos);
        const controllerDir = new THREE.Vector3(0, 0, -1);
        controllerDir.applyMatrix4(this.xrController.matrixWorld);
        controllerDir.sub(controllerPos).normalize();
        aimPoint = controllerPos.clone().addScaledVector(controllerDir, 12);
      } else {
        // Desktop: use camera direction
        aimPoint = this.player
          .camera
          .getWorldDirection(this.tempDir)
          .multiplyScalar(12)
          .add(this.player.getHandWorldPosition(this.tempVec));
      }
    }

    this.#updateBeam(aimPoint);
  }

  #createBeam() {
    const geometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 8, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color: '#6efbff',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(geometry, material);
    this.beam.visible = true;
    this.beam.scale.set(1, 0, 1);
    
    // Create pistol-shaped tool model
    this.#createPistolModel();
    
    // Initially attach to hand anchor (will be moved to controller on VR start)
    this.beamContainer = this.player.handAnchor;
    this.beamContainer.add(this.beam);
    this.beamContainer.add(this.pistolModel);
    this.beam.position.set(0, 0, 0);
  }

  #createPistolModel() {
    // Create a group to hold all pistol parts
    this.pistolModel = new THREE.Group();
    
    // Material for the pistol
    const pistolMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.7,
      roughness: 0.3,
    });
    
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x6efbff,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x6efbff,
      emissiveIntensity: 0.3,
    });
    
    // Handle (grip)
    const handleGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.04);
    const handle = new THREE.Mesh(handleGeometry, pistolMaterial);
    handle.position.set(0, -0.05, 0.01);
    handle.rotation.x = -0.2;
    this.pistolModel.add(handle);
    
    // Main body (barrel housing)
    const bodyGeometry = new THREE.BoxGeometry(0.035, 0.04, 0.12);
    const body = new THREE.Mesh(bodyGeometry, pistolMaterial);
    body.position.set(0, 0.02, -0.04);
    this.pistolModel.add(body);
    
    // Barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8);
    const barrel = new THREE.Mesh(barrelGeometry, pistolMaterial);
    barrel.position.set(0, 0.02, -0.08);
    barrel.rotation.x = Math.PI / 2;
    this.pistolModel.add(barrel);
    
    // Barrel tip (glowing accent)
    const barrelTipGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8);
    const barrelTip = new THREE.Mesh(barrelTipGeometry, accentMaterial);
    barrelTip.position.set(0, 0.02, -0.12);
    barrelTip.rotation.x = Math.PI / 2;
    this.pistolModel.add(barrelTip);
    
    // Trigger guard
    const triggerGuardGeometry = new THREE.TorusGeometry(0.02, 0.003, 8, 12, Math.PI);
    const triggerGuard = new THREE.Mesh(triggerGuardGeometry, pistolMaterial);
    triggerGuard.position.set(0, -0.01, 0.01);
    triggerGuard.rotation.x = Math.PI / 2;
    this.pistolModel.add(triggerGuard);
    
    // Trigger
    const triggerGeometry = new THREE.BoxGeometry(0.008, 0.02, 0.015);
    const trigger = new THREE.Mesh(triggerGeometry, accentMaterial);
    trigger.position.set(0, -0.015, 0.01);
    this.pistolModel.add(trigger);
    
    // Side details (tech panels)
    const panelGeometry = new THREE.BoxGeometry(0.036, 0.015, 0.04);
    const panelLeft = new THREE.Mesh(panelGeometry, accentMaterial);
    panelLeft.position.set(0.018, 0.01, -0.03);
    this.pistolModel.add(panelLeft);
    
    const panelRight = new THREE.Mesh(panelGeometry, accentMaterial);
    panelRight.position.set(-0.018, 0.01, -0.03);
    this.pistolModel.add(panelRight);
    
    // Position the entire pistol model
    this.pistolModel.position.set(0, 0, 0);
    this.pistolModel.rotation.x = 0; // No rotation - barrel points along -Z axis
  }

  #bind() {
    const targetElement = this.player.canvas;
    targetElement.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.active = true;
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.active = false;
        if (this.player.heldMesh) {
          const dir = this.player.camera.getWorldDirection(this.tempDir);
          this.player.throwCargo(dir, 18);
        }
        this.#releaseTarget();
      }
    });
  }

  #acquireTarget() {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.player.camera);
    const hits = this.raycaster.intersectObjects(this.garbageField.meshes);
    if (hits.length) {
      this.currentTarget = hits[0].object;
      this.currentTarget.userData.velocity.set(0, 0, 0);
      this.currentTarget.userData.state = 'pulled';
    }
  }

  #pullTowardsHand(delta) {
    // In VR, pull towards offset position in front of controller
    // On desktop, pull towards hand anchor
    let handPos;
    if (this.xrController) {
      // Get controller position
      handPos = new THREE.Vector3();
      this.xrController.getWorldPosition(handPos);
      
      // Calculate offset position (same as #updateHeldMesh uses)
      const controllerDir = new THREE.Vector3(0, 0, -1);
      controllerDir.applyMatrix4(this.xrController.matrixWorld);
      
      const controllerPos = new THREE.Vector3();
      this.xrController.getWorldPosition(controllerPos);
      controllerDir.sub(controllerPos).normalize();
      
      // Position in front of controller
      handPos.copy(controllerPos).addScaledVector(controllerDir, 0.3);
      handPos.y -= 0.15;
    } else {
      handPos = this.player.getHandWorldPosition(new THREE.Vector3());
    }
    
    // Directly move the object towards handPos (not using velocity since pulled objects skip GarbageField)
    const target = this.currentTarget.position;
    const direction = handPos.clone().sub(target);
    const distance = direction.length();
    
    if (distance < 0.4) {
      // Grab the object
      console.log('GRABBING object, current state:', this.currentTarget.userData.state, 'object ID:', this.currentTarget.uuid, 'heldMesh before:', this.player.heldMesh?.uuid);
      this.player.attachCargo(this.currentTarget, this.xrController);
      console.log('After attachCargo, object state should be: held player.heldMesh ID:', this.player.heldMesh.uuid, 'SAME OBJECT?', this.currentTarget === this.player.heldMesh);
      this.currentTarget = null;
      console.log('Set currentTarget to null');
      return;
    }
    
    // Move object directly towards hand position
    direction.normalize();
    const moveSpeed = 15; // units per second
    target.addScaledVector(direction, moveSpeed * delta);
  }

  #updateBeam(targetPoint) {
    // When using controller, work in controller space; otherwise use hand space
    if (this.xrController) {
      // VR controller aiming - position beam in controller local space
      const localTarget = this.xrController.worldToLocal(targetPoint.clone());
      const length = localTarget.length();
      const dir = localTarget.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );
      this.beam.quaternion.copy(quat);
      this.beam.scale.set(1, length, 1);
      this.beam.position.copy(dir.multiplyScalar(length * 0.5));
    } else {
      // Desktop mode - work in hand space
      const localTarget = this.player.handAnchor.worldToLocal(targetPoint.clone());
      const length = localTarget.length();
      const dir = localTarget.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );
      this.beam.quaternion.copy(quat);
      this.beam.scale.set(1, length, 1);
      this.beam.position.copy(dir.multiplyScalar(length * 0.5));
    }
  }

  #releaseTarget() {
    if (this.currentTarget) {
      this.currentTarget.userData.state = 'floating';
    }
    this.currentTarget = null;
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
    // No longer throwing on deactivate - let the player control that with grip button
    this.#releaseTarget();
  }

  throwHeldObject() {
    if (this.player.heldMesh) {
      const mesh = this.player.heldMesh; // Save reference before throwCargo sets it to null
      let dir;
      if (this.xrController) {
        // In VR, throw in controller direction (just the rotation, not position)
        dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(this.xrController.quaternion);
      } else {
        // On desktop, throw in camera direction
        dir = this.player.camera.getWorldDirection(this.tempDir);
      }
      // Throw with increased strength
      this.player.throwCargo(dir, 80);
      // Mark when it was thrown so it can't be collected immediately
      mesh.userData.thrownTime = performance.now();
    }
  }
}
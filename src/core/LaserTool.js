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
    // Attach beam to controller when in VR
    if (this.beam && this.beam.parent) {
      this.beam.parent.remove(this.beam);
    }
    if (controller) {
      this.beamContainer = controller;
      this.beamContainer.add(this.beam);
      this.beam.position.set(0, 0, 0);
    } else {
      this.beamContainer = this.player.handAnchor;
      this.beamContainer.add(this.beam);
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
      this.currentTarget = hits[0].object;
      this.currentTarget.userData.velocity.set(0, 0, 0);
      this.currentTarget.userData.state = 'pulled';
    }

    if (this.currentTarget && this.currentTarget.userData?.state === 'respawning') {
      this.#releaseTarget();
    }

    let aimPoint = null;

    if (this.currentTarget) {
      this.#pullTowardsHand(delta);
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
    // Initially attach to hand anchor (will be moved to controller on VR start)
    this.beamContainer = this.player.handAnchor;
    this.beamContainer.add(this.beam);
    this.beam.position.set(0, 0, 0);
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
    // In VR, pull towards controller; on desktop, pull towards hand anchor
    let handPos = this.tempVec;
    if (this.xrController) {
      this.xrController.getWorldPosition(handPos);
    } else {
      this.player.getHandWorldPosition(handPos);
    }
    
    const target = this.currentTarget.position;
    const direction = handPos.clone().sub(target);
    const distance = direction.length();
    if (distance < 0.4) {
      this.player.attachCargo(this.currentTarget, this.xrController);
      this.currentTarget = null;
      return;
    }
    direction.normalize();
    target.addScaledVector(direction, delta * 6 * Math.max(distance, 1));
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
    if (this.player.heldMesh) {
      const dir = this.player.camera.getWorldDirection(this.tempDir);
      this.player.throwCargo(dir, 18);
    }
    this.#releaseTarget();
  }
}
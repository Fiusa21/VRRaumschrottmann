import * as THREE from 'three';

export class LaserTool {
  constructor({ player, garbageField }) {
    this.player = player;
    this.garbageField = garbageField;

    this.raycaster = new THREE.Raycaster();
    this.tempVec = new THREE.Vector3();
    this.tempDir = new THREE.Vector3();
    this.active = false;
    this.currentTarget = null;
    
    // VR support
    this.vrController = null;
    this.vrBeam = null;

    this.#createBeam();
    this.#bind();
  }

  setVRController(controller) {
    this.vrController = controller;
    if (controller && !this.vrBeam) {
      this.#createVRBeam(controller);
    }
  }

  update(delta) {
    const isVR = this.vrController !== null;
    const targetBeam = isVR && this.vrBeam ? this.vrBeam : this.beam;
    
    if (targetBeam) {
      targetBeam.scale.y = THREE.MathUtils.lerp(
        targetBeam.scale.y,
        this.active ? 1 : 0,
        delta * 10
      );
    }

    if (!this.active) return;

    let hits = [];
    let aimPoint = null;

    // VR mode: raycast from controller
    if (isVR && this.vrController) {
      const controllerPosition = new THREE.Vector3();
      this.vrController.getWorldPosition(controllerPosition);
      const direction = new THREE.Vector3();
      this.vrController.getWorldDirection(direction).negate();
      this.raycaster.set(controllerPosition, direction);
      hits = this.raycaster.intersectObjects(this.garbageField.meshes);
    } else {
      // Desktop mode: raycast from camera center
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.player.camera);
      hits = this.raycaster.intersectObjects(this.garbageField.meshes);
    }

    if (!this.currentTarget && hits.length) {
      this.currentTarget = hits[0].object;
      if (!this.currentTarget.userData.velocity) {
        this.currentTarget.userData.velocity = new THREE.Vector3();
      }
      this.currentTarget.userData.velocity.set(0, 0, 0);
      this.currentTarget.userData.state = 'pulled';
    }

    if (this.currentTarget && this.currentTarget.userData?.state === 'respawning') {
      this.#releaseTarget();
    }

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
      if (isVR && this.vrController) {
        const controllerPosition = new THREE.Vector3();
        this.vrController.getWorldPosition(controllerPosition);
        const direction = new THREE.Vector3();
        this.vrController.getWorldDirection(direction).negate();
        aimPoint = direction.multiplyScalar(12).add(controllerPosition);
      } else {
        aimPoint = this.player
          .camera
          .getWorldDirection(this.tempDir)
          .multiplyScalar(12)
          .add(this.player.getHandWorldPosition(this.tempVec));
      }
    }

    if (isVR && this.vrBeam) {
      this.#updateVRBeam(aimPoint);
    } else {
      this.#updateBeam(aimPoint);
    }
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
    this.player.handAnchor.add(this.beam);
    this.beam.position.set(0, 0, 0);
  }

  #createVRBeam(controller) {
    const geometry = new THREE.CylinderGeometry(0.01, 0.01, 1, 8, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color: '#6efbff',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    this.vrBeam = new THREE.Mesh(geometry, material);
    this.vrBeam.visible = true;
    this.vrBeam.scale.set(1, 0, 1);
    controller.add(this.vrBeam);
    this.vrBeam.position.set(0, 0, 0);
    
    // Hide desktop beam in VR
    if (this.beam) {
      this.beam.visible = false;
    }
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
    // In VR, pull towards controller; otherwise use hand anchor
    let handPos;
    if (this.vrController) {
      this.vrController.getWorldPosition(this.tempVec);
      handPos = this.tempVec;
    } else {
      handPos = this.player.getHandWorldPosition(this.tempVec);
    }
    
    const target = this.currentTarget.position;
    const direction = handPos.clone().sub(target);
    const distance = direction.length();
    if (distance < 0.4) {
      this.player.attachCargo(this.currentTarget);
      this.currentTarget = null;
      return;
    }
    direction.normalize();
    target.addScaledVector(direction, delta * 6 * Math.max(distance, 1));
  }

  #updateBeam(targetPoint) {
    // Work in hand space; align cylinder's +Y to the aim direction.
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

  #updateVRBeam(targetPoint) {
    if (!this.vrBeam || !this.vrController) return;
    
    // Work in controller space
    const localTarget = this.vrController.worldToLocal(targetPoint.clone());
    const length = localTarget.length();
    const dir = localTarget.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    this.vrBeam.quaternion.copy(quat);
    this.vrBeam.scale.set(1, length, 1);
    this.vrBeam.position.copy(dir.multiplyScalar(length * 0.5));
  }

  #releaseTarget() {
    if (this.currentTarget) {
      this.currentTarget.userData.state = 'floating';
    }
    this.currentTarget = null;
  }

  releaseTarget() {
    this.#releaseTarget();
  }
}


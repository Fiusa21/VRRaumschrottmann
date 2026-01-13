import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Player {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    this.controls = new PointerLockControls(camera, canvas);
    this.root = this.controls.getObject();
    this.root.position.set(0, 8, 10);

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.move = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false,
    };

    this.handAnchor = new THREE.Object3D();
    this.handAnchor.position.set(0.4, -0.35, -0.8);
    camera.add(this.handAnchor);

    this.heldMesh = null;
    this.throwVelocity = new THREE.Vector3();

    this.#bindInput();
  }

  update(delta) {
    const baseSpeed = 6;
    const speed = this.move.boost ? baseSpeed * 1.6 : baseSpeed;

    this.direction.set(
      Number(this.move.right) - Number(this.move.left),
      0,
      Number(this.move.forward) - Number(this.move.backward)
    );

    const movementDelta = new THREE.Vector3();

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      movementDelta.copy(this.direction).multiplyScalar(speed * delta);
    }

    if (this.heldMesh) {
      if (!this.heldMesh.userData) {
        console.log('ERROR: heldMesh has no userData!');
      } else {
        console.log('Updating held mesh, state:', this.heldMesh.userData.state, 'visible:', this.heldMesh.visible, 'pos:', this.heldMesh.position);
      }
      this.#updateHeldMesh(delta);
    }

    return movementDelta;
  }

  getHandWorldPosition(target = new THREE.Vector3()) {
    return target.setFromMatrixPosition(this.handAnchor.matrixWorld);
  }

  attachCargo(mesh, xrController = null) {
    console.log('attachCargo CALLED for mesh:', mesh.uuid, 'current heldMesh:', this.heldMesh?.uuid);
    if (this.heldMesh && this.heldMesh !== mesh) {
      console.log('WARNING: Already holding a different object!', this.heldMesh.uuid);
      return;
    }
    console.log('Attaching cargo, state BEFORE:', mesh.userData.state, 'controller:', !!xrController);
    this.heldMesh = mesh;
    mesh.userData.velocity = mesh.userData.velocity || new THREE.Vector3();
    mesh.userData.state = 'held';
    console.log('Attaching cargo, state AFTER:', mesh.userData.state, 'heldMesh set:', !!this.heldMesh);
    mesh.userData.xrController = xrController;
  }

  throwCargo(direction, strength = 16) {
    if (!this.heldMesh) return;
    this.throwVelocity.copy(direction).normalize().multiplyScalar(strength);
    const mesh = this.heldMesh;
    mesh.userData.velocity = mesh.userData.velocity || new THREE.Vector3();
    mesh.userData.velocity.copy(this.throwVelocity);
    mesh.userData.state = 'thrown';
    this.heldMesh = null;
  }

  teleportTo(position) {
    this.root.position.set(position.x, 2, position.z);
  }

  #updateHeldMesh(delta) {
    let target;
    if (this.heldMesh.userData.xrController) {
      // In VR, position object in front of the controller
      target = new THREE.Vector3();
      this.heldMesh.userData.xrController.getWorldPosition(target);
      
      // Get controller's forward direction and add offset
      const controllerDir = new THREE.Vector3(0, 0, -1);
      controllerDir.applyMatrix4(this.heldMesh.userData.xrController.matrixWorld);
      
      const controllerPos = new THREE.Vector3();
      this.heldMesh.userData.xrController.getWorldPosition(controllerPos);
      controllerDir.sub(controllerPos).normalize();
      
      // Position in front of controller: 0.3 units forward
      target = controllerPos.clone().addScaledVector(controllerDir, 0.3);
      target.y -= 0.15; // Slight downward offset
    } else {
      // On desktop, position relative to hand anchor
      target = this.getHandWorldPosition();
    }
    
    const oldPos = this.heldMesh.position.clone();
    // Increase lerp speed from 18 to 30 to track controller more tightly
    this.heldMesh.position.lerp(target, delta * 30);
    this.heldMesh.quaternion.slerp(this.camera.quaternion, delta * 10);
    this.heldMesh.userData.velocity.set(0, 0, 0);
  }

  #bindInput() {
    const toggle = (state, key) => {
      switch (key.code) {
        case 'KeyW':
          this.move.forward = state;
          break;
        case 'KeyS':
          this.move.backward = state;
          break;
        case 'KeyA':
          this.move.left = state;
          break;
        case 'KeyD':
          this.move.right = state;
          break;
        case 'ShiftLeft':
          this.move.boost = state;
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', (event) => toggle(true, event));
    document.addEventListener('keyup', (event) => toggle(false, event));

    this.canvas.addEventListener('click', () => {
      if (!this.controls.isLocked) {
        this.controls.lock();
      }
    });
  }
}


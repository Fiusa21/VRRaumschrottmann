import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Player {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    this.controls = new PointerLockControls(camera, canvas);
    this.root = this.controls.getObject();
    this.root.position.set(0, 2, 10);

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

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      const moveX = this.direction.x * speed * delta;
      const moveZ = this.direction.z * speed * delta;
      this.controls.moveRight(moveX);
      this.controls.moveForward(moveZ);
    }

    if (this.heldMesh) {
      this.#updateHeldMesh(delta);
    }
  }

  getHandWorldPosition(target = new THREE.Vector3()) {
    return target.setFromMatrixPosition(this.handAnchor.matrixWorld);
  }

  attachCargo(mesh) {
    this.heldMesh = mesh;
    mesh.userData.velocity = mesh.userData.velocity || new THREE.Vector3();
    mesh.userData.state = 'held';
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
    const target = this.getHandWorldPosition();
    this.heldMesh.position.lerp(target, delta * 18);
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


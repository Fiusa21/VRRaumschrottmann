import * as THREE from 'three';

export class GameOverBoard {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometry = new THREE.PlaneGeometry(4.5, 2.2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;

    this.setScore(0);
  }

  setScore(score) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.9)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.strokeStyle = 'rgba(110, 251, 255, 0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, this.canvas.width - 36, this.canvas.height - 36);

    ctx.fillStyle = '#ffb38c';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Game Over', this.canvas.width / 2, this.canvas.height / 2 - 40);

    ctx.fillStyle = '#6efbff';
    ctx.font = 'bold 54px Arial';
    ctx.fillText(`Score: ${score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
     ctx.fillText('Press A to Restart', this.canvas.width / 2, this.canvas.height - 40);

    this.texture.needsUpdate = true;
  }

  setVisible(state) {
    this.mesh.visible = state;
  }

  update(camera) {
    if (!camera || !this.mesh.visible) return;
    const offset = new THREE.Vector3(0, 0, -3.2);
    offset.applyQuaternion(camera.quaternion);
    this.mesh.position.copy(camera.position).add(offset);
    this.mesh.quaternion.copy(camera.quaternion);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

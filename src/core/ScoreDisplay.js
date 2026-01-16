import * as THREE from 'three';

export class ScoreDisplay {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.geometry = new THREE.PlaneGeometry(3, 1.2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 6, -6);

    this.setScore(0);
  }

  setScore(value) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(3, 5, 12, 0.65)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#6efbff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score: ${value}`, this.canvas.width / 2, this.canvas.height / 2);
    this.texture.needsUpdate = true;
  }

  update(camera) {
    if (!camera) return;
    this.mesh.quaternion.copy(camera.quaternion);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

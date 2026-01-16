import * as THREE from 'three';

export class TimerDisplay {
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
    this.mesh.position.set(-3.4, 7, -6);

    this.setTime(120);
  }

  setTime(seconds) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(3, 5, 12, 0.65)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ffb38c';
    ctx.font = 'bold 46px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Time: ${this.#fmt(seconds)}`, this.canvas.width / 2, this.canvas.height / 2);
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

  #fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
}

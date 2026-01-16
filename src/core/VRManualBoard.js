import * as THREE from 'three';

export class VRManualBoard {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometry = new THREE.PlaneGeometry(4.5, 2.8);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;

    this.drawManual();
  }

  drawManual() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.82)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.strokeStyle = 'rgba(110, 251, 255, 0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, this.canvas.width - 36, this.canvas.height - 36);

    const headerY = 80;
    ctx.fillStyle = '#6efbff';
    ctx.font = 'bold 54px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Mission Briefing', this.canvas.width / 2, headerY);

    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'left';

    const sections = [
      {
        title: 'Controls',
        lines: [
          'VR: Trigger to pull, Grip to throw, Right stick move.',
        ],
      },
      {
        title: 'Objective',
        lines: [
          'Grab debris with the laser.',
          'Throw debris into the orange containers to score.',
        ],
      },
      {
        title: 'Tips',
        lines: [
          'Step aside from collectors before throwing.',
          'Hold the trigger right until before throwing for best aim.',
          'Keep the aim steady until debris is caught. Otherwise you may drop it!'
          ,
        ],
      },
    ];

    const startX = 120;
    let y = 150;
    for (const section of sections) {
      ctx.fillStyle = '#cfe9ff';
      ctx.font = 'bold 36px Arial';
      ctx.fillText(section.title, startX, y);
      y += 36;
      ctx.fillStyle = '#e9f7ff';
      ctx.font = '28px Arial';
      for (const line of section.lines) {
        ctx.fillText('• ' + line, startX, y + 12);
        y += 34;
      }
      y += 24;
    }

    ctx.fillStyle = '#6efbff';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Press Manual button or toggle (right/left stick) to hide', this.canvas.width / 2, this.canvas.height - 40);

    this.texture.needsUpdate = true;
  }

  setVisible(state) {
    this.mesh.visible = state;
  }

  toggle() {
    this.mesh.visible = !this.mesh.visible;
  }

  update(camera) {
    if (!camera || !this.mesh.visible) return;
    // Place board in front of camera and face it
    const offset = new THREE.Vector3(0, 0, -3.5);
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

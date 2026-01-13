import * as THREE from 'three';

export class TeleportController {
  constructor({ radius }) {
    this.radius = radius;
    this.points = this.#makePoints();
    this.index = 0;
  }

  getNextPoint() {
    this.index = (this.index + 1) % this.points.length;
    return this.points[this.index].clone();
  }

  moveAllPoints(delta) {
    for (const point of this.points) {
      point.add(delta);
    }
  }

  #makePoints() {
    const points = [];
    const steps = 6;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const x = Math.cos(angle) * this.radius;
      const z = Math.sin(angle) * this.radius;
      points.push(new THREE.Vector3(x, 0, z));
    }
    return points;
  }
}


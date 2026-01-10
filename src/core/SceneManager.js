import * as THREE from 'three';
import { Player } from './Player.js';
import { Platform } from './Platform.js';
import { GarbageField } from './GarbageField.js';
import { LaserTool } from './LaserTool.js';
import { CollectorPit } from './CollectorPit.js';
import { TeleportController } from './TeleportController.js';
import { VRController } from './VRController.js';

export class SceneManager {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;

    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Enable WebXR
    this.renderer.xr.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#03050c');

    this.camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.1,
        500
    );

    this.clock = new THREE.Clock();
    this.collected = 0;

    this.update = this.update.bind(this);
  }

  async init() {
    this.#setupEnvironment();
    this.#setupActors();
    this.#setupEvents();
  }

  start() {
    this.renderer.setAnimationLoop(this.update);
  }

  update() {
    const delta = Math.min(this.clock.getDelta(), 0.05);

    // Update VR controllers if in VR mode
    if (this.vrController && this.renderer.xr.isPresenting) {
      this.vrController.update(delta);
    } else {
      // Only update player with keyboard controls if not in VR
      this.player.update(delta);
    }

    this.collectorPit.animate(delta);
    this.garbageField.update(delta);
    this.laserTool.update(delta);
    this.collectorPit.checkCapture(
        this.garbageField.meshes,
        this.#handleCollection.bind(this)
    );

    this.renderer.render(this.scene, this.camera);
  }

  teleportPlayer() {
    const target = this.teleportController.getNextPoint();
    this.player.teleportTo(target);
  }

  #setupEnvironment() {
    const hemi = new THREE.HemisphereLight('#6af9ff', '#010003', 0.6);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight('#c3f7ff', 1.4);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    this.scene.add(dirLight);

    this.platform = new Platform();
    this.platform.mesh.userData.teleportable = true;
    // Mark all child meshes as teleportable
    this.platform.mesh.traverse((child) => {
      if (child.isMesh) {
        child.userData.teleportable = true;
      }
    });
    this.scene.add(this.platform.mesh);

    this.collectorPit = new CollectorPit();
    this.scene.add(this.collectorPit.group);
  }

  #setupActors() {
    this.player = new Player(this.camera, this.canvas);
    this.scene.add(this.player.root);

    this.garbageField = new GarbageField(this.scene, this.collectorPit.radius);

    this.laserTool = new LaserTool({
      player: this.player,
      garbageField: this.garbageField,
      onGrab: (mesh) => this.scene.attach(mesh),
    });

    this.teleportController = new TeleportController({
      radius: this.platform.radius * 0.7,
    });

    // Setup VR controllers after all actors are created
    this.vrController = new VRController(
      this.renderer,
      this.scene,
      this.camera,
      this.player,
      this.laserTool
    );
  }

  #setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Handle WebXR session events
    this.renderer.xr.addEventListener('sessionstart', () => {
      // Update camera for VR
      this.camera.position.set(0, 2, 10);
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      // Return to desktop mode
    });
  }

  #handleCollection(mesh) {
    // Only increment if the mesh is actually still in the game
    // (Prevents double-counting if the pit logic is very fast)
    this.collected += 1;

    // Use the new remove function instead of respawn
    this.garbageField.removeMesh(mesh);

    if (typeof this.hooks.onCollect === 'function') {
      this.hooks.onCollect(this.collected);
    }
  }
}


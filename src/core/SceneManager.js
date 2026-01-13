import * as THREE from 'three';
import { Player } from './Player.js';
import { Platform } from './Platform.js';
import { GarbageField } from './GarbageField.js';
import { LaserTool } from './LaserTool.js';
import { CollectorPit } from './CollectorPit.js';
import { TeleportController } from './TeleportController.js';

export class SceneManager {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;

    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');

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
    this.xrSession = null;
    this.xrInputSources = [];
    this.lastTriggerState = false;
    this.xrController = null;

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

    // Process XR controller input if in VR
    if (this.xrSession && this.xrInputSources.length > 0) {
      this.#processXRInput();
    }

    const movementDelta = this.player.update(delta);
    
    // Move the world in opposite direction to simulate player movement
    if (movementDelta.lengthSq() > 0) {
      movementDelta.multiplyScalar(-1);
      this.platform.mesh.position.add(movementDelta);
      this.collectorPit.group.position.add(movementDelta);
      this.garbageField.moveAll(movementDelta);
      this.teleportController.moveAllPoints(movementDelta);
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

  async startXRSession() {
    if (!navigator.xr) {
      alert('WebXR is not supported on this device');
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
      });
      this.xrSession = session;
      
      // Create visible controllers
      const controllerGeometry = new THREE.BoxGeometry(0.05, 0.12, 0.06);
      const controllerMaterial = new THREE.MeshStandardMaterial({
        color: '#2fd7ff',
        emissive: '#2fd7ff',
        emissiveIntensity: 0.3,
      });
      
      // Right controller (index 1) for aiming
      this.xrController = this.renderer.xr.getController(1);
      const rightControllerMesh = new THREE.Mesh(controllerGeometry, controllerMaterial.clone());
      this.xrController.add(rightControllerMesh);
      this.scene.add(this.xrController);
      
      // Left controller (index 0) for reference
      const leftController = this.renderer.xr.getController(0);
      const leftControllerMesh = new THREE.Mesh(controllerGeometry, controllerMaterial.clone());
      leftController.add(leftControllerMesh);
      this.scene.add(leftController);
      
      // Update laser tool to use controller aiming
      this.laserTool.setXRController(this.xrController);
      
      // Track input sources
      session.addEventListener('inputsourceschange', (event) => {
        this.xrInputSources = Array.from(session.inputSources);
      });
      
      this.renderer.xr.setSession(session);
    } catch (error) {
      console.error('Failed to start XR session:', error);
      alert('Could not start VR mode');
    }
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
  }

  #setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
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

  #processXRInput() {
    for (const source of this.xrInputSources) {
      if (source.gamepad) {
        const gamepad = source.gamepad;
        
        // Left thumbstick for movement (axes 2 and 3)
        // Right thumbstick for rotation (axes 0 and 1)
        if (gamepad.axes.length >= 4) {
          const lx = gamepad.axes[2]; // Left thumbstick X
          const ly = gamepad.axes[3]; // Left thumbstick Y
          
          // Set movement states based on thumbstick input
          // Apply deadzone
          const deadzone = 0.2;
          if (Math.abs(lx) > deadzone || Math.abs(ly) > deadzone) {
            this.player.move.forward = ly < -deadzone;
            this.player.move.backward = ly > deadzone;
            this.player.move.left = lx < -deadzone;
            this.player.move.right = lx > deadzone;
          } else {
            this.player.move.forward = false;
            this.player.move.backward = false;
            this.player.move.left = false;
            this.player.move.right = false;
          }
        }

        // Trigger button for laser (button 0)
        const triggerPressed = gamepad.buttons[0]?.pressed || false;
        if (triggerPressed && !this.lastTriggerState) {
          this.laserTool.activate();
        } else if (!triggerPressed && this.lastTriggerState) {
          this.laserTool.deactivate();
        }
        this.lastTriggerState = triggerPressed;
      }
    }
  }
}


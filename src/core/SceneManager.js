import * as THREE from 'three';
import { Player } from './Player.js';
import { Platform } from './Platform.js';
import { GarbageField } from './GarbageField.js';
import { LaserTool } from './LaserTool.js';
import { GarbageCollector } from './GarbageCollector.js';
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

    // Combo system
    this.combo = 0;
    this.comboMultiplier = 1;
    this.lastCollectionTime = 0;
    this.comboWindow = 3000; // 3 seconds to maintain combo

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
      this.garbageCollectors.forEach(collector => collector.group.position.add(movementDelta));
      this.garbageField.moveAll(movementDelta);
      this.teleportController.moveAllPoints(movementDelta);
    }
    
    // Animate garbage collectors with difficulty scaling
    const difficultyScale = 1 + (this.collected / 25) * 0.5; // Speed increases with collections
    this.garbageCollectors.forEach(collector => collector.animate(delta, difficultyScale));
    
    // Update combo timeout
    const now = performance.now();
    if (now - this.lastCollectionTime > this.comboWindow && this.combo > 0) {
      this.combo = 0;
      this.comboMultiplier = 1;
    }
    
    this.laserTool.update(delta);  // Run BEFORE garbageField so objects get grabbed before physics
    this.garbageField.update(delta);
    
    // Check collision with garbage collectors
    this.#checkCollectorCollisions();

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
      
      // Move the world down so player spawns above the platform
      // This is more reliable than moving the player in VR
      const yOffset = -4.5;
      this.platform.mesh.position.y += yOffset;
      this.garbageCollectors.forEach(collector => collector.group.position.y += yOffset);
      this.garbageField.moveAll(new THREE.Vector3(0, yOffset, 0));
      this.teleportController.moveAllPoints(new THREE.Vector3(0, yOffset, 0));
      
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

    // Create garbage collectors in space around the platform
    this.garbageCollectors = [];
    const positions = [
      new THREE.Vector3(15, 8, 0),
      new THREE.Vector3(-15, 8, 0),
      new THREE.Vector3(0, 8, 15),
      new THREE.Vector3(0, 8, -15),
      new THREE.Vector3(12, 10, 12),
      new THREE.Vector3(-12, 10, 12),
      new THREE.Vector3(12, 10, -12),
      new THREE.Vector3(-12, 10, -12),
    ];
    for (const pos of positions) {
      const collector = new GarbageCollector(pos);
      this.garbageCollectors.push(collector);
      this.scene.add(collector.group);
    }
  }

  #setupActors() {
    this.player = new Player(this.camera, this.canvas);
    this.scene.add(this.player.root);

    this.garbageField = new GarbageField(this.scene);

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

  #checkCollectorCollisions() {
    for (const mesh of this.garbageField.meshes) {
      // Only check thrown and floating objects
      if (mesh.userData.state !== 'thrown' && mesh.userData.state !== 'floating') {
        continue;
      }
      
      // Check collision with each garbage collector
      for (const collector of this.garbageCollectors) {
        if (collector.checkCollision(mesh)) {
          this.#handleCollection(mesh);
          break; // Object collected, move to next mesh
        }
      }
    }
  }

  #handleCollection(mesh) {
    // Only increment if the mesh is actually still in the game
    // (Prevents double-counting if the pit logic is very fast)
    this.collected += 1;

    // Update combo system
    const now = performance.now();
    if (now - this.lastCollectionTime < this.comboWindow) {
      this.combo += 1;
      this.comboMultiplier = 1 + (this.combo * 0.1); // +10% per consecutive collection
    } else {
      this.combo = 1;
      this.comboMultiplier = 1;
    }
    this.lastCollectionTime = now;

    // Use the new remove function instead of respawn
    this.garbageField.removeMesh(mesh);

    if (typeof this.hooks.onCollect === 'function') {
      this.hooks.onCollect(this.collected, this.combo, this.comboMultiplier);
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
            this.player.move.forward = ly > deadzone;
            this.player.move.backward = ly < -deadzone;
            this.player.move.left = lx < -deadzone;
            this.player.move.right = lx > deadzone;
          } else {
            this.player.move.forward = false;
            this.player.move.backward = false;
            this.player.move.left = false;
            this.player.move.right = false;
          }
        }

        // Trigger button for pulling (button 0)
        const triggerPressed = gamepad.buttons[0]?.pressed || false;
        if (triggerPressed && !this.lastTriggerState) {
          this.laserTool.activate();
        } else if (!triggerPressed && this.lastTriggerState) {
          this.laserTool.deactivate();
        }
        this.lastTriggerState = triggerPressed;

        // Grip button for throwing (button 1)
        const gripPressed = gamepad.buttons[1]?.pressed || false;
        if (gripPressed && !this.lastGripState) {
          this.laserTool.throwHeldObject();
        }
        this.lastGripState = gripPressed;
      }
    }
  }
}


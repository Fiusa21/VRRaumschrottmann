import * as THREE from 'three';
import { Player } from './Player.js';
import { Platform } from './Platform.js';
import { GarbageField } from './GarbageField.js';
import { LaserTool } from './LaserTool.js';
import { GarbageCollector } from './GarbageCollector.js';
import { TeleportController } from './TeleportController.js';
import { ScoreDisplay } from './ScoreDisplay.js';
import { VRManualBoard } from './VRManualBoard.js';
import { TimerDisplay } from './TimerDisplay.js';
import { GameOverBoard } from './GameOverBoard.js';

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
    this.roundDuration = 60; // seconds
    this.remainingTime = this.roundDuration;
    this.roundEnded = false;
    this.xrSession = null;
    this.xrInputSources = [];
    this.lastTriggerState = false;
    this.lastManualButtonState = false;
    this.lastRestartButtonState = false;
    this.lastRestartButton4State = false;
    this.gripHoldStart = null;
    this.xrController = null;

    this.scoreDisplay = null;
    this.timerDisplay = null;
    this.starField = null;
    this.manualBoard = null;
    this.gameOverBoard = null;
    this.update = this.update.bind(this);
  }

  async init() {
    this.#setupEnvironment();
    this.#setupActors();
    this.#setupEvents();
  }

  start() {
    this.remainingTime = this.roundDuration;
    this.roundEnded = false;
    if (this.timerDisplay) {
      this.timerDisplay.setTime(this.remainingTime);
    }
    if (this.scoreDisplay) {
      this.scoreDisplay.setScore(this.collected);
    }
    this.renderer.setAnimationLoop(this.update);
  }

  update() {
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (!this.roundEnded) {
      this.remainingTime = Math.max(0, this.remainingTime - delta);
      if (typeof this.hooks.onTimerUpdate === 'function') {
        this.hooks.onTimerUpdate(this.remainingTime);
      }
      if (this.remainingTime <= 0) {
        this.#endRound();
        return;
      }
    }

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
    
    // Animate garbage collectors
    this.garbageCollectors.forEach(collector => collector.animate(delta));

    if (this.scoreDisplay) {
      this.scoreDisplay.update(this.camera);
    }

    if (this.timerDisplay) {
      this.timerDisplay.update(this.camera);
      this.timerDisplay.setTime(this.remainingTime);
    }

    if (this.manualBoard) {
      this.manualBoard.update(this.camera);
    }

    if (this.gameOverBoard) {
      this.gameOverBoard.update(this.camera);
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

      if (this.manualBoard) {
        this.manualBoard.setVisible(true);
      }
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

    this.#addStars();

    this.platform = new Platform();
    this.scene.add(this.platform.mesh);

    this.scoreDisplay = new ScoreDisplay();
    this.scene.add(this.scoreDisplay.mesh);

    this.timerDisplay = new TimerDisplay();
    this.scene.add(this.timerDisplay.mesh);

    this.manualBoard = new VRManualBoard();
    this.scene.add(this.manualBoard.mesh);

    this.gameOverBoard = new GameOverBoard();
    this.scene.add(this.gameOverBoard.mesh);

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

  #addStars() {
    const count = 1200;
    const radius = 420;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = radius * (0.7 + Math.random() * 0.3);
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.cos(theta);
      const z = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: '#cfe9ff',
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    this.starField = new THREE.Points(geometry, material);
    this.scene.add(this.starField);
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

  showManualBoard() {
    if (this.manualBoard) {
      this.manualBoard.setVisible(true);
    }
  }

  hideManualBoard() {
    if (this.manualBoard) {
      this.manualBoard.setVisible(false);
    }
  }

  toggleManualBoard() {
    if (this.manualBoard) {
      this.manualBoard.toggle();
    }
  }

  #handleCollection(mesh) {
    // Only increment if the mesh is actually still in the game
    // (Prevents double-counting if the pit logic is very fast)
    this.collected += 1;

    if (this.scoreDisplay) {
      this.scoreDisplay.setScore(this.collected);
    }

    // Use the new remove function instead of respawn
    this.garbageField.removeMesh(mesh);

    if (typeof this.hooks.onCollect === 'function') {
      this.hooks.onCollect(this.collected);
    }
  }

  #endRound() {
    if (this.roundEnded) return;
    this.roundEnded = true;
    if (this.gameOverBoard) {
      this.gameOverBoard.setScore(this.collected);
      this.gameOverBoard.setVisible(true);
    }
    if (typeof this.hooks.onRoundEnd === 'function') {
      this.hooks.onRoundEnd();
    }
  }

  restartRound() {
    this.roundEnded = false;
    this.remainingTime = this.roundDuration;
    this.collected = 0;
    if (this.gameOverBoard) {
      this.gameOverBoard.setVisible(false);
    }
    if (this.garbageField) {
      this.garbageField.reset();
    }
    if (this.scoreDisplay) {
      this.scoreDisplay.setScore(0);
    }
    if (this.timerDisplay) {
      this.timerDisplay.setTime(this.remainingTime);
    }
    if (typeof this.hooks.onCollect === 'function') {
      this.hooks.onCollect(this.collected);
    }
    this.renderer.setAnimationLoop(this.update);
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

        // Grip long-press fallback to restart (1.2s)
        if (gripPressed) {
          if (this.gripHoldStart == null) {
            this.gripHoldStart = performance.now();
          } else if (performance.now() - this.gripHoldStart > 1200) {
            console.log('[XR] Grip long-press: restart round');
            this.restartRound();
            this.gripHoldStart = null;
          }
        } else {
          this.gripHoldStart = null;
        }

        // Use A/X (button 3) to toggle the VR manual board
        const manualPressed = gamepad.buttons[3]?.pressed || false;
        if (manualPressed && !this.lastManualButtonState) {
          this.toggleManualBoard();
        }
        this.lastManualButtonState = manualPressed;

        // Use B/Y to restart: some devices use index 2, others 4
        const restartPressed2 = gamepad.buttons[2]?.pressed || false;
        const restartPressed4 = gamepad.buttons[4]?.pressed || false;
        if (restartPressed2 && !this.lastRestartButtonState) {
          console.log('[XR] Button 2: restart round');
          this.restartRound();
        }
        if (restartPressed4 && !this.lastRestartButton4State) {
          console.log('[XR] Button 4: restart round');
          this.restartRound();
        }
        this.lastRestartButtonState = restartPressed2;
        this.lastRestartButton4State = restartPressed4;
      }
    }
  }
}


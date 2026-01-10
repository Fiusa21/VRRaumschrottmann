import { SceneManager } from './core/SceneManager.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';

const canvas = document.getElementById('game-canvas');
const teleportBtn = document.getElementById('teleport-btn');
const xrButton = document.getElementById('xr-button');
const collectedLabel = document.getElementById('collected-count');

const sceneManager = new SceneManager(canvas, {
  onCollect: (count) => {
    collectedLabel.textContent = count;
  },
});

sceneManager.init().then(() => {
  sceneManager.start();
  
  // Setup WebXR button
  const xrBtn = XRButton.createButton(sceneManager.renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['bounded-floor', 'hand-tracking']
  });
  
  // Replace the placeholder button with the XRButton
  xrButton.replaceWith(xrBtn);
  
  // Style the XR button to match the UI
  xrBtn.classList.add('xr-button');
  const style = document.createElement('style');
  style.textContent = `
    .xr-button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0.6rem 1.2rem !important;
      font-size: 0.9rem !important;
      border: 1px solid var(--accent) !important;
      border-radius: 999px !important;
      background: transparent !important;
      color: var(--accent) !important;
      cursor: pointer !important;
      text-transform: uppercase !important;
      letter-spacing: 0.1em !important;
      margin-left: 0.5rem !important;
      font-family: "Space Mono", "Segoe UI", sans-serif !important;
    }
    .xr-button:hover {
      background: rgba(104, 241, 255, 0.12) !important;
    }
  `;
  document.head.appendChild(style);
});

teleportBtn.addEventListener('click', () => sceneManager.teleportPlayer());
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyT') {
    sceneManager.teleportPlayer();
  }
});


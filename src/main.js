import { SceneManager } from './core/SceneManager.js';

const canvas = document.getElementById('game-canvas');
const teleportBtn = document.getElementById('teleport-btn');
const collectedLabel = document.getElementById('collected-count');

const sceneManager = new SceneManager(canvas, {
  onCollect: (count) => {
    collectedLabel.textContent = count;
  },
});

sceneManager.init().then(() => sceneManager.start());

teleportBtn.addEventListener('click', () => sceneManager.teleportPlayer());
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyT') {
    sceneManager.teleportPlayer();
  }
});


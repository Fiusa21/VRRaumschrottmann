import { SceneManager } from './core/SceneManager.js';

const canvas = document.getElementById('game-canvas');
const teleportBtn = document.getElementById('teleport-btn');
const vrBtn = document.getElementById('vr-btn');
const collectedLabel = document.getElementById('collected-count');
const timerLabel = document.getElementById('timer-display');
const overlay = document.getElementById('menu-overlay');
const startDesktopBtn = document.getElementById('start-desktop');
const startVrBtn = document.getElementById('start-vr');
const manualBtn = document.getElementById('manual-btn');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-game');

const sceneManager = new SceneManager(canvas, {
  onCollect: (count) => {
    collectedLabel.textContent = count;
  },
  onTimerUpdate: (seconds) => {
    if (timerLabel) timerLabel.textContent = formatTime(seconds);
  },
  onRoundEnd: () => {
    overlay?.classList.remove('hidden');
    started = false;
  },
});

let initialized = false;
let started = false;

async function boot(mode = 'desktop') {
  if (started) {
    if (sceneManager.roundEnded) {
      sceneManager.restartRound();
    }
    if (mode === 'vr') {
      await sceneManager.startXRSession();
    }
    overlay?.classList.add('hidden');
    started = true;
    return;
  }

  if (!initialized) {
    await sceneManager.init();
    initialized = true;
  }

  sceneManager.start();
  started = true;
  if (mode === 'vr') {
    await sceneManager.startXRSession();
  }
  overlay?.classList.add('hidden');
}

teleportBtn.addEventListener('click', () => sceneManager.teleportPlayer());
vrBtn.addEventListener('click', () => boot('vr'));
startDesktopBtn?.addEventListener('click', () => boot('desktop'));
startVrBtn?.addEventListener('click', () => boot('vr'));
manualBtn?.addEventListener('click', () => overlay?.classList.remove('hidden'));
resumeBtn?.addEventListener('click', () => overlay?.classList.add('hidden'));
restartBtn?.addEventListener('click', () => window.location.reload());

// When in VR, also show the in-world manual board so headset users can read it
manualBtn?.addEventListener('click', () => {
  sceneManager.toggleManualBoard?.();
});

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyT') {
    sceneManager.teleportPlayer();
  }
});


import { LAWS, LAW_INDEX } from '../engine/laws.js';
import { Simulation } from '../engine/simulation.js';
import { CHAMBERS, loadChamber } from '../engine/chambers.js';
import { FaultLineSynth } from '../audio/synth.js';
import { ManifoldRenderer } from './renderer.js';
import { TelemetryPanel } from './telemetry.js';

const sim = new Simulation(192, 112, 5);
const synth = new FaultLineSynth();

const canvas = document.getElementById('manifold-canvas');
const renderer = new ManifoldRenderer(canvas, sim);
const telemetry = new TelemetryPanel(
  document.getElementById('scope-canvas'),
  document.getElementById('event-feed'),
  document.getElementById('telemetry-stats'),
  sim
);

sim.onFaultAudio = (evt, xNorm) => synth.playFaultCrossing(evt, xNorm);
sim.onDetectorAudio = (det, xNorm) => synth.playDetectorPing(det, xNorm);

const state = {
  tool: 'pulse', // 'pulse' | 'paint' | 'rect' | 'emitter' | 'detector' | 'erase'
  paintLaw: LAW_INDEX.TAXICAB,
  brushRadius: 28,
  speedScale: 1,
  dragging: false,
  dragStart: null,
  lastPaintPos: null,
  hoveredPos: null,
  logicA: true,
  logicB: true,
  toastTimer: null,
};

// DOM References
const chamberSelect = document.getElementById('chamber-select');
const briefTitleEl = document.getElementById('brief-title');
const briefSubEl = document.getElementById('brief-sub');
const briefDescEl = document.getElementById('brief-desc');
const lawPaletteEl = document.getElementById('law-palette');
const toolButtons = document.querySelectorAll('[data-tool]');
const brushSlider = document.getElementById('brush-size');
const brushSizeLabel = document.getElementById('brush-size-label');
const playBtn = document.getElementById('btn-play');
const stepBtn = document.getElementById('btn-step');
const speedSelect = document.getElementById('speed-select');
const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');
const resetBtn = document.getElementById('btn-reset');
const clearBtn = document.getElementById('btn-clear');
const audioBtn = document.getElementById('btn-audio');
const guideBtn = document.getElementById('btn-guide');
const guideModal = document.getElementById('guide-modal');
const closeGuideBtn = document.getElementById('btn-close-guide');
const toastEl = document.getElementById('toast');
const toggleWaves = document.getElementById('toggle-waves');
const toggleTrails = document.getElementById('toggle-trails');
const toggleMetric = document.getElementById('toggle-metric');
const logicPanel = document.getElementById('logic-panel');
const btnLogicA = document.getElementById('btn-logic-a');
const btnLogicB = document.getElementById('btn-logic-b');
const btnLogicFire = document.getElementById('btn-logic-fire');
const truthButtons = document.querySelectorAll('.truth-btn');
const ledSum = document.getElementById('led-sum');
const ledCarry = document.getElementById('led-carry');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const fileImport = document.getElementById('file-import');

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2600);
}

function refreshUndoButtons() {
  undoBtn.disabled = !sim.manifold.canUndo();
  redoBtn.disabled = !sim.manifold.canRedo();
}

function buildChamberOptions() {
  const frag = document.createDocumentFragment();
  for (const c of CHAMBERS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    frag.appendChild(opt);
  }
  chamberSelect.replaceChildren(frag);
}

function buildLawPalette() {
  const frag = document.createDocumentFragment();
  for (const law of LAWS) {
    const btn = document.createElement('button');
    btn.className = `law-card${law.index === state.paintLaw ? ' active' : ''}`;
    btn.dataset.law = String(law.index);
    btn.title = law.hint;

    const head = document.createElement('div');
    head.className = 'law-card-head';

    const badge = document.createElement('span');
    badge.className = 'law-badge';
    badge.style.color = law.colorHex;
    badge.style.borderColor = `${law.colorHex}44`;
    badge.style.background = `${law.colorHex}18`;
    badge.textContent = law.symbol;

    const name = document.createElement('span');
    name.className = 'law-name';
    name.textContent = law.shortName;

    const code = document.createElement('span');
    code.className = 'law-code';
    code.textContent = law.code;

    head.append(badge, name, code);

    const eq = document.createElement('div');
    eq.className = 'law-eq';
    eq.textContent = law.equation;

    const hint = document.createElement('div');
    hint.className = 'law-hint';
    hint.textContent = law.hint;

    btn.append(head, eq, hint);
    btn.addEventListener('click', () => {
      state.paintLaw = law.index;
      if (
        state.tool === 'pulse' ||
        state.tool === 'emitter' ||
        state.tool === 'detector' ||
        state.tool === 'erase'
      ) {
        setTool('paint');
      }
      refreshLawSelection();
    });
    frag.appendChild(btn);
  }
  lawPaletteEl.replaceChildren(frag);
}

function refreshLawSelection() {
  lawPaletteEl.querySelectorAll('.law-card').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.law) === state.paintLaw);
  });
}

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  canvas.style.cursor = tool === 'pulse' ? 'crosshair' : 'none';
}

function setBrief(title, sub, desc) {
  briefTitleEl.textContent = title;
  briefSubEl.textContent = sub;
  briefDescEl.textContent = desc;
}

function activateChamber(chamberId) {
  const chamber = loadChamber(sim, chamberId);
  sim.manifold.clearHistory();
  refreshUndoButtons();
  chamberSelect.value = chamber.id;
  setBrief(chamber.name, chamber.subtitle, chamber.description);

  const isLogic = Boolean(chamber.isLogicChamber);
  logicPanel.classList.toggle('hidden', !isLogic);
  if (isLogic) {
    syncLogicEmitters();
    fireHalfAdderCycle();
  }
}

function syncLogicEmitters() {
  const emA = sim.emitters.find((e) => e.id === 'input-a');
  const emB = sim.emitters.find((e) => e.id === 'input-b');
  if (emA) emA.enabled = state.logicA;
  if (emB) emB.enabled = state.logicB;
  btnLogicA.classList.toggle('on', state.logicA);
  btnLogicA.textContent = `INPUT A: ${state.logicA ? '1' : '0'}`;
  btnLogicB.classList.toggle('on', state.logicB);
  btnLogicB.textContent = `INPUT B: ${state.logicB ? '1' : '0'}`;
}

function fireHalfAdderCycle() {
  sim.particles = [];
  sim.waveField.clear();
  sim.resetDetectors();
  syncLogicEmitters();
  sim.pulseAllEnabledEmitters();
  updateLogicLEDs();
}

function updateLogicLEDs() {
  if (sim.currentChamberId !== 'half-adder') return;
  const sumDet = sim.detectors.find((d) => d.id === 'det-sum');
  const carryDet = sim.detectors.find((d) => d.id === 'det-carry');
  const sumOn = Boolean(sumDet && sumDet.hitCount > 0);
  const carryOn = Boolean(carryDet && carryDet.hitCount > 0);
  ledSum.classList.toggle('lit', sumOn);
  ledCarry.classList.toggle('lit', carryOn);
  ledSum.querySelector('strong').textContent = sumOn ? '1' : '0';
  ledCarry.querySelector('strong').textContent = carryOn ? '1' : '0';
}

function canvasToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = sim.manifold.worldWidth / Math.max(1, rect.width);
  const scaleY = sim.manifold.worldHeight / Math.max(1, rect.height);
  return {
    x: Math.max(0, Math.min(sim.manifold.worldWidth - 1, (ev.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(sim.manifold.worldHeight - 1, (ev.clientY - rect.top) * scaleY)),
  };
}

// Canvas mouse/pointer bindings
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (ev) => {
  const pos = canvasToWorld(ev);
  if (ev.button === 2) {
    sim.waveField.injectWorld(pos.x, pos.y, 3.2, 2.5);
    return;
  }

  canvas.setPointerCapture(ev.pointerId);
  state.dragging = true;
  state.dragStart = pos;
  state.lastPaintPos = pos;

  if (state.tool === 'paint') {
    sim.manifold.pushHistory();
    refreshUndoButtons();
    sim.manifold.paintCircle(pos.x, pos.y, state.brushRadius, state.paintLaw);
  } else if (state.tool === 'pulse') {
    sim.waveField.injectWorld(pos.x, pos.y, 3.0, 2.3);
  } else if (state.tool === 'detector') {
    sim.addDetector({
      label: `DET ${sim.detectors.length + 1}`,
      x: pos.x,
      y: pos.y,
      radius: 22,
    });
    showToast(`Added Detector DET ${sim.detectors.length}`);
  } else if (state.tool === 'erase') {
    const hit = sim.findObjectAt(pos.x, pos.y);
    if (hit) {
      if (hit.kind === 'emitter') {
        sim.emitters.splice(hit.index, 1);
        showToast('Removed Emitter');
      } else {
        sim.detectors.splice(hit.index, 1);
        showToast('Removed Detector');
      }
    }
  }
});

canvas.addEventListener('pointermove', (ev) => {
  const pos = canvasToWorld(ev);
  state.hoveredPos = pos;

  if (state.dragging && state.tool === 'paint' && state.lastPaintPos) {
    sim.manifold.paintLine(
      state.lastPaintPos.x,
      state.lastPaintPos.y,
      pos.x,
      pos.y,
      state.brushRadius,
      state.paintLaw
    );
    state.lastPaintPos = pos;
  }

  renderer.hoverState = {
    x: pos.x,
    y: pos.y,
    tool: state.tool,
    brushRadius: state.brushRadius,
    paintLaw: state.paintLaw,
    dragStart: state.dragging ? state.dragStart : null,
  };
});

canvas.addEventListener('pointerup', (ev) => {
  if (!state.dragging) return;
  const pos = canvasToWorld(ev);
  const start = state.dragStart;

  if (state.tool === 'pulse' && start) {
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      const speed = Math.min(210, Math.max(55, dist * 1.4));
      const ang = Math.atan2(dy, dx);
      sim.spawnParticle({
        x: start.x,
        y: start.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 14,
      });
    }
  } else if (state.tool === 'rect' && start) {
    const rx = Math.min(start.x, pos.x);
    const ry = Math.min(start.y, pos.y);
    const rw = Math.abs(pos.x - start.x);
    const rh = Math.abs(pos.y - start.y);
    if (rw >= 6 && rh >= 6) {
      sim.manifold.pushHistory();
      refreshUndoButtons();
      sim.manifold.paintRect(rx, ry, rw, rh, state.paintLaw);
    }
  } else if (state.tool === 'emitter' && start) {
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const dist = Math.hypot(dx, dy);
    const angle = dist > 5 ? Math.atan2(dy, dx) : 0;
    const speed = dist > 5 ? Math.min(200, Math.max(70, dist * 1.3)) : 130;
    sim.addEmitter({
      label: `E${sim.emitters.length + 1}`,
      x: start.x,
      y: start.y,
      angle,
      speed,
      interval: 0.75,
      mode: 'hybrid',
      waveAmp: 2.2,
    });
    showToast(`Placed Emitter E${sim.emitters.length}`);
  }

  state.dragging = false;
  state.dragStart = null;
  state.lastPaintPos = null;
  if (renderer.hoverState) renderer.hoverState.dragStart = null;
});

canvas.addEventListener('pointerleave', () => {
  state.hoveredPos = null;
  renderer.hoverState = null;
});

// UI Control Bindings
toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

brushSlider.addEventListener('input', () => {
  state.brushRadius = Number(brushSlider.value);
  brushSizeLabel.textContent = `${state.brushRadius}px`;
});

chamberSelect.addEventListener('change', () => {
  activateChamber(chamberSelect.value);
});

speedSelect.addEventListener('change', () => {
  state.speedScale = Number(speedSelect.value) || 1;
});

playBtn.addEventListener('click', () => {
  sim.paused = !sim.paused;
  playBtn.textContent = sim.paused ? 'Play' : 'Pause';
  playBtn.classList.toggle('paused', sim.paused);
});

stepBtn.addEventListener('click', () => {
  sim.paused = true;
  playBtn.textContent = 'Play';
  playBtn.classList.add('paused');
  sim.step(1 / 60);
  updateLogicLEDs();
});

undoBtn.addEventListener('click', () => {
  if (sim.manifold.undo()) {
    refreshUndoButtons();
    showToast('Undid paint stroke');
  }
});

redoBtn.addEventListener('click', () => {
  if (sim.manifold.redo()) {
    refreshUndoButtons();
    showToast('Redid paint stroke');
  }
});

resetBtn.addEventListener('click', () => {
  activateChamber(sim.currentChamberId);
  showToast('Preset reloaded');
});

clearBtn.addEventListener('click', () => {
  sim.manifold.pushHistory();
  sim.clearAll();
  refreshUndoButtons();
  setBrief(
    'Blank Euclidean Canvas',
    'Freeform Sandbox',
    'Paint incompatible space rules, drag to launch particles, right-click for waves, or place emitters and detectors.'
  );
  logicPanel.classList.add('hidden');
  showToast('Reset grid to Euclidean');
});

audioBtn.addEventListener('click', async () => {
  const nextMuted = !synth.muted;
  await synth.setMuted(nextMuted);
  audioBtn.textContent = nextMuted ? 'Audio: Off' : 'Audio: On';
  audioBtn.classList.toggle('active-audio', !nextMuted);
  showToast(nextMuted ? 'Audio muted' : 'Audio enabled');
});

guideBtn.addEventListener('click', () => {
  guideModal.classList.remove('hidden');
});

closeGuideBtn.addEventListener('click', () => {
  guideModal.classList.add('hidden');
});

guideModal.addEventListener('click', (ev) => {
  if (ev.target === guideModal) {
    guideModal.classList.add('hidden');
  }
});

toggleWaves.addEventListener('change', () => {
  renderer.showWaveLayer = toggleWaves.checked;
  sim.enableWaves = toggleWaves.checked;
});
toggleTrails.addEventListener('change', () => {
  renderer.showTrails = toggleTrails.checked;
});
toggleMetric.addEventListener('change', () => {
  renderer.showMetricOverlay = toggleMetric.checked;
});

btnLogicA.addEventListener('click', () => {
  state.logicA = !state.logicA;
  fireHalfAdderCycle();
});
btnLogicB.addEventListener('click', () => {
  state.logicB = !state.logicB;
  fireHalfAdderCycle();
});
btnLogicFire.addEventListener('click', () => {
  fireHalfAdderCycle();
});
truthButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.logicA = btn.dataset.a === '1';
    state.logicB = btn.dataset.b === '1';
    fireHalfAdderCycle();
    showToast(`Half-Adder pulse: A=${state.logicA ? 1 : 0}, B=${state.logicB ? 1 : 0}`);
  });
});

btnExport.addEventListener('click', () => {
  const blob = new Blob([sim.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `axiom-rift-${sim.currentChamberId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported JSON');
});

btnImport.addEventListener('click', () => fileImport.click());
fileImport.addEventListener('change', async () => {
  const file = fileImport.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    sim.importJSON(text);
    refreshUndoButtons();
    logicPanel.classList.toggle('hidden', sim.detectors.length === 0);
    setBrief(
      'Imported Layout',
      'Custom JSON Preset',
      'Loaded saved rule grid, emitters, and detectors.'
    );
    showToast(`Loaded ${file.name}`);
  } catch (err) {
    showToast(err.message || 'Failed to import JSON', true);
  }
  fileImport.value = '';
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !guideModal.classList.contains('hidden')) {
    guideModal.classList.add('hidden');
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoBtn.click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoBtn.click();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.key >= '1' && e.key <= '7') {
    state.paintLaw = Number(e.key) - 1;
    refreshLawSelection();
    setTool('paint');
  }
});

// Main 60Hz Loop with speed multiplier accumulator
buildChamberOptions();
buildLawPalette();
setTool('pulse');
activateChamber('fourfold-prism');

let lastTs = performance.now();
let stepAccumulator = 0;

function loop(ts) {
  const elapsed = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;

  if (!sim.paused) {
    stepAccumulator += elapsed * 60 * state.speedScale;
    const steps = Math.min(5, Math.floor(stepAccumulator));
    stepAccumulator -= steps;
    for (let i = 0; i < steps; i++) {
      sim.step(1 / 60);
    }
    updateLogicLEDs();
  }

  renderer.render();
  telemetry.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

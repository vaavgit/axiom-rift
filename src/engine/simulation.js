import { LAW_INDEX } from './laws.js';
import { Manifold } from './manifold.js';
import { WaveField } from './wavefield.js';
import {
  createParticle,
  stepParticle,
  resolveParticleCollisions,
} from './particles.js';

export class Simulation {
  constructor(cols = 192, rows = 112, cellSize = 5) {
    this.manifold = new Manifold(cols, rows, cellSize);
    this.waveField = new WaveField(this.manifold);
    this.particles = [];
    this.sparks = [];
    this.emitters = [];
    this.detectors = [];
    this.events = [];
    this.history = [];

    this.time = 0;
    this.stepCount = 0;
    this.paused = false;
    this.enableWaves = true;
    this.enableCollisions = true;
    this.maxParticles = 240;

    this.stepDefectAccum = 0;
    this.onFaultAudio = null;
    this.onDetectorAudio = null;
    this.currentChamberId = 'fourfold-prism';
  }

  clearDynamics() {
    this.particles = [];
    this.sparks = [];
    this.events = [];
    this.history = [];
    this.waveField.clear();
    this.time = 0;
    this.stepCount = 0;
    this.stepDefectAccum = 0;
    for (const d of this.detectors) {
      d.hitCount = 0;
      d.activeTimer = 0;
      d.lastHitTime = -1;
      d.consumedIds.clear();
    }
    for (const e of this.emitters) {
      e.timer = e.phaseOffset ?? 0;
    }
  }

  clearAll() {
    this.manifold.clearHistory();
    this.manifold.fill(LAW_INDEX.EUCLIDEAN);
    this.emitters = [];
    this.detectors = [];
    this.clearDynamics();
  }

  addEmitter(cfg) {
    if (!cfg || !Number.isFinite(cfg.x) || !Number.isFinite(cfg.y)) {
      throw new Error('Invalid emitter coordinates');
    }
    const mode = cfg.mode === 'wave' || cfg.mode === 'hybrid' ? cfg.mode : 'particle';
    const rawInterval = Number.isFinite(cfg.interval) ? cfg.interval : 0.9;
    const interval = rawInterval <= 0 ? 0 : Math.max(0.12, Math.min(30, rawInterval));
    const emitter = {
      id: typeof cfg.id === 'string' && cfg.id ? cfg.id.slice(0, 40) : `emit-${this.emitters.length + 1}`,
      label: typeof cfg.label === 'string' ? cfg.label.slice(0, 24) : '',
      x: clampNum(cfg.x, 4, this.manifold.worldWidth - 4),
      y: clampNum(cfg.y, 4, this.manifold.worldHeight - 4),
      angle: Number.isFinite(cfg.angle) ? cfg.angle : 0,
      speed: clampNum(Number.isFinite(cfg.speed) ? cfg.speed : 130, 10, 320),
      spread: clampNum(Number.isFinite(cfg.spread) ? cfg.spread : 0, 0, Math.PI * 2),
      interval,
      phaseOffset: clampNum(Number.isFinite(cfg.phaseOffset) ? cfg.phaseOffset : 0, 0, 30),
      timer: clampNum(Number.isFinite(cfg.phaseOffset) ? cfg.phaseOffset : 0, 0, 30),
      mode,
      waveAmp: clampNum(Number.isFinite(cfg.waveAmp) ? cfg.waveAmp : 2.2, 0.1, 4.0),
      particleLife: clampNum(Number.isFinite(cfg.particleLife) ? cfg.particleLife : 12.0, 0.5, 99999),
      particleRadius: clampNum(Number.isFinite(cfg.particleRadius) ? cfg.particleRadius : 4.5, 2, 14),
      enabled: cfg.enabled !== false,
      tag: typeof cfg.tag === 'string' ? cfg.tag.slice(0, 24) : null,
    };
    this.emitters.push(emitter);
    return emitter;
  }

  addDetector(cfg) {
    if (!cfg || !Number.isFinite(cfg.x) || !Number.isFinite(cfg.y)) {
      throw new Error('Invalid detector coordinates');
    }
    const detector = {
      id: typeof cfg.id === 'string' && cfg.id ? cfg.id.slice(0, 40) : `det-${this.detectors.length + 1}`,
      label: typeof cfg.label === 'string' && cfg.label ? cfg.label.slice(0, 24) : 'DET',
      x: clampNum(cfg.x, 4, this.manifold.worldWidth - 4),
      y: clampNum(cfg.y, 4, this.manifold.worldHeight - 4),
      radius: clampNum(Number.isFinite(cfg.radius) ? cfg.radius : 20, 8, 70),
      hitCount: 0,
      activeTimer: 0,
      lastHitTime: -1,
      consumedIds: new Set(),
      consumeOnHit: Boolean(cfg.consumeOnHit),
    };
    this.detectors.push(detector);
    return detector;
  }

  findObjectAt(wx, wy, hitPad = 14) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (Math.hypot(wx - e.x, wy - e.y) <= hitPad) {
        return { kind: 'emitter', index: i, item: e };
      }
    }
    for (let i = this.detectors.length - 1; i >= 0; i--) {
      const d = this.detectors[i];
      if (Math.hypot(wx - d.x, wy - d.y) <= d.radius + 4) {
        return { kind: 'detector', index: i, item: d };
      }
    }
    return null;
  }

  spawnParticle(opts) {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    const law = this.manifold.lawAtWorld(opts.x, opts.y);
    const p = createParticle({ ...opts, law });
    this.particles.push(p);
    return p;
  }

  fireEmitter(emitter, burstWave = true) {
    const jitter = emitter.spread > 0 ? (Math.random() - 0.5) * emitter.spread : 0;
    const ang = emitter.angle + jitter;

    if (emitter.mode === 'particle' || emitter.mode === 'hybrid') {
      this.spawnParticle({
        x: emitter.x,
        y: emitter.y,
        vx: Math.cos(ang) * emitter.speed,
        vy: Math.sin(ang) * emitter.speed,
        life: emitter.particleLife,
        radius: emitter.particleRadius,
        tag: emitter.tag,
      });
    }
    if ((emitter.mode === 'wave' || emitter.mode === 'hybrid') && burstWave && this.enableWaves) {
      this.waveField.injectWorld(emitter.x, emitter.y, emitter.waveAmp, 2.2);
    }
  }

  pulseAllEnabledEmitters() {
    for (const e of this.emitters) {
      if (e.enabled) {
        this.fireEmitter(e, true);
      }
    }
  }

  resetDetectors() {
    for (const d of this.detectors) {
      d.hitCount = 0;
      d.activeTimer = 0;
      d.lastHitTime = -1;
      d.consumedIds.clear();
    }
  }

  step(dt = 1 / 60) {
    this.time += dt;
    this.stepCount++;
    this.stepDefectAccum = 0;

    for (const e of this.emitters) {
      if (!e.enabled || e.interval <= 0) continue;
      e.timer += dt;
      if (e.timer >= e.interval) {
        e.timer -= e.interval;
        this.fireEmitter(e, true);
      }
    }

    if (this.enableWaves) {
      this.waveField.step();
    }

    const transitionHandler = (p, fromLaw, toLaw, res) => {
      const defect = res.defect || 0;
      const impulse = res.impulse || 0;
      const visualMagnitude = defect + impulse * 18;
      this.stepDefectAccum += defect;
      this.manifold.exciteFaultAtWorld(p.x, p.y, Math.min(1.0, 0.22 + visualMagnitude * 0.00018));

      if (this.enableWaves && visualMagnitude > 250) {
        const amp = Math.min(0.55, 0.16 + visualMagnitude * 0.00005);
        this.waveField.injectWorld(p.x, p.y, amp, 1.4);
      }

      this.spawnDefectSpark(p.x, p.y, res.outcome, visualMagnitude);

      const evt = {
        time: this.time,
        x: p.x,
        y: p.y,
        fromLaw,
        toLaw,
        outcome: res.outcome,
        thetaI: (res.thetaI * 180) / Math.PI,
        thetaR: (res.thetaR * 180) / Math.PI,
        defect,
        impulse,
      };
      this.events.unshift(evt);
      if (this.events.length > 28) {
        this.events.pop();
      }

      if (this.onFaultAudio) {
        this.onFaultAudio(evt, p.x / this.manifold.worldWidth);
      }
    };

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      stepParticle(p, this.manifold, dt, this.time, transitionHandler);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    if (this.enableCollisions && this.particles.length > 1) {
      resolveParticleCollisions(this.particles, (a, b, cx, cy, impulse) => {
        if (this.enableWaves && impulse > 25) {
          this.waveField.injectWorld(cx, cy, Math.min(0.65, impulse * 0.003), 1.6);
        }
        this.pushSpark({
          x: cx,
          y: cy,
          radius: 4,
          maxRadius: 28,
          alpha: 0.9,
          color: '#fef08a',
          kind: 'COLLIDE',
        });
      });
    }

    let activeParticleIds = null;
    for (const d of this.detectors) {
      if (d.activeTimer > 0) {
        d.activeTimer = Math.max(0, d.activeTimer - dt);
      }
      if (d.consumedIds.size > 300) {
        if (!activeParticleIds) {
          activeParticleIds = new Set(this.particles.map((p) => p.id));
        }
        for (const id of d.consumedIds) {
          if (!activeParticleIds.has(id)) {
            d.consumedIds.delete(id);
          }
        }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        if (d.consumedIds.has(p.id)) continue;
        const dist = Math.hypot(p.x - d.x, p.y - d.y);
        if (dist <= d.radius + p.radius * 0.5) {
          d.consumedIds.add(p.id);
          d.hitCount++;
          d.activeTimer = 1.8;
          d.lastHitTime = this.time;
          this.pushSpark({
            x: d.x,
            y: d.y,
            radius: 6,
            maxRadius: d.radius * 1.9,
            alpha: 1.0,
            color: '#4ade80',
            kind: 'DETECT',
          });
          if (this.onDetectorAudio) {
            this.onDetectorAudio(d, d.x / this.manifold.worldWidth);
          }
          if (d.consumeOnHit) {
            this.particles.splice(i, 1);
          }
        }
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.radius += (s.maxRadius - s.radius) * Math.min(1, dt * 8.5);
      s.alpha -= dt * 2.1;
      if (s.alpha <= 0) {
        this.sparks.splice(i, 1);
      }
    }
    this.manifold.decayFaultIntensity(0.92);

    if (this.stepCount % 3 === 0) {
      this.history.push({
        defect: this.stepDefectAccum,
        wave: this.waveField.totalEnergy * 0.02,
      });
      if (this.history.length > 140) {
        this.history.shift();
      }
    }
  }

  pushSpark(spark) {
    if (this.sparks.length >= 120) {
      this.sparks.shift();
    }
    this.sparks.push(spark);
  }

  spawnDefectSpark(x, y, outcome, defect) {
    const isTir = outcome === 'METRIC_TIR';
    const isChrono = outcome === 'CHRONO_INVERT';
    const maxR = Math.min(44, 12 + Math.sqrt(defect) * 0.35);
    this.pushSpark({
      x,
      y,
      radius: 3,
      maxRadius: maxR,
      alpha: 0.95,
      color: isTir ? '#fbbf24' : isChrono ? '#e879f9' : '#38bdf8',
      kind: outcome,
    });
  }

  exportJSON() {
    return JSON.stringify({
      version: 1,
      cols: this.manifold.cols,
      rows: this.manifold.rows,
      cellSize: this.manifold.cellSize,
      grid: this.manifold.exportGrid(),
      emitters: this.emitters.map((e) => ({ ...e })),
      detectors: this.detectors.map((d) => ({
        id: d.id,
        label: d.label,
        x: d.x,
        y: d.y,
        radius: d.radius,
        consumeOnHit: d.consumeOnHit,
      })),
    });
  }

  importJSON(raw) {
    if (typeof raw === 'string' && raw.length > 2 * 1024 * 1024) {
      throw new Error('JSON file exceeds 2 MB safety limit');
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.grid)) {
      throw new Error('Invalid Axiom Manifold JSON payload');
    }
    if (data.emitters !== undefined && !Array.isArray(data.emitters)) {
      throw new Error('Invalid emitters array in JSON');
    }
    if (data.detectors !== undefined && !Array.isArray(data.detectors)) {
      throw new Error('Invalid detectors array in JSON');
    }
    if ((data.emitters?.length ?? 0) > 48 || (data.detectors?.length ?? 0) > 48) {
      throw new Error('Too many emitters or detectors (max 48 each)');
    }
    if (!this.manifold.importGrid(data.grid)) {
      throw new Error('Manifold grid dimensions or law indices are invalid');
    }

    this.manifold.clearHistory();
    this.emitters = [];
    this.detectors = [];
    this.clearDynamics();

    if (Array.isArray(data.emitters)) {
      for (const e of data.emitters) this.addEmitter(e);
    }
    if (Array.isArray(data.detectors)) {
      for (const d of data.detectors) this.addDetector(d);
    }
  }
}

function clampNum(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

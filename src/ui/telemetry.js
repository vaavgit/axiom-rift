import { getLaw } from '../engine/laws.js';

export class TelemetryPanel {
  constructor(scopeCanvas, eventsEl, statsEl, sim) {
    this.scopeCanvas = scopeCanvas;
    this.scopeCtx = scopeCanvas.getContext('2d');
    this.eventsEl = eventsEl;
    this.statsEl = statsEl;
    this.sim = sim;
    this.lastEventHeadTime = -1;
    this.lastRenderedCount = -1;
  }

  render() {
    this.renderOscilloscope();
    this.renderStats();
    this.renderEvents();
  }

  renderOscilloscope() {
    const ctx = this.scopeCtx;
    const w = this.scopeCanvas.width;
    const h = this.scopeCanvas.height;
    const history = this.sim.history;

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    if (history.length < 2) return;

    let maxDefect = 100;
    let maxWave = 1;
    for (const s of history) {
      if (s.defect > maxDefect) maxDefect = s.defect;
      if (s.wave > maxWave) maxWave = s.wave;
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = (i / Math.max(1, history.length - 1)) * w;
      const y = h - 4 - (history[i].wave / maxWave) * (h - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = (i / Math.max(1, history.length - 1)) * w;
      const y = h - 4 - (history[i].defect / maxDefect) * (h - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  renderStats() {
    const { particles, waveField, time } = this.sim;
    const lastDefect =
      this.sim.history.length > 0
        ? this.sim.history[this.sim.history.length - 1].defect
        : 0;

    const items = [
      ['Time', `${time.toFixed(1)}s`],
      ['Particles', `${particles.length}`],
      ['Wave E', `${waveField.totalEnergy.toFixed(0)}`],
      ['ΔH Flux', `${lastDefect.toFixed(0)}`],
    ];

    if (this.statsEl.children.length !== items.length) {
      this.statsEl.replaceChildren(
        ...items.map(([label, value]) => {
          const pill = document.createElement('div');
          pill.className = 'stat-pill';
          const span = document.createElement('span');
          span.textContent = label;
          const strong = document.createElement('strong');
          strong.textContent = value;
          pill.append(span, strong);
          return pill;
        })
      );
      return;
    }

    for (let i = 0; i < items.length; i++) {
      this.statsEl.children[i].lastElementChild.textContent = items[i][1];
    }
  }

  renderEvents() {
    const events = this.sim.events;
    const headTime = events.length > 0 ? events[0].time : -1;
    if (headTime === this.lastEventHeadTime && events.length === this.lastRenderedCount) {
      return;
    }
    this.lastEventHeadTime = headTime;
    this.lastRenderedCount = events.length;

    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'event-empty';
      empty.textContent =
        'No border crossings yet. Click or right-click to emit waves and particles across regions.';
      this.eventsEl.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const e of events.slice(0, 10)) {
      const from = getLaw(e.fromLaw);
      const to = getLaw(e.toLaw);

      const row = document.createElement('div');
      row.className = 'event-row';

      const lawsLine = document.createElement('div');
      lawsLine.className = 'event-laws';

      const fromSpan = document.createElement('span');
      fromSpan.style.color = from.colorHex;
      fromSpan.textContent = `${from.symbol} ${from.code}`;

      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';

      const toSpan = document.createElement('span');
      toSpan.style.color = to.colorHex;
      toSpan.textContent = `${to.symbol} ${to.code}`;

      const tag = document.createElement('span');
      const tagClass =
        e.outcome === 'METRIC_TIR'
          ? 'tag-tir'
          : e.outcome === 'CHRONO_INVERT'
          ? 'tag-chrono'
          : e.outcome === 'QUANTUM_SNAP'
          ? 'tag-quant'
          : 'tag-refract';
      tag.className = `outcome-tag ${tagClass}`;
      tag.textContent = e.outcome;

      lawsLine.append(fromSpan, arrow, toSpan, tag);

      const mathLine = document.createElement('div');
      mathLine.className = 'event-math';
      const dp = Number.isFinite(e.impulse) ? e.impulse.toFixed(0) : '0';
      mathLine.textContent = `θᵢ=${e.thetaI.toFixed(1)}° -> θᵣ=${e.thetaR.toFixed(1)}° | Δp=${dp} | ΔH=${e.defect.toFixed(0)}`;

      row.append(lawsLine, mathLine);
      fragment.appendChild(row);
    }

    this.eventsEl.replaceChildren(fragment);
  }
}

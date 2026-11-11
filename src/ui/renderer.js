import { LAWS, LAW_INDEX, getLaw, unitBallRadius } from '../engine/laws.js';

export class ManifoldRenderer {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = simulation;

    const { worldWidth, worldHeight, cols, rows } = simulation.manifold;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // Cached static territory + fault-line surface
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = worldWidth;
    this.terrainCanvas.height = worldHeight;
    this.terrainCtx = this.terrainCanvas.getContext('2d');
    this.lastManifoldVersion = -1;

    // Low-res wavefield ImageData buffer upscaled smoothly with additive glow
    this.waveCanvas = document.createElement('canvas');
    this.waveCanvas.width = cols;
    this.waveCanvas.height = rows;
    this.waveCtx = this.waveCanvas.getContext('2d');
    this.waveImg = this.waveCtx.createImageData(cols, rows);

    this.showMetricOverlay = true;
    this.showWaveLayer = true;
    this.showTrails = true;
    this.hoverState = null; // { x, y, tool, brushRadius, paintLaw, dragStart }
  }

  rebuildTerrainCache() {
    const { manifold } = this.sim;
    const { cols, rows, cellSize, grid } = manifold;
    const ctx = this.terrainCtx;
    const w = this.worldWidth;
    const h = this.worldHeight;

    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, w, h);

    // Subtle territory base tint per cell
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lawIdx = grid[y * cols + x];
        if (lawIdx === LAW_INDEX.EUCLIDEAN) continue;
        const law = getLaw(lawIdx);
        ctx.fillStyle = law.bgRgba;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    // Subtle geometric texture signatures clipped cleanly per law mask
    this.drawTerritoryPatterns(ctx, manifold);

    // Crisp iridescent Ontological Fault Lines at cell borders
    ctx.lineWidth = 1.6;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const py = y * cellSize;
      for (let x = 0; x < cols; x++) {
        const idx = row + x;
        const here = grid[idx];
        const px = x * cellSize;

        if (x + 1 < cols && grid[idx + 1] !== here) {
          const other = grid[idx + 1];
          ctx.strokeStyle = blendLawStroke(here, other);
          ctx.beginPath();
          ctx.moveTo(px + cellSize, py);
          ctx.lineTo(px + cellSize, py + cellSize);
          ctx.stroke();
        }
        if (y + 1 < rows && grid[idx + cols] !== here) {
          const other = grid[idx + cols];
          ctx.strokeStyle = blendLawStroke(here, other);
          ctx.beginPath();
          ctx.moveTo(px, py + cellSize);
          ctx.lineTo(px + cellSize, py + cellSize);
          ctx.stroke();
        }
      }
    }

    this.lastManifoldVersion = manifold.version;
  }

  drawTerritoryPatterns(ctx, manifold) {
    const { cols, rows, cellSize, grid } = manifold;
    ctx.save();
    for (let y = 0; y < rows; y += 3) {
      for (let x = 0; x < cols; x += 3) {
        const lawIdx = grid[y * cols + x];
        const cx = (x + 1.5) * cellSize;
        const cy = (y + 1.5) * cellSize;

        if (lawIdx === LAW_INDEX.TAXICAB) {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 4);
          ctx.lineTo(cx + 4, cy);
          ctx.lineTo(cx, cy + 4);
          ctx.lineTo(cx - 4, cy);
          ctx.closePath();
          ctx.stroke();
        } else if (lawIdx === LAW_INDEX.CHEBYSHEV) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.14)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(cx - 3.5, cy - 3.5, 7, 7);
        } else if (lawIdx === LAW_INDEX.CHRONO) {
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.18)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0.4, Math.PI * 1.45);
          ctx.stroke();
        } else if (lawIdx === LAW_INDEX.ARISTOTELIAN) {
          ctx.fillStyle = 'rgba(251, 113, 133, 0.18)';
          ctx.fillRect(cx - 1, cy - 1, 2, 2);
        } else if (lawIdx === LAW_INDEX.HYPERBOLIC) {
          ctx.strokeStyle = 'rgba(129, 140, 248, 0.16)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (lawIdx === LAW_INDEX.QUANTIZED) {
          ctx.fillStyle = 'rgba(45, 212, 191, 0.20)';
          ctx.beginPath();
          ctx.arc(cx, cy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  render() {
    const { manifold, waveField, particles, sparks, emitters, detectors } = this.sim;
    if (this.lastManifoldVersion !== manifold.version) {
      this.rebuildTerrainCache();
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.drawImage(this.terrainCanvas, 0, 0);

    if (this.showWaveLayer && this.sim.enableWaves) {
      this.renderWaveBuffer(manifold, waveField);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.waveCanvas, 0, 0, this.worldWidth, this.worldHeight);
      ctx.restore();
    }

    for (const s of sparks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.kind === 'DETECT' ? 2.4 : 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const d of detectors) {
      const active = d.activeTimer > 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(74, 222, 128, 0.24)' : 'rgba(15, 23, 42, 0.55)';
      ctx.fill();
      ctx.lineWidth = active ? 2.4 : 1.5;
      ctx.strokeStyle = active ? '#4ade80' : 'rgba(148, 163, 184, 0.65)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(134, 239, 172, 0.9)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? '#86efac' : '#cbd5e1';
      ctx.fillText(d.label, d.x, d.y - d.radius - 7);
      ctx.fillStyle = active ? '#4ade80' : '#94a3b8';
      ctx.fillText(`${d.hitCount}`, d.x, d.y + 4);
      ctx.restore();
    }

    for (const e of emitters) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);

      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = e.enabled ? 'rgba(78, 161, 255, 0.25)' : 'rgba(100, 116, 139, 0.18)';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = e.enabled ? '#7dd3fc' : '#64748b';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(16, 0);
      ctx.lineTo(12, -3.5);
      ctx.moveTo(16, 0);
      ctx.lineTo(12, 3.5);
      ctx.strokeStyle = e.enabled ? '#e0f2fe' : '#64748b';
      ctx.stroke();
      ctx.restore();

      if (e.label) {
        ctx.save();
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = e.enabled ? '#bae6fd' : '#64748b';
        ctx.fillText(e.label, e.x, e.y - 14);
        ctx.restore();
      }
    }

    for (const p of particles) {
      const law = getLaw(p.law);

      if (this.showTrails && p.trail.length > 1) {
        for (let i = 1; i < p.trail.length; i++) {
          const prev = p.trail[i - 1];
          const curr = p.trail[i];
          const tLaw = getLaw(curr.law);
          const alpha = (i / p.trail.length) * 0.72;
          ctx.strokeStyle = `rgba(${tLaw.rgb[0]}, ${tLaw.rgb[1]}, ${tLaw.rgb[2]}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.1 + (i / p.trail.length) * 1.6;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${law.rgb[0]}, ${law.rgb[1]}, ${law.rgb[2]}, 0.24)`;
      ctx.fill();

      if (p.law === LAW_INDEX.CHRONO) {
        ctx.strokeStyle = '#f0abfc';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2.3, p.phase, p.phase + Math.PI * 1.3);
        ctx.stroke();
      } else if (p.law === LAW_INDEX.QUANTIZED) {
        ctx.strokeStyle = '#5eead4';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const hx = p.x + Math.cos(a) * p.radius * 2.1;
          const hy = p.y + Math.sin(a) * p.radius * 2.1;
          if (k === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = law.colorHex;
      ctx.stroke();
      ctx.restore();
    }

    if (this.hoverState) {
      this.renderHoverOverlay(ctx, manifold, this.hoverState);
    }

    ctx.restore();
  }

  renderWaveBuffer(manifold, waveField) {
    const data = this.waveImg.data;
    const { u, energyAcc } = waveField;
    const { grid, faultIntensity } = manifold;
    const len = waveField.size;

    for (let i = 0; i < len; i++) {
      const val = u[i];
      const absVal = val < 0 ? -val : val;
      const glow = faultIntensity[i];
      const law = LAWS[grid[i]];
      const rgb = law.waveRgb;

      const offset = i * 4;
      if (absVal < 0.012 && glow < 0.02 && energyAcc[i] < 0.015) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        continue;
      }

      const amp = Math.min(1.0, absVal * 1.55 + energyAcc[i] * 0.4);
      const crest = val > 0 ? Math.min(1, val * 0.9) : 0;
      const trough = val < 0 ? Math.min(1, -val * 0.9) : 0;

      // Positive crests illuminate in law color + bright core; negative troughs tint cool deep violet/cyan
      let r = rgb[0] * amp + crest * 80 + trough * 24 + glow * 255;
      let g = rgb[1] * amp + crest * 85 + trough * 40 + glow * 230;
      let b = rgb[2] * amp + crest * 95 + trough * 95 + glow * 170;

      data[offset] = r > 255 ? 255 : r;
      data[offset + 1] = g > 255 ? 255 : g;
      data[offset + 2] = b > 255 ? 255 : b;
      data[offset + 3] = Math.min(245, Math.floor((amp * 0.9 + glow * 0.85) * 255));
    }

    this.waveCtx.putImageData(this.waveImg, 0, 0);
  }

  renderHoverOverlay(ctx, manifold, hover) {
    const { x, y, tool, brushRadius, paintLaw, dragStart } = hover;
    const lawIdx = manifold.lawAtWorld(x, y);
    const law = getLaw(lawIdx);

    ctx.save();

    // Draw Live Finsler Unit-Ball Probe around cursor
    if (this.showMetricOverlay) {
      const scale = 28;
      ctx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const r = unitBallRadius(lawIdx, theta) * scale;
        const px = x + Math.cos(theta) * r;
        const py = y + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = law.colorHex;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = `${law.symbol} ${law.shortName} (${law.code}) | tau=${law.tau > 0 ? '+1' : '-1'}`;
      const hint = law.hint || '';
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      const w1 = ctx.measureText(label).width;
      ctx.font = '400 10px Inter, system-ui, sans-serif';
      const w2 = ctx.measureText(hint).width;
      const boxW = Math.max(w1, w2) + 14;
      const bx = Math.min(this.worldWidth - boxW - 8, x + 32);
      const by = Math.max(36, y - 28);

      ctx.fillStyle = 'rgba(7, 10, 18, 0.88)';
      ctx.fillRect(bx - 6, by - 14, boxW, 33);
      ctx.strokeStyle = law.colorHex;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(bx - 6, by - 14, boxW, 33);

      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(label, bx, by - 2);
      ctx.font = '400 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(hint, bx, by + 12);
    }

    // Tool-specific cursor preview
    if (tool === 'paint') {
      const targetLaw = getLaw(paintLaw);
      ctx.beginPath();
      ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
      ctx.strokeStyle = targetLaw.colorHex;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (tool === 'pulse' && dragStart) {
      ctx.beginPath();
      ctx.moveTo(dragStart.x, dragStart.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(dragStart.x, dragStart.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    } else if (tool === 'emitter' && dragStart) {
      ctx.beginPath();
      ctx.moveTo(dragStart.x, dragStart.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (tool === 'rect' && dragStart) {
      const rx = Math.min(dragStart.x, x);
      const ry = Math.min(dragStart.y, y);
      const rw = Math.abs(x - dragStart.x);
      const rh = Math.abs(y - dragStart.y);
      ctx.strokeStyle = getLaw(paintLaw).colorHex;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (tool === 'erase') {
      const hit = this.sim.findObjectAt(x, y);
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = hit ? '#fb7185' : 'rgba(251, 113, 133, 0.6)';
      ctx.lineWidth = hit ? 2.2 : 1.3;
      ctx.stroke();
      if (hit) {
        ctx.beginPath();
        ctx.arc(hit.item.x, hit.item.y, (hit.item.radius || 10) + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function blendLawStroke(a, b) {
  const la = getLaw(a);
  const lb = getLaw(b);
  const r = Math.round((la.rgb[0] + lb.rgb[0]) * 0.55 + 45);
  const g = Math.round((la.rgb[1] + lb.rgb[1]) * 0.55 + 45);
  const bl = Math.round((la.rgb[2] + lb.rgb[2]) * 0.55 + 45);
  return `rgba(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, bl)}, 0.88)`;
}

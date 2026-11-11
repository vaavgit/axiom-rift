import { LAW_INDEX } from './laws.js';

/**
 * Coupled Multi-Metric 2D Wave PDE Solver.
 * Each cell evolves according to the spatial law at that cell:
 *  - Euclidean (L2): 4th-order isotropic 9-point stencil -> circular fronts
 *  - Taxicab (L1): Finsler directional speed c = 1 / (|cos θ| + |sin θ|) -> diamond fronts
 *  - Chebyshev (L∞): Finsler directional speed c = 1 / max(|cos θ|, |sin θ|) -> square fronts
 *  - Chrono-Inverted (R): Ping-Pong Phase-Conjugate Time-Reversal Mirror -> imploding return waves
 *  - Aristotelian (A): Overdamped zero-inertia medium -> rapid viscous extinction
 *  - Hyperbolic (H): Inhomogeneous conformal speed Ω(x,y) -> geodesic lensing
 *  - Quantized (Q): Hexagonal 6-fold eigenvalue dispersion + harmonic shell resonance
 */
export class WaveField {
  constructor(manifold) {
    this.manifold = manifold;
    const n = manifold.cols * manifold.rows;
    this.size = n;
    this.u = new Float32Array(n);
    this.uPrev = new Float32Array(n);
    this.uNext = new Float32Array(n);
    this.energyAcc = new Float32Array(n);

    // Ping-Pong Phase-Conjugate Time-Reversal buffers for Chrono-Inverted cells
    this.chronoWindow = 28;
    this.chronoBufA = new Float32Array(this.chronoWindow * n);
    this.chronoBufB = new Float32Array(this.chronoWindow * n);
    this.chronoTick = 0;
    this.chronoParity = 0;

    this.totalEnergy = 0;
  }

  clear() {
    this.u.fill(0);
    this.uPrev.fill(0);
    this.uNext.fill(0);
    this.energyAcc.fill(0);
    this.chronoBufA.fill(0);
    this.chronoBufB.fill(0);
    this.chronoTick = 0;
    this.chronoParity = 0;
    this.totalEnergy = 0;
  }

  injectWorld(wx, wy, amplitude = 2.0, radiusCells = 2.2) {
    const [cx, cy] = this.manifold.worldToCell(wx, wy);
    const { cols, rows } = this.manifold;
    const r = Math.ceil(radiusCells);
    const sigma2 = Math.max(0.6, radiusCells * radiusCells * 0.45);

    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y <= 0 || y >= rows - 1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x <= 0 || x >= cols - 1) continue;
        const d2 = dx * dx + dy * dy;
        const val = amplitude * Math.exp(-d2 / sigma2);
        const idx = y * cols + x;
        this.u[idx] = clampWave(this.u[idx] + val);
        this.uPrev[idx] = clampWave(this.uPrev[idx] + val * 0.35);
      }
    }
  }

  step() {
    const { cols, rows, grid } = this.manifold;
    const { u, uPrev, uNext, energyAcc } = this;
    const size = this.size;

    const tick = this.chronoTick;
    const revTick = this.chronoWindow - 1 - tick;
    const recBuf = this.chronoParity === 0 ? this.chronoBufA : this.chronoBufB;
    const playBuf = this.chronoParity === 0 ? this.chronoBufB : this.chronoBufA;
    const recOffset = tick * size;
    const playOffset = revTick * size;

    let sumEnergy = 0;

    for (let y = 1; y < rows - 1; y++) {
      const row = y * cols;
      const rowN = row - cols;
      const rowS = row + cols;

      for (let x = 1; x < cols - 1; x++) {
        const idx = row + x;
        const law = grid[idx];

        const u0 = u[idx];
        const uN = u[rowN + x];
        const uS = u[rowS + x];
        const uW = u[idx - 1];
        const uE = u[idx + 1];
        const uNW = u[rowN + x - 1];
        const uNE = u[rowN + x + 1];
        const uSW = u[rowS + x - 1];
        const uSE = u[rowS + x + 1];

        // 4th-order isotropic 9-point stencil average
        const avgIso =
          0.2 * (uN + uS + uW + uE) +
          0.05 * (uNW + uNE + uSW + uSE);

        let nextVal = 0;

        if (law === LAW_INDEX.EUCLIDEAN) {
          nextVal = (2 * u0 - uPrev[idx] + 0.56 * (avgIso - u0)) * 0.994;
        } else if (law === LAW_INDEX.TAXICAB || law === LAW_INDEX.CHEBYSHEV) {
          const gx = (uE - uW) * 0.5;
          const gy = (uS - uN) * 0.5;
          const mag = Math.hypot(gx, gy);

          if (law === LAW_INDEX.TAXICAB) {
            let dirScale = 0.84;
            if (mag > 1e-4) {
              const ax = Math.abs(gx) / mag;
              const ay = Math.abs(gy) / mag;
              // L1 Huygens speed scales as 1/(|cos|+|sin|), raised to 1.35 to keep diamond corners crisp at long wavelengths.
              dirScale = Math.pow(1 / (ax + ay), 1.35);
            }
            const avg4 = 0.25 * (uN + uS + uW + uE);
            const mix = 0.72 * avg4 + 0.28 * avgIso;
            const r2 = Math.min(1.05, 0.74 * dirScale * dirScale);
            nextVal = (2 * u0 - uPrev[idx] + r2 * (mix - u0)) * 0.993;
          } else {
            let dirScale = 1.15;
            if (mag > 1e-4) {
              const ax = Math.abs(gx) / mag;
              const ay = Math.abs(gy) / mag;
              dirScale = Math.pow(1 / Math.max(1e-4, Math.max(ax, ay)), 1.35);
            }
            const avgDiag = 0.25 * (uNW + uNE + uSW + uSE);
            const mix = 0.62 * avgDiag + 0.38 * avgIso;
            const r2 = Math.min(1.06, 0.36 * dirScale * dirScale);
            nextVal = (2 * u0 - uPrev[idx] + r2 * (mix - u0)) * 0.993;
          }
        } else if (law === LAW_INDEX.CHRONO) {
          const prop = (2 * u0 - uPrev[idx] + 0.58 * (avgIso - u0)) * 0.975;
          // Weight boundary recording higher than interior so echoes re-emit cleanly back across the seam.
          const isFault = this.manifold.faultMask[idx];
          recBuf[recOffset + idx] = isFault ? u0 * 0.9 : u0 * 0.35;
          const echo = playBuf[playOffset + idx];
          nextVal = prop + echo * (isFault ? 0.32 : 0.08);
        } else if (law === LAW_INDEX.ARISTOTELIAN) {
          nextVal = u0 * 0.74 + 0.16 * (avgIso - u0);
        } else if (law === LAW_INDEX.HYPERBOLIC) {
          const dx = (x / cols) - 0.5;
          const dy = (y / rows) - 0.5;
          const omega = 0.52 + 0.95 * (dx * dx + dy * dy);
          const r2 = Math.min(1.02, omega);
          nextVal = (2 * u0 - uPrev[idx] + r2 * (avgIso - u0)) * 0.995;
        } else {
          const gx = (uE - uW) * 0.5;
          const gy = (uS - uN) * 0.5;
          const mag = Math.hypot(gx, gy);
          let r2 = 0.54;
          if (mag > 1e-4) {
            const theta = Math.atan2(gy, gx);
            const hex = 0.88 + 0.24 * Math.cos(6 * theta);
            r2 = 0.56 * hex * hex;
          }
          const raw = (2 * u0 - uPrev[idx] + r2 * (avgIso - u0)) * 0.995;
          nextVal = raw - 0.018 * Math.sin(raw * Math.PI * 2.2);
        }

        // Subtle fault-line scattering loss on abrupt metric discontinuities
        if (this.manifold.faultMask[idx]) {
          nextVal *= 0.992;
        }

        nextVal = clampWave(nextVal);
        uNext[idx] = nextVal;

        const vel = nextVal - u0;
        const e = 0.5 * (nextVal * nextVal + vel * vel);
        energyAcc[idx] = energyAcc[idx] * 0.82 + Math.min(2.0, e * 1.4) * 0.18;
        sumEnergy += e;
      }
    }

    for (let x = 0; x < cols; x++) {
      uNext[x] = 0;
      uNext[(rows - 1) * cols + x] = 0;
    }
    for (let y = 0; y < rows; y++) {
      uNext[y * cols] = 0;
      uNext[y * cols + (cols - 1)] = 0;
    }

    this.uPrev = this.u;
    this.u = this.uNext;
    this.uNext = uPrev;
    this.totalEnergy = sumEnergy;

    this.chronoTick++;
    if (this.chronoTick >= this.chronoWindow) {
      this.chronoTick = 0;
      this.chronoParity ^= 1;
    }
  }
}

function clampWave(v) {
  if (v > 3.5) return 3.5;
  if (v < -3.5) return -3.5;
  if (Number.isNaN(v)) return 0;
  return v;
}

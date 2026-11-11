import { LAWS, LAW_INDEX } from './laws.js';

/**
 * 2D Multi-Metric Wave PDE Solver.
 * Each cell steps the scalar wave equation using the local rule's operator:
 *  - Euclidean (L2): 2nd-order isotropic 9-point Laplacian (O(h^4) rotational symmetry)
 *  - Taxicab (L1), Chebyshev (L∞), Quantized (Q): orientation-tensor directional
 *    curvature (c_n^2 u_nn + c_t^2 u_tt) with Kelvin-Voigt high-k damping
 *  - Chrono-Inverted (R): passive capture/replay half-cycle boundary mirror
 *  - Aristotelian (A): overdamped diffusion
 *  - Hyperbolic (H): local conformal depth scaling (translation-invariant)
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

    this.chronoWindow = 28;
    this.chronoBuf = new Float32Array(this.chronoWindow * n);
    this.chronoTick = 0;
    this.chronoPhase = 0; // 0 = passive capture, 1 = passive reverse replay

    this.totalEnergy = 0;
    this.maxAbsU = 0;
    this.clampedCount = 0;
  }

  clear() {
    this.u.fill(0);
    this.uPrev.fill(0);
    this.uNext.fill(0);
    this.energyAcc.fill(0);
    this.chronoBuf.fill(0);
    this.chronoTick = 0;
    this.chronoPhase = 0;
    this.totalEnergy = 0;
    this.maxAbsU = 0;
    this.clampedCount = 0;
  }

  injectWorld(wx, wy, amplitude = 1.1, radiusCells = 2.0) {
    const [cx, cy] = this.manifold.worldToCell(wx, wy);
    const { cols, rows } = this.manifold;
    const r = Math.ceil(radiusCells);
    const sigma2 = Math.max(0.65, radiusCells * radiusCells * 0.45);

    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y <= 0 || y >= rows - 1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x <= 0 || x >= cols - 1) continue;
        const d2 = dx * dx + dy * dy;
        const val = amplitude * Math.exp(-d2 / sigma2);
        const idx = y * cols + x;
        this.u[idx] += val;
        this.uPrev[idx] += val * 0.35;
      }
    }
  }

  step() {
    const { cols, rows, grid, faultMask, hyperbolicDepth } = this.manifold;
    const { u, uPrev, uNext, energyAcc, chronoBuf } = this;
    const size = this.size;

    const tick = this.chronoTick;
    const isCapturing = this.chronoPhase === 0;
    const bufOffset = (isCapturing ? tick : this.chronoWindow - 1 - tick) * size;

    let sumEnergy = 0;
    let frameMaxAbs = 0;

    for (let y = 1; y < rows - 1; y++) {
      const row = y * cols;
      const rowN = row - cols;
      const rowS = row + cols;

      for (let x = 1; x < cols - 1; x++) {
        const idx = row + x;
        const law = grid[idx];

        const u0 = u[idx];
        const up = uPrev[idx];
        const uN = u[rowN + x];
        const uS = u[rowS + x];
        const uW = u[idx - 1];
        const uE = u[idx + 1];
        const uNW = u[rowN + x - 1];
        const uNE = u[rowN + x + 1];
        const uSW = u[rowS + x - 1];
        const uSE = u[rowS + x + 1];

        const avgIso =
          0.2 * (uN + uS + uW + uE) +
          0.05 * (uNW + uNE + uSW + uSE);

        let nextVal = 0;

        if (law === LAW_INDEX.EUCLIDEAN) {
          const base = LAWS[law].baseSpeed;
          const r2 = 0.62 * base * base;
          nextVal = (2 * u0 - up + r2 * (avgIso - u0)) * 0.993;
        } else if (
          law === LAW_INDEX.TAXICAB ||
          law === LAW_INDEX.CHEBYSHEV ||
          law === LAW_INDEX.QUANTIZED
        ) {
          const uxx = uE - 2 * u0 + uW;
          const uyy = uS - 2 * u0 + uN;
          const uxy = 0.25 * (uSE - uNE - uSW + uNW);

          const gx0 = (uE - uW) * 0.5;
          const gy0 = (uS - uN) * 0.5;
          const gxN = (uNE - uNW) * 0.5;
          const gxS = (uSE - uSW) * 0.5;
          const gyE = (uSE - uNE) * 0.5;
          const gyW = (uSW - uNW) * 0.5;

          const jxx = gx0 * gx0 + 0.5 * (gxN * gxN + gxS * gxS);
          const jyy = gy0 * gy0 + 0.5 * (gyE * gyE + gyW * gyW);
          const jxy = gx0 * gy0 + 0.25 * ((gxN + gxS) * (gyE + gyW));

          let cos2t = 1;
          let ax = Math.SQRT1_2;
          let ay = Math.SQRT1_2;
          let sgn = 1;

          if (jxx + jyy > 1e-9) {
            const diff = jxx - jyy;
            const norm = Math.hypot(diff, 2 * jxy);
            if (norm > 1e-10) {
              cos2t = Math.max(-1, Math.min(1, diff / norm));
              ax = Math.sqrt(Math.max(0, 0.5 * (1 + cos2t)));
              ay = Math.sqrt(Math.max(0, 0.5 * (1 - cos2t)));
              sgn = jxy >= 0 ? 1 : -1;
            }
          }

          const unn = ax * ax * uxx + 2 * sgn * ax * ay * uxy + ay * ay * uyy;
          const utt = ay * ay * uxx - 2 * sgn * ax * ay * uxy + ax * ax * uyy;

          let cn2;
          if (law === LAW_INDEX.TAXICAB) {
            const f = (ax + ay - 1) / (Math.SQRT2 - 1);
            cn2 = 0.34 - 0.24 * f;
          } else if (law === LAW_INDEX.CHEBYSHEV) {
            const f = (ax + ay - 1) / (Math.SQRT2 - 1);
            cn2 = 0.115 + 0.225 * f;
          } else {
            const cos6t = 4 * cos2t * cos2t * cos2t - 3 * cos2t;
            cn2 = 0.23 + 0.085 * cos6t;
          }

          const avgIsoPrev =
            0.2 * (uPrev[rowN + x] + uPrev[rowS + x] + uPrev[idx - 1] + uPrev[idx + 1]) +
            0.05 * (uPrev[rowN + x - 1] + uPrev[rowN + x + 1] + uPrev[rowS + x - 1] + uPrev[rowS + x + 1]);
          const kv = 0.045 * ((avgIso - u0) - (avgIsoPrev - up));
          nextVal = (2 * u0 - up + cn2 * unn + 0.08 * utt + kv) * 0.993;
        } else if (law === LAW_INDEX.CHRONO) {
          // Passive capture/replay convex boundary coupling prevents energy amplification.
          const prop = (2 * u0 - up + 0.58 * (avgIso - u0)) * 0.972;
          if (faultMask[idx]) {
            if (isCapturing) {
              chronoBuf[bufOffset + idx] = u0 * 0.72;
              nextVal = prop;
            } else {
              const echo = chronoBuf[bufOffset + idx];
              chronoBuf[bufOffset + idx] = 0;
              nextVal = 0.84 * prop + 0.16 * echo;
            }
          } else {
            nextVal = prop;
          }
        } else if (law === LAW_INDEX.ARISTOTELIAN) {
          nextVal = u0 * 0.74 + 0.16 * (avgIso - u0);
        } else {
          // Hyperbolic speed scales strictly with local interior depth inside the painted region.
          const depth = Math.min(16, hyperbolicDepth[idx]);
          const r2 = Math.min(1.04, 0.56 + 0.028 * depth);
          nextVal = (2 * u0 - up + r2 * (avgIso - u0)) * 0.994;
        }

        if (faultMask[idx]) {
          nextVal *= 0.995;
        }

        if (!Number.isFinite(nextVal) || nextVal > 8.0 || nextVal < -8.0) {
          this.clampedCount++;
          nextVal = Number.isFinite(nextVal) ? Math.max(-8.0, Math.min(8.0, nextVal)) : 0;
        }

        uNext[idx] = nextVal;
        const absVal = nextVal < 0 ? -nextVal : nextVal;
        if (absVal > frameMaxAbs) frameMaxAbs = absVal;

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
    this.maxAbsU = frameMaxAbs;

    this.chronoTick++;
    if (this.chronoTick >= this.chronoWindow) {
      this.chronoTick = 0;
      this.chronoPhase ^= 1;
    }
  }
}

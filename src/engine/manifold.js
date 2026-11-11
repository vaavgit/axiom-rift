import { LAW_COUNT, LAW_INDEX } from './laws.js';

/**
 * 2D Ontological Manifold storing per-cell physical laws and boundary geometry.
 */
export class Manifold {
  constructor(cols = 192, rows = 112, cellSize = 5) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.worldWidth = cols * cellSize;
    this.worldHeight = rows * cellSize;
    this.grid = new Uint8Array(cols * rows);
    this.faultMask = new Uint8Array(cols * rows);
    this.faultIntensity = new Float32Array(cols * rows);
    this.hyperbolicDepth = new Float32Array(cols * rows);
    this.version = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;
    this.fill(LAW_INDEX.EUCLIDEAN);
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
  }

  pushHistory() {
    this.undoStack.push(new Uint8Array(this.grid));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(new Uint8Array(this.grid));
    const prev = this.undoStack.pop();
    this.grid.set(prev);
    this.rebuildFaultMask();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(new Uint8Array(this.grid));
    const next = this.redoStack.pop();
    this.grid.set(next);
    this.rebuildFaultMask();
    return true;
  }

  fill(lawIndex) {
    const safeLaw = Number.isInteger(lawIndex) && lawIndex >= 0 && lawIndex < LAW_COUNT
      ? lawIndex
      : LAW_INDEX.EUCLIDEAN;
    this.grid.fill(safeLaw);
    this.rebuildFaultMask();
  }

  worldToCell(wx, wy) {
    const gx = Math.max(0, Math.min(this.cols - 1, Math.floor(wx / this.cellSize)));
    const gy = Math.max(0, Math.min(this.rows - 1, Math.floor(wy / this.cellSize)));
    return [gx, gy];
  }

  lawAtWorld(wx, wy) {
    const [gx, gy] = this.worldToCell(wx, wy);
    return this.grid[gy * this.cols + gx];
  }

  paintCircle(wx, wy, radius, lawIndex) {
    const changed = this.paintCircleQuiet(wx, wy, radius, lawIndex);
    if (changed) this.rebuildFaultMask();
    return changed;
  }

  paintRect(wx, wy, w, h, lawIndex) {
    const x0 = Math.max(0, Math.floor(wx / this.cellSize));
    const y0 = Math.max(0, Math.floor(wy / this.cellSize));
    const x1 = Math.min(this.cols - 1, Math.floor((wx + w) / this.cellSize));
    const y1 = Math.min(this.rows - 1, Math.floor((wy + h) / this.cellSize));
    let changed = false;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * this.cols + x;
        if (this.grid[idx] !== lawIndex) {
          this.grid[idx] = lawIndex;
          changed = true;
        }
      }
    }
    if (changed) this.rebuildFaultMask();
    return changed;
  }

  paintPolygon(points, lawIndex) {
    if (!points || points.length < 3) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const x0 = Math.max(0, Math.floor(minX / this.cellSize));
    const y0 = Math.max(0, Math.floor(minY / this.cellSize));
    const x1 = Math.min(this.cols - 1, Math.ceil(maxX / this.cellSize));
    const y1 = Math.min(this.rows - 1, Math.ceil(maxY / this.cellSize));
    let changed = false;

    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5) * this.cellSize;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * this.cellSize;
        if (pointInPolygon(px, py, points)) {
          const idx = y * this.cols + x;
          if (this.grid[idx] !== lawIndex) {
            this.grid[idx] = lawIndex;
            changed = true;
          }
        }
      }
    }
    if (changed) this.rebuildFaultMask();
    return changed;
  }

  paintLine(x0, y0, x1, y1, radius, lawIndex) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize * 0.5)));
    let anyChanged = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wx = x0 + (x1 - x0) * t;
      const wy = y0 + (y1 - y0) * t;
      if (this.paintCircleQuiet(wx, wy, radius, lawIndex)) {
        anyChanged = true;
      }
    }
    if (anyChanged) this.rebuildFaultMask();
    return anyChanged;
  }

  paintCircleQuiet(wx, wy, radius, lawIndex) {
    const rCells = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(wx / this.cellSize);
    const cy = Math.floor(wy / this.cellSize);
    const r2 = radius * radius;
    let changed = false;

    const minY = Math.max(0, cy - rCells);
    const maxY = Math.min(this.rows - 1, cy + rCells);
    const minX = Math.max(0, cx - rCells);
    const maxX = Math.min(this.cols - 1, cx + rCells);

    for (let y = minY; y <= maxY; y++) {
      const py = (y + 0.5) * this.cellSize;
      const dy = py - wy;
      for (let x = minX; x <= maxX; x++) {
        const px = (x + 0.5) * this.cellSize;
        const dx = px - wx;
        if (dx * dx + dy * dy <= r2) {
          const idx = y * this.cols + x;
          if (this.grid[idx] !== lawIndex) {
            this.grid[idx] = lawIndex;
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  rebuildFaultMask() {
    this.faultMask.fill(0);
    this.hyperbolicDepth.fill(0);
    const { cols, rows, grid, faultMask, hyperbolicDepth } = this;
    const size = cols * rows;
    const queue = new Int32Array(size);
    let qHead = 0;
    let qTail = 0;

    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x++) {
        const idx = rowOffset + x;
        const here = grid[idx];
        let isFault = 0;
        if (x + 1 < cols && grid[idx + 1] !== here) isFault = 1;
        else if (x > 0 && grid[idx - 1] !== here) isFault = 1;
        else if (y + 1 < rows && grid[idx + cols] !== here) isFault = 1;
        else if (y > 0 && grid[idx - cols] !== here) isFault = 1;
        faultMask[idx] = isFault;

        if (here === LAW_INDEX.HYPERBOLIC) {
          const atEdge = x === 0 || x === cols - 1 || y === 0 || y === rows - 1;
          if (isFault || atEdge) {
            hyperbolicDepth[idx] = 1;
            queue[qTail++] = idx;
          }
        }
      }
    }

    // BFS inward from each painted Hyperbolic border so conformal depth is strictly local to the painted region.
    while (qHead < qTail) {
      const idx = queue[qHead++];
      const d = hyperbolicDepth[idx] + 1;
      const x = idx % cols;
      const y = (idx - x) / cols;

      if (x + 1 < cols && grid[idx + 1] === LAW_INDEX.HYPERBOLIC && hyperbolicDepth[idx + 1] === 0) {
        hyperbolicDepth[idx + 1] = d;
        queue[qTail++] = idx + 1;
      }
      if (x > 0 && grid[idx - 1] === LAW_INDEX.HYPERBOLIC && hyperbolicDepth[idx - 1] === 0) {
        hyperbolicDepth[idx - 1] = d;
        queue[qTail++] = idx - 1;
      }
      if (y + 1 < rows && grid[idx + cols] === LAW_INDEX.HYPERBOLIC && hyperbolicDepth[idx + cols] === 0) {
        hyperbolicDepth[idx + cols] = d;
        queue[qTail++] = idx + cols;
      }
      if (y > 0 && grid[idx - cols] === LAW_INDEX.HYPERBOLIC && hyperbolicDepth[idx - cols] === 0) {
        hyperbolicDepth[idx - cols] = d;
        queue[qTail++] = idx - cols;
      }
    }

    // One smoothing pass to reduce staircase anisotropy in local depth gradients.
    if (qTail > 0) {
      const smoothed = new Float32Array(hyperbolicDepth);
      for (let y = 1; y < rows - 1; y++) {
        const row = y * cols;
        for (let x = 1; x < cols - 1; x++) {
          const idx = row + x;
          if (grid[idx] !== LAW_INDEX.HYPERBOLIC) continue;
          smoothed[idx] =
            0.5 * hyperbolicDepth[idx] +
            0.125 * (hyperbolicDepth[idx - 1] + hyperbolicDepth[idx + 1] + hyperbolicDepth[idx - cols] + hyperbolicDepth[idx + cols]);
        }
      }
      this.hyperbolicDepth.set(smoothed);
    }

    this.version++;
  }

  exciteFaultAtWorld(wx, wy, energy) {
    const [cx, cy] = this.worldToCell(wx, wy);
    const r = 2;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.rows) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= this.cols) continue;
        const idx = y * this.cols + x;
        if (this.faultMask[idx]) {
          const w = Math.max(0, 1 - Math.hypot(dx, dy) / 3);
          this.faultIntensity[idx] = Math.min(1.5, this.faultIntensity[idx] + energy * w);
        }
      }
    }
  }

  decayFaultIntensity(factor = 0.92) {
    const arr = this.faultIntensity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > 0.002) {
        arr[i] *= factor;
      } else {
        arr[i] = 0;
      }
    }
  }

  /**
   * Estimates the unit boundary normal pointing from `fromLaw` into `toLaw`
   * around world coordinates (wx, wy), using a smoothed 5x5 local kernel so
   * curved circles and diagonal prisms produce accurate refraction angles.
   */
  estimateBoundaryNormal(wx, wy, fromLaw, toLaw, fallbackVx = 1, fallbackVy = 0) {
    const [cx, cy] = this.worldToCell(wx, wy);
    let nx = 0;
    let ny = 0;

    for (let dy = -2; dy <= 2; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.rows) continue;
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cx + dx;
        if (x < 0 || x >= this.cols) continue;
        const law = this.grid[y * this.cols + x];
        const dist2 = dx * dx + dy * dy;
        const weight = 1 / dist2;
        if (law === toLaw) {
          nx += dx * weight;
          ny += dy * weight;
        } else if (law === fromLaw) {
          nx -= dx * weight;
          ny -= dy * weight;
        }
      }
    }

    const mag = Math.hypot(nx, ny);
    if (mag > 1e-5) {
      return [nx / mag, ny / mag];
    }

    const vmag = Math.hypot(fallbackVx, fallbackVy) || 1;
    return [fallbackVx / vmag, fallbackVy / vmag];
  }

  hyperbolicAcceleration(wx, wy, vx, vy) {
    const [cx, cy] = this.worldToCell(wx, wy);
    const { cols, rows, hyperbolicDepth } = this;
    const xL = Math.max(0, cx - 1);
    const xR = Math.min(cols - 1, cx + 1);
    const yU = Math.max(0, cy - 1);
    const yD = Math.min(rows - 1, cy + 1);

    const dL = hyperbolicDepth[cy * cols + xL];
    const dR = hyperbolicDepth[cy * cols + xR];
    const dU = hyperbolicDepth[yU * cols + cx];
    const dD = hyperbolicDepth[yD * cols + cx];

    const gradX = (dR - dL) * 0.015;
    const gradY = (dD - dU) * 0.015;
    const speed2 = vx * vx + vy * vy;
    const vDotG = vx * gradX + vy * gradY;

    // Geodesic equation for conformal metric ds^2 = e^{2φ}(dx^2+dy^2): a = |v|^2 ∇φ - 2(v·∇φ)v
    const ax = (speed2 * gradX - 2 * vDotG * vx) * 0.04;
    const ay = (speed2 * gradY - 2 * vDotG * vy) * 0.04;
    return [ax, ay];
  }

  exportGrid() {
    return Array.from(this.grid);
  }

  importGrid(arr) {
    if (!arr || arr.length !== this.grid.length) return false;
    for (let i = 0; i < arr.length; i++) {
      const val = arr[i];
      if (!Number.isInteger(val) || val < 0 || val >= LAW_COUNT) {
        return false;
      }
    }
    this.grid.set(arr);
    this.rebuildFaultMask();
    return true;
  }
}

function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const LAW_INDEX = Object.freeze({
  EUCLIDEAN: 0,
  TAXICAB: 1,
  CHEBYSHEV: 2,
  CHRONO: 3,
  ARISTOTELIAN: 4,
  HYPERBOLIC: 5,
  QUANTIZED: 6,
});

export const QUANTIZED_SHELLS = Object.freeze([55, 100, 145, 190]);

export const LAWS = Object.freeze([
  {
    index: LAW_INDEX.EUCLIDEAN,
    id: 'euclidean',
    symbol: 'E',
    code: 'L2',
    name: 'Euclidean',
    shortName: 'Euclidean',
    equation: 'ds² = dx² + dy² | τ = +1',
    hint: 'Round circles and normal straight-line momentum.',
    baseSpeed: 1.0,
    tau: 1,
    inertia: 1.0,
    colorHex: '#4ea1ff',
    rgb: [78, 161, 255],
    bgRgba: 'rgba(18, 38, 66, 0.25)',
    waveRgb: [78, 161, 255],
  },
  {
    index: LAW_INDEX.TAXICAB,
    id: 'taxicab',
    symbol: 'T',
    code: 'L1',
    name: 'Taxicab (L1)',
    shortName: 'Taxicab L1',
    equation: 'ds = |dx| + |dy| | τ = +1',
    hint: 'Waves form 45 deg diamonds; rays align N/S/E/W.',
    baseSpeed: 1.15,
    tau: 1,
    inertia: 1.0,
    colorHex: '#f59e0b',
    rgb: [245, 158, 11],
    bgRgba: 'rgba(72, 42, 8, 0.34)',
    waveRgb: [251, 191, 36],
  },
  {
    index: LAW_INDEX.CHEBYSHEV,
    id: 'chebyshev',
    symbol: 'C',
    code: 'L∞',
    name: 'Chebyshev (L∞)',
    shortName: 'Chebyshev L∞',
    equation: 'ds = max(|dx|, |dy|) | τ = +1',
    hint: 'Waves flatten into squares; diagonals run faster.',
    baseSpeed: 0.82,
    tau: 1,
    inertia: 1.0,
    colorHex: '#10b981',
    rgb: [16, 185, 129],
    bgRgba: 'rgba(8, 56, 40, 0.34)',
    waveRgb: [52, 211, 153],
  },
  {
    index: LAW_INDEX.CHRONO,
    id: 'chrono',
    symbol: 'R',
    code: 'τ⁻¹',
    name: 'Time-Reversed',
    shortName: 'Time-Reversed',
    equation: 'τ → −1 | Phase-Conjugate',
    hint: 'Time reverses locally; wave echoes replay backward.',
    baseSpeed: 1.0,
    tau: -1,
    inertia: 1.0,
    colorHex: '#e879f9',
    rgb: [232, 121, 249],
    bgRgba: 'rgba(68, 16, 78, 0.36)',
    waveRgb: [232, 121, 249],
  },
  {
    index: LAW_INDEX.ARISTOTELIAN,
    id: 'aristotelian',
    symbol: 'A',
    code: 'v∝F',
    name: 'Aristotelian',
    shortName: 'Aristotelian',
    equation: 'v = F / γ | No Inertia',
    hint: 'Zero coasting; moving particles and waves damp fast.',
    baseSpeed: 0.45,
    tau: 1,
    inertia: 0.15,
    colorHex: '#fb7185',
    rgb: [251, 113, 133],
    bgRgba: 'rgba(74, 16, 28, 0.36)',
    waveRgb: [251, 113, 133],
  },
  {
    index: LAW_INDEX.HYPERBOLIC,
    id: 'hyperbolic',
    symbol: 'H',
    code: 'κ<0',
    name: 'Hyperbolic',
    shortName: 'Hyperbolic',
    equation: 'ds² = Ω²(dx²+dy²) | κ < 0',
    hint: 'Curved space bends rays and reflects steep angles.',
    baseSpeed: 1.44,
    tau: 1,
    inertia: 1.0,
    colorHex: '#818cf8',
    rgb: [129, 140, 248],
    bgRgba: 'rgba(28, 28, 82, 0.36)',
    waveRgb: [165, 180, 252],
  },
  {
    index: LAW_INDEX.QUANTIZED,
    id: 'quantized',
    symbol: 'Q',
    code: 'ℏn',
    name: 'Quantized',
    shortName: 'Quantized',
    equation: 'E = n²E₀ | θ ∈ k·60°',
    hint: 'Speed snaps to fixed shells and 60 deg hex rays.',
    baseSpeed: 0.96,
    tau: 1,
    inertia: 1.0,
    colorHex: '#2dd4bf',
    rgb: [45, 212, 191],
    bgRgba: 'rgba(10, 56, 54, 0.36)',
    waveRgb: [94, 234, 212],
  },
]);

export const LAW_COUNT = LAWS.length;

export function getLaw(index) {
  return LAWS[index] || LAWS[0];
}

export function metricNorm(lawIndex, vx, vy) {
  switch (lawIndex) {
    case LAW_INDEX.TAXICAB:
      return Math.abs(vx) + Math.abs(vy);
    case LAW_INDEX.CHEBYSHEV:
      return Math.max(Math.abs(vx), Math.abs(vy));
    default:
      return Math.hypot(vx, vy);
  }
}

export function unitBallRadius(lawIndex, theta) {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  switch (lawIndex) {
    case LAW_INDEX.TAXICAB:
      return 1 / Math.max(1e-6, c + s);
    case LAW_INDEX.CHEBYSHEV:
      return 1 / Math.max(1e-6, Math.max(c, s));
    case LAW_INDEX.QUANTIZED:
      return 0.88 + 0.14 * Math.cos(6 * theta);
    case LAW_INDEX.HYPERBOLIC:
      return 1.12 + 0.08 * Math.cos(4 * theta);
    default:
      return 1.0;
  }
}

export function directionalPhaseSpeed(lawIndex, theta) {
  return getLaw(lawIndex).baseSpeed * unitBallRadius(lawIndex, theta);
}

export function metricEnergy(lawIndex, vx, vy) {
  const n = metricNorm(lawIndex, vx, vy);
  return 0.5 * getLaw(lawIndex).inertia * n * n;
}

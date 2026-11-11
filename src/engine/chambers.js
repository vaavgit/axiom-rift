import { LAW_INDEX } from './laws.js';

export const CHAMBERS = [
  {
    id: 'fourfold-prism',
    name: 'Fourfold Metric Prism',
    subtitle: 'L2 Circle | L1 Diamond | L∞ Square | Quantized Hex',
    description:
      'One wave and particle fan splits across circular L2, diamond L1 Taxicab, square L∞ Chebyshev, a Hyperbolic lens, and a Quantized hex prism at the same time.',
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;

      // Taxicab L1 upper crystal prism
      m.paintPolygon(
        [
          [340, 50],
          [620, 50],
          [560, 235],
          [380, 235],
        ],
        LAW_INDEX.TAXICAB
      );

      // Chebyshev L∞ lower lattice slab
      m.paintPolygon(
        [
          [340, 325],
          [620, 325],
          [620, 510],
          [340, 510],
        ],
        LAW_INDEX.CHEBYSHEV
      );

      // Quantized far-right eigen-chamber
      m.paintPolygon(
        [
          [685, 70],
          [905, 110],
          [905, 450],
          [685, 490],
          [645, 280],
        ],
        LAW_INDEX.QUANTIZED
      );

      // Central Hyperbolic conformal lens
      m.paintCircle(480, 280, 56, LAW_INDEX.HYPERBOLIC);

      sim.addEmitter({
        id: 'prism-beam',
        label: 'SOURCE',
        x: 135,
        y: 280,
        angle: 0,
        speed: 135,
        spread: 0.95,
        interval: 0.42,
        mode: 'hybrid',
        waveAmp: 1.15,
        particleLife: 11.0,
      });

      sim.addEmitter({
        id: 'l1-pulser',
        label: 'L1',
        x: 470,
        y: 135,
        angle: 0,
        speed: 80,
        interval: 1.45,
        phaseOffset: 0.4,
        mode: 'wave',
        waveAmp: 1.1,
      });

      sim.addEmitter({
        id: 'l8-pulser',
        label: 'L∞',
        x: 470,
        y: 420,
        angle: 0,
        speed: 80,
        interval: 1.45,
        phaseOffset: 0.9,
        mode: 'wave',
        waveAmp: 1.1,
      });
    },
  },
  {
    id: 'metric-diode',
    name: 'L1 / L2 Angle Diode',
    subtitle: 'One-Way Reflection Without Walls',
    description:
      'No solid walls here. The upper beam passes through a Taxicab wedge into TRANSMIT, while the lower beam hits a 45 deg Hyperbolic border past its critical angle and bounces upward into TIR ECHO.',
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;

      // Upper Taxicab wedge tilted gently -> transmits into PASS
      m.paintPolygon(
        [
          [420, 75],
          [650, 75],
          [650, 225],
          [380, 225],
        ],
        LAW_INDEX.TAXICAB
      );

      // Lower Hyperbolic prism facing beam at 45° -> triggers Metric TIR straight upward
      m.paintPolygon(
        [
          [410, 515],
          [610, 320],
          [610, 515],
        ],
        LAW_INDEX.HYPERBOLIC
      );

      // Subtle Taxicab wave converter on far right of upper lane
      m.paintCircle(780, 150, 48, LAW_INDEX.EUCLIDEAN);

      sim.addEmitter({
        id: 'upper-beam',
        label: 'BEAM 1 (PASS)',
        x: 130,
        y: 150,
        angle: 0,
        speed: 140,
        interval: 0.55,
        mode: 'hybrid',
        waveAmp: 1.0,
      });

      sim.addEmitter({
        id: 'lower-beam',
        label: 'BEAM 2 (TIR)',
        x: 130,
        y: 410,
        angle: 0,
        speed: 140,
        interval: 0.55,
        phaseOffset: 0.25,
        mode: 'hybrid',
        waveAmp: 1.0,
      });

      sim.addDetector({ id: 'det-pass', label: 'TRANSMIT', x: 760, y: 150, radius: 26 });
      sim.addDetector({ id: 'det-block', label: 'BLOCKED', x: 760, y: 410, radius: 26 });
      sim.addDetector({ id: 'det-tir', label: 'TIR ECHO', x: 518, y: 270, radius: 26 });
    },
  },
  {
    id: 'paradox-pendulum',
    name: 'Border Oscillator',
    subtitle: 'Damping vs Anti-Damping Equilibrium',
    description:
      'Particles lose speed crossing the Aristotelian drag strip and recover that energy inside the Time-Reversed right wing, staying trapped inside a Hyperbolic boundary.',
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;

      // Outer Hyperbolic TIR containment arena
      m.fill(LAW_INDEX.HYPERBOLIC);

      // Inner diamond resonator: Euclidean left wing, Chrono-Inverted right wing, Aristotelian friction seam
      m.paintPolygon(
        [
          [480, 130],
          [300, 280],
          [480, 430],
        ],
        LAW_INDEX.EUCLIDEAN
      );

      m.paintPolygon(
        [
          [480, 130],
          [660, 280],
          [480, 430],
        ],
        LAW_INDEX.CHRONO
      );

      // Central Aristotelian energy-shedding seam along x = 455..485
      m.paintRect(455, 165, 30, 230, LAW_INDEX.ARISTOTELIAN);

      // Seed sustained border-straddling oscillators
      const seeds = [
        { x: 425, y: 220, vx: 135, vy: 22 },
        { x: 525, y: 280, vx: -135, vy: 30 },
        { x: 430, y: 340, vx: 130, vy: -24 },
      ];
      for (const s of seeds) {
        sim.spawnParticle({
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          life: 9999,
          radius: 5.0,
        });
      }

      sim.addEmitter({
        id: 'chimera-pulse',
        label: 'RESONATOR',
        x: 480,
        y: 280,
        angle: 0,
        speed: 120,
        interval: 2.2,
        mode: 'wave',
        waveAmp: 1.0,
      });
    },
  },
  {
    id: 'half-adder',
    name: 'Particle Half-Adder (Logic Gate)',
    subtitle: 'SUM = A XOR B | CARRY = A AND B',
    description:
      '1-bit binary addition built from colliding particles and 45 deg Hyperbolic bounce borders. Either single pulse bounces into SUM; firing A and B together collides mid-air so one lands in CARRY.',
    isLogicChamber: true,
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;

      // Upper 45° Hyperbolic TIR mirror: reflects horizontal A=(+1,0) straight down at (590, 250)
      // Hypotenuse passes through (590, 250) from (568, 228) to (614, 274)
      m.paintPolygon(
        [
          [568, 228],
          [622, 228],
          [622, 282],
        ],
        LAW_INDEX.HYPERBOLIC
      );

      // Lower 45° Hyperbolic TIR mirror: reflects downward B=(0,+1) straight right at (402.5, 390)
      // Hypotenuse passes through (402.5, 390) from (375, 362.5) to (437.5, 425)
      m.paintPolygon(
        [
          [375, 362.5],
          [375, 430],
          [442.5, 430],
        ],
        LAW_INDEX.HYPERBOLIC
      );

      // Aristotelian damping sink on bottom-left catches post-collision deflected particle A
      m.paintRect(300, 305, 86, 130, LAW_INDEX.ARISTOTELIAN);

      // Quantized resonator pad around CARRY output for crisp visual signature
      m.paintCircle(740, 317, 58, LAW_INDEX.QUANTIZED);

      sim.addEmitter({
        id: 'input-a',
        label: 'INPUT A',
        x: 220,
        y: 250,
        angle: 0,
        speed: 140,
        interval: 0, // Triggered synchronously via Logic Pulse or auto-cycle
        mode: 'hybrid',
        waveAmp: 0.9,
        particleLife: 6.5,
        particleRadius: 5.0,
        enabled: true,
        tag: 'A',
      });

      sim.addEmitter({
        id: 'input-b',
        label: 'INPUT B',
        x: 402.5,
        y: 70,
        angle: Math.PI / 2,
        speed: 140,
        interval: 0,
        mode: 'hybrid',
        waveAmp: 0.9,
        particleLife: 6.5,
        particleRadius: 5.0,
        enabled: true,
        tag: 'B',
      });

      sim.addDetector({
        id: 'det-sum',
        label: 'SUM (A ⊕ B)',
        x: 590,
        y: 390,
        radius: 26,
        consumeOnHit: true,
      });

      sim.addDetector({
        id: 'det-carry',
        label: 'CARRY (A ∧ B)',
        x: 740,
        y: 317,
        radius: 28,
        consumeOnHit: true,
      });
    },
  },
  {
    id: 'chrono-mirror',
    name: 'Time-Reversal Echo Cavern',
    subtitle: 'Phase-Conjugate Wave Playback',
    description:
      'Waves scatter around Taxicab and Aristotelian blocks into the Time-Reversed wall on the right, which records and replays incoming wave frames in reverse.',
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;

      // Scattering Taxicab & Aristotelian obstacles in middle
      m.paintPolygon(
        [
          [420, 120],
          [475, 195],
          [420, 265],
          [385, 195],
        ],
        LAW_INDEX.TAXICAB
      );
      m.paintPolygon(
        [
          [420, 295],
          [475, 365],
          [420, 440],
          [385, 365],
        ],
        LAW_INDEX.ARISTOTELIAN
      );

      // Right-hand concave Chrono-Inverted Phase-Conjugate Mirror
      m.paintPolygon(
        [
          [660, 45],
          [890, 45],
          [890, 515],
          [660, 515],
          [615, 280],
        ],
        LAW_INDEX.CHRONO
      );

      sim.addEmitter({
        id: 'echo-source',
        label: 'PING',
        x: 205,
        y: 280,
        angle: 0,
        speed: 135,
        spread: 0.7,
        interval: 1.15,
        mode: 'hybrid',
        waveAmp: 1.2,
      });
    },
  },
  {
    id: 'echo-loom',
    name: 'Echo Mandala',
    subtitle: 'Nested Geometry Sequencer',
    description:
      'Concentric layers of Euclidean, Taxicab, Chebyshev, Time-Reversed, and Quantized zones split a central particle stream into repeating interference patterns and chimes.',
    setup(sim) {
      sim.clearAll();
      const m = sim.manifold;
      const cx = 480;
      const cy = 280;

      // Outer Quantized ring
      m.paintCircle(cx, cy, 235, LAW_INDEX.QUANTIZED);
      // Chebyshev square-like mid ring
      m.paintRect(cx - 170, cy - 170, 340, 340, LAW_INDEX.CHEBYSHEV);
      // Taxicab diamond inner layer
      m.paintPolygon(
        [
          [cx, cy - 155],
          [cx + 155, cy],
          [cx, cy + 155],
          [cx - 155, cy],
        ],
        LAW_INDEX.TAXICAB
      );
      // Four Chrono-Inverted corner petals
      const offsets = [
        [-145, -110],
        [145, -110],
        [145, 110],
        [-145, 110],
      ];
      for (const [ox, oy] of offsets) {
        m.paintCircle(cx + ox, cy + oy, 54, LAW_INDEX.CHRONO);
      }
      // Euclidean center core
      m.paintCircle(cx, cy, 62, LAW_INDEX.EUCLIDEAN);

      sim.addEmitter({
        id: 'loom-1',
        label: 'CORE α',
        x: cx,
        y: cy,
        angle: 0.42,
        speed: 125,
        spread: Math.PI * 2,
        interval: 0.45,
        mode: 'hybrid',
        waveAmp: 1.0,
        particleLife: 13.0,
      });

      sim.addEmitter({
        id: 'loom-2',
        label: 'CORE β',
        x: cx,
        y: cy,
        angle: -1.1,
        speed: 95,
        spread: 0.4,
        interval: 0.72,
        phaseOffset: 0.3,
        mode: 'particle',
        particleLife: 14.0,
      });
    },
  },
];

export function loadChamber(sim, chamberId) {
  const chamber = CHAMBERS.find((c) => c.id === chamberId) || CHAMBERS[0];
  sim.currentChamberId = chamber.id;
  chamber.setup(sim);
  return chamber;
}

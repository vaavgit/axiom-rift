# AXIOM RIFT

A 2D wave and particle sandbox where different painted areas follow incompatible rules for distance, inertia, and time direction.

Live demo: https://vaavgit.github.io/axiom-rift/

![AXIOM RIFT running the Fourfold Metric Prism preset](./assets/screenshot.png)

Instead of painting physical materials like glass or water, you paint different spatial rules onto a `192 x 112` grid. A single wave ripple starts round in Euclidean space, bends into a 45 degree diamond inside a Taxicab ($L_1$) zone, flattens into a square inside a Chebyshev ($L_\infty$) zone, and plays backward out of a Time-Reversed pocket. Crossing borders between rules calculates generalized Snell refraction, flags total internal reflection without walls, and triggers optional WebAudio chimes.

## Running locally

Requires Node.js 20 or newer, with no external npm packages to install.

```bash
npm start
```

Open `http://127.0.0.1:4173`. To run the engine and server tests:

```bash
npm test
```

Because `index.html`, `styles.css`, and `src/` use relative module paths, the app also runs directly as a static site on GitHub Pages without Node in production.

## Space rules

| Rule | Metric / behavior | Effect on waves and particles |
| :--- | :--- | :--- |
| Euclidean (`E`) | $ds^2 = dx^2 + dy^2$ | Round circular waves and standard inertial coasting. |
| Taxicab (`T`) | $ds = |dx| + |dy|$ | Waves spread as 45 deg diamonds; trajectories bend toward cardinal axes. |
| Chebyshev (`C`) | $ds = \max(|dx|, |dy|)$ | Waves square off; diagonals run faster than orthogonal lines. |
| Time-Reversed (`R`) | Local $\tau = -1$ | Particles accelerate up to a cap; boundary buffers replay wave frames in reverse. |
| Aristotelian (`A`) | Overdamped ($v \propto F$) | Motion damps quickly unless pushed, dumping energy mismatch at entry. |
| Hyperbolic (`H`) | Curved conformal metric | Paths bend along curvature gradients; 45 deg seams cause total internal reflection. |
| Quantized (`Q`) | Discrete shells (`55, 100, 145, 190`) | Speed snaps to discrete shells and 60 deg hex rays. |

## Built-in presets

- **Fourfold Metric Prism**: splits one emitter fan across Euclidean, Taxicab, Chebyshev, Hyperbolic, and Quantized zones.
- **L1 / L2 Angle Diode**: demonstrates transmission vs 45 deg bounce reflection with zero solid walls.
- **Border Oscillator**: particles lose energy in an Aristotelian strip and regain it in a Time-Reversed wing inside a Hyperbolic cavity.
- **Particle Half-Adder**: 1-bit binary addition (`SUM = A XOR B`, `CARRY = A AND B`) using colliding beams and 45 deg Hyperbolic mirrors.
- **Time-Reversal Echo Cavern**: waves scatter around obstacles and replay back from a Time-Reversed boundary.
- **Echo Mandala**: nested concentric rings wired as a generative WebAudio chime loop.

## Controls

- Hover anywhere on the canvas to see the local unit ball shape around the cursor.
- Left-click or drag uses the selected tool (`Pulse / Fire`, `Brush`, `Slab`, `Emitter`, `Detector`, `Remove`).
- Right-click anywhere drops an immediate wave ripple.
- Shortcuts: `Space` (play/pause), `1-7` (pick rule and switch to Brush), `Ctrl+Z` / `Ctrl+Y` (undo/redo paint).

## Known quirks

- The 5-pixel grid discretizes angled boundaries into tiny staircase steps, so small 1-cell islands scatter waves noisily rather than refracting cleanly.
- The Particle Half-Adder relies on synchronized emitter timing (`140 px/s`) so simultaneous `A` and `B` pulses collide at the exact crossing point.
- Wave Audio starts muted by default because browsers block audio playback until a user click (`Audio: Off`).

## Project layout

- `index.html`, `styles.css`: static frontend root for GitHub Pages and local serving
- `server.mjs`: local Node static server with path containment and CSP headers
- `src/engine/`: shared simulation modules (`laws.js`, `manifold.js`, `wavefield.js`, `particles.js`, `simulation.js`, `chambers.js`) running identically in Node tests and the browser
- `src/audio/synth.js`: procedural WebAudio voice synthesis per destination rule
- `src/ui/`: canvas renderer, oscilloscope/crossing feed, and UI controller
- `tests/engine.test.mjs`: tests covering norms, wave geometry, Half-Adder truth table, JSON validation, and HTTP security headers

## License

MIT. See [LICENSE](LICENSE).

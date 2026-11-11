import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  LAW_INDEX,
  directionalPhaseSpeed,
  metricNorm,
  unitBallRadius,
} from '../src/engine/laws.js';
import { resolveFaultTransition } from '../src/engine/particles.js';
import { Simulation } from '../src/engine/simulation.js';
import { CHAMBERS, loadChamber } from '../src/engine/chambers.js';
import { createAppServer } from '../server.mjs';

test('Metric norms and Finsler unit-ball geometry', () => {
  // Euclidean circle: r(0) == r(pi/4) == 1
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.EUCLIDEAN, 0) - 1) < 1e-6);
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.EUCLIDEAN, Math.PI / 4) - 1) < 1e-6);

  // Taxicab diamond: r(0) = 1, r(pi/4) = 1/sqrt(2)
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.TAXICAB, 0) - 1) < 1e-6);
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.TAXICAB, Math.PI / 4) - Math.SQRT1_2) < 1e-6);
  assert.equal(metricNorm(LAW_INDEX.TAXICAB, 3, -4), 7);

  // Chebyshev square: r(0) = 1, r(pi/4) = sqrt(2)
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.CHEBYSHEV, 0) - 1) < 1e-6);
  assert.ok(Math.abs(unitBallRadius(LAW_INDEX.CHEBYSHEV, Math.PI / 4) - Math.SQRT2) < 1e-6);
  assert.equal(metricNorm(LAW_INDEX.CHEBYSHEV, -3, 7), 7);
});

test('Generalized Snell Law obeys refraction invariant, energy-conserving TIR, and shell snap', () => {
  // Elastic TIR must report zero energy defect and true momentum recoil impulse
  const tir = resolveFaultTransition(
    140,
    0,
    LAW_INDEX.EUCLIDEAN,
    LAW_INDEX.HYPERBOLIC,
    Math.SQRT1_2,
    -Math.SQRT1_2
  );
  assert.equal(tir.outcome, 'METRIC_TIR');
  assert.equal(tir.reflected, true);
  assert.ok(tir.defect < 1e-6, `Elastic TIR should have ~0 energy defect, got ${tir.defect}`);
  assert.ok(tir.impulse > 190, `Elastic TIR should report real momentum impulse, got ${tir.impulse}`);
  assert.ok(Math.abs(tir.vx) < 1e-3 && tir.vy > 130);

  // Quantitative Snell invariant check: sin(thetaR) / sin(thetaI) == cB / cA
  const angleIn = Math.PI / 6; // 30 deg
  const refr = resolveFaultTransition(
    100 * Math.cos(angleIn),
    100 * Math.sin(angleIn),
    LAW_INDEX.EUCLIDEAN,
    LAW_INDEX.CHEBYSHEV,
    1,
    0
  );
  assert.equal(refr.outcome, 'REFRACT');
  assert.equal(refr.reflected, false);
  const outAngle = Math.atan2(refr.vy, refr.vx);
  const cA = directionalPhaseSpeed(LAW_INDEX.EUCLIDEAN, angleIn);
  const cB = directionalPhaseSpeed(LAW_INDEX.CHEBYSHEV, outAngle);
  const lhs = Math.sin(refr.thetaR) / cB;
  const rhs = Math.sin(refr.thetaI) / cA;
  assert.ok(Math.abs(lhs - rhs) < 1e-3, `Snell invariant mismatch: ${lhs} vs ${rhs}`);

  const quant = resolveFaultTransition(118, 0, LAW_INDEX.EUCLIDEAN, LAW_INDEX.QUANTIZED, 1, 0);
  assert.equal(quant.outcome, 'QUANTUM_SNAP');
  const outSpeed = Math.hypot(quant.vx, quant.vy);
  assert.ok([55, 100, 145, 190].some((s) => Math.abs(outSpeed - s) < 1e-3));
});

test('Multi-metric WaveField produces quantitative L2 circle, L1 diamond (~0.71), and L∞ square (~1.41)', () => {
  function measureAspectRatio(lawIndex) {
    const sim = new Simulation(120, 120, 5);
    sim.manifold.fill(lawIndex);
    const cx = 60;
    const cy = 60;
    sim.waveField.injectWorld(cx * 5 + 2.5, cy * 5 + 2.5, 1.4, 2.2);
    for (let i = 0; i < 42; i++) {
      sim.waveField.step();
    }

    const u = sim.waveField.u;
    const threshold = 0.008;
    let maxAxis = 0;
    let maxDiag = 0;

    for (let d = 1; d < 50; d++) {
      if (Math.abs(u[cy * 120 + (cx + d)]) > threshold) maxAxis = d;
      const diagCell = Math.round(d * Math.SQRT1_2);
      if (Math.abs(u[(cy + diagCell) * 120 + (cx + diagCell)]) > threshold) {
        maxDiag = Math.hypot(diagCell, diagCell);
      }
    }
    assert.equal(sim.waveField.clampedCount, 0);
    assert.ok(maxAxis > 12, `Wave did not propagate in law ${lawIndex}`);
    return maxDiag / maxAxis;
  }

  const ratioL2 = measureAspectRatio(LAW_INDEX.EUCLIDEAN);
  const ratioL1 = measureAspectRatio(LAW_INDEX.TAXICAB);
  const ratioLInf = measureAspectRatio(LAW_INDEX.CHEBYSHEV);

  assert.ok(ratioL2 >= 0.94 && ratioL2 <= 1.06, `Euclidean ratio should be ~1.00, got ${ratioL2}`);
  assert.ok(ratioL1 >= 0.65 && ratioL1 <= 0.80, `Taxicab ratio should be ~0.71, got ${ratioL1}`);
  assert.ok(ratioLInf >= 1.28 && ratioLInf <= 1.50, `Chebyshev ratio should be ~1.41, got ${ratioLInf}`);
});

test('Homogeneous wave fields including Time-Reversed decay passively without clamping', () => {
  for (const law of [
    LAW_INDEX.EUCLIDEAN,
    LAW_INDEX.TAXICAB,
    LAW_INDEX.CHEBYSHEV,
    LAW_INDEX.CHRONO,
    LAW_INDEX.ARISTOTELIAN,
    LAW_INDEX.QUANTIZED,
  ]) {
    const sim = new Simulation(100, 100, 5);
    sim.manifold.fill(law);
    sim.waveField.injectWorld(250, 250, 1.2, 2.2);

    for (let i = 0; i < 30; i++) sim.waveField.step();
    const eEarly = sim.waveField.totalEnergy;

    for (let i = 0; i < 570; i++) sim.waveField.step();
    const eLate = sim.waveField.totalEnergy;

    assert.equal(sim.waveField.clampedCount, 0, `Law ${law} hit emergency clamp`);
    assert.ok(eLate < eEarly, `Law ${law} should decay passively: e30=${eEarly}, e600=${eLate}`);
  }
});

test('Hyperbolic acceleration and wave speed depend strictly on local painted region', () => {
  const sim = new Simulation(192, 112, 5);
  sim.manifold.paintCircle(220, 220, 60, LAW_INDEX.HYPERBOLIC);
  sim.manifold.paintCircle(740, 340, 60, LAW_INDEX.HYPERBOLIC);

  const [ax1, ay1] = sim.manifold.hyperbolicAcceleration(205, 220, 100, 0);
  const [ax2, ay2] = sim.manifold.hyperbolicAcceleration(725, 340, 100, 0);

  assert.ok(Math.hypot(ax1, ay1) > 0, 'Expected non-zero local hyperbolic geodesic acceleration');
  assert.ok(
    Math.abs(ax1 - ax2) < 1e-6 && Math.abs(ay1 - ay2) < 1e-6,
    `Hyperbolic acceleration must be translation-invariant: (${ax1},${ay1}) vs (${ax2},${ay2})`
  );
});

test('Half-Adder executes full binary truth table across -10% to +10% emitter speeds', () => {
  function runHalfAdder(enableA, enableB, speed = 140) {
    const sim = new Simulation(192, 112, 5);
    loadChamber(sim, 'half-adder');
    const emA = sim.emitters.find((e) => e.id === 'input-a');
    const emB = sim.emitters.find((e) => e.id === 'input-b');
    emA.enabled = enableA;
    emB.enabled = enableB;
    emA.speed = speed;
    emB.speed = speed;
    sim.resetDetectors();
    sim.pulseAllEnabledEmitters();

    for (let i = 0; i < 300; i++) {
      sim.step(1 / 60);
    }

    return {
      sum: sim.detectors.find((d) => d.id === 'det-sum').hitCount > 0 ? 1 : 0,
      carry: sim.detectors.find((d) => d.id === 'det-carry').hitCount > 0 ? 1 : 0,
    };
  }

  for (const speed of [126, 140, 154]) {
    assert.deepEqual(runHalfAdder(false, false, speed), { sum: 0, carry: 0 }, `00 at speed=${speed}`);
    assert.deepEqual(runHalfAdder(true, false, speed), { sum: 1, carry: 0 }, `10 at speed=${speed}`);
    assert.deepEqual(runHalfAdder(false, true, speed), { sum: 1, carry: 0 }, `01 at speed=${speed}`);
    assert.deepEqual(runHalfAdder(true, true, speed), { sum: 0, carry: 1 }, `11 at speed=${speed}`);
  }
});

test('Border Oscillator maintains sustained limit-cycle crossings', () => {
  const sim = new Simulation(192, 112, 5);
  loadChamber(sim, 'paradox-pendulum');
  for (let i = 0; i < 600; i++) {
    sim.step(1 / 60);
  }
  assert.equal(sim.particles.length, 3, 'All 3 oscillators should remain alive');
  const totalCrossings = sim.particles.reduce((acc, p) => acc + p.crossings, 0);
  assert.ok(totalCrossings >= 12, `Expected repeated border crossings, got ${totalCrossings}`);
});

test('L1 / L2 Angle Diode demonstrates asymmetric transmission vs TIR', () => {
  const sim = new Simulation(192, 112, 5);
  loadChamber(sim, 'metric-diode');
  for (let i = 0; i < 420; i++) {
    sim.step(1 / 60);
  }
  const passDet = sim.detectors.find((d) => d.id === 'det-pass');
  const blockDet = sim.detectors.find((d) => d.id === 'det-block');
  const tirDet = sim.detectors.find((d) => d.id === 'det-tir');

  assert.ok(passDet.hitCount > 0);
  assert.equal(blockDet.hitCount, 0);
  assert.ok(tirDet.hitCount > 0);
});

test('All 6 presets run 1,200 steps cleanly with zero wave clamping and valid JSON roundtrip', () => {
  for (const ch of CHAMBERS) {
    const sim = new Simulation(192, 112, 5);
    loadChamber(sim, ch.id);
    for (let i = 0; i < 1200; i++) {
      sim.step(1 / 60);
    }
    assert.equal(sim.waveField.clampedCount, 0, `Preset ${ch.id} hit emergency wave clamp`);
    assert.ok(sim.waveField.maxAbsU < 4.5, `Preset ${ch.id} wave amplitude too high: ${sim.waveField.maxAbsU}`);
    for (const p of sim.particles) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  }

  const simA = new Simulation(192, 112, 5);
  loadChamber(simA, 'echo-loom');
  const json = simA.exportJSON();

  const simB = new Simulation(192, 112, 5);
  simB.importJSON(json);
  assert.deepEqual(simB.manifold.exportGrid(), simA.manifold.exportGrid());
  assert.equal(simB.emitters.length, simA.emitters.length);
});

test('Manifold undo/redo and Simulation JSON security validation', () => {
  const sim = new Simulation(192, 112, 5);
  assert.equal(sim.manifold.canUndo(), false);
  sim.manifold.pushHistory();
  sim.manifold.paintCircle(200, 200, 30, LAW_INDEX.TAXICAB);
  assert.equal(sim.manifold.lawAtWorld(200, 200), LAW_INDEX.TAXICAB);
  assert.equal(sim.manifold.canUndo(), true);

  assert.equal(sim.manifold.undo(), true);
  assert.equal(sim.manifold.lawAtWorld(200, 200), LAW_INDEX.EUCLIDEAN);
  assert.equal(sim.manifold.canRedo(), true);

  assert.equal(sim.manifold.redo(), true);
  assert.equal(sim.manifold.lawAtWorld(200, 200), LAW_INDEX.TAXICAB);

  // Reject out-of-range law index in grid
  const badGrid = new Array(192 * 112).fill(0);
  badGrid[10] = 99;
  assert.throws(() => sim.importJSON({ grid: badGrid }), /invalid/i);

  // Reject wrong grid length
  assert.throws(() => sim.importJSON({ grid: [0, 1, 2] }), /invalid/i);

  // Reject non-finite emitter coords
  assert.throws(
    () =>
      sim.importJSON({
        grid: new Array(192 * 112).fill(0),
        emitters: [{ x: Number.NaN, y: 100 }],
      }),
    /invalid/i
  );

  // Reject oversized emitter arrays
  const tooMany = Array.from({ length: 50 }, () => ({ x: 100, y: 100 }));
  assert.throws(
    () => sim.importJSON({ grid: new Array(192 * 112).fill(0), emitters: tooMany }),
    /too many/i
  );

  // Reject oversized raw strings (>2MB)
  assert.throws(() => sim.importJSON('x'.repeat(2 * 1024 * 1024 + 10)), /2 MB/i);
});

test('Detector consumedIds prunes stale IDs without unbounded memory growth', () => {
  const sim = new Simulation(192, 112, 5);
  const det = sim.addDetector({ x: 100, y: 100, radius: 20, consumeOnHit: false });
  for (let i = 1; i <= 310; i++) {
    det.consumedIds.add(i);
  }
  sim.step(1 / 60);
  assert.equal(det.consumedIds.size, 0);
});

test('HTTP server enforces path containment, methods, malformed URI rejection, and security headers', async () => {
  const server = createAppServer(0);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  function request(method, reqPath) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: reqPath, method }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    const home = await request('GET', '/');
    assert.equal(home.status, 200);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    assert.equal(home.headers['x-frame-options'], 'DENY');
    assert.ok(home.headers['content-security-policy'].includes("default-src 'self'"));
    assert.ok(home.body.includes('AXIOM RIFT'));

    const styles = await request('GET', '/styles.css');
    assert.equal(styles.status, 200);
    assert.ok(styles.headers['content-type'].includes('text/css'));

    const engineModule = await request('GET', '/src/engine/laws.js');
    assert.equal(engineModule.status, 200);
    assert.ok(engineModule.headers['content-type'].includes('application/javascript'));

    const forbiddenServer = await request('GET', '/server.mjs');
    assert.equal(forbiddenServer.status, 403);

    const forbiddenReadme = await request('GET', '/README.md');
    assert.equal(forbiddenReadme.status, 403);

    const traversal = await request('GET', '/src/../package.json');
    assert.equal(traversal.status, 403);

    const malformed = await request('GET', '/%E0%A4%A');
    assert.equal(malformed.status, 400);

    const postResp = await request('POST', '/');
    assert.equal(postResp.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});



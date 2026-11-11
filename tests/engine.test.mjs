import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  LAW_INDEX,
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

test('Generalized Metric Snell Law exhibits asymmetric TIR and Bohr shell quantization', () => {
  // 45° incidence into Hyperbolic (c ~ 1.50 > 1.0) triggers Metric Total Internal Reflection
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
  assert.ok(Math.abs(tir.vx) < 1e-3 && tir.vy > 130, `Expected downward reflection, got (${tir.vx}, ${tir.vy})`);

  // Normal incidence (0°) into Hyperbolic refracts cleanly without TIR
  const refr = resolveFaultTransition(
    140,
    0,
    LAW_INDEX.EUCLIDEAN,
    LAW_INDEX.HYPERBOLIC,
    1,
    0
  );
  assert.equal(refr.outcome, 'REFRACT');
  assert.equal(refr.reflected, false);
  assert.ok(refr.defect > 0);

  // Crossing into Quantized snaps speed to a discrete Bohr shell (55, 100, 145, 190)
  const quant = resolveFaultTransition(
    118,
    0,
    LAW_INDEX.EUCLIDEAN,
    LAW_INDEX.QUANTIZED,
    1,
    0
  );
  assert.equal(quant.outcome, 'QUANTUM_SNAP');
  const outSpeed = Math.hypot(quant.vx, quant.vy);
  assert.ok([55, 100, 145, 190].some((s) => Math.abs(outSpeed - s) < 1e-3), `Speed ${outSpeed} not quantized`);
});

test('Multi-metric WaveField generates circular (L2), diamond (L1), and square (L∞) wavefronts', () => {
  function measureAspectRatio(lawIndex) {
    const sim = new Simulation(100, 100, 5);
    sim.manifold.fill(lawIndex);
    const cx = 50;
    const cy = 50;
    sim.waveField.injectWorld(cx * 5 + 2.5, cy * 5 + 2.5, 3.0, 2.0);
    for (let i = 0; i < 36; i++) {
      sim.waveField.step();
    }

    const u = sim.waveField.u;
    const threshold = 0.015;
    let maxAxis = 0;
    let maxDiag = 0;

    for (let d = 1; d < 42; d++) {
      if (Math.abs(u[cy * 100 + (cx + d)]) > threshold) maxAxis = d;
      const diagCell = Math.round(d * Math.SQRT1_2);
      if (Math.abs(u[(cy + diagCell) * 100 + (cx + diagCell)]) > threshold) {
        maxDiag = Math.hypot(diagCell, diagCell);
      }
      assert.ok(Number.isFinite(u[cy * 100 + (cx + d)]), 'Wave value must stay finite');
    }
    assert.ok(maxAxis > 10, `Wave did not propagate in law ${lawIndex}`);
    return maxDiag / maxAxis;
  }

  const ratioL2 = measureAspectRatio(LAW_INDEX.EUCLIDEAN);
  const ratioL1 = measureAspectRatio(LAW_INDEX.TAXICAB);
  const ratioLInf = measureAspectRatio(LAW_INDEX.CHEBYSHEV);

  assert.ok(ratioL2 > 0.90 && ratioL2 < 1.10, `Euclidean ratio should be ~1.0 (circle), got ${ratioL2}`);
  assert.ok(ratioL1 < 0.85, `Taxicab ratio should be < 0.85 (diamond), got ${ratioL1}`);
  assert.ok(ratioLInf > 1.15, `Chebyshev ratio should be > 1.15 (square), got ${ratioLInf}`);
});

test('Chrono-Inverted Phase-Conjugate wave echo stays bounded over 300 steps', () => {
  const sim = new Simulation(192, 112, 5);
  loadChamber(sim, 'chrono-mirror');
  for (let i = 0; i < 300; i++) {
    sim.step(1 / 60);
  }
  assert.ok(Number.isFinite(sim.waveField.totalEnergy));
  assert.ok(sim.waveField.totalEnergy >= 0 && sim.waveField.totalEnergy < 50000);
});

test('Chamber 4: Fault-Line Half-Adder executes full binary truth table (00, 10, 01, 11) via physics', () => {
  function runHalfAdder(enableA, enableB) {
    const sim = new Simulation(192, 112, 5);
    loadChamber(sim, 'half-adder');
    const emA = sim.emitters.find((e) => e.id === 'input-a');
    const emB = sim.emitters.find((e) => e.id === 'input-b');
    emA.enabled = enableA;
    emB.enabled = enableB;
    sim.resetDetectors();
    sim.pulseAllEnabledEmitters();

    // Simulate 4.5 seconds (270 steps at 60Hz)
    for (let i = 0; i < 270; i++) {
      sim.step(1 / 60);
    }

    const sumDet = sim.detectors.find((d) => d.id === 'det-sum');
    const carryDet = sim.detectors.find((d) => d.id === 'det-carry');
    return {
      sum: sumDet.hitCount > 0 ? 1 : 0,
      carry: carryDet.hitCount > 0 ? 1 : 0,
      sumHits: sumDet.hitCount,
      carryHits: carryDet.hitCount,
    };
  }

  const r00 = runHalfAdder(false, false);
  const r10 = runHalfAdder(true, false);
  const r01 = runHalfAdder(false, true);
  const r11 = runHalfAdder(true, true);

  assert.deepEqual({ sum: r00.sum, carry: r00.carry }, { sum: 0, carry: 0 }, `00 failed: ${JSON.stringify(r00)}`);
  assert.deepEqual({ sum: r10.sum, carry: r10.carry }, { sum: 1, carry: 0 }, `10 failed: ${JSON.stringify(r10)}`);
  assert.deepEqual({ sum: r01.sum, carry: r01.carry }, { sum: 1, carry: 0 }, `01 failed: ${JSON.stringify(r01)}`);
  assert.deepEqual({ sum: r11.sum, carry: r11.carry }, { sum: 0, carry: 1 }, `11 failed: ${JSON.stringify(r11)}`);
});

test('Chamber 3: Paradox Pendulum maintains sustained fault-line limit-cycle oscillations', () => {
  const sim = new Simulation(192, 112, 5);
  loadChamber(sim, 'paradox-pendulum');
  for (let i = 0; i < 600; i++) {
    sim.step(1 / 60);
  }
  assert.equal(sim.particles.length, 3, 'All 3 chimera oscillators should remain alive');
  const totalCrossings = sim.particles.reduce((acc, p) => acc + p.crossings, 0);
  assert.ok(totalCrossings >= 12, `Expected repeated fault-line crossings, got ${totalCrossings}`);
});

test('Chamber 2: Metric Diode demonstrates asymmetric transmission vs TIR', () => {
  const sim = new Simulation(192, 112, 5);
  loadChamber(sim, 'metric-diode');
  for (let i = 0; i < 420; i++) {
    sim.step(1 / 60);
  }
  const passDet = sim.detectors.find((d) => d.id === 'det-pass');
  const blockDet = sim.detectors.find((d) => d.id === 'det-block');
  const tirDet = sim.detectors.find((d) => d.id === 'det-tir');

  assert.ok(passDet.hitCount > 0, `Expected upper beam to transmit into PASS, got ${passDet.hitCount}`);
  assert.equal(blockDet.hitCount, 0, `Expected lower beam to be blocked by TIR, got ${blockDet.hitCount}`);
  assert.ok(tirDet.hitCount > 0, `Expected lower beam to reflect into TIR ECHO, got ${tirDet.hitCount}`);
});

test('All 6 chambers run stably and export/import JSON cleanly', () => {
  for (const ch of CHAMBERS) {
    const sim = new Simulation(192, 112, 5);
    loadChamber(sim, ch.id);
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60);
    }
    assert.ok(Number.isFinite(sim.waveField.totalEnergy), `Chamber ${ch.id} wave energy non-finite`);
    for (const p of sim.particles) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `Chamber ${ch.id} particle NaN`);
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



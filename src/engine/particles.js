import {
  LAW_INDEX,
  QUANTIZED_SHELLS,
  getLaw,
  directionalPhaseSpeed,
  metricEnergy,
} from './laws.js';

let nextParticleId = 1;

export function createParticle({
  x,
  y,
  vx,
  vy,
  law = LAW_INDEX.EUCLIDEAN,
  radius = 4.2,
  mass = 1.0,
  life = 14.0,
  color = null,
  tag = null,
}) {
  return {
    id: nextParticleId++,
    x,
    y,
    vx,
    vy,
    law,
    radius,
    mass,
    life,
    maxLife: life,
    age: 0,
    tau: getLaw(law).tau,
    phase: 0,
    color,
    tag,
    trail: [],
    lastCrossingTime: -1,
    crossings: 0,
  };
}

/**
 * Computes Generalized Metric Snell Refraction / Total Internal Reflection
 * when a particle moves from `fromLaw` into `toLaw` across normal (nx, ny).
 */
export function resolveFaultTransition(vx, vy, fromLaw, toLaw, nx, ny) {
  const speedIn = Math.hypot(vx, vy);
  if (speedIn < 1e-6) {
    return {
      outcome: 'STALL',
      vx: 0,
      vy: 0,
      thetaI: 0,
      thetaR: 0,
      defect: 0,
    };
  }

  // Ensure normal points into destination medium along incoming velocity
  let nX = nx;
  let nY = ny;
  if (vx * nX + vy * nY < 0) {
    nX = -nX;
    nY = -nY;
  }

  // Orthonormal tangent vector along fault line
  const tX = -nY;
  const tY = nX;

  const vn = vx * nX + vy * nY;
  const vt = vx * tX + vy * tY;
  const sinThetaI = Math.max(-1, Math.min(1, vt / speedIn));
  const thetaI = Math.asin(Math.abs(sinThetaI));

  const phiIn = Math.atan2(vy, vx);
  const cA = directionalPhaseSpeed(fromLaw, phiIn);
  let cB = directionalPhaseSpeed(toLaw, phiIn);

  // Two-step fixed-point refinement for anisotropic L1/L∞ Finsler Snell refraction
  let sinThetaR = (cB / Math.max(1e-4, cA)) * sinThetaI;
  for (let iter = 0; iter < 2; iter++) {
    if (Math.abs(sinThetaR) >= 0.992) break;
    const cosR = Math.sqrt(1 - sinThetaR * sinThetaR);
    const ux = nX * cosR + tX * sinThetaR;
    const uy = nY * cosR + tY * sinThetaR;
    cB = directionalPhaseSpeed(toLaw, Math.atan2(uy, ux));
    sinThetaR = (cB / Math.max(1e-4, cA)) * sinThetaI;
  }

  const eBefore = metricEnergy(fromLaw, vx, vy);

  // Metric Total Internal Reflection when generalized Snell angle exceeds critical angle
  if (Math.abs(sinThetaR) >= 0.992) {
    const rvx = vx - 2 * vn * nX;
    const rvy = vy - 2 * vn * nY;
    const eAfter = metricEnergy(fromLaw, rvx, rvy);
    return {
      outcome: 'METRIC_TIR',
      vx: rvx,
      vy: rvy,
      thetaI,
      thetaR: thetaI,
      defect: Math.abs(eBefore - eAfter) + 0.35 * eBefore,
      reflected: true,
    };
  }

  const cosThetaR = Math.sqrt(1 - sinThetaR * sinThetaR);
  const thetaR = Math.asin(Math.abs(sinThetaR));

  let ux = nX * cosThetaR + tX * sinThetaR;
  let uy = nY * cosThetaR + tY * sinThetaR;

  let outSpeed = speedIn * Math.pow(cB / Math.max(1e-4, cA), 0.75);
  let outcome = 'REFRACT';

  if (toLaw === LAW_INDEX.ARISTOTELIAN) {
    // Crossing into zero-inertia sheds momentum abruptly
    outSpeed = speedIn * 0.48;
    outcome = 'VISCOUS_SHOCK';
  } else if (toLaw === LAW_INDEX.CHRONO) {
    // Phase-conjugate boundary boost
    outSpeed = Math.min(200, Math.max(45, speedIn * 1.06));
    outcome = 'CHRONO_INVERT';
  } else if (toLaw === LAW_INDEX.QUANTIZED) {
    outSpeed = nearestShellSpeed(outSpeed);
    const ang = Math.atan2(uy, ux);
    const snapAng = Math.round(ang / (Math.PI / 3)) * (Math.PI / 3);
    const blended = ang + wrapAngle(snapAng - ang) * 0.55;
    ux = Math.cos(blended);
    uy = Math.sin(blended);
    outcome = 'QUANTUM_SNAP';
  } else if (fromLaw === LAW_INDEX.ARISTOTELIAN) {
    outSpeed = Math.max(70, speedIn * 1.35);
    outcome = 'INERTIAL_SURGE';
  }

  outSpeed = Math.max(12, Math.min(240, outSpeed));
  const outVx = ux * outSpeed;
  const outVy = uy * outSpeed;
  const eAfter = metricEnergy(toLaw, outVx, outVy);

  return {
    outcome,
    vx: outVx,
    vy: outVy,
    thetaI,
    thetaR,
    defect: Math.abs(eBefore - eAfter),
    reflected: false,
  };
}

/**
 * Integrates one particle for step dt and resolves boundary crossings & conservation defects.
 */
export function stepParticle(p, manifold, dt, simTime, onTransition) {
  p.age += dt;
  p.life -= dt;

  const currentLaw = manifold.lawAtWorld(p.x, p.y);
  p.law = currentLaw;
  const lawDef = getLaw(currentLaw);
  p.tau = lawDef.tau;
  p.phase += p.tau * dt * 6.0;

  // Apply law-specific continuous kinematics
  let vx = p.vx;
  let vy = p.vy;

  if (currentLaw === LAW_INDEX.TAXICAB) {
    // Gentle axial crystal torque toward nearest cardinal direction (0, 90, 180, 270 deg)
    const speed = Math.hypot(vx, vy);
    if (speed > 8) {
      const ang = Math.atan2(vy, vx);
      const nearest = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      const diff = wrapAngle(nearest - ang);
      const rot = diff * Math.min(1, dt * 1.15);
      const newAng = ang + rot;
      vx = Math.cos(newAng) * speed;
      vy = Math.sin(newAng) * speed;
    }
  } else if (currentLaw === LAW_INDEX.CHEBYSHEV) {
    // Gentle diagonal eigen-axis torque toward 45° diagonals
    const speed = Math.hypot(vx, vy);
    if (speed > 8) {
      const ang = Math.atan2(vy, vx);
      const nearest = Math.round((ang - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
      const diff = wrapAngle(nearest - ang);
      const rot = diff * Math.min(1, dt * 0.85);
      const newAng = ang + rot;
      vx = Math.cos(newAng) * speed;
      vy = Math.sin(newAng) * speed;
    }
  } else if (currentLaw === LAW_INDEX.ARISTOTELIAN) {
    // Strong non-inertial damping
    const damp = Math.pow(0.18, dt);
    vx *= damp;
    vy *= damp;
  } else if (currentLaw === LAW_INDEX.CHRONO) {
    // Negative damping / energy healing inside time-reversed domain
    const speed = Math.hypot(vx, vy);
    if (speed > 4 && speed < 155) {
      const boost = Math.pow(1.42, dt);
      vx *= boost;
      vy *= boost;
    }
  } else if (currentLaw === LAW_INDEX.HYPERBOLIC) {
    const [ax, ay] = manifold.hyperbolicAcceleration(p.x, p.y, vx, vy);
    vx += ax * dt * 60;
    vy += ay * dt * 60;
  } else if (currentLaw === LAW_INDEX.QUANTIZED) {
    const speed = Math.hypot(vx, vy);
    const target = nearestShellSpeed(speed);
    if (speed > 1) {
      const newSpeed = speed + (target - speed) * Math.min(1, dt * 4.0);
      const scale = newSpeed / speed;
      vx *= scale;
      vy *= scale;
    }
  }

  p.vx = vx;
  p.vy = vy;

  const prevX = p.x;
  const prevY = p.y;
  const nextX = prevX + vx * dt;
  const nextY = prevY + vy * dt;

  // World wall containment (elastic bounce inside simulation chamber)
  let boundedX = nextX;
  let boundedY = nextY;
  if (boundedX < p.radius) {
    boundedX = p.radius;
    p.vx = Math.abs(p.vx);
  } else if (boundedX > manifold.worldWidth - p.radius) {
    boundedX = manifold.worldWidth - p.radius;
    p.vx = -Math.abs(p.vx);
  }
  if (boundedY < p.radius) {
    boundedY = p.radius;
    p.vy = Math.abs(p.vy);
  } else if (boundedY > manifold.worldHeight - p.radius) {
    boundedY = manifold.worldHeight - p.radius;
    p.vy = -Math.abs(p.vy);
  }

  const nextLaw = manifold.lawAtWorld(boundedX, boundedY);
  if (nextLaw !== currentLaw && simTime - p.lastCrossingTime > 0.045) {
    const [nx, ny] = manifold.estimateBoundaryNormal(
      (prevX + boundedX) * 0.5,
      (prevY + boundedY) * 0.5,
      currentLaw,
      nextLaw,
      p.vx,
      p.vy
    );
    const res = resolveFaultTransition(p.vx, p.vy, currentLaw, nextLaw, nx, ny);
    p.vx = res.vx;
    p.vy = res.vy;
    p.lastCrossingTime = simTime;
    p.crossings++;

    if (res.reflected) {
      // Remain on incoming side of the Fault Line after Metric TIR
      const rx = prevX + p.vx * dt * 0.5;
      const ry = prevY + p.vy * dt * 0.5;
      if (manifold.lawAtWorld(rx, ry) === currentLaw) {
        p.x = rx;
        p.y = ry;
      } else {
        p.x = prevX;
        p.y = prevY;
      }
    } else {
      p.x = boundedX;
      p.y = boundedY;
      p.law = nextLaw;
      p.tau = getLaw(nextLaw).tau;
    }

    if (onTransition) {
      onTransition(p, currentLaw, nextLaw, res);
    }
  } else {
    p.x = boundedX;
    p.y = boundedY;
  }

  // Record bounded trail
  p.trail.push({ x: p.x, y: p.y, law: p.law, tau: p.tau });
  if (p.trail.length > 26) {
    p.trail.shift();
  }
}

/**
 * Resolves pairwise 2D elastic collisions between active particles.
 */
export function resolveParticleCollisions(particles, onCollide) {
  const count = particles.length;
  for (let i = 0; i < count; i++) {
    const a = particles[i];
    for (let j = i + 1; j < count; j++) {
      const b = particles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > minDist * minDist || dist2 < 1e-9) continue;

      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const ny = dy / dist;

      // Separate overlap symmetrically
      const overlap = (minDist - dist) * 0.52;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const relNormal = rvx * nx + rvy * ny;
      if (relNormal > 0) continue;

      const invMa = 1 / a.mass;
      const invMb = 1 / b.mass;
      const jImpulse = -(1 + 1.0) * relNormal / (invMa + invMb);

      a.vx -= jImpulse * invMa * nx;
      a.vy -= jImpulse * invMa * ny;
      b.vx += jImpulse * invMb * nx;
      b.vy += jImpulse * invMb * ny;

      if (onCollide) {
        onCollide(a, b, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, Math.abs(jImpulse));
      }
    }
  }
}

function nearestShellSpeed(speed) {
  let best = QUANTIZED_SHELLS[0];
  let bestDist = Infinity;
  for (const s of QUANTIZED_SHELLS) {
    const d = Math.abs(speed - s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

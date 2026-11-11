import { LAW_INDEX } from '../engine/laws.js';

const JUST_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4, 5 / 2, 3];

export class FaultLineSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.muted = true;
    this.volume = 0.42;
    this.lastVoiceMs = 0;
    this.activeVoices = 0;
    this.maxVoices = 12;
  }

  ensureContext() {
    if (this.ctx) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    this.ctx = new AudioCtx();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.compressor.connect(this.master);
    this.master.connect(this.ctx.destination);
    return true;
  }

  async setMuted(muted) {
    this.muted = muted;
    if (!muted) {
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.025);
    }
  }

  playFaultCrossing(evt, xNorm = 0.5) {
    if (this.muted || !this.ensureContext()) return;
    if (this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastVoiceMs < 42 || this.activeVoices >= this.maxVoices) return;
    this.lastVoiceMs = nowMs;

    const now = this.ctx.currentTime;
    const defectNorm = Math.min(1, Math.sqrt(Math.max(0, evt.defect)) / 140);
    const ratioIdx = Math.min(
      JUST_RATIOS.length - 1,
      Math.floor(defectNorm * (JUST_RATIOS.length - 1))
    );
    const baseRoot = evt.toLaw === LAW_INDEX.ARISTOTELIAN ? 110 : 220;
    const freq = baseRoot * JUST_RATIOS[ratioIdx];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, xNorm * 2 - 1));

    const peak = 0.045 + defectNorm * 0.075;
    let duration = 0.24;
    let sourceNode = osc;

    if (evt.toLaw === LAW_INDEX.CHRONO) {
      // Reverse attack envelope mirrors time-reversed zone behavior.
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.92, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.22);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.2);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.23);
    } else if (evt.toLaw === LAW_INDEX.TAXICAB) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 1.5, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      duration = 0.18;
    } else if (evt.toLaw === LAW_INDEX.CHEBYSHEV) {
      osc.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq * 2.4;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak * 0.55, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      osc.connect(filter);
      sourceNode = filter;
      duration = 0.2;
    } else if (evt.toLaw === LAW_INDEX.HYPERBOLIC) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.25, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.78, now + 0.24);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      duration = 0.26;
    } else if (evt.toLaw === LAW_INDEX.ARISTOTELIAN) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.9, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.14);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak * 1.1, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      duration = 0.17;
    } else if (evt.toLaw === LAW_INDEX.QUANTIZED) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 2.0, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak * 0.8, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      duration = 0.3;
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak * 0.75, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      duration = 0.23;
    }

    sourceNode.connect(gain);
    gain.connect(pan);
    pan.connect(this.compressor);
    this.triggerOsc(osc, now, duration);
  }

  playDetectorPing(detector, xNorm = 0.5) {
    if (this.muted || !this.ensureContext()) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.8, Math.min(0.8, xNorm * 2 - 1));

    const isCarry = detector.id.includes('carry');
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isCarry ? 660 : 523.25, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.compressor);
    this.triggerOsc(osc, now, 0.34);
  }

  triggerOsc(osc, start, duration) {
    this.activeVoices++;
    osc.start(start);
    osc.stop(start + duration);
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
  }
}

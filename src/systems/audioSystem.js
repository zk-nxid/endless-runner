const BPM = 124;
const STEPS_PER_BEAT = 4;
const STEP_SECONDS = 60 / BPM / STEPS_PER_BEAT;
const PATTERN_LENGTH = 16;

const KICK_STEPS = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const SNARE_STEPS = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const HAT_STEPS = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

const BASS_PATTERN = [110.0, 87.31, 73.42, 82.41];
const LEAD_PATTERN = [
  440.0, 523.25, 659.25, 783.99,
  880.0, 783.99, 659.25, 523.25,
  440.0, 523.25, 659.25, 783.99,
  987.77, 783.99, 659.25, 523.25,
];
const COUNTER_PATTERN = [
  329.63, 0, 392.0, 0,
  329.63, 0, 440.0, 0,
  329.63, 0, 392.0, 0,
  493.88, 0, 440.0, 0,
];
const GAME_MUSIC_SCALE = 1.0;
const MENU_MUSIC_SCALE = 0.45;

export class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.kickGain = null;
    this.bassGain = null;
    this.leadGain = null;
    this.counterGain = null;
    this.filter = null;
    this.sfxGain = null;
    this.reverbSend = null;
    this.reverbReturn = null;
    this.noiseBuffer = null;
    this.duckGain = null;

    this.schedulerId = null;
    this.nextStepTime = 0;
    this.currentStep = 0;
    this.scheduleAheadTime = 0.1;
    this.schedulerIntervalMs = 25;
    this.menuMode = true;
    this.leadLayerLevel = 0;
    this.counterLayerLevel = 0;
    this.targetLeadLevel = 0;
    this.targetCounterLevel = 0;

    let stored = NaN;
    try {
      stored = parseFloat(localStorage.getItem("nr.volume"));
    } catch {}
    this.userVolume = Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.7;
  }

  getMasterVolume() {
    return this.userVolume;
  }

  setMasterVolume(value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    this.userVolume = v;
    try {
      localStorage.setItem("nr.volume", String(v));
    } catch {}
    if (this.context && this.masterGain) {
      const now = this.context.currentTime;
      this.masterGain.gain.setTargetAtTime(0.22 * v, now, 0.05);
    }
  }

  async start() {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.context = new Ctx();
      this.#buildGraph();
    }

    if (this.context.state !== "running") {
      await this.context.resume();
    }

    this.#applyMixVolumes(this.context.currentTime, 0.12);
    this.#startScheduler();
  }

  setMoodIntensity(intensity, speed = 0) {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    this.filter.frequency.setTargetAtTime(1400 + intensity * 800, now, 0.25);
    this.targetLeadLevel = speed > 14 ? Math.min(1, (speed - 14) / 8) : 0;
    this.targetCounterLevel = speed > 22 ? Math.min(1, (speed - 22) / 12) : 0;
    this.leadLayerLevel += (this.targetLeadLevel - this.leadLayerLevel) * 0.05;
    this.counterLayerLevel += (this.targetCounterLevel - this.counterLayerLevel) * 0.05;
    if (this.leadGain) {
      this.leadGain.gain.setTargetAtTime(0.45 * this.leadLayerLevel, now, 0.25);
    }
    if (this.counterGain) {
      this.counterGain.gain.setTargetAtTime(0.32 * this.counterLayerLevel, now, 0.3);
    }
  }

  setMenuMode(isMenu) {
    this.menuMode = isMenu;
    if (!this.context || !this.masterGain) return;
    this.#applyMixVolumes(this.context.currentTime, 0.2);
  }

  pulse() {
    if (!this.context || !this.filter) return;
    const now = this.context.currentTime;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.linearRampToValueAtTime(2800, now + 0.08);
    this.filter.frequency.linearRampToValueAtTime(1400, now + 0.5);
  }

  /** Sidechain-ish music duck for stingers. */
  duckMusic(amount = 0.4, duration = 0.6) {
    if (!this.context || !this.duckGain) return;
    const now = this.context.currentTime;
    const ducked = Math.max(0.05, 1 - amount);
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
    this.duckGain.gain.linearRampToValueAtTime(ducked, now + 0.04);
    this.duckGain.gain.linearRampToValueAtTime(1, now + duration);
  }

  playMoveSfx() {
    this.#playTone(440, 0.045, "square", 0.05);
  }

  playJumpSfx() {
    this.#playSweep(280, 620, 0.12, "triangle", 0.06);
  }

  playUiHoverSfx() {
    this.#playSweep(760, 640, 0.06, "triangle", 0.09);
  }

  playBoostStinger() {
    if (!this.context) return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    if (this.reverbSend) gain.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + 0.45);

    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    const noiseFilter = this.context.createBiquadFilter();
    noise.buffer = this.noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(5200, now + 0.42);
    noiseFilter.Q.value = 1.4;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.46);

    const sub = this.context.createOscillator();
    const subGain = this.context.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, now + 0.36);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.7);
    subGain.gain.setValueAtTime(0.0001, now + 0.36);
    subGain.gain.exponentialRampToValueAtTime(0.55, now + 0.4);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.74);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now + 0.36);
    sub.stop(now + 0.78);

    this.duckMusic(0.4, 0.6);
  }

  playImpactSfx() {
    if (!this.context) return;
    const now = this.context.currentTime;

    const sub = this.context.createOscillator();
    const subGain = this.context.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.45);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.85, now + 0.005);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.6);

    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    const noiseFilter = this.context.createBiquadFilter();
    noise.buffer = this.noiseBuffer;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(4200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(220, now + 0.5);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.6, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    if (this.reverbSend) noiseGain.connect(this.reverbSend);
    noise.start(now);
    noise.stop(now + 0.8);

    const sweep = this.context.createOscillator();
    const sweepGain = this.context.createGain();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(1200, now);
    sweep.frequency.exponentialRampToValueAtTime(180, now + 0.32);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    sweep.connect(sweepGain);
    sweepGain.connect(this.sfxGain);
    if (this.reverbSend) sweepGain.connect(this.reverbSend);
    sweep.start(now);
    sweep.stop(now + 0.45);

    this.duckMusic(0.55, 0.85);
  }

  #buildGraph() {
    const ctx = this.context;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.22;
    this.masterGain.connect(ctx.destination);

    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.duckGain.connect(this.masterGain);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 0.6;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.duckGain);

    this.filter.connect(this.musicGain);

    this.kickGain = ctx.createGain();
    this.kickGain.gain.value = 0.85;
    this.kickGain.connect(this.musicGain);

    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0.65;
    this.bassGain.connect(this.filter);

    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = 0;
    this.leadGain.connect(this.filter);

    this.counterGain = ctx.createGain();
    this.counterGain.gain.value = 0;
    this.counterGain.connect(this.filter);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.masterGain);

    this.#buildReverb();

    this.noiseBuffer = this.#createNoiseBuffer();
  }

  #buildReverb() {
    const ctx = this.context;
    try {
      const length = Math.floor(ctx.sampleRate * 1.3);
      const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i += 1) {
          const t = i / length;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = buffer;

      const send = ctx.createGain();
      send.gain.value = 0.55;
      const ret = ctx.createGain();
      ret.gain.value = 0.4;

      send.connect(convolver);
      convolver.connect(ret);
      ret.connect(this.duckGain);

      this.reverbSend = send;
      this.reverbReturn = ret;
    } catch (error) {
      console.warn("Reverb send unavailable:", error);
      this.reverbSend = null;
    }
  }

  #applyMixVolumes(now, timeConstant) {
    const scale = this.menuMode ? MENU_MUSIC_SCALE : GAME_MUSIC_SCALE;
    this.masterGain.gain.setTargetAtTime(0.22 * this.userVolume, now, timeConstant);
    this.musicGain.gain.setTargetAtTime(0.55 * scale, now, timeConstant);
    this.bassGain.gain.setTargetAtTime(0.65 * scale, now, timeConstant);
    this.kickGain.gain.setTargetAtTime(0.85 * scale, now, timeConstant);
  }

  #createNoiseBuffer() {
    const ctx = this.context;
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  #startScheduler() {
    if (this.schedulerId !== null) return;
    this.nextStepTime = this.context.currentTime + 0.05;
    this.currentStep = 0;
    this.schedulerId = setInterval(() => this.#schedulerTick(), this.schedulerIntervalMs);
  }

  #schedulerTick() {
    if (!this.context) return;
    const horizon = this.context.currentTime + this.scheduleAheadTime;
    while (this.nextStepTime < horizon) {
      this.#scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += STEP_SECONDS;
      this.currentStep = (this.currentStep + 1) % PATTERN_LENGTH;
    }
  }

  #scheduleStep(stepIdx, time) {
    if (KICK_STEPS[stepIdx]) this.#scheduleKick(time);
    if (SNARE_STEPS[stepIdx]) this.#scheduleSnare(time);
    if (HAT_STEPS[stepIdx]) this.#scheduleHat(time);
    if (stepIdx % STEPS_PER_BEAT === 0) {
      const bassFreq = BASS_PATTERN[(stepIdx / STEPS_PER_BEAT) % BASS_PATTERN.length];
      this.#scheduleBass(time, bassFreq);
    }
    this.#scheduleLead(time, LEAD_PATTERN[stepIdx]);
    if (COUNTER_PATTERN[stepIdx]) this.#scheduleCounter(time, COUNTER_PATTERN[stepIdx]);
  }

  #scheduleKick(time) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.95, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(gain);
    gain.connect(this.kickGain);
    osc.start(time);
    osc.stop(time + 0.2);

    const click = ctx.createBufferSource();
    const clickGain = ctx.createGain();
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = "lowpass";
    clickFilter.frequency.value = 2400;
    click.buffer = this.noiseBuffer;
    clickGain.gain.setValueAtTime(0.0001, time);
    clickGain.gain.exponentialRampToValueAtTime(0.4, time + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.kickGain);
    click.start(time);
    click.stop(time + 0.06);
  }

  #scheduleSnare(time) {
    const ctx = this.context;
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1200;
    noise.buffer = this.noiseBuffer;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.45, time + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.kickGain);
    noise.start(time);
    noise.stop(time + 0.22);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(220, time);
    tone.frequency.exponentialRampToValueAtTime(150, time + 0.12);
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.exponentialRampToValueAtTime(0.25, time + 0.005);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    tone.connect(toneGain);
    toneGain.connect(this.kickGain);
    tone.start(time);
    tone.stop(time + 0.15);
  }

  #scheduleHat(time) {
    const ctx = this.context;
    const noise = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6500;
    noise.buffer = this.noiseBuffer;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.kickGain);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  #scheduleBass(time, freq) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.55, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    osc.connect(gain);
    gain.connect(this.bassGain);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  #scheduleLead(time, freq) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.32, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + STEP_SECONDS * 0.95);
    osc.connect(gain);
    gain.connect(this.leadGain);
    if (this.reverbSend) gain.connect(this.reverbSend);
    osc.start(time);
    osc.stop(time + STEP_SECONDS + 0.02);
  }

  #scheduleCounter(time, freq) {
    if (!this.counterGain) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.28, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + STEP_SECONDS * 1.8);
    osc.connect(gain);
    gain.connect(this.counterGain);
    if (this.reverbSend) gain.connect(this.reverbSend);
    osc.start(time);
    osc.stop(time + STEP_SECONDS * 2);
  }

  #playTone(freq, duration, type, gainAmount) {
    if (!this.context || !this.sfxGain) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainAmount, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  #playSweep(startFreq, endFreq, duration, type, gainAmount) {
    if (!this.context || !this.sfxGain) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainAmount, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}

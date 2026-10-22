// 100% Procedural Web Audio Soundscape (Zero external audio files).
// Generates gentle flowing river water, soft mountain wind in the willows,
// warm hearth fire crackle, and meditative pentatonic koto / shishi-odoshi tones.

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this.waterGain = null;
    this.windGain = null;
    this.kotoTimer = null;
  }

  toggle() {
    if (!this.enabled) {
      this.start();
    } else {
      this.stop();
    }
    return this.enabled;
  }

  start() {
    if (this.enabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);

      // Create pink-ish noise buffer for water & wind
      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }

      // River murmur
      const waterSrc = this.ctx.createBufferSource();
      waterSrc.buffer = noiseBuf;
      waterSrc.loop = true;
      const waterFilter = this.ctx.createBiquadFilter();
      waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 480;
      waterFilter.Q.value = 0.8;
      this.waterGain = this.ctx.createGain();
      this.waterGain.gain.value = 0.45;
      waterSrc.connect(waterFilter);
      waterFilter.connect(this.waterGain);
      this.waterGain.connect(this.master);
      waterSrc.start();

      // Mountain breeze
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = noiseBuf;
      windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 260;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.3;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.enabled = true;

    // Gentle Japanese Hirajoshi pentatonic koto plucks
    const scale = [196.0, 220.0, 233.08, 293.66, 311.13, 392.0, 440.0, 466.16, 587.33];
    const scheduleNote = () => {
      if (!this.enabled) return;
      this.playKotoPluck(scale[Math.floor(Math.random() * scale.length)]);
      this.kotoTimer = setTimeout(scheduleNote, 3200 + Math.random() * 5500);
    };
    this.kotoTimer = setTimeout(scheduleNote, 1200);
  }

  playKotoPluck(freq) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.master);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 3.5);
    osc2.stop(now + 3.5);
  }

  stop() {
    this.enabled = false;
    if (this.kotoTimer) clearTimeout(this.kotoTimer);
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }
}

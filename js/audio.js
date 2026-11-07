export class Soundscape {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.noise = null;
    this.windGain = null;
    this.propGain = null;
    this.propOsc = null;
    this.propNoise = null;
  }

  unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || this.failed) return;
    if (!this.ctx) {
      try {
        this.ctx = new Ctx();
      } catch (err) {
        this.failed = true;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.ready) this.build();
  }

  build() {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const samples = rate * 2;
    const noise = ctx.createBuffer(1, samples, rate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < samples; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.5;
    }
    this.noise = noise;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();

    this.propOsc = ctx.createOscillator();
    this.propOsc.type = 'triangle';
    this.propOsc.frequency.value = 52;
    const propTone = ctx.createBiquadFilter();
    propTone.type = 'lowpass';
    propTone.frequency.value = 420;
    const propToneGain = ctx.createGain();
    propToneGain.gain.value = 0.55;
    this.propOsc.connect(propTone);
    propTone.connect(propToneGain);

    const propAir = ctx.createBufferSource();
    propAir.buffer = noise;
    propAir.loop = true;
    const propAirFilter = ctx.createBiquadFilter();
    propAirFilter.type = 'bandpass';
    propAirFilter.frequency.value = 1100;
    propAirFilter.Q.value = 0.7;
    this.propNoise = ctx.createGain();
    this.propNoise.gain.value = 0;
    propAir.connect(propAirFilter);
    propAirFilter.connect(this.propNoise);

    this.propGain = ctx.createGain();
    this.propGain.gain.value = 0;
    propToneGain.connect(this.propGain);
    this.propNoise.connect(this.propGain);
    this.propGain.connect(this.master);
    this.propOsc.start();
    propAir.start();

    this.ready = true;
  }

  wind(amount) {
    if (!this.ready) return;
    const level = Math.max(0, Math.min(1, amount)) * 0.05;
    this.windGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.45);
  }

  prop(power, speed, airborne) {
    if (!this.ready) return;
    const drive = Math.max(power, Math.min(1, speed / 51));
    const awake = airborne ? Math.max(drive, speed > 1 ? 0.18 : drive) : (power < 0.02 && speed < 0.8 ? 0 : drive);
    const now = this.ctx.currentTime;
    this.propGain.gain.setTargetAtTime(awake * 0.09, now, 0.15);
    this.propOsc.frequency.setTargetAtTime(46 + awake * 98, now, 0.15);
    this.propNoise.gain.setTargetAtTime(awake * 0.55, now, 0.15);
  }

  burst(opts) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = opts.dur;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.peak), now + opts.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    gain.connect(this.master);

    let source;
    if (opts.tone) {
      source = ctx.createOscillator();
      source.type = opts.wave || 'sine';
      source.frequency.setValueAtTime(opts.freq, now);
      if (opts.freqTo) source.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqTo), now + dur);
    } else {
      source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.playbackRate.value = opts.rate || 1;
    }
    if (opts.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter;
      filter.frequency.setValueAtTime(opts.cut, now);
      if (opts.cutTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.cutTo), now + dur);
      filter.Q.value = opts.q || 0.7;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    source.start(now);
    source.stop(now + dur + 0.03);
  }

  step(kind, pitch = 1) {
    const sand = kind === 'sand';
    const quiet = pitch > 1.1 ? 0.55 : 1;
    this.burst({
      dur: 0.07,
      attack: 0.008,
      peak: (sand ? 0.11 : 0.15) * quiet,
      rate: (sand ? 1.4 : 0.72) * pitch,
      filter: 'bandpass',
      cut: (sand ? 1700 : 380) * pitch,
      q: 0.65
    });
  }

  splash(scale = 1) {
    const quiet = scale < 0.8 ? 0.5 : 1;
    this.burst({
      dur: 0.16,
      attack: 0.01,
      peak: 0.14 * quiet,
      rate: scale < 0.8 ? 1.5 : 1,
      filter: 'lowpass',
      cut: 900,
      cutTo: 220
    });
  }

  liftoff() {
    this.burst({
      dur: 0.45,
      attack: 0.04,
      peak: 0.1,
      filter: 'bandpass',
      cut: 280,
      cutTo: 1400,
      q: 0.5
    });
  }

  touchdown() {
    this.burst({
      tone: true,
      wave: 'sine',
      freq: 110,
      freqTo: 55,
      dur: 0.22,
      attack: 0.008,
      peak: 0.2
    });
  }

  scrape() {
    this.burst({
      dur: 0.18,
      attack: 0.01,
      peak: 0.1,
      rate: 0.55,
      filter: 'bandpass',
      cut: 240,
      q: 1.2
    });
  }

  click() {
    this.burst({
      tone: true,
      wave: 'square',
      freq: 740,
      freqTo: 420,
      dur: 0.06,
      attack: 0.004,
      peak: 0.04
    });
  }

  pour() {
    this.burst({
      dur: 0.32,
      attack: 0.03,
      peak: 0.1,
      rate: 1.2,
      filter: 'lowpass',
      cut: 1400,
      cutTo: 500
    });
  }

  flap() {
    this.burst({
      dur: 0.2,
      attack: 0.012,
      peak: 0.09,
      rate: 0.85,
      filter: 'bandpass',
      cut: 1600,
      cutTo: 400,
      q: 0.6
    });
  }
}

// Sonidos: los .wav arcade de Buscaminas Pokémon + efectos sintetizados con WebAudio (como ¡Millón al Agua!).
type Wav = 'correct' | 'bomb' | 'next-round' | 'perfect';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buffers = new Map<Wav, AudioBuffer>();
  private noiseBuf!: AudioBuffer;
  muted = false;

  /** El navegador sólo permite audio después de una interacción del usuario. */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (const name of ['correct', 'bomb', 'next-round', 'perfect'] as Wav[]) {
      fetch(`${import.meta.env.BASE_URL}audio/${name}.wav`)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.buffers.set(name, buf))
        .catch(() => { /* sin ese .wav el juego sigue en silencio para ese efecto */ });
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  private get ok() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  private wav(name: Wav, vol = 0.8, rate = 1) {
    if (!this.ok) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx!.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  pick() { this.tone('square', 660, 990, 0.08, 0.12); }
  drumroll(delay: number, duration: number) {
    for (let t = 0; t < duration; t += 0.06) this.noise(0.05, 0.1 + (t / duration) * 0.2, 'bandpass', 220, 0.8, delay + t);
  }
  /** Barrido mientras los modelos pasan a escala real. */
  morph(delay: number, duration: number) {
    this.tone('triangle', 220, 880, duration, 0.08, delay);
  }
  /** Golpe seco al llegar una barra o asentarse el balancín. */
  thud(delay = 0) {
    this.tone('sine', 180, 60, 0.2, 0.5, delay);
    this.noise(0.08, 0.3, 'lowpass', 1200, 1, delay);
  }
  correct() { this.wav('correct', 0.9); }
  wrong() { this.wav('bomb', 0.7); }
  nextRound() { this.wav('next-round', 0.6); }
  final() { this.wav('perfect', 0.9); }
}

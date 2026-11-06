// Procedural ambience (no asset files): a low drone with a slow swell, plus a temple bell every few seconds.
let ctx, master, muted = false;

export function startAudio() {
  if (ctx) return ctx.resume();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const drone = ctx.createGain();
  drone.gain.value = 0.07;
  drone.connect(master);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain).connect(drone.gain);
  lfo.start();
  for (const f of [73.4, 110, 146.8, 220.5]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 10;
    o.connect(drone);
    o.start();
  }
  const ring = () => { bell(); setTimeout(ring, 9000 + Math.random() * 7000); };
  setTimeout(ring, 2500);
}

export function bell(freq = 392) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
  g.connect(master);
  for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    og.gain.value = a;
    o.frequency.value = freq * m;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 5);
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

/** Wooden-fish (mõ) strike: a short hollow knock. `vol` 0..1 falls off with the listener's distance. */
export function moTap(vol = 1) {
  if (!ctx || muted || vol <= 0.02) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  g.connect(master);
  for (const [f, a] of [[420, 1], [830, 0.5]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 0.25);
  }
}

// ---------- dog world sounds (all synthesised) ----------

function env(t, peak, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(master);
  return g;
}

/** Short filtered noise burst; used for breath, splashes, munching and thunder. */
function noise(t, dur, freq, peak, type = 'bandpass') {
  const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
  src.buffer = buf; f.type = type; f.frequency.value = freq;
  src.connect(f).connect(env(t, peak, dur));
  src.start(t);
}

/** "Gâu!" – a falling sawtooth through a vowel-ish filter. `pitch` ~1 for a medium dog, lower for big ones. */
export function bark(vol = 1, pitch = 1) {
  if (!ctx || muted || vol <= 0.02) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(420 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.16);
  f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.16); f.Q.value = 2.5;
  o.connect(f).connect(env(t, 0.38 * vol, 0.2));
  o.start(t); o.stop(t + 0.22);
  noise(t, 0.08, 1800, 0.12 * vol);
}

export function growl(vol = 1) {
  if (!ctx || muted || vol <= 0.02) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = 70;
  lfo.frequency.value = 28; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  o.connect(f).connect(env(t, 0.3 * vol, 0.9));
  o.start(t); lfo.start(t); o.stop(t + 0.95); lfo.stop(t + 0.95);
}

export function yelp(vol = 1) {
  if (!ctx || muted || vol <= 0.02) return;
  const t = ctx.currentTime, o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(600, t + 0.28);
  o.connect(env(t, 0.3 * vol, 0.3));
  o.start(t); o.stop(t + 0.32);
}

export function sfx(kind, vol = 1) {
  if (!ctx || muted || vol <= 0.02) return;
  const t = ctx.currentTime;
  if (kind === 'munch') for (let i = 0; i < 4; i++) noise(t + i * 0.16, 0.07, 1200 + i * 150, 0.2 * vol);
  else if (kind === 'splash') noise(t, 0.35, 700, 0.3 * vol);
  else if (kind === 'dig') for (let i = 0; i < 5; i++) noise(t + i * 0.22, 0.12, 380, 0.25 * vol, 'lowpass');
  else if (kind === 'sniff') for (let i = 0; i < 4; i++) noise(t + i * 0.18, 0.1, 3200, 0.1 * vol, 'highpass');
  else if (kind === 'thunder') noise(t, 2.6, 160, 0.9 * vol, 'lowpass');
  else if (kind === 'poof') noise(t, 0.4, 900, 0.3 * vol);
  else if (kind === 'racket') { // tennis: the "pock" of strings on the ball
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.07);
    o.connect(env(t, 0.5 * vol, 0.1)); o.start(t); o.stop(t + 0.12);
    noise(t, 0.03, 2600, 0.25 * vol, 'highpass');
  }
  else if (kind === 'bounce') { // ball on the court: a softer pock
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    o.connect(env(t, 0.28 * vol, 0.08)); o.start(t); o.stop(t + 0.1);
  }
  else if (kind === 'net') noise(t, 0.18, 500, 0.3 * vol, 'lowpass');
  else if (kind === 'whistle') for (const [i, f] of [[0, 1900], [1, 2300]]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    o.connect(env(t + i * 0.16, 0.08 * vol, 0.15)); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.17);
  }
  else if (kind === 'honk') for (const f of [349, 440]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
    o.connect(f2).connect(env(t, 0.12 * vol, 0.45)); o.start(t); o.stop(t + 0.5);
  }
  else if (kind === 'coin' || kind === 'level') for (const [i, f] of (kind === 'coin' ? [[0, 988], [1, 1319]] : [[0, 523], [1, 659], [2, 784], [3, 1046]])) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(env(t + i * 0.09, 0.2 * vol, 0.3)); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.35);
  }
}

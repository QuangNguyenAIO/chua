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

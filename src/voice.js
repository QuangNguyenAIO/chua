// Voice chat for a meeting: a WebRTC audio mesh (one peer connection per other member, up to 20 people), signalled through
// the game server. Remote voices are panned and attenuated by where their avatars stand (spatial audio).

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function createVoice({ send, onSpeak, listener, positionOf }) {
  let you = '';
  let stream = null, track = null, ctx = null, analyser = null, speaking = false, lastLoud = 0;
  let volume = 1;
  const peers = new Map(); // mid -> { pc, tr, audio, src, pan, gain, pid }

  const audioCtx = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

  function connect(mid, pid) {
    if (peers.has(mid)) return peers.get(mid);
    const pc = new RTCPeerConnection(ICE);
    const p = { pc, tr: null, pid, audio: null, pan: null, gain: null };
    peers.set(mid, p);
    pc.onicecandidate = (e) => e.candidate && send({ k: 'sig', mid, data: { c: e.candidate } });
    pc.ontrack = (e) => {
      const ac = audioCtx();
      p.audio = new Audio();
      p.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      p.audio.muted = true; // Chrome only delivers the stream to Web Audio while it is attached to a media element
      p.audio.play().catch(() => {});
      p.src = ac.createMediaStreamSource(p.audio.srcObject);
      p.pan = ac.createStereoPanner();
      p.gain = ac.createGain();
      p.src.connect(p.pan).connect(p.gain).connect(ac.destination);
      ac.resume?.();
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) drop(mid); };
    if (you < mid) { // the smaller id makes the offer
      p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (track) p.tr.sender.replaceTrack(track);
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => send({ k: 'sig', mid, data: { d: pc.localDescription } })).catch(() => {});
    }
    return p;
  }

  function drop(mid) {
    const p = peers.get(mid);
    if (!p) return;
    peers.delete(mid);
    try { p.src?.disconnect(); p.gain?.disconnect(); p.pc.close(); } catch {}
    if (p.audio) p.audio.srcObject = null;
  }

  return {
    /** Keeps one connection per other online member. */
    sync(members, me) {
      you = me;
      const live = new Set(members.filter((m) => m.mid !== me && m.state === 'online').map((m) => m.mid));
      for (const m of members) if (live.has(m.mid)) { const p = connect(m.mid, m.pid); p.pid = m.pid; }
      for (const mid of [...peers.keys()]) if (!live.has(mid)) drop(mid);
    },

    async onSignal(from, data) {
      const known = [...peers.keys()].includes(from);
      const p = peers.get(from);
      if (!known || !p) return;
      const pc = p.pc;
      try {
        if (data.d) {
          await pc.setRemoteDescription(data.d);
          if (data.d.type === 'offer') {
            const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
            if (tr) { tr.direction = 'sendrecv'; p.tr = tr; if (track) tr.sender.replaceTrack(track); }
            await pc.setLocalDescription(await pc.createAnswer());
            send({ k: 'sig', mid: from, data: { d: pc.localDescription } });
          }
        } else if (data.c) await pc.addIceCandidate(data.c);
      } catch {}
    },

    /** Turns the microphone on or off. Returns false when the browser refuses access. */
    async setMic(on) {
      if (!on) {
        track && (track.enabled = false);
        stream?.getTracks().forEach((t) => t.stop());
        stream = track = analyser = null;
        for (const p of peers.values()) p.tr?.sender.replaceTrack(null);
        if (speaking) { speaking = false; onSpeak(false); }
        return true;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch { return false; }
      track = stream.getAudioTracks()[0];
      const ac = audioCtx();
      ac.resume?.();
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(analyser);
      for (const p of peers.values()) p.tr?.sender.replaceTrack(track);
      return true;
    },

    /** Per frame: speaking detection for the local mic and spatial mixing of everyone else. */
    update() {
      if (analyser) {
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const t = performance.now();
        if (peak > 10) lastLoud = t;
        const now = t - lastLoud < 400;
        if (now !== speaking) { speaking = now; onSpeak(now); }
      }
      const L = listener();
      for (const p of peers.values()) {
        if (!p.gain) continue;
        const pos = positionOf(p.pid);
        if (!pos) { p.gain.gain.value = volume; continue; }
        const dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
        const right = -Math.cos(L.yaw) * dx + Math.sin(L.yaw) * dz; // listener's right-hand axis
        p.pan.pan.value = Math.max(-0.8, Math.min(0.8, d > 0.1 ? right / d : 0));
        p.gain.gain.value = volume * Math.max(0.25, 1 - d / 40);
      }
    },

    setVolume(v) { volume = v; },
    close() { for (const mid of [...peers.keys()]) drop(mid); this.setMic(false); },
  };
}

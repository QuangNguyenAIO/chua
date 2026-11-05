// Canvas painters shared by the meeting panels and the 3D room: whiteboard elements, the presentation screen and the
// hologram above the table. They only draw; state lives in meeting.js.

export const BOARD_W = 1600, BOARD_H = 900;
const imgCache = new Map(); // element id -> HTMLImageElement
export function boardImage(el, onLoad) {
  let im = imgCache.get(el.id);
  if (!im) {
    im = new Image();
    im.onload = onLoad;
    im.src = el.d;
    imgCache.set(el.id, im);
  }
  return im;
}

function wrap(g, text, x, y, maxW, lh) {
  let yy = y;
  for (const para of String(text).split('\n')) {
    let ln = '';
    for (const word of para.split(' ')) {
      const t = ln ? `${ln} ${word}` : word;
      if (g.measureText(t).width > maxW && ln) { g.fillText(ln, x, yy); yy += lh; ln = word; } else ln = t;
    }
    g.fillText(ln, x, yy); yy += lh;
  }
  return yy;
}

export function drawElement(g, el, onLoad) {
  g.save();
  g.strokeStyle = g.fillStyle = el.c;
  g.lineWidth = el.lw; g.lineCap = g.lineJoin = 'round';
  if (el.t === 'pen') {
    g.beginPath();
    g.moveTo(el.p[0], el.p[1]);
    if (el.p.length === 4) g.lineTo(el.p[2] + 0.01, el.p[3]);
    for (let i = 2; i < el.p.length; i += 2) g.lineTo(el.p[i], el.p[i + 1]);
    g.stroke();
  } else if (el.t === 'line' || el.t === 'arrow') {
    g.beginPath(); g.moveTo(el.x, el.y); g.lineTo(el.x2, el.y2); g.stroke();
    if (el.t === 'arrow') {
      const a = Math.atan2(el.y2 - el.y, el.x2 - el.x), s = 12 + el.lw * 2;
      g.beginPath();
      g.moveTo(el.x2, el.y2); g.lineTo(el.x2 - s * Math.cos(a - 0.45), el.y2 - s * Math.sin(a - 0.45));
      g.lineTo(el.x2 - s * Math.cos(a + 0.45), el.y2 - s * Math.sin(a + 0.45)); g.closePath(); g.fill();
    }
  } else if (el.t === 'rect') g.strokeRect(Math.min(el.x, el.x2), Math.min(el.y, el.y2), Math.abs(el.x2 - el.x), Math.abs(el.y2 - el.y));
  else if (el.t === 'ellipse') {
    g.beginPath();
    g.ellipse((el.x + el.x2) / 2, (el.y + el.y2) / 2, Math.abs(el.x2 - el.x) / 2 || 1, Math.abs(el.y2 - el.y) / 2 || 1, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (el.t === 'text') {
    g.font = `${el.fs}px system-ui, sans-serif`; g.textBaseline = 'top';
    wrap(g, el.s, el.x, el.y, 700, el.fs * 1.25);
  } else if (el.t === 'sticky') {
    g.fillStyle = el.c; g.shadowColor = '#0004'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.fillRect(el.x, el.y, 260, 200);
    g.shadowColor = 'transparent';
    g.fillStyle = '#222'; g.font = `${Math.min(el.fs, 30)}px system-ui, sans-serif`; g.textBaseline = 'top';
    wrap(g, el.s, el.x + 14, el.y + 14, 232, Math.min(el.fs, 30) * 1.25);
  } else if (el.t === 'img') {
    const im = boardImage(el, onLoad);
    if (im.complete && im.naturalWidth) g.drawImage(im, el.x, el.y, el.w, el.h);
  }
  g.restore();
}

export function drawBoard(g, els, draft, onLoad) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.strokeStyle = '#eef0f3'; g.lineWidth = 1;
  for (let x = 0; x < BOARD_W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, BOARD_H); g.stroke(); }
  for (let y = 0; y < BOARD_H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(BOARD_W, y); g.stroke(); }
  for (const el of els) drawElement(g, el, onLoad);
  if (draft) drawElement(g, draft, onLoad);
}

/** Presentation screen. `pres` is the server's presentation state; `info` is shown on the idle screen. */
export function drawScreen(g, w, h, pres, info, onLoad) {
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#12263a'); bg.addColorStop(1, '#1d4a5c');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  if (pres.kind === 'slides') {
    const s = pres.slides[pres.i] || { t: '', b: [] };
    const z = pres.zoom || 1;
    g.fillStyle = '#c9a24a'; g.fillRect(0, 0, 18, h);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(66 * z)}px system-ui, sans-serif`;
    let y = wrap(g, s.t, 80, 40 + 66 * z, w - 160, 78 * z);
    g.font = `${Math.round(42 * z)}px system-ui, sans-serif`; g.fillStyle = '#e4f0f6';
    y += 20;
    for (const b of s.b) { g.fillStyle = '#c9a24a'; g.fillText('•', 80, y); g.fillStyle = '#e4f0f6'; y = wrap(g, b, 120, y, w - 200, 56 * z) + 10; }
    g.fillStyle = '#ffffff99'; g.font = '24px system-ui, sans-serif';
    g.fillText(`${pres.title || ''}   ${pres.i + 1}/${pres.slides.length}   ·   ${pres.name || ''}`, 80, h - 28);
  } else if (pres.kind === 'image') {
    const im = boardImage({ id: `pres-${pres.d?.length}`, d: pres.d }, onLoad);
    if (im.complete && im.naturalWidth) {
      const z = pres.zoom || 1, k = Math.min(w / im.naturalWidth, h / im.naturalHeight) * z;
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
      g.drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      g.restore();
    }
    g.fillStyle = '#000a'; g.fillRect(0, h - 44, w, 44);
    g.fillStyle = '#fff'; g.font = '22px system-ui, sans-serif'; g.fillText(`${pres.title || 'Hình ảnh'} · ${pres.name || ''}`, 24, h - 14);
  } else {
    g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = 'bold 78px system-ui, sans-serif'; g.fillText(info.name || 'Phòng họp ảo', w / 2, h / 2 - 40, w - 120);
    g.fillStyle = '#c9a24a'; g.font = '44px system-ui, sans-serif'; g.fillText(info.code ? `Mã phòng: ${info.code}` : '', w / 2, h / 2 + 30);
    g.fillStyle = '#ffffffaa'; g.font = '32px system-ui, sans-serif'; g.fillText('Chưa có nội dung trình chiếu', w / 2, h / 2 + 100);
  }
}

/** Hologram over the table: clock, status, agenda and live poll. */
export function drawHolo(g, w, h, d) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#6fe3ff'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#6fe3ff22'; g.fillRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#9ff0ff'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(`AI · ${d.name}`.slice(0, 34), 24, 40, w - 48);
  g.font = 'bold 64px system-ui, sans-serif'; g.fillText(d.timer, 24, 112);
  g.font = '20px system-ui, sans-serif'; g.fillStyle = '#c8f7ff';
  g.fillText(`👥 ${d.count}/${d.max}   ✋ ${d.hands}   ${d.locked ? '🔒' : ''}${d.speaker ? '🎤 ' + d.speaker : ''}`, 24, 146, w - 48);
  if (d.poll) {
    g.fillStyle = '#9ff0ff'; g.font = 'bold 20px system-ui, sans-serif'; g.fillText(d.poll.q.slice(0, 40), 24, 182, w - 48);
    const tot = Math.max(1, d.poll.total);
    d.poll.opts.forEach((o, i) => {
      const y = 196 + i * 26;
      g.fillStyle = '#6fe3ff44'; g.fillRect(24, y, w - 48, 20);
      g.fillStyle = '#6fe3ff'; g.fillRect(24, y, (w - 48) * (d.poll.counts[i] / tot), 20);
      g.fillStyle = '#05212b'; g.font = '16px system-ui, sans-serif'; g.fillText(`${o.t.slice(0, 28)} · ${d.poll.counts[i]}`, 30, y + 15);
    });
  } else if (d.agenda) {
    g.fillStyle = '#c8f7ff'; g.font = '22px system-ui, sans-serif'; g.fillText(`📋 ${d.agenda}`.slice(0, 40), 24, 200, w - 48);
  }
}

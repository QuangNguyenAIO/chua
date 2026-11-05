import { drawBoard, drawScreen, drawHolo, BOARD_W, BOARD_H } from './meetdraw.js';
import { MEET, MEET_EXIT, SEAT_COUNT, seatPos } from './meetzone.js';
import { createVoice } from './voice.js';

// Client side of the virtual meeting room (module VRM): lobby, rooms, in-room HUD and panels. The server (meetings.js)
// owns all state; this file renders it and sends intents.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { host: 'Chủ trì', cohost: 'Đồng chủ trì', presenter: 'Người trình bày', participant: 'Thành viên', guest: 'Khách' };
const STATUS = { scheduled: 'Đã lên lịch', waiting: 'Đang chờ bắt đầu', active: 'Đang diễn ra', ended: 'Đã kết thúc', cancelled: 'Đã hủy' };
const TPL = { small: 'Phòng nhỏ (6)', standard: 'Phòng tiêu chuẩn (12)', hall: 'Hội trường (20)' };
const TPLMAX = { small: 6, standard: 12, hall: 20 };
const DENY = {
  notfound: 'Không tìm thấy phòng với mã này.', pass: 'Sai mật khẩu phòng.', locked: 'Phòng đang bị khóa.', full: 'Phòng đã đủ số người.',
  removed: 'Bạn đã bị mời ra khỏi phòng này.', ended: 'Cuộc họp đã kết thúc.', refused: 'Chủ trì đã từ chối yêu cầu tham gia.',
  notstarted: 'Cuộc họp chưa bắt đầu. Hãy chờ chủ trì mở phòng.',
};
const EMOJI = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏'];
const COLORS = ['#222222', '#d93025', '#f29900', '#188038', '#1a73e8', '#8e24aa', '#ffffff'];
const fmtTime = (t) => new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtHM = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function download(name, mime, data) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Reads an image file, shrinks it and returns a JPEG data URL (keeps messages small). */
function readImage(file, maxDim, q = 0.8) {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return rej(new Error('Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP.'));
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        res({ d: c.toDataURL('image/jpeg', q), w: c.width, h: c.height });
      };
      im.onerror = () => rej(new Error('Không đọc được ảnh.'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(new Error('Không đọc được tệp.'));
    fr.readAsDataURL(file);
  });
}

export function createMeeting({ room, send: rawSend, actor, toast, place, hostName, onState }) {
  let tok = lsGet('meet.tok');
  if (!tok) { tok = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); lsSet('meet.tok', tok); }
  const send = (o) => rawSend({ t: 'm', ...o });

  // ---------- state ----------
  const S = { lobby: false, tab: 'rooms', rooms: [], hist: [], skew: 0, join: null, wait: null, side: null, listAt: 0, remind: new Set() };
  let R = null; // the room I am in: { meta, members, chat, pres, wb, poll, agenda, agendaIdx, notes, actions, approval, versions, you, waitlist }
  let unread = 0, joinGrace = 0, pendingExport = null, handShown = new Map();
  let micOn = false, board = null, dirtyBoard = false, dirtyScreen = true, boardAt = 0, holoAt = 0;
  const undo = [], redo = [];
  let tool = 'pen', color = '#222222', lw = 4;

  const voice = createVoice({
    send,
    onSpeak: (on) => send({ k: 'speak', on }),
    listener: () => { const a = actor(R?.members.find((m) => m.mid === R.you)?.pid)?.avatar.group; return a ? { x: a.position.x, z: a.position.z, yaw: a.rotation.y } : { x: 0, z: 0, yaw: 0 }; },
    positionOf: (pid) => { const g = actor(pid)?.avatar.group; return g ? { x: g.position.x, z: g.position.z } : null; },
  });

  // ---------- derived ----------
  const meM = () => R?.members.find((m) => m.mid === R.you);
  const mgr = () => ['host', 'cohost'].includes(meM()?.role);
  const canPresent = () => mgr() || meM()?.role === 'presenter' || R.meta.allowPresent;
  const canBoard = () => mgr() || meM()?.role === 'presenter' || R.meta.allowBoard;
  const canNotes = () => mgr() || meM()?.role === 'presenter';
  const memberName = (mid) => R.members.find((m) => m.mid === mid)?.name || '?';
  const nowMs = () => Date.now() + S.skew;

  // ---------- DOM skeleton ----------
  const root = document.createElement('div');
  root.id = 'mt';
  root.innerHTML = `
    <div id="mtLobby" class="mt-modal" hidden></div>
    <div id="mtModal" class="mt-modal" hidden></div>
    <div id="mtWait" class="mt-modal" hidden></div>
    <div id="mtToast"></div>
    <div id="mtTop" hidden></div>
    <div id="mtSide" hidden></div>
    <div id="mtDock" hidden></div>`;
  document.body.appendChild(root);
  const el = { lobby: $('mtLobby'), modal: $('mtModal'), wait: $('mtWait'), toast: $('mtToast'), top: $('mtTop'), side: $('mtSide'), dock: $('mtDock') };

  const note = (text, cls = '') => {
    const d = document.createElement('div');
    d.className = cls; d.textContent = text;
    el.toast.appendChild(d);
    setTimeout(() => d.remove(), 4500);
    while (el.toast.children.length > 4) el.toast.firstChild.remove();
  };

  // ---------- lobby ----------
  function openLobby(tab) {
    if (R) return toast('Bạn đang ở trong một phòng họp.');
    S.lobby = true; if (tab) S.tab = tab;
    el.lobby.hidden = false;
    refreshList(); renderLobby();
  }
  const closeLobby = () => { S.lobby = false; el.lobby.hidden = true; };
  const refreshList = () => { S.listAt = performance.now(); send({ k: 'list' }); };

  function roomCard(r, hist) {
    const when = r.start ? fmtTime(r.start) : fmtTime(r.created);
    const full = r.count >= r.max;
    return `<div class="mt-card">
      <div><b>${esc(r.name)}</b> <span class="mt-chip ${r.status}">${STATUS[r.status] || r.status}</span>
        ${r.hasPass ? '🔑' : ''}${r.priv ? '🔒' : ''}${r.locked ? ' ⛔' : ''}${r.recur !== 'none' ? ' 🔁' : ''}<br>
        <small>Mã <code>${esc(r.code)}</code> · ${esc(r.hostName)} · ${TPL[r.tpl] || r.tpl} · ${r.count}/${r.max} người · ${hist ? 'kết thúc ' + fmtTime(r.endedAt || r.created) : when}${r.desc ? '<br>' + esc(r.desc) : ''}</small></div>
      <div class="mt-acts">
        ${hist ? `<button data-a="rec" data-code="${r.code}">📝 Biên bản</button>` : `
        <button data-a="joinroom" data-code="${r.code}" data-pass="${r.hasPass ? 1 : 0}" ${full && !r.mine ? 'disabled' : ''}>${r.mine && r.status !== 'active' ? '▶ Bắt đầu' : 'Tham gia'}</button>
        ${r.mine && ['scheduled', 'waiting'].includes(r.status) ? `<button data-a="cancelroom" data-code="${r.code}">Hủy lịch</button>` : ''}`}
        ${r.mine && r.status !== 'active' ? `<button data-a="delroom" data-code="${r.code}">🗑</button>` : ''}
      </div></div>`;
  }

  function calendar(upcoming) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    const first = new Date(y, m, 1).getDay() || 7, days = new Date(y, m + 1, 0).getDate();
    const has = new Set(upcoming.filter((r) => r.start).map((r) => { const t = new Date(r.start); return t.getFullYear() === y && t.getMonth() === m ? t.getDate() : 0; }));
    let cells = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => `<i class="h">${x}</i>`).join('') + '<i></i>'.repeat(first - 1);
    for (let i = 1; i <= days; i++) cells += `<i class="${i === d.getDate() ? 'today' : ''}">${i}${has.has(i) ? '<u></u>' : ''}</i>`;
    return `<div class="mt-cal"><b>Tháng ${m + 1}/${y}</b><div>${cells}</div></div>`;
  }

  function renderLobby() {
    if (!S.lobby) return;
    const tabs = [['rooms', '🏢 Phòng họp'], ['create', '➕ Tạo phòng'], ['sched', '📅 Lịch họp'], ['hist', '🕘 Lịch sử']];
    let body = '';
    if (S.tab === 'rooms') {
      const q = (S.q || '').toLowerCase(), f = S.filter || '';
      const list = S.rooms.filter((r) => (!q || (r.name + r.code + r.hostName).toLowerCase().includes(q)) && (!f || r.status === f));
      body = `<div class="mt-row">
          <input id="mtCode" maxlength="9" placeholder="Nhập mã phòng" value="${esc(S.code || '')}"><input id="mtPass" type="password" maxlength="32" placeholder="Mật khẩu (nếu có)">
          <button data-a="joincode">Tham gia</button><button data-a="micTest">🎤 Kiểm tra mic</button></div>
        <div id="mtMic" class="mt-small"></div>
        <div class="mt-row"><input id="mtQ" placeholder="Tìm phòng…" value="${esc(S.q || '')}"><select id="mtF"><option value="">Tất cả trạng thái</option>
          ${['active', 'waiting', 'scheduled'].map((s) => `<option value="${s}" ${f === s ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></div>
        <div>${list.map((r) => roomCard(r)).join('') || '<p class="mt-small">Chưa có phòng họp nào. Hãy tạo phòng mới!</p>'}</div>`;
    } else if (S.tab === 'create') {
      body = `<div class="mt-form">
        <label>Tên phòng *<input id="cName" maxlength="60" value="Cuộc họp mới"></label>
        <label>Mô tả / mục đích<textarea id="cDesc" maxlength="400" rows="2"></textarea></label>
        <div class="mt-row"><label>Loại phòng *<select id="cTpl">${Object.entries(TPL).map(([k, v]) => `<option value="${k}" ${k === 'standard' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Số người tối đa *<input id="cMax" type="number" min="2" max="20" value="12"></label></div>
        <div class="mt-row"><label>Quyền riêng tư *<select id="cPriv"><option value="0">Công khai</option><option value="1">Riêng tư (ẩn khỏi danh sách)</option></select></label>
          <label>Mật khẩu<input id="cPass" type="password" maxlength="32" autocomplete="new-password"></label></div>
        <div class="mt-row"><label>Ngày họp<input id="cDate" type="date"></label><label>Giờ bắt đầu<input id="cTime" type="time"></label>
          <label>Thời lượng (phút)<input id="cDur" type="number" min="5" max="600" value="60"></label></div>
        <div class="mt-row"><label>Lặp lại<select id="cRecur"><option value="none">Không</option><option value="daily">Hằng ngày</option><option value="weekly">Hằng tuần</option></select></label>
          <label>Khi chủ trì rời phòng<select id="cLeave"><option value="transfer">Chuyển quyền chủ trì</option><option value="end">Kết thúc cuộc họp</option></select></label></div>
        <label>Người được mời (tên, cách nhau dấu phẩy)<input id="cInv" maxlength="300"></label>
        <label class="mt-check"><input id="cWait" type="checkbox"> Bật phòng chờ (chủ trì duyệt từng người)</label>
        <p class="mt-small">Để trống ngày/giờ để họp ngay. Nếu đặt lịch, phòng sẽ mở khi chủ trì bấm “Bắt đầu”.</p>
        <button data-a="create" class="mt-primary">Tạo phòng</button></div>`;
    } else if (S.tab === 'sched') {
      const up = S.rooms.filter((r) => ['scheduled', 'waiting'].includes(r.status) && r.start).sort((a, b) => a.start - b.start);
      body = `${calendar(up)}<div>${up.map((r) => roomCard(r)).join('') || '<p class="mt-small">Chưa có cuộc họp nào được lên lịch.</p>'}</div>`;
    } else {
      body = `<div>${S.hist.map((r) => roomCard(r, true)).join('') || '<p class="mt-small">Chưa có cuộc họp nào đã diễn ra.</p>'}</div>`;
    }
    const keep = document.activeElement?.id;
    el.lobby.innerHTML = `<div class="mt-box"><div class="mt-head"><h3>🏢 Phòng họp ảo</h3><button data-a="closeLobby">✕</button></div>
      <div class="mt-tabs">${tabs.map(([k, l]) => `<button data-a="tab" data-k="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${body}</div>`;
    if (keep && $(keep)) { const e = $(keep); e.focus(); if (e.setSelectionRange && e.type !== 'number') try { e.setSelectionRange(1e4, 1e4); } catch {} }
  }

  function createRoom() {
    const v = (id) => $(id).value;
    const date = v('cDate'), time = v('cTime');
    let start = null;
    if (date) { start = new Date(`${date}T${time || '09:00'}`).getTime(); if (!(start > Date.now())) start = null; }
    S.pendingPass = v('cPass');
    S.afterCreate = !start;
    send({
      k: 'create', name: v('cName'), desc: v('cDesc'), tpl: v('cTpl'), max: +v('cMax'), priv: v('cPriv') === '1', pass: v('cPass'), start, dur: +v('cDur'),
      recur: v('cRecur'), onHostLeave: v('cLeave'), invites: v('cInv').split(',').map((x) => x.trim()).filter(Boolean), waiting: $('cWait').checked,
    });
    if (start && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }

  const joinRoom = (code, pass, via) => { S.joining = code; send({ k: 'join', code, pass, via }); };

  async function micTest() {
    const out = $('mtMic');
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext(), an = ac.createAnalyser();
      ac.createMediaStreamSource(st).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const t0 = performance.now();
      out.innerHTML = '🎤 Hãy nói thử: <span class="mt-meter"><i id="mtLvl"></i></span>';
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x - 128));
        const l = $('mtLvl');
        if (l) l.style.width = `${Math.min(100, p * 2.2)}%`;
        if (l && performance.now() - t0 < 8000) requestAnimationFrame(tick);
        else { st.getTracks().forEach((t) => t.stop()); ac.close(); if (out) out.textContent = 'Đã kiểm tra xong micro.'; }
      };
      tick();
    } catch { out.textContent = 'Không truy cập được micro. Hãy cấp quyền cho trình duyệt.'; }
  }

  // ---------- entering / leaving ----------
  function enterRoom(snap) {
    R = { ...snap, waitlist: [] };
    S.skew = snap.now - Date.now();
    closeLobby(); el.wait.hidden = true; S.wait = null;
    micOn = false; unread = 0; undo.length = 0; redo.length = 0; handShown = new Map();
    room.setDoor(true);
    joinGrace = performance.now() + 2500;
    el.top.hidden = el.dock.hidden = false;
    S.side = null; el.side.hidden = true;
    renderTop(); renderDock();
    applyMembers();
    const mm = meM();
    if (mm && mm.seat >= 0) { const sp = seatPos(mm.seat); place(sp.x, sp.z, sp.yaw, true); }
    dirtyBoard = dirtyScreen = true;
    onState(R.meta.code);
    toast(`Bạn đã vào “${R.meta.name}”. Nhấn E để ngồi/đứng.`);
  }

  function leaveLocal(msg) {
    if (!R) return;
    voice.close();
    for (const m of R.members) { const a = actor(m.pid); if (a) { a.human.setChair(false); a.human.setGesture(null); } }
    R = null; micOn = false;
    el.top.hidden = el.dock.hidden = el.side.hidden = true;
    room.setDoor(false);
    place(MEET_EXIT.x, MEET_EXIT.z, 0);
    dirtyScreen = dirtyBoard = true;
    onState('');
    if (msg) toast(msg);
  }

  function applyMembers() {
    voice.sync(R.members, R.you);
    for (const m of R.members) {
      const a = actor(m.pid);
      if (!a) continue;
      a.human.setChair(m.seat >= 0 && m.state === 'online');
      const sig = m.hand ? 'hand' : '';
      if (handShown.get(m.pid) !== sig) { handShown.set(m.pid, sig); a.human.setGesture(m.hand ? 'hand' : null); }
    }
  }

  // ---------- top bar & dock ----------
  function renderTop() {
    if (!R) return;
    const m = R.meta;
    el.top.innerHTML = `<b>${esc(m.name)}</b> · Mã <code>${esc(m.code)}</code> <button data-a="copylink">🔗 Sao chép liên kết</button>
      <span id="mtTimer">00:00:00</span>${m.locked ? ' 🔒' : ''}${m.hasPass ? ' 🔑' : ''}<span class="mt-chip ${m.status}">${STATUS[m.status] || ''}</span>`;
  }

  const TABS = [['members', '👥', 'Thành viên'], ['chat', '💬', 'Chat'], ['present', '📺', 'Trình chiếu'], ['board', '🖍', 'Bảng trắng'], ['poll', '🗳', 'Biểu quyết'], ['notes', '📝', 'Biên bản'], ['agenda', '📋', 'Chương trình'], ['control', '⚙', 'Điều hành']];
  function renderDock() {
    if (!R) return;
    const me = meM();
    const hands = R.members.filter((x) => x.hand).length;
    el.dock.innerHTML = `
      <button data-a="mic" class="${micOn ? 'on' : ''}" title="Bật/tắt micro (M)">${micOn ? '🎤' : '🔇'}</button>
      <input id="mtVol" type="range" min="0" max="100" value="${lsGet('meet.vol') ?? 100}" title="Âm lượng loa">
      <button data-a="hand" class="${me?.hand ? 'on' : ''}" title="Giơ tay (H)">✋</button>
      <button data-a="emo" title="Cảm xúc">😀</button>
      <span id="mtEmo" hidden>${EMOJI.map((e) => `<button data-a="react" data-e="${e}">${e}</button>`).join('')}
        ${[['wave', '👋'], ['nod', '🙆'], ['shake', '🙅'], ['clap', '👏'], ['point', '👉']].map(([g, i]) => `<button data-a="gest" data-g="${g}" title="${g}">${i}</button>`).join('')}</span>
      <button data-a="sit" title="Ngồi / đứng (E)">🪑</button>
      ${TABS.map(([k, i, l]) => `<button data-a="side" data-k="${k}" class="${S.side === k ? 'on' : ''}" title="${l}">${i}${k === 'chat' && unread ? `<b class="mt-badge">${unread}</b>` : ''}${k === 'members' && hands && mgr() ? `<b class="mt-badge">${hands}</b>` : ''}${k === 'members' && R.waitlist.length && mgr() ? `<b class="mt-badge">+${R.waitlist.length}</b>` : ''}</button>`).join('')}
      <button data-a="leave" class="mt-danger" title="Rời phòng">🚪</button>`;
  }

  // ---------- side panel ----------
  const T = {}; // tab renderers
  function openSide(k) {
    if (!R) return;
    S.side = S.side === k ? null : k;
    el.side.hidden = !S.side;
    el.side.classList.toggle('wide', S.side === 'board' || S.side === 'present');
    if (S.side) {
      const t = TABS.find((x) => x[0] === k);
      el.side.innerHTML = `<div class="mt-head"><h3>${t[1]} ${t[2]}</h3><button data-a="closeSide">✕</button></div><div id="mtBody"></div>`;
      T[k].build();
      if (k === 'chat') { unread = 0; }
    }
    renderDock();
  }
  const upd = (k) => { if (R && S.side === k) T[k].update?.(); };

  // -- members
  T.members = {
    build() { this.update(); },
    update() {
      const me = meM(), body = $('mtBody');
      const wl = mgr() ? R.waitlist.map((w) => `<div class="mt-card"><div>⏳ <b>${esc(w.name)}</b> xin vào phòng</div><div class="mt-acts"><button data-a="approve" data-tok="${w.tok}" data-ok="1">Duyệt</button><button data-a="approve" data-tok="${w.tok}" data-ok="0">Từ chối</button></div></div>`).join('') : '';
      const rows = [...R.members].sort((a, b) => ['host', 'cohost', 'presenter', 'participant', 'guest'].indexOf(a.role) - ['host', 'cohost', 'presenter', 'participant', 'guest'].indexOf(b.role)).map((m) => {
        const isMe = m.mid === R.you;
        const ctl = mgr() && !isMe && m.role !== 'host' && m.state === 'online' ? `
          <button data-a="mutem" data-id="${m.mid}" data-on="${m.muted ? 0 : 1}" title="${m.muted ? 'Cho phép nói' : 'Tắt micro'}">${m.muted ? '🔊' : '🔇'}</button>
          ${m.hand ? `<button data-a="lower" data-id="${m.mid}" title="Hạ tay">✋✕</button>` : ''}
          <select data-a="rolesel" data-id="${m.mid}">${['cohost', 'presenter', 'participant'].map((r) => `<option value="${r}" ${m.role === r ? 'selected' : ''} ${r === 'cohost' && meM().role !== 'host' ? 'disabled' : ''}>${ROLE[r]}</option>`).join('')}</select>
          ${me.role === 'host' ? `<button data-a="tohost" data-id="${m.mid}" title="Chuyển quyền chủ trì">👑</button>` : ''}
          <button data-a="kick" data-id="${m.mid}" title="Mời ra khỏi phòng">🚪✕</button>` : '';
        return `<div class="mt-card"><div>${m.speaking ? '🟢' : m.state === 'offline' ? '⚪' : '⚫'} <b>${esc(m.name)}</b>${isMe ? ' (bạn)' : ''} <span class="mt-chip">${ROLE[m.role]}</span>
          ${m.mic ? '🎤' : m.muted ? '🔇' : ''}${m.hand ? ' ✋' : ''}${m.state === 'offline' ? ' <small>mất kết nối</small>' : ''}</div><div class="mt-acts">${ctl}</div></div>`;
      }).join('');
      body.innerHTML = `${wl}<div class="mt-small">${R.members.filter((m) => m.state === 'online').length}/${R.meta.max} người trong phòng</div>${rows}`;
    },
  };

  // -- chat
  const chatLine = (c) => `<div class="mt-msg ${c.from === R.you ? 'me' : ''} ${c.to ? 'dm' : ''}" data-id="${c.id}"><small>${esc(c.name)}${c.to ? ` → ${c.from === R.you ? esc(c.toName) : 'bạn'} (riêng)` : ''} · ${fmtHM(c.ts)}${mgr() ? ` <a data-a="delmsg" data-id="${c.id}">xóa</a>` : ''}</small>
    <div>${esc(c.text)}${c.file ? `<br><a data-a="getfile" data-id="${c.id}">📎 ${esc(c.file.name)}</a>` : ''}</div></div>`;
  T.chat = {
    build() {
      $('mtBody').innerHTML = `<div id="mtChatList"></div><div class="mt-row"><select id="mtTo"></select></div>
        <div class="mt-row"><input id="mtChatIn" maxlength="500" placeholder="Nhập tin nhắn…" autocomplete="off"><button data-a="chatsend">Gửi</button>
        <button data-a="attach" title="Đính kèm tệp (≤ 400KB)">📎</button><input id="mtFile" type="file" hidden></div>
        ${R.meta.chatLock ? '<p class="mt-small">💬 Chat đang bị chủ trì khóa.</p>' : ''}`;
      $('mtChatList').innerHTML = R.chat.map(chatLine).join('');
      this.members();
      const l = $('mtChatList'); l.scrollTop = l.scrollHeight;
    },
    members() {
      const sel = $('mtTo'); if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = `<option value="">Gửi tới: Mọi người</option>${R.members.filter((m) => m.mid !== R.you && m.state === 'online').map((m) => `<option value="${m.mid}" ${cur === m.mid ? 'selected' : ''}>Riêng: ${esc(m.name)}</option>`).join('')}`;
    },
    add(c) { const l = $('mtChatList'); if (!l) return; const atEnd = l.scrollTop + l.clientHeight >= l.scrollHeight - 30; l.insertAdjacentHTML('beforeend', chatLine(c)); if (atEnd) l.scrollTop = l.scrollHeight; },
    update() { this.members(); },
  };
  function sendChat() {
    const i = $('mtChatIn'); if (!i) return;
    const text = i.value.trim(); if (!text) return;
    i.value = '';
    send({ k: 'chat', text, to: $('mtTo').value || null });
  }

  // -- presentation
  const SAMPLE = 'Chào mừng\nMục tiêu cuộc họp\nThống nhất kế hoạch quý\n\nNội dung chính\n- Tiến độ dự án\n- Rủi ro và đề xuất\n- Phân công công việc\n\nCảm ơn\nHỏi đáp';
  function parseSlides(text) {
    return text.split(/\n\s*\n/).map((b) => b.split('\n').map((s) => s.trim()).filter(Boolean)).filter((l) => l.length).map((l) => ({ t: l[0], b: l.slice(1).map((x) => x.replace(/^[-•*]\s*/, '')) }));
  }
  T.present = {
    build() {
      const p = R.pres, can = canPresent();
      $('mtBody').innerHTML = `<canvas id="mtPrev" width="640" height="360"></canvas>
        <div class="mt-row" id="mtPCtl"></div>
        ${can ? `<details open><summary>Tạo slide (mỗi slide cách nhau một dòng trống; dòng đầu là tiêu đề)</summary>
          <textarea id="mtSlides" rows="8">${esc(S.slideText || SAMPLE)}</textarea>
          <div class="mt-row"><input id="mtSTitle" maxlength="80" placeholder="Tên bài trình bày" value="${esc(p.title || '')}"><button data-a="showslides" class="mt-primary">Trình chiếu slide</button></div></details>
          <div class="mt-row"><button data-a="pickimg">🖼 Trình chiếu hình ảnh</button><input id="mtImg" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></div>`
          : '<p class="mt-small">Bạn chưa được cấp quyền trình chiếu. Hãy giơ tay để xin chủ trì.</p>'}
        <p class="mt-small">PDF/PowerPoint và chia sẻ màn hình chưa được hỗ trợ trong phiên bản này.</p>`;
      this.update();
    },
    update() {
      const p = R.pres, ctl = $('mtPCtl'); if (!ctl) return;
      const own = p.kind !== 'none' && (p.by === R.you || mgr());
      ctl.innerHTML = p.kind === 'none' ? '' : `<span class="mt-small">${esc(p.name || '')}: ${esc(p.title || (p.kind === 'image' ? 'Hình ảnh' : 'Slide'))}</span>
        ${own ? `${p.kind === 'slides' ? `<button data-a="slide" data-d="-1">◀</button><span>${p.i + 1}/${p.slides.length}</span><button data-a="slide" data-d="1">▶</button>` : ''}
        <button data-a="zoom" data-d="-0.25">➖</button><span>${Math.round(p.zoom * 100)}%</span><button data-a="zoom" data-d="0.25">➕</button><button data-a="stoppres" class="mt-danger">Dừng</button>` : ''}`;
      dirtyScreen = true;
    },
  };

  // -- whiteboard
  const bctx = () => $('mtBoard')?.getContext('2d');
  T.board = {
    build() {
      const can = canBoard();
      $('mtBody').innerHTML = `<div class="mt-tools">
          ${[['pen', '✏️'], ['line', '╱'], ['arrow', '➜'], ['rect', '▭'], ['ellipse', '◯'], ['text', 'T'], ['sticky', '🗒'], ['eraser', '🧽']].map(([k, i]) => `<button data-a="tool" data-k="${k}" class="${tool === k ? 'on' : ''}" ${can ? '' : 'disabled'}>${i}</button>`).join('')}
          <button data-a="wbimg" ${can ? '' : 'disabled'}>🖼</button><input id="mtWbImg" type="file" accept="image/*" hidden>
          ${COLORS.map((c) => `<i class="mt-sw ${c === color ? 'on' : ''}" data-a="color" data-c="${c}" style="background:${c}"></i>`).join('')}
          <input id="mtLw" type="range" min="1" max="20" value="${lw}" title="Độ dày">
          <button data-a="undo" ${can ? '' : 'disabled'}>↶</button><button data-a="redo" ${can ? '' : 'disabled'}>↷</button>
          ${mgr() ? '<button data-a="wbclear">🗑 Xóa hết</button>' : ''}<button data-a="wbexport">⬇ PNG</button></div>
        <canvas id="mtBoard" width="${BOARD_W}" height="${BOARD_H}"></canvas>
        ${can ? '' : '<p class="mt-small">Bạn chỉ có quyền xem bảng trắng. Nhờ chủ trì cấp quyền.</p>'}`;
      bindBoard(); dirtyBoard = true;
    },
    update() { dirtyBoard = true; },
  };
  let draft = null;
  const hitDist = (el, x, y) => {
    if (el.t === 'pen') { let d = 1e9; for (let i = 0; i < el.p.length; i += 2) d = Math.min(d, Math.hypot(el.p[i] - x, el.p[i + 1] - y)); return d; }
    const [x0, y0, x1, y1] = el.t === 'text' ? [el.x, el.y, el.x + 400, el.y + el.fs * 1.4] : el.t === 'sticky' ? [el.x, el.y, el.x + 260, el.y + 200]
      : el.t === 'img' ? [el.x, el.y, el.x + el.w, el.y + el.h] : [Math.min(el.x, el.x2), Math.min(el.y, el.y2), Math.max(el.x, el.x2), Math.max(el.y, el.y2)];
    return x >= x0 - 10 && x <= x1 + 10 && y >= y0 - 10 && y <= y1 + 10 ? 0 : 1e9;
  };
  const newId = () => `${R.you}${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  function addEl(el) {
    R.wb.push(el); undo.push(el.id); redo.length = 0; dirtyBoard = true;
    send({ k: 'wb', op: 'add', el });
  }
  function bindBoard() {
    const cv = $('mtBoard'); if (!cv) return;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * BOARD_W / r.width), Math.round((e.clientY - r.top) * BOARD_H / r.height)]; };
    let start = null;
    cv.onpointerdown = (e) => {
      if (!canBoard()) return;
      const [x, y] = pt(e);
      if (tool === 'eraser') {
        for (let i = R.wb.length - 1; i >= 0; i--) if (hitDist(R.wb[i], x, y) < 14) { const [d] = R.wb.splice(i, 1); send({ k: 'wb', op: 'del', id: d.id }); redo.push(d); dirtyBoard = true; break; }
        return;
      }
      if (tool === 'text' || tool === 'sticky') {
        const s = prompt(tool === 'text' ? 'Nội dung văn bản:' : 'Nội dung ghi chú:');
        if (s?.trim()) addEl({ id: newId(), t: tool, c: tool === 'sticky' ? '#fff3a0' : color, lw, x, y, s: s.trim().slice(0, 200), fs: tool === 'text' ? 18 + lw * 2 : 24 });
        return;
      }
      cv.setPointerCapture(e.pointerId);
      start = [x, y];
      draft = tool === 'pen' ? { id: 'd', t: 'pen', c: color, lw, p: [x, y] } : { id: 'd', t: tool, c: color, lw, x, y, x2: x, y2: y };
    };
    cv.onpointermove = (e) => {
      if (!draft) return;
      const [x, y] = pt(e);
      if (draft.t === 'pen') { const n = draft.p.length; if (Math.hypot(x - draft.p[n - 2], y - draft.p[n - 1]) > 3 && n < 780) draft.p.push(x, y); } else { draft.x2 = x; draft.y2 = y; }
      dirtyBoard = true;
    };
    cv.onpointerup = () => {
      if (!draft) return;
      const d = draft; draft = null;
      if (d.t === 'pen' || Math.hypot(d.x2 - d.x, d.y2 - d.y) > 4) addEl({ ...d, id: newId() });
      dirtyBoard = true;
    };
  }
  function undoBoard() {
    const id = undo.pop(); if (!id) return;
    const i = R.wb.findIndex((x) => x.id === id); if (i < 0) return;
    const [d] = R.wb.splice(i, 1); redo.push(d); send({ k: 'wb', op: 'del', id }); dirtyBoard = true;
  }
  function redoBoard() {
    const d = redo.pop(); if (!d) return;
    R.wb.push(d); undo.push(d.id); send({ k: 'wb', op: 'add', el: d }); dirtyBoard = true;
  }

  // -- polls
  T.poll = {
    build() {
      $('mtBody').innerHTML = `<div id="mtPoll"></div>${mgr() ? `<details><summary>➕ Tạo biểu quyết mới</summary><div class="mt-form">
        <label>Câu hỏi<input id="pQ" maxlength="160"></label>
        <label>Phương án (mỗi dòng một phương án, 2–8)<textarea id="pOpts" rows="4">Đồng ý\nKhông đồng ý\nTrắng</textarea></label>
        <div class="mt-row"><label class="mt-check"><input id="pMulti" type="checkbox"> Chọn nhiều</label><label class="mt-check"><input id="pAnon" type="checkbox"> Ẩn danh</label>
        <label>Thời gian (giây, 0 = không giới hạn)<input id="pSecs" type="number" min="0" max="3600" value="0"></label></div>
        <button data-a="pollcreate" class="mt-primary">Bắt đầu biểu quyết</button></div></details>` : ''}`;
      this.update();
    },
    update() {
      const box = $('mtPoll'); if (!box) return;
      const p = R.poll;
      if (!p) { box.innerHTML = '<p class="mt-small">Chưa có cuộc biểu quyết nào.</p>'; return; }
      const open = !p.closed, tot = Math.max(1, p.total);
      box.innerHTML = `<div class="mt-card col"><b>${esc(p.q)}</b> <span class="mt-chip ${open ? 'active' : 'ended'}">${open ? 'Đang mở' : 'Đã đóng'}</span>
        <small>${p.multi ? 'Chọn nhiều' : 'Chọn một'} · ${p.anon ? 'Ẩn danh' : 'Công khai'} · ${p.total} phiếu${open && p.endsAt ? ` · còn <span id="mtPollT"></span>` : ''}</small>
        ${p.opts.map((o, i) => `<label class="mt-opt"><input type="${p.multi ? 'checkbox' : 'radio'}" name="pv" data-a="vote" data-i="${i}" ${p.mine.includes(i) ? 'checked' : ''} ${open ? '' : 'disabled'}>
          <span class="mt-bar"><i style="width:${(p.counts[i] / tot) * 100}%"></i><span>${esc(o.t)} — <b>${p.counts[i]}</b></span></span></label>
          ${p.voters?.[i]?.length ? `<small>${p.voters[i].map(esc).join(', ')}</small>` : ''}`).join('')}
        <div class="mt-row">${open && mgr() ? '<button data-a="pollclose">Đóng biểu quyết</button>' : ''}<button data-a="pollcsv">⬇ Xuất CSV</button></div></div>`;
    },
  };

  // -- minutes + action items
  T.notes = {
    build() {
      const can = canNotes();
      $('mtBody').innerHTML = `<label>Nội dung thảo luận<textarea id="nDisc" rows="6" ${can ? '' : 'readonly'}></textarea></label>
        <label>Kết luận<textarea id="nConc" rows="3" ${can ? '' : 'readonly'}></textarea></label>
        <div class="mt-small" id="nMeta"></div>
        <b>Công việc sau họp (Action Items)</b><div id="nActs"></div>
        ${can ? `<div class="mt-row"><input id="aTask" maxlength="200" placeholder="Công việc"><select id="aWho"></select><input id="aDue" type="date"><button data-a="actadd">Thêm</button></div>` : ''}
        <div class="mt-row">${can ? '<button data-a="savever">💾 Lưu phiên bản</button>' : ''}${R.members.find((m) => m.mid === R.you)?.role === 'host' ? '<button data-a="approvemin" class="mt-primary">✔ Xác nhận biên bản</button>' : ''}</div>
        <div class="mt-row"><button data-a="exp" data-k="pdf">PDF</button><button data-a="exp" data-k="doc">DOCX</button><button data-a="exp" data-k="txt">TXT</button><button data-a="attend">📊 Điểm danh</button></div>`;
      $('nDisc').value = R.notes.discussion; $('nConc').value = R.notes.conclusion;
      for (const [id, f] of [['nDisc', 'discussion'], ['nConc', 'conclusion']]) {
        let t; $(id).oninput = () => { clearTimeout(t); t = setTimeout(() => send({ k: 'notes', f, v: $(id).value }), 500); };
      }
      this.update();
    },
    update() {
      if (!$('nActs')) return;
      for (const [id, f] of [['nDisc', 'discussion'], ['nConc', 'conclusion']]) if (document.activeElement !== $(id)) $(id).value = R.notes[f];
      $('nMeta').innerHTML = `${R.notes.by ? `Sửa lần cuối: ${esc(R.notes.by)} lúc ${fmtHM(R.notes.at)} · ` : ''}${R.approval ? `✔ Đã xác nhận bởi ${esc(R.approval.by)} (${fmtTime(R.approval.at)})` : 'Chưa xác nhận'} · ${R.versions.length} phiên bản`;
      const who = $('aWho'); if (who && !who.options.length) who.innerHTML = `<option value="">Người phụ trách</option>${R.members.map((m) => `<option>${esc(m.name)}</option>`).join('')}`;
      $('nActs').innerHTML = R.actions.map((a) => `<div class="mt-card"><div><label class="mt-check"><input type="checkbox" data-a="actdone" data-id="${a.id}" ${a.done ? 'checked' : ''} ${canNotes() ? '' : 'disabled'}> <span class="${a.done ? 'done' : ''}">${esc(a.task)}</span></label>
        <small>${esc(a.who || 'Chưa giao')}${a.due ? ' · hạn ' + esc(a.due) : ''}</small></div>${canNotes() ? `<div class="mt-acts"><button data-a="actdel" data-id="${a.id}">🗑</button></div>` : ''}</div>`).join('') || '<p class="mt-small">Chưa có công việc.</p>';
    },
  };

  // -- agenda
  T.agenda = {
    build() {
      $('mtBody').innerHTML = `<div id="agList"></div>${mgr() ? '<div class="mt-row"><input id="agT" maxlength="100" placeholder="Nội dung"><input id="agM" type="number" min="0" max="300" value="10" style="width:70px" title="Phút"><button data-a="agadd">Thêm</button></div>' : ''}`;
      this.update();
    },
    update() {
      const l = $('agList'); if (!l) return;
      l.innerHTML = R.agenda.map((a, i) => `<div class="mt-card ${i === R.agendaIdx ? 'cur' : ''}"><div><label class="mt-check"><input type="checkbox" data-a="agdone" data-id="${a.id}" ${a.done ? 'checked' : ''} ${mgr() ? '' : 'disabled'}>
        <span class="${a.done ? 'done' : ''}">${esc(a.title)}</span></label> <small>${a.min} phút${i === R.agendaIdx ? ' · <span id="agClock"></span>' : ''}</small></div>
        ${mgr() ? `<div class="mt-acts"><button data-a="agcur" data-id="${a.id}">▶</button><button data-a="agdel" data-id="${a.id}">🗑</button></div>` : ''}</div>`).join('') || '<p class="mt-small">Chưa có chương trình họp.</p>';
    },
  };

  // -- control
  T.control = {
    build() {
      const m = R.meta, me = meM(), isHost = me?.role === 'host', edit = isHost || (me?.role === 'cohost' && m.cohostEdit);
      const chk = (id, label, v, on) => `<label class="mt-check"><input type="checkbox" data-a="setting" data-f="${id}" ${v ? 'checked' : ''} ${on ? '' : 'disabled'}> ${label}</label>`;
      $('mtBody').innerHTML = `<div class="mt-small">${esc(m.desc) || 'Không có mô tả'}<br>${TPL[m.tpl]} · chủ trì: ${esc(m.hostName)}</div>
        ${mgr() ? `<div class="mt-row"><button data-a="lock">${m.locked ? '🔓 Mở khóa phòng' : '🔒 Khóa phòng'}</button><button data-a="muteall" data-on="1">🔇 Tắt mic tất cả</button><button data-a="muteall" data-on="0">🔊 Cho phép bật mic</button></div>` : ''}
        ${chk('chatLock', 'Khóa chat của thành viên', m.chatLock, isHost)}${chk('allowPresent', 'Cho phép thành viên trình chiếu', m.allowPresent, isHost)}
        ${chk('allowBoard', 'Cho phép thành viên dùng bảng trắng', m.allowBoard, isHost)}${chk('speakOnly', 'Chế độ giới hạn phát biểu (chỉ người có quyền)', m.speakOnly, isHost)}
        ${chk('cohostEdit', 'Đồng chủ trì được sửa cấu hình phòng', m.cohostEdit, isHost)}
        ${edit ? `<details><summary>✏️ Sửa thông tin phòng</summary><div class="mt-form"><label>Tên<input id="eName" maxlength="60" value="${esc(m.name)}"></label>
          <label>Mô tả<textarea id="eDesc" rows="2" maxlength="400">${esc(m.desc)}</textarea></label>
          <div class="mt-row"><label>Tối đa<input id="eMax" type="number" min="2" max="${TPLMAX[m.tpl]}" value="${m.max}"></label>
          <label>Riêng tư<select id="ePriv"><option value="0">Công khai</option><option value="1" ${m.priv ? 'selected' : ''}>Riêng tư</option></select></label></div>
          <label>Mật khẩu mới (để trống = giữ nguyên, “-” = bỏ mật khẩu)<input id="ePass" type="password" maxlength="32"></label>
          <label class="mt-check"><input id="eWait" type="checkbox" ${m.waiting ? 'checked' : ''}> Phòng chờ</label>
          <button data-a="saveedit" class="mt-primary">Lưu</button></div></details>` : ''}
        <div class="mt-row"><button data-a="attend">📊 Điểm danh</button>${isHost ? '<button data-a="endmeeting" class="mt-danger">⏹ Kết thúc cuộc họp</button>' : ''}</div>
        ${isHost ? `<label>Khi chủ trì rời phòng<select data-a="setting" data-f="onHostLeave"><option value="transfer" ${m.onHostLeave === 'transfer' ? 'selected' : ''}>Chuyển quyền chủ trì</option><option value="end" ${m.onHostLeave === 'end' ? 'selected' : ''}>Kết thúc cuộc họp</option></select></label>` : ''}
        <p class="mt-small">Ghi hình, dịch thuật, trợ lý AI và phòng họp nhóm chưa có trong phiên bản này.</p>`;
    },
  };

  // ---------- record view and exports ----------
  function minutesHtml(rec) {
    const m = rec.meta, e = esc;
    const sess = (s) => s.map((x) => `${fmtHM(x.in)}–${x.out ? fmtHM(x.out) : '…'}`).join(', ');
    return `<h1>BIÊN BẢN CUỘC HỌP</h1><h2>${e(m.name)}</h2>
      <p>Mã phòng: ${e(m.code)} · Phòng ảo · Chủ trì: ${e(m.hostName)}<br>Thời gian: ${fmtTime(rec.created)}${rec.endedAt ? ' – ' + fmtTime(rec.endedAt) : ''}<br>${e(m.desc)}</p>
      <h3>Thành phần tham dự</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>Họ tên</th><th>Vai trò</th><th>Thời gian tham gia</th></tr>
      ${rec.attendance.filter((a) => a.sessions.length).map((a) => `<tr><td>${e(a.name)}</td><td>${ROLE[a.role] || a.role}</td><td>${sess(a.sessions)}</td></tr>`).join('')}</table>
      <h3>Chương trình</h3><ol>${rec.agenda.map((a) => `<li>${e(a.title)} (${a.min} phút)${a.done ? ' ✔' : ''}</li>`).join('') || '<li>—</li>'}</ol>
      <h3>Nội dung thảo luận</h3><p>${e(rec.notes.discussion).replace(/\n/g, '<br>') || '—'}</p>
      <h3>Kết luận</h3><p>${e(rec.notes.conclusion).replace(/\n/g, '<br>') || '—'}</p>
      <h3>Biểu quyết</h3>${rec.polls.map((p) => `<p><b>${e(p.q)}</b> (${p.total} phiếu): ${p.opts.map((o) => `${e(o.t)} = ${o.n}`).join('; ')}</p>`).join('') || '<p>—</p>'}
      <h3>Công việc sau họp</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>Công việc</th><th>Người thực hiện</th><th>Hạn</th><th>Trạng thái</th></tr>
      ${rec.actions.map((a) => `<tr><td>${e(a.task)}</td><td>${e(a.who)}</td><td>${e(a.due)}</td><td>${a.done ? 'Hoàn thành' : 'Chưa xong'}</td></tr>`).join('')}</table>
      <p>Trạng thái xác nhận: ${rec.approval ? `Đã xác nhận bởi ${e(rec.approval.by)} lúc ${fmtTime(rec.approval.at)}` : 'Chưa xác nhận'} · ${rec.versions.length} phiên bản</p>`;
  }
  function textMinutes(rec) {
    const m = rec.meta;
    return [`BIÊN BẢN CUỘC HỌP: ${m.name}`, `Mã phòng: ${m.code} · Chủ trì: ${m.hostName}`, `Thời gian: ${fmtTime(rec.created)}`, '',
      'THÀNH PHẦN THAM DỰ', ...rec.attendance.filter((a) => a.sessions.length).map((a) => `- ${a.name} (${ROLE[a.role] || a.role})`), '', 'CHƯƠNG TRÌNH', ...rec.agenda.map((a, i) => `${i + 1}. ${a.title} (${a.min} phút)`), '',
      'THẢO LUẬN', rec.notes.discussion, '', 'KẾT LUẬN', rec.notes.conclusion, '', 'CÔNG VIỆC', ...rec.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.task} — ${a.who || '?'} — ${a.due || 'không hạn'}`)].join('\n');
  }
  function exportRecord(rec, kind) {
    const base = `bien-ban-${rec.meta.code}`;
    if (kind === 'txt') return download(`${base}.txt`, 'text/plain;charset=utf-8', textMinutes(rec));
    if (kind === 'csv') {
      const rows = [['Họ tên', 'Vai trò', 'Vào', 'Ra'], ...rec.attendance.flatMap((a) => a.sessions.map((s) => [a.name, ROLE[a.role] || a.role, new Date(s.in).toLocaleString('vi-VN'), s.out ? new Date(s.out).toLocaleString('vi-VN') : '']))];
      return download(`diem-danh-${rec.meta.code}.csv`, 'text/csv;charset=utf-8', '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n'));
    }
    const html = `<html><head><meta charset="utf-8"><title>${esc(rec.meta.name)}</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}</style></head><body>${minutesHtml(rec)}</body></html>`;
    if (kind === 'doc') return download(`${base}.doc`, 'application/msword', html);
    const w = window.open('', '_blank');
    if (!w) return toast('Trình duyệt chặn cửa sổ in. Hãy cho phép popup.');
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  function showRecord(rec) {
    const att = rec.attendance.filter((a) => a.sessions.length);
    el.modal.hidden = false;
    S.record = rec;
    el.modal.innerHTML = `<div class="mt-box wide"><div class="mt-head"><h3>📝 ${esc(rec.meta.name)}</h3><button data-a="closeModal">✕</button></div>
      <div class="mt-row"><button data-a="recexp" data-k="pdf">PDF</button><button data-a="recexp" data-k="doc">DOCX</button><button data-a="recexp" data-k="txt">TXT</button><button data-a="recexp" data-k="csv">Điểm danh CSV</button></div>
      <div class="mt-doc">${minutesHtml(rec).replace(/<h1>.*?<\/h1>/, '')}</div></div>`;
    if (!att.length) el.modal.querySelector('.mt-doc').insertAdjacentHTML('afterbegin', '<p class="mt-small">Chưa có dữ liệu điểm danh.</p>');
  }

  // ---------- network ----------
  function onMsg(m) {
    switch (m.k) {
      case 'rooms': S.rooms = m.rooms; S.hist = m.history; S.skew = m.now - Date.now(); renderLobby(); checkReminders(); break;
      case 'created':
        if (S.afterCreate) joinRoom(m.code, S.pendingPass || '', '');
        else { toast(`Đã lên lịch họp. Mã phòng: ${m.code}`); S.tab = 'sched'; refreshList(); }
        break;
      case 'joined': enterRoom(m.room); break;
      case 'wait':
        S.wait = m.code; closeLobby(); el.wait.hidden = false;
        el.wait.innerHTML = `<div class="mt-box"><h3>⏳ Phòng chờ</h3><p>Đang chờ chủ trì duyệt bạn vào “${esc(m.name)}”…</p><button data-a="cancelwait">Hủy</button></div>`;
        break;
      case 'denied': el.wait.hidden = true; S.wait = null; toast(DENY[m.why] || 'Không thể vào phòng.'); if (!R) openLobby(); break;
      case 'err': toast(m.text); break;
      case 'toast': toast(m.text); refreshList(); break;
      case 'record':
        if (pendingExport) { const k = pendingExport; pendingExport = null; exportRecord(m.record, k); } else showRecord(m.record);
        break;
      case 'kicked': if (m.why === 'dup') leaveLocal('Bạn đã mở phòng này ở một thẻ khác.'); else leaveLocal('Bạn đã bị mời ra khỏi phòng.'); break;
      case 'ended': leaveLocal('Cuộc họp đã kết thúc. Biên bản được lưu trong Lịch sử.'); break;
    }
    if (!R) return;
    switch (m.k) {
      case 'members': {
        const old = R.members;
        R.members = m.members;
        const was = old.find((x) => x.mid === R.you), now = meM();
        if (was && now && was.role !== now.role) toast(`Vai trò của bạn: ${ROLE[now.role]}`);
        if (!now) return leaveLocal();
        applyMembers(); renderDock(); upd('members'); T.chat.members();
        break;
      }
      case 'meta': R.meta = m.meta; renderTop(); renderDock(); if (S.side === 'control') T.control.build(); dirtyScreen = true; break;
      case 'sys': note(m.text, 'sys'); if (S.side === 'chat') T.chat.add({ id: 's' + Math.random(), from: '', name: 'Hệ thống', text: m.text, ts: nowMs(), to: null }); break;
      case 'chat':
        R.chat.push(m.msg);
        if (S.side === 'chat') T.chat.add(m.msg); else if (m.msg.from !== R.you) { unread++; renderDock(); note(`${m.msg.name}: ${m.msg.text || '📎 ' + m.msg.file.name}`, 'chat'); }
        actor(R.members.find((x) => x.mid === m.msg.from)?.pid)?.avatar.say(m.msg.text || '📎', 6);
        break;
      case 'delmsg': R.chat = R.chat.filter((c) => c.id !== m.id); document.querySelector(`.mt-msg[data-id="${m.id}"]`)?.remove(); break;
      case 'pres': R.pres = m.pres; upd('present'); if (S.side === 'present') T.present.build(); dirtyScreen = true; break;
      case 'slide': R.pres.i = m.i; R.pres.zoom = m.zoom; upd('present'); dirtyScreen = true; break;
      case 'wb':
        if (m.op === 'add') R.wb.push(m.el); else if (m.op === 'del') R.wb = R.wb.filter((x) => x.id !== m.id); else R.wb = [];
        dirtyBoard = true; break;
      case 'poll': { const fresh = !R.poll || R.poll.id !== m.poll?.id; R.poll = m.poll; if (fresh && m.poll && !m.poll.closed) toast(`🗳 Biểu quyết: ${m.poll.q}`); upd('poll'); break; }
      case 'notes': R.notes = m.notes; R.approval = m.approval; upd('notes'); break;
      case 'actions': R.actions = m.actions; R.approval = m.approval; upd('notes'); break;
      case 'approval': R.approval = m.approval; R.versions = m.versions; upd('notes'); toast(m.approval ? '✔ Biên bản đã được xác nhận' : 'Đã lưu phiên bản'); break;
      case 'agenda': R.agenda = m.agenda; R.agendaIdx = m.agendaIdx; R.agendaStart = m.agendaStart; upd('agenda'); break;
      case 'waitlist': {
        const prev = R.waitlist.length;
        R.waitlist = m.list;
        if (m.list.length > prev) note(`⏳ ${m.list[m.list.length - 1].name} xin vào phòng`, 'sys');
        renderDock(); upd('members'); break;
      }
      case 'st': {
        const t = R.members.find((x) => x.mid === m.mid);
        if (t) { if (m.mic !== undefined) t.mic = m.mic; if (m.speaking !== undefined) t.speaking = m.speaking; }
        if (m.mid === R.you && m.mic !== undefined) { micOn = m.mic; renderDock(); }
        upd('members'); break;
      }
      case 'react': actor(R.members.find((x) => x.mid === m.mid)?.pid)?.avatar.say(m.e, 3); break;
      case 'gest': actor(R.members.find((x) => x.mid === m.mid)?.pid)?.human.setGesture(m.g, 3); break;
      case 'forcemute': micOn = false; voice.setMic(false); renderDock(); toast('Chủ trì đã tắt micro của bạn. Giơ tay để xin phát biểu.'); break;
      case 'unmuted': toast('Bạn có thể bật micro.'); break;
      case 'sig': voice.onSignal(m.from, m.data); break;
      case 'seatfail': toast('Chỗ này đã có người ngồi.'); break;
    }
  }

  // ---------- UI events ----------
  const onClick = async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type !== 'checkbox' && b.type !== 'radio')) return;
    const a = b.dataset.a, d = b.dataset;
    switch (a) {
      case 'closeLobby': return closeLobby();
      case 'closeModal': el.modal.hidden = true; return;
      case 'closeSide': return openSide(S.side);
      case 'tab': S.tab = d.k; if (S.tab === 'create') S.afterCreate = true; return renderLobby();
      case 'joincode': return joinRoom($('mtCode').value, $('mtPass').value, new URLSearchParams(location.search).get('room') ? 'link' : '');
      case 'joinroom': {
        let pass = '';
        if (d.pass === '1') { pass = prompt('Nhập mật khẩu phòng:') ?? null; if (pass === null) return; }
        return joinRoom(d.code, pass, '');
      }
      case 'micTest': return micTest();
      case 'create': return createRoom();
      case 'cancelroom': return send({ k: 'cancel', code: d.code });
      case 'delroom': if (confirm('Xóa phòng này?')) { send({ k: 'delete', code: d.code }); } return;
      case 'rec': return send({ k: 'hist', code: d.code });
      case 'cancelwait': send({ k: 'leave' }); el.wait.hidden = true; S.wait = null; return openLobby();
      case 'copylink': {
        const url = `${location.origin}${location.pathname}?room=${R.meta.code}`;
        try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết mời.'); } catch { prompt('Sao chép liên kết:', url); }
        return;
      }
    }
    if (!R) return;
    switch (a) {
      case 'mic': return setMic(!micOn);
      case 'hand': send({ k: 'hand', on: !meM().hand }); return;
      case 'emo': $('mtEmo').hidden = !$('mtEmo').hidden; return;
      case 'react': send({ k: 'react', e: d.e }); $('mtEmo').hidden = true; return;
      case 'gest': actor(meM().pid)?.human.setGesture(d.g, 3); send({ k: 'gest', g: d.g }); $('mtEmo').hidden = true; return;
      case 'sit': return toggleSit();
      case 'side': return openSide(d.k);
      case 'leave': if (confirm('Rời khỏi phòng họp?')) send({ k: 'leave' }); return;
      case 'approve': return send({ k: 'approve', tok: d.tok, ok: d.ok === '1' });
      case 'mutem': return send({ k: 'mute', mid: d.id, on: d.on === '1' });
      case 'lower': return send({ k: 'lower', mid: d.id });
      case 'tohost': if (confirm('Chuyển quyền chủ trì cho người này?')) send({ k: 'host', mid: d.id }); return;
      case 'kick': if (confirm('Mời người này ra khỏi phòng?')) send({ k: 'kick', mid: d.id }); return;
      case 'chatsend': return sendChat();
      case 'attach': return $('mtFile').click();
      case 'delmsg': return send({ k: 'delmsg', id: d.id });
      case 'getfile': { const c = R.chat.find((x) => x.id === d.id); if (c?.file) { const l = document.createElement('a'); l.href = c.file.d; l.download = c.file.name; l.click(); } return; }
      case 'showslides': { S.slideText = $('mtSlides').value; const slides = parseSlides(S.slideText); return slides.length ? send({ k: 'pres', kind: 'slides', title: $('mtSTitle').value, slides }) : toast('Hãy nhập nội dung slide.'); }
      case 'pickimg': return $('mtImg').click();
      case 'slide': return send({ k: 'slide', i: R.pres.i + +d.d, zoom: R.pres.zoom });
      case 'zoom': return send({ k: 'slide', i: R.pres.i, zoom: Math.max(0.5, Math.min(3, R.pres.zoom + +d.d)) });
      case 'stoppres': return send({ k: 'pres', kind: 'none' });
      case 'tool': tool = d.k; return T.board.build();
      case 'color': color = d.c; return T.board.build();
      case 'undo': return undoBoard();
      case 'redo': return redoBoard();
      case 'wbclear': if (confirm('Xóa toàn bộ bảng trắng?')) { R.wb = []; send({ k: 'wb', op: 'clear' }); dirtyBoard = true; } return;
      case 'wbexport': { bctx().canvas.toBlob((bl) => download(`bang-trang-${R.meta.code}.png`, 'image/png', bl)); return; }
      case 'wbimg': return $('mtWbImg').click();
      case 'pollcreate': return send({ k: 'poll', op: 'create', q: $('pQ').value, opts: $('pOpts').value.split('\n'), multi: $('pMulti').checked, anon: $('pAnon').checked, secs: +$('pSecs').value });
      case 'pollclose': return send({ k: 'poll', op: 'close' });
      case 'vote': {
        const p = R.poll, boxes = [...document.querySelectorAll('#mtPoll input[data-a=vote]')];
        return send({ k: 'poll', op: 'vote', id: p.id, v: boxes.filter((x) => x.checked).map((x) => +x.dataset.i) });
      }
      case 'pollcsv': {
        const p = R.poll; if (!p) return;
        return download('bieu-quyet.csv', 'text/csv;charset=utf-8', '﻿' + [['Phương án', 'Số phiếu', 'Người bầu'], ...p.opts.map((o, i) => [o.t, p.counts[i], p.voters?.[i]?.join('; ') || ''])].map((r) => r.map(csvCell).join(',')).join('\n'));
      }
      case 'actadd': { const t = $('aTask').value.trim(); if (!t) return; send({ k: 'action', op: 'add', task: t, who: $('aWho').value, due: $('aDue').value }); $('aTask').value = ''; return; }
      case 'actdone': return send({ k: 'action', op: 'upd', id: d.id, done: b.checked });
      case 'actdel': return send({ k: 'action', op: 'del', id: d.id });
      case 'savever': return send({ k: 'savever' });
      case 'approvemin': return send({ k: 'approvemin' });
      case 'exp': pendingExport = d.k; return send({ k: 'hist', code: R.meta.code });
      case 'attend': return send({ k: 'hist', code: R.meta.code });
      case 'agadd': { const t = $('agT').value.trim(); if (t) { send({ k: 'agenda', op: 'add', title: t, min: +$('agM').value }); $('agT').value = ''; } return; }
      case 'agdone': return send({ k: 'agenda', op: 'done', id: d.id });
      case 'agcur': return send({ k: 'agenda', op: 'cur', id: d.id });
      case 'agdel': return send({ k: 'agenda', op: 'del', id: d.id });
      case 'lock': return send({ k: 'lock', on: !R.meta.locked });
      case 'muteall': return send({ k: 'muteall', on: d.on === '1' });
      case 'setting': if (b.tagName === 'INPUT') send({ k: 'edit', [d.f]: b.checked }); return;
      case 'saveedit': { const p = $('ePass').value; return send({ k: 'edit', name: $('eName').value, desc: $('eDesc').value, max: +$('eMax').value, priv: $('ePriv').value === '1', waiting: $('eWait').checked, ...(p ? { pass: p === '-' ? '' : p } : {}) }); }
      case 'endmeeting': if (confirm('Kết thúc cuộc họp cho tất cả mọi người?')) send({ k: 'end' }); return;
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'mtF') { S.filter = t.value; renderLobby(); }
    else if (t.dataset.a === 'rolesel') send({ k: 'role', mid: t.dataset.id, role: t.value });
    else if (t.dataset.a === 'setting' && t.tagName === 'SELECT') send({ k: 'edit', [t.dataset.f]: t.value });
    else if (t.id === 'mtFile' && t.files[0]) {
      const f = t.files[0]; t.value = '';
      if (f.size > 400_000) return toast('Tệp quá lớn (tối đa 400 KB).');
      const fr = new FileReader();
      fr.onload = () => send({ k: 'chat', text: '', to: $('mtTo').value || null, file: { name: f.name, type: f.type, d: fr.result } });
      fr.readAsDataURL(f);
    } else if (t.id === 'mtImg' && t.files[0]) {
      const f = t.files[0]; t.value = '';
      readImage(f, 1600, 0.82).then(({ d }) => send({ k: 'pres', kind: 'image', title: f.name.slice(0, 60), d })).catch((er) => toast(er.message));
    } else if (t.id === 'mtWbImg' && t.files[0]) {
      const f = t.files[0]; t.value = '';
      readImage(f, 600, 0.75).then(({ d, w, h }) => addEl({ id: newId(), t: 'img', c: '#000000', lw: 1, x: 100, y: 100, w, h, d })).catch((er) => toast(er.message));
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'mtQ') { S.q = t.value; renderLobby(); }
    else if (t.id === 'mtCode') S.code = t.value;
    else if (t.id === 'mtLw') lw = +t.value;
    else if (t.id === 'mtVol') { const v = +t.value / 100; voice.setVolume(v); lsSet('meet.vol', t.value); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && e.target.id === 'mtChatIn') { e.preventDefault(); sendChat(); }
    else if (e.key === 'Enter' && e.target.id === 'mtCode') { e.preventDefault(); joinRoom($('mtCode').value, $('mtPass').value, ''); }
    else if (e.key === 'Escape') { e.target.blur?.(); if (S.lobby) closeLobby(); else if (!el.modal.hidden) el.modal.hidden = true; }
    e.stopPropagation();
  });

  async function setMic(on) {
    const me = meM();
    if (on && me.muted) return toast('Chủ trì đang tắt micro của bạn. Hãy giơ tay xin phát biểu.');
    if (on && R.meta.speakOnly && !mgr() && me.role !== 'presenter') return toast('Phòng đang ở chế độ giới hạn phát biểu.');
    if (on && !(await voice.setMic(true))) return toast('Không truy cập được micro. Hãy cấp quyền cho trình duyệt.');
    if (!on) await voice.setMic(false);
    micOn = on; send({ k: 'mic', on }); renderDock();
  }

  function toggleSit() {
    const me = meM(), g = actor(me.pid)?.avatar.group;
    if (!g) return;
    if (me.seat >= 0) return send({ k: 'stand' });
    let best = -1, bd = 4;
    const taken = new Set(R.members.filter((m) => m.seat >= 0 && m.state === 'online').map((m) => m.seat));
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (taken.has(i)) continue;
      const s = seatPos(i), d = Math.hypot(s.x - g.position.x, s.z - g.position.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return toast('Hãy đến gần một chiếc ghế trống.');
    send({ k: 'seat', i: best });
  }

  function checkReminders() {
    for (const r of S.rooms) {
      if (!r.start || !['scheduled', 'waiting'].includes(r.status) || !(r.mine || r.invited) || S.remind.has(r.code)) continue;
      const left = r.start - nowMs();
      if (left < 5 * 60_000 && left > -30 * 60_000) {
        S.remind.add(r.code);
        const text = `Cuộc họp “${r.name}” sắp bắt đầu lúc ${fmtHM(r.start)} (mã ${r.code}).`;
        toast('⏰ ' + text);
        try { if (Notification.permission === 'granted') new Notification('Nhắc lịch họp', { body: text }); } catch {}
      }
    }
  }

  // ---------- per-frame ----------
  let tickAt = 0;
  function update(dt, me) {
    room.update(dt);
    const t = performance.now();
    if (!R) {
      if (t - S.listAt > (S.lobby ? 4000 : 60000)) { if (me) refreshList(); S.listAt = t; }
      if (dirtyScreen && t - boardAt > 500) { boardAt = t; paintScreen(); dirtyScreen = false; }
      return;
    }
    voice.update();
    if (dirtyBoard && t - boardAt > 120) { boardAt = t; paintBoard(); dirtyBoard = false; }
    if (dirtyScreen) { paintScreen(); dirtyScreen = false; }
    if (t - tickAt > 1000) { // clocks, hologram, poll timer
      tickAt = t;
      const run = R.meta.startedAt ? nowMs() - R.meta.startedAt : 0;
      const tm = $('mtTimer'); if (tm) tm.textContent = clock(run);
      const p = R.poll, pt = $('mtPollT'); if (pt && p?.endsAt) pt.textContent = clock(p.endsAt - nowMs()).slice(3);
      const ag = R.agenda[R.agendaIdx], agc = $('agClock');
      if (agc && ag && R.agendaStart) agc.textContent = clock(ag.min * 60000 - (nowMs() - R.agendaStart));
      paintHolo(run);
    }
    if (me && t > joinGrace && !room.contains(me.x, me.z) && !S.leaving) { S.leaving = true; send({ k: 'leave' }); setTimeout(() => (S.leaving = false), 2000); }
  }

  const info = () => ({ name: R?.meta.name, code: R?.meta.code });
  function paintScreen() {
    const s = room.screen;
    drawScreen(s.g, s.w, s.h, R ? R.pres : { kind: 'none' }, info(), () => { dirtyScreen = true; });
    s.tex.needsUpdate = true;
    const pv = $('mtPrev'); if (pv && R) pv.getContext('2d').drawImage(s.c, 0, 0, pv.width, pv.height);
  }
  function paintBoard() {
    const g = room.board.g;
    drawBoard(g, R ? R.wb : [], draft, () => { dirtyBoard = true; });
    room.board.tex.needsUpdate = true;
    const cx = bctx(); if (cx) cx.drawImage(room.board.c, 0, 0);
  }
  function paintHolo(run) {
    const h = room.holo, ag = R.agenda[R.agendaIdx];
    const sp = R.members.find((m) => m.speaking);
    drawHolo(h.g, h.w, h.h, {
      name: R.meta.name, timer: clock(run), count: R.members.filter((m) => m.state === 'online').length, max: R.meta.max, hands: R.members.filter((m) => m.hand).length,
      locked: R.meta.locked, speaker: sp?.name, poll: R.poll && !R.poll.closed ? { q: R.poll.q, opts: R.poll.opts, counts: R.poll.counts, total: R.poll.total } : null, agenda: ag?.title,
    });
    h.tex.needsUpdate = true;
  }

  // link ?room=CODE: offer to join once the player is in the world
  const linkCode = new URLSearchParams(location.search).get('room');

  return {
    tok, onMsg, update, openLobby,
    get code() { return R?.meta.code || ''; },
    get inRoom() { return !!R; },
    get wait() { return !!S.wait; },
    onOpen() { send({ k: 'list' }); if (linkCode) { S.code = linkCode; openLobby('rooms'); } },
    /** Chair of a player in the current room (-1 when standing or not in the room). */
    seatOf(pid) { const m = R?.members.find((x) => x.pid === pid && x.state === 'online'); return m ? m.seat : -1; },
    isMember(pid) { return !!R?.members.some((x) => x.pid === pid && x.state === 'online'); },
    mySeat() { const m = meM(); return m && m.seat >= 0 ? seatPos(m.seat) : null; },
    key(code) {
      if (code === 'KeyH' && !R) { S.lobby ? closeLobby() : openLobby(); return true; }
      if (!R) return false;
      if (code === 'KeyE') { toggleSit(); return true; }
      if (code === 'KeyM') { setMic(!micOn); return true; }
      if (code === 'KeyH') { send({ k: 'hand', on: !meM().hand }); return true; }
      return false;
    },
    stand() { const m = meM(); if (m && m.seat >= 0) send({ k: 'stand' }); },
    sendChat(text) { send({ k: 'chat', text }); },
    reconnect() { if (R) { const c = R.meta.code; leaveLocal(); S.rejoin = c; } },
    afterReconnect() { send({ k: 'list' }); if (S.rejoin) { const c = S.rejoin; S.rejoin = null; setTimeout(() => joinRoom(c, '', ''), 400); } },
  };
}

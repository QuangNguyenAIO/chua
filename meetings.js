import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Virtual meeting rooms (module VRM): rooms, roles, waiting room, chat, presentation, whiteboard, polls, agenda,
// minutes, action items and attendance. Everything is in memory and mirrored to data/meetings.json.
// Identity is a client-held token (`tok`), so a host or member keeps their place after a reconnect.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TPL = { small: 6, standard: 12, hall: 20 };
const SEATS = 20;
const GRACE_MS = 60_000; // how long a dropped member keeps their seat
const EMPTY_MS = 120_000; // an active room nobody is in ends after this
const EMOJI = new Set(['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏']);
const GESTURES = new Set(['wave', 'nod', 'shake', 'clap', 'point']);
const FILE_TYPES = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.[a-z.]+)$/;
const IMG_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const FILE_URL = /^data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+$/;
const EL_TYPES = new Set(['pen', 'line', 'rect', 'ellipse', 'arrow', 'text', 'sticky', 'img']);

const now = () => Date.now();
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);
const line = (v, n) => str(v, n).replace(/\s+/g, ' ');
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : d);
const rid = (n = 6) => [...randomBytes(n)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const hash = (pass, salt) => createHash('sha256').update(salt + pass).digest('hex');
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const isManager = (m) => m.role === 'host' || m.role === 'cohost';

export function createMeetings({ sendTo, setRoom, dataDir }) {
  const rooms = new Map(); // code -> room
  const byPid = new Map(); // pid -> { tok, name, code }
  const toks = new Map(); // pid -> tok
  const names = new Map(); // pid -> display name
  const file = join(dataDir, 'meetings.json');

  // ---------- persistence ----------
  let saveT = null;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        mkdirSync(dataDir, { recursive: true });
        const out = [...rooms.values()].map((r) => ({
          ...r,
          members: [...r.members.values()].map((m) => ({ ...m, pid: null, timer: undefined, state: 'left' })),
          waitlist: undefined,
          allowed: [...r.allowed],
          removed: [...r.removed],
          chat: r.chat.map((c) => (c.file ? { ...c, file: { name: c.file.name, type: c.file.type, size: c.file.size } } : c)),
          pres: r.pres.kind === 'image' ? { ...r.pres, d: null, kind: 'none' } : r.pres,
        }));
        writeFileSync(file, JSON.stringify(out));
      } catch (e) { console.error('meetings save failed:', e.message); }
    }, 1500);
  };
  try {
    if (existsSync(file)) {
      for (const r of JSON.parse(readFileSync(file, 'utf8'))) {
        r.members = new Map(r.members.map((m) => [m.tok, m]));
        r.waitlist = new Map();
        r.allowed = new Set(r.allowed);
        r.removed = new Set(r.removed);
        if (r.status === 'active' || r.status === 'waiting') { r.status = 'ended'; r.endedAt = r.endedAt || now(); }
        rooms.set(r.code, r);
      }
    }
  } catch (e) { console.error('meetings load failed:', e.message); }

  // ---------- helpers ----------
  const online = (r) => [...r.members.values()].filter((m) => m.pid && m.state === 'online');
  const push = (r, msg, except) => { for (const m of online(r)) if (m.pid !== except) sendTo(m.pid, { t: 'm', ...msg }); };
  const memberOf = (r, pid) => [...r.members.values()].find((m) => m.pid === pid);
  const pub = (m) => ({ mid: m.mid, pid: m.pid, name: m.name, role: m.role, seat: m.seat, hand: m.hand, mic: m.mic, muted: m.muted, state: m.state, speaking: !!m.speaking });
  const pushMembers = (r) => push(r, { k: 'members', members: [...r.members.values()].filter((m) => m.state !== 'left').map(pub) });
  const pushWait = (r) => {
    const list = [...r.waitlist.values()].map((w) => ({ tok: w.tok.slice(0, 8), pid: w.pid, name: w.name }));
    for (const m of online(r)) if (isManager(m)) sendTo(m.pid, { t: 'm', k: 'waitlist', list });
  };
  const meta = (r) => ({
    code: r.code, name: r.name, desc: r.desc, tpl: r.tpl, priv: r.priv, hasPass: !!r.pass, max: r.max, status: r.status, locked: r.locked,
    chatLock: r.chatLock, allowPresent: r.allowPresent, allowBoard: r.allowBoard, cohostEdit: r.cohostEdit, onHostLeave: r.onHostLeave,
    speakOnly: r.speakOnly, waiting: r.waiting, startedAt: r.startedAt, start: r.start, dur: r.dur, hostName: r.hostName,
  });
  const pushMeta = (r) => push(r, { k: 'meta', meta: meta(r) });
  const sys = (r, text) => push(r, { k: 'sys', text });

  const label = (r) => {
    if (r.status === 'scheduled' && r.start && r.start - now() < 10 * 60_000) return 'waiting';
    return r.status;
  };
  const summary = (r, tok) => ({
    code: r.code, name: r.name, desc: r.desc, tpl: r.tpl, priv: r.priv, hasPass: !!r.pass, max: r.max, count: online(r).length,
    status: label(r), locked: r.locked, hostName: r.hostName, start: r.start, dur: r.dur, recur: r.recur, created: r.created,
    startedAt: r.startedAt, endedAt: r.endedAt, mine: r.host === tok, member: r.members.has(tok),
  });

  function pollView(r, m) {
    const p = r.poll;
    if (!p) return null;
    const entries = Object.entries(p.votes);
    const counts = p.opts.map((_, i) => entries.filter(([, v]) => v.includes(i)).length);
    const show = !p.anon || p.closed;
    return {
      id: p.id, q: p.q, opts: p.opts, multi: p.multi, anon: p.anon, endsAt: p.endsAt, closed: p.closed, total: entries.length, counts,
      mine: (p.votes[m.tok] || []).slice(),
      voters: show && !p.anon ? p.opts.map((_, i) => entries.filter(([, v]) => v.includes(i)).map(([t]) => r.members.get(t)?.name || '?')) : null,
    };
  }
  const pushPoll = (r) => { for (const m of online(r)) sendTo(m.pid, { t: 'm', k: 'poll', poll: pollView(r, m) }); };

  const canPresent = (r, m) => isManager(m) || m.role === 'presenter' || r.allowPresent;
  const canBoard = (r, m) => isManager(m) || m.role === 'presenter' || r.allowBoard;
  const canNotes = (m) => isManager(m) || m.role === 'presenter';

  function visibleChat(r, m) { return r.chat.filter((c) => !c.to || c.to === m.mid || c.from === m.mid).slice(-120); }

  function snapshot(r, m) {
    return {
      meta: meta(r), now: now(), you: m.mid, members: [...r.members.values()].filter((x) => x.state !== 'left').map(pub),
      chat: visibleChat(r, m), pres: r.pres, wb: r.wb, poll: pollView(r, m), agenda: r.agenda, agendaIdx: r.agendaIdx,
      notes: r.notes, actions: r.actions, approval: r.approval, versions: r.versions.map((v) => ({ at: v.at, by: v.by })),
    };
  }

  function seatFor(r) {
    const used = new Set([...r.members.values()].filter((x) => x.state !== 'left' && x.seat >= 0).map((x) => x.seat));
    for (let i = 0; i < SEATS; i++) if (!used.has(i)) return i;
    return -1;
  }

  // ---------- lifecycle ----------
  function newRoom(f, tok, name) {
    let code;
    do { code = rid(6); } while (rooms.has(code));
    const tpl = TPL[f.tpl] ? f.tpl : 'standard';
    const salt = randomBytes(6).toString('hex');
    const start = Number.isFinite(+f.start) && +f.start > now() - 60_000 ? +f.start : null;
    const r = {
      code, name: line(f.name, 60) || 'Cuộc họp mới', desc: str(f.desc, 400), tpl, max: Math.round(num(f.max, 2, TPL[tpl], TPL[tpl])),
      priv: !!f.priv, salt, pass: f.pass ? hash(str(f.pass, 32), salt) : '', waiting: f.waiting ?? !!f.priv,
      onHostLeave: f.onHostLeave === 'end' ? 'end' : 'transfer', host: tok, hostName: name,
      status: start && start > now() + 60_000 ? 'scheduled' : 'waiting', locked: false, chatLock: false, allowPresent: false, allowBoard: true,
      cohostEdit: true, speakOnly: false, start, dur: Math.round(num(f.dur, 5, 600, 60)),
      recur: ['daily', 'weekly'].includes(f.recur) ? f.recur : 'none',
      invites: (Array.isArray(f.invites) ? f.invites : []).slice(0, 50).map((x) => line(x, 30)).filter(Boolean),
      created: now(), startedAt: null, endedAt: null, emptySince: null,
      members: new Map(), waitlist: new Map(), allowed: new Set([tok]), removed: new Set(),
      chat: [], pres: { kind: 'none' }, wb: [], poll: null, polls: [], agenda: [], agendaIdx: -1,
      notes: { discussion: '', conclusion: '', by: '', at: 0 }, actions: [], approval: null, versions: [],
    };
    rooms.set(code, r);
    persist();
    return r;
  }

  function admit(r, pid, tok, name, via) {
    let m = r.members.get(tok);
    const first = !m;
    if (!m) {
      m = { tok, mid: rid(5), pid: null, name, role: tok === r.host ? 'host' : via === 'link' ? 'guest' : 'participant', seat: -1, hand: false, mic: false, muted: false, state: 'left', joined: [] };
      r.members.set(tok, m);
    }
    if (m.pid && m.pid !== pid) { // the same person opened a second tab: the new one takes over
      sendTo(m.pid, { t: 'm', k: 'kicked', why: 'dup' });
      setRoom(m.pid, '');
      byPid.delete(m.pid);
    }
    clearTimeout(m.timer);
    m.timer = undefined;
    m.pid = pid; m.name = name; m.state = 'online';
    if (m.seat < 0 || memberSeatTaken(r, m)) m.seat = m.role === 'host' ? (seatTakenBy(r, 0, m) ? seatFor(r) : 0) : seatFor(r);
    m.joined.push({ in: now(), out: null });
    r.allowed.add(tok);
    r.emptySince = null;
    byPid.set(pid, { tok, code: r.code });
    setRoom(pid, r.code);
    if (m.role === 'host' && (r.status === 'waiting' || r.status === 'scheduled')) { r.status = 'active'; r.startedAt = r.startedAt || now(); }
    sendTo(pid, { t: 'm', k: 'joined', room: snapshot(r, m) });
    pushMembers(r);
    pushMeta(r);
    sys(r, first ? `${name} đã vào phòng` : `${name} đã kết nối lại`);
    persist();
  }
  const seatTakenBy = (r, i, except) => [...r.members.values()].some((x) => x !== except && x.state !== 'left' && x.seat === i);
  const memberSeatTaken = (r, m) => seatTakenBy(r, m.seat, m);

  function release(r, m, why) { // member leaves (explicitly, kicked or after the reconnect grace)
    clearTimeout(m.timer);
    m.timer = undefined;
    const last = m.joined[m.joined.length - 1];
    if (last && !last.out) last.out = now();
    const pid = m.pid;
    m.pid = null; m.state = 'left'; m.seat = -1; m.hand = false; m.mic = false; m.speaking = false;
    if (pid) { byPid.delete(pid); setRoom(pid, ''); }
    sys(r, `${m.name} ${why === 'kick' ? 'đã bị mời ra khỏi phòng' : 'đã rời phòng'}`);
    if (m.tok === r.host && r.status === 'active') {
      if (r.onHostLeave === 'end') return endRoom(r);
      const next = [...r.members.values()].find((x) => x.state === 'online' && x.role === 'cohost') || online(r)[0];
      if (next) setHost(r, next);
    }
    pushMembers(r);
    persist();
  }

  function setHost(r, next) {
    const old = r.members.get(r.host);
    if (old && old.role === 'host') old.role = 'participant';
    r.host = next.tok; r.hostName = next.name; next.role = 'host';
    sys(r, `${next.name} là chủ trì mới`);
    pushMeta(r);
    pushMembers(r);
    persist();
  }

  function endRoom(r) {
    if (r.status === 'ended') return;
    r.status = 'ended'; r.endedAt = now();
    if (r.poll && !r.poll.closed) { r.poll.closed = true; r.polls.push(pollRecord(r)); }
    r.versions.push({ at: now(), by: 'Hệ thống (kết thúc họp)', notes: { ...r.notes }, actions: structuredClone(r.actions) });
    for (const m of online(r)) {
      const last = m.joined[m.joined.length - 1];
      if (last && !last.out) last.out = now();
      sendTo(m.pid, { t: 'm', k: 'ended' });
      byPid.delete(m.pid); setRoom(m.pid, '');
      m.pid = null; m.state = 'left'; m.seat = -1;
    }
    for (const w of r.waitlist.values()) sendTo(w.pid, { t: 'm', k: 'denied', why: 'ended' });
    r.waitlist.clear();
    if (r.recur !== 'none' && r.start) { // recurring meeting: schedule the next occurrence
      const step = r.recur === 'daily' ? 86_400_000 : 7 * 86_400_000;
      const n = newRoom({ ...r, tpl: r.tpl, start: Math.max(r.start + step, now() + 3_600_000), pass: '' }, r.host, r.hostName);
      n.pass = r.pass; n.salt = r.salt; n.recur = r.recur; n.invites = r.invites; n.agenda = r.agenda.map((a) => ({ ...a, done: false })); n.agendaIdx = -1;
    }
    persist();
  }

  const pollRecord = (r) => {
    const p = r.poll;
    const entries = Object.entries(p.votes);
    return { q: p.q, multi: p.multi, anon: p.anon, opts: p.opts.map((o, i) => ({ t: o.t, n: entries.filter(([, v]) => v.includes(i)).length })), total: entries.length, at: p.created };
  };

  function record(r) {
    const att = [...r.members.values()].map((m) => ({ name: m.name, role: m.role, sessions: m.joined }));
    return {
      meta: meta(r), created: r.created, endedAt: r.endedAt, agenda: r.agenda, notes: r.notes, actions: r.actions, approval: r.approval,
      versions: r.versions.map((v) => ({ at: v.at, by: v.by, notes: v.notes, actions: v.actions })), polls: r.polls, attendance: att, wb: r.wb.length, board: r.wb,
      invites: r.invites,
    };
  }

  const mayView = (r, tok) => r.host === tok || r.members.has(tok) || !r.priv;

  // ---------- message handling ----------
  function onMessage(pid, m) {
    const tok = toks.get(pid);
    if (!tok) return;
    const k = m.k;
    const name = names.get(pid) || 'Khách';
    const reply = (msg) => sendTo(pid, { t: 'm', ...msg });

    if (k === 'list') {
      const mine = (r) => r.host === tok || r.members.has(tok);
      const inv = (r) => r.invites?.some((x) => x.toLowerCase() === name.toLowerCase());
      const all = [...rooms.values()];
      const open = all.filter((r) => r.status !== 'ended' && r.status !== 'cancelled' && (!r.priv || mine(r) || inv(r)));
      const hist = all.filter((r) => (r.status === 'ended' || r.status === 'cancelled') && mine(r)).sort((a, b) => (b.endedAt || b.created) - (a.endedAt || a.created)).slice(0, 50);
      return reply({ k: 'rooms', now: now(), rooms: open.map((r) => ({ ...summary(r, tok), invited: !!inv(r) })), history: hist.map((r) => summary(r, tok)) });
    }
    if (k === 'create') {
      if (byPid.has(pid)) return reply({ k: 'err', text: 'Hãy rời phòng hiện tại trước khi tạo phòng mới.' });
      const r = newRoom(m, tok, name);
      return reply({ k: 'created', code: r.code, scheduled: r.status === 'scheduled' });
    }
    if (k === 'delete') { const err = api.remove(pid, m.code); return reply(err ? { k: 'err', text: err } : { k: 'toast', text: 'Đã xóa phòng.' }); }
    if (k === 'cancel') return reply(api.cancel(pid, m.code) ? { k: 'toast', text: 'Đã hủy lịch họp.' } : { k: 'err', text: 'Không thể hủy lịch này.' });
    if (k === 'hist') {
      const r = rooms.get(normCode(m.code));
      return r && mayView(r, tok) ? reply({ k: 'record', record: record(r) }) : reply({ k: 'err', text: 'Không tìm thấy biên bản.' });
    }
    if (k === 'join') {
      if (byPid.has(pid)) return reply({ k: 'err', text: 'Bạn đang ở trong một phòng họp.' });
      const r = rooms.get(normCode(m.code));
      if (!r) return reply({ k: 'denied', why: 'notfound' });
      if (r.status === 'ended' || r.status === 'cancelled') return reply({ k: 'denied', why: 'ended' });
      if (r.removed.has(tok)) return reply({ k: 'denied', why: 'removed' });
      const isHost = tok === r.host, known = r.allowed.has(tok);
      if (!isHost) {
        if (r.status !== 'active') return reply({ k: 'denied', why: 'notstarted' });
        if (r.locked && !known) return reply({ k: 'denied', why: 'locked' });
        if (r.pass && !known && hash(str(m.pass, 32), r.salt) !== r.pass) return reply({ k: 'denied', why: 'pass' });
        if (online(r).length >= r.max && !(r.members.get(tok)?.state === 'online')) return reply({ k: 'denied', why: 'full' });
        if (r.waiting && !known) {
          r.waitlist.set(tok, { tok, pid, name });
          byPid.set(pid, { tok, code: r.code, waiting: true });
          reply({ k: 'wait', code: r.code, name: r.name });
          return pushWait(r);
        }
      }
      return admit(r, pid, tok, name, m.via);
    }

    const ctx = byPid.get(pid);
    if (!ctx) return;
    const r = rooms.get(ctx.code);
    if (!r) return;
    if (ctx.waiting) { // only "cancel waiting" is allowed from the waiting room
      if (k === 'leave') { r.waitlist.delete(tok); byPid.delete(pid); pushWait(r); }
      return;
    }
    const me = r.members.get(tok);
    if (!me || me.pid !== pid) return;
    const target = () => [...r.members.values()].find((x) => x.mid === m.mid && x.state !== 'left');
    const deny = (text = 'Bạn không có quyền thực hiện thao tác này.') => reply({ k: 'err', text });
    const mgr = isManager(me);

    switch (k) {
      case 'leave': return release(r, me, 'leave');
      case 'end': if (me.role !== 'host') return deny(); return endRoom(r);
      case 'approve': { // waiting-room decision
        if (!mgr) return deny();
        const w = [...r.waitlist.values()].find((x) => x.tok.slice(0, 8) === m.tok);
        if (!w) return;
        r.waitlist.delete(w.tok);
        if (m.ok) admit(r, w.pid, w.tok, w.name, 'wait');
        else { byPid.delete(w.pid); sendTo(w.pid, { t: 'm', k: 'denied', why: 'refused' }); }
        return pushWait(r);
      }
      case 'edit': {
        if (!(me.role === 'host' || (me.role === 'cohost' && r.cohostEdit))) return deny();
        if (typeof m.name === 'string') r.name = line(m.name, 60) || r.name;
        if (typeof m.desc === 'string') r.desc = str(m.desc, 400);
        if (m.max !== undefined) r.max = Math.round(num(m.max, Math.max(2, online(r).length), TPL[r.tpl], r.max));
        if (m.priv !== undefined) r.priv = !!m.priv;
        if (m.waiting !== undefined) r.waiting = !!m.waiting;
        if (typeof m.pass === 'string') r.pass = m.pass ? hash(str(m.pass, 32), r.salt) : '';
        if (me.role === 'host') {
          for (const f of ['chatLock', 'allowPresent', 'allowBoard', 'cohostEdit', 'speakOnly']) if (m[f] !== undefined) r[f] = !!m[f];
          if (m.onHostLeave) r.onHostLeave = m.onHostLeave === 'end' ? 'end' : 'transfer';
        }
        pushMeta(r); persist(); return;
      }
      case 'lock': if (!mgr) return deny(); r.locked = !!m.on; sys(r, r.locked ? 'Phòng đã được khóa' : 'Phòng đã được mở khóa'); pushMeta(r); return;
      case 'role': {
        const t = target();
        if (!t || me.role !== 'host' && !(me.role === 'cohost' && ['participant', 'presenter', 'guest'].includes(m.role) && t.role !== 'host' && t.role !== 'cohost')) return deny();
        if (t.role === 'host' || !['cohost', 'presenter', 'participant'].includes(m.role)) return;
        t.role = m.role; sys(r, `${t.name} được đặt vai trò ${m.role}`); pushMembers(r); persist(); return;
      }
      case 'host': { const t = target(); if (me.role !== 'host' || !t) return deny(); return setHost(r, t); }
      case 'kick': {
        const t = target();
        if (!mgr || !t || t.role === 'host' || (t.role === 'cohost' && me.role !== 'host')) return deny();
        r.removed.add(t.tok); r.allowed.delete(t.tok);
        sendTo(t.pid, { t: 'm', k: 'kicked', why: 'kick' });
        return release(r, t, 'kick');
      }
      case 'mute': {
        const t = target();
        if (!mgr || !t) return deny();
        t.muted = !!m.on;
        if (t.muted) { t.mic = false; sendTo(t.pid, { t: 'm', k: 'forcemute' }); }
        else sendTo(t.pid, { t: 'm', k: 'unmuted' });
        return pushMembers(r);
      }
      case 'muteall':
        if (!mgr) return deny();
        for (const x of online(r)) if (!isManager(x)) { x.muted = !!m.on; if (x.muted) { x.mic = false; sendTo(x.pid, { t: 'm', k: 'forcemute' }); } else sendTo(x.pid, { t: 'm', k: 'unmuted' }); }
        sys(r, m.on ? 'Chủ trì đã tắt micro tất cả' : 'Chủ trì đã cho phép bật micro');
        return pushMembers(r);
      case 'mic': {
        const on = !!m.on && !me.muted && !(r.speakOnly && !(mgr || me.role === 'presenter'));
        me.mic = on; if (!on) me.speaking = false;
        return push(r, { k: 'st', mid: me.mid, mic: me.mic, speaking: me.speaking });
      }
      case 'speak': me.speaking = !!m.on && me.mic; return push(r, { k: 'st', mid: me.mid, speaking: me.speaking }, pid);
      case 'sig': { // WebRTC signalling relay for voice
        const t = target();
        if (t?.pid) sendTo(t.pid, { t: 'm', k: 'sig', from: me.mid, data: m.data });
        return;
      }
      case 'hand': me.hand = !!m.on; return pushMembers(r);
      case 'lower': { const t = target(); if (!mgr || !t) return deny(); t.hand = false; return pushMembers(r); }
      case 'react': if (EMOJI.has(m.e)) push(r, { k: 'react', mid: me.mid, e: m.e }); return;
      case 'gest': if (GESTURES.has(m.g)) push(r, { k: 'gest', mid: me.mid, g: m.g }, pid); return;
      case 'seat': {
        const i = m.i;
        if (!Number.isInteger(i) || i < 0 || i >= SEATS || seatTakenBy(r, i, me)) return reply({ k: 'seatfail' });
        me.seat = i; return pushMembers(r);
      }
      case 'stand': me.seat = -1; return pushMembers(r);

      case 'chat': {
        const text = str(m.text, 500);
        let file = null;
        if (m.file) {
          const f = m.file;
          if (typeof f.d !== 'string' || f.d.length > 560_000 || !FILE_URL.test(f.d) || !FILE_TYPES.test(String(f.type))) return reply({ k: 'err', text: 'Tệp không hợp lệ (chỉ ảnh, PDF, TXT, Office; tối đa ~400 KB).' });
          if (r.chat.filter((c) => c.file?.d).length >= 20) return reply({ k: 'err', text: 'Phòng đã đạt giới hạn tệp đính kèm.' });
          file = { name: line(f.name, 60) || 'tep', type: f.type, size: Math.round(f.d.length * 0.75), d: f.d };
        }
        if (!text && !file) return;
        if (r.chatLock && !mgr) return reply({ k: 'err', text: 'Chat đang bị khóa.' });
        if (now() - (me.lastChat || 0) < 400) return;
        me.lastChat = now();
        const to = m.to ? [...r.members.values()].find((x) => x.mid === m.to && x.state === 'online') : null;
        const msg = { id: rid(6), from: me.mid, name: me.name, text, ts: now(), to: to?.mid || null, toName: to?.name || null, file };
        r.chat.push(msg);
        if (r.chat.length > 300) r.chat.shift();
        if (to) { sendTo(to.pid, { t: 'm', k: 'chat', msg }); sendTo(pid, { t: 'm', k: 'chat', msg }); }
        else push(r, { k: 'chat', msg });
        return persist();
      }
      case 'delmsg': {
        if (!mgr) return deny();
        const i = r.chat.findIndex((c) => c.id === m.id);
        if (i >= 0) { r.chat.splice(i, 1); push(r, { k: 'delmsg', id: m.id }); }
        return;
      }

      case 'pres': {
        if (!canPresent(r, me)) return deny();
        const cur = r.pres;
        if (cur.kind !== 'none' && cur.by !== me.mid && !mgr) return deny('Đang có người trình chiếu. Chủ trì có thể thu hồi quyền.');
        if (m.kind === 'none') r.pres = { kind: 'none' };
        else if (m.kind === 'slides') {
          const slides = (Array.isArray(m.slides) ? m.slides : []).slice(0, 40).map((s) => ({ t: line(s?.t, 100), b: (Array.isArray(s?.b) ? s.b : []).slice(0, 10).map((x) => line(x, 160)) }));
          if (!slides.length) return;
          r.pres = { kind: 'slides', by: me.mid, name: me.name, title: line(m.title, 80), slides, i: 0, zoom: 1 };
        } else if (m.kind === 'image') {
          if (typeof m.d !== 'string' || m.d.length > 2_000_000 || !IMG_URL.test(m.d)) return reply({ k: 'err', text: 'Ảnh không hợp lệ (PNG, JPG, GIF, WEBP; tối đa ~1.5 MB).' });
          r.pres = { kind: 'image', by: me.mid, name: me.name, title: line(m.title, 80), d: m.d, i: 0, zoom: 1 };
        } else return;
        return push(r, { k: 'pres', pres: r.pres });
      }
      case 'slide': {
        const p = r.pres;
        if (p.kind === 'none' || (p.by !== me.mid && !mgr)) return deny();
        if (p.kind === 'slides') p.i = Math.round(num(m.i, 0, p.slides.length - 1, p.i));
        p.zoom = num(m.zoom, 0.5, 3, p.zoom);
        return push(r, { k: 'slide', i: p.i, zoom: p.zoom });
      }
      case 'presenter': { // host hands the screen to someone
        const t = target();
        if (!mgr || !t) return deny();
        if (t.role === 'participant' || t.role === 'guest') t.role = 'presenter';
        pushMembers(r);
        return;
      }

      case 'wb': {
        if (!canBoard(r, me)) return deny('Bạn chưa được cấp quyền dùng bảng trắng.');
        if (m.op === 'add') {
          const el = cleanEl(m.el, me.name);
          if (!el || r.wb.length >= 1500 || r.wb.some((x) => x.id === el.id)) return;
          r.wb.push(el); push(r, { k: 'wb', op: 'add', el }, pid);
        } else if (m.op === 'del') {
          const i = r.wb.findIndex((x) => x.id === m.id);
          if (i >= 0) { r.wb.splice(i, 1); push(r, { k: 'wb', op: 'del', id: m.id }, pid); }
        } else if (m.op === 'clear') {
          if (!mgr) return deny();
          r.wb = []; push(r, { k: 'wb', op: 'clear' });
        }
        return persist();
      }

      case 'poll': {
        if (m.op === 'create') {
          if (!mgr) return deny();
          const opts = (Array.isArray(m.opts) ? m.opts : []).slice(0, 8).map((x) => ({ t: line(x, 80) })).filter((o) => o.t);
          const q = line(m.q, 160);
          if (!q || opts.length < 2) return reply({ k: 'err', text: 'Cần câu hỏi và ít nhất 2 phương án.' });
          if (r.poll && !r.poll.closed) { r.poll.closed = true; r.polls.push(pollRecord(r)); }
          const secs = Math.round(num(m.secs, 0, 3600, 0));
          r.poll = { id: rid(4), q, opts, multi: !!m.multi, anon: !!m.anon, votes: {}, created: now(), endsAt: secs ? now() + secs * 1000 : null, closed: false };
          sys(r, `Biểu quyết mới: ${q}`);
        } else if (m.op === 'vote') {
          const p = r.poll;
          if (!p || p.closed || p.id !== m.id) return;
          let v = (Array.isArray(m.v) ? m.v : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < p.opts.length);
          v = [...new Set(v)];
          if (!p.multi) v = v.slice(0, 1);
          if (v.length) p.votes[tok] = v; else delete p.votes[tok];
        } else if (m.op === 'close') {
          if (!mgr || !r.poll || r.poll.closed) return deny();
          r.poll.closed = true; r.polls.push(pollRecord(r));
        } else return;
        return pushPoll(r), persist();
      }

      case 'notes': {
        if (!canNotes(me)) return deny('Chỉ chủ trì, đồng chủ trì và người được cấp quyền mới ghi biên bản.');
        if (!['discussion', 'conclusion'].includes(m.f)) return;
        r.notes[m.f] = str(m.v, 8000); r.notes.by = me.name; r.notes.at = now(); r.approval = null;
        push(r, { k: 'notes', notes: r.notes, approval: null }, pid);
        return persist();
      }
      case 'action': {
        if (!canNotes(me)) return deny();
        if (m.op === 'add') {
          if (r.actions.length >= 100) return;
          r.actions.push({ id: rid(4), task: line(m.task, 200), who: line(m.who, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(m.due) ? m.due : '', done: false });
        } else if (m.op === 'upd') {
          const a = r.actions.find((x) => x.id === m.id);
          if (!a) return;
          if (typeof m.task === 'string') a.task = line(m.task, 200);
          if (typeof m.who === 'string') a.who = line(m.who, 40);
          if (typeof m.due === 'string') a.due = /^\d{4}-\d{2}-\d{2}$/.test(m.due) ? m.due : '';
          if (m.done !== undefined) a.done = !!m.done;
        } else if (m.op === 'del') r.actions = r.actions.filter((x) => x.id !== m.id);
        else return;
        r.approval = null;
        push(r, { k: 'actions', actions: r.actions, approval: null });
        return persist();
      }
      case 'approvemin': {
        if (me.role !== 'host') return deny('Chỉ chủ trì mới xác nhận biên bản.');
        r.approval = { by: me.name, at: now() };
        r.versions.push({ at: now(), by: me.name, notes: { ...r.notes }, actions: structuredClone(r.actions) });
        if (r.versions.length > 30) r.versions.shift();
        push(r, { k: 'approval', approval: r.approval, versions: r.versions.map((v) => ({ at: v.at, by: v.by })) });
        return persist();
      }
      case 'savever': {
        if (!canNotes(me)) return deny();
        r.versions.push({ at: now(), by: me.name, notes: { ...r.notes }, actions: structuredClone(r.actions) });
        if (r.versions.length > 30) r.versions.shift();
        push(r, { k: 'approval', approval: r.approval, versions: r.versions.map((v) => ({ at: v.at, by: v.by })) });
        return persist();
      }
      case 'agenda': {
        if (!mgr) return deny();
        if (m.op === 'add') { if (r.agenda.length < 30) r.agenda.push({ id: rid(4), title: line(m.title, 100), min: Math.round(num(m.min, 0, 300, 5)), done: false }); }
        else if (m.op === 'del') { r.agenda = r.agenda.filter((a) => a.id !== m.id); r.agendaIdx = Math.min(r.agendaIdx, r.agenda.length - 1); }
        else if (m.op === 'done') { const a = r.agenda.find((x) => x.id === m.id); if (a) a.done = !a.done; }
        else if (m.op === 'cur') { r.agendaIdx = r.agenda.findIndex((x) => x.id === m.id); r.agendaStart = now(); }
        else return;
        return push(r, { k: 'agenda', agenda: r.agenda, agendaIdx: r.agendaIdx, agendaStart: r.agendaStart || null }), persist();
      }
    }
  }

  function cleanEl(e, by) {
    if (!e || !EL_TYPES.has(e.t)) return null;
    const id = str(e.id, 24);
    if (!id) return null;
    const el = { id, by, t: e.t, c: /^#[0-9a-f]{6}$/i.test(e.c) ? e.c : '#222222', lw: num(e.lw, 1, 24, 3) };
    const c = (v) => Math.round(num(v, -200, 2000, 0) * 10) / 10;
    if (e.t === 'pen') {
      el.p = (Array.isArray(e.p) ? e.p : []).slice(0, 800).map(c);
      if (el.p.length < 4) return null;
    } else if (e.t === 'text' || e.t === 'sticky') {
      Object.assign(el, { x: c(e.x), y: c(e.y), s: str(e.s, 200), fs: num(e.fs, 10, 80, 28) });
      if (!el.s) return null;
    } else if (e.t === 'img') {
      if (typeof e.d !== 'string' || e.d.length > 400_000 || !IMG_URL.test(e.d)) return null;
      Object.assign(el, { x: c(e.x), y: c(e.y), w: num(e.w, 10, 1600, 200), h: num(e.h, 10, 900, 150), d: e.d });
    } else Object.assign(el, { x: c(e.x), y: c(e.y), x2: c(e.x2), y2: c(e.y2) });
    return el;
  }

  // ---------- connection hooks ----------
  const api = {
    hello(pid, tok, name) { toks.set(pid, String(tok || '').slice(0, 64) || rid(10)); names.set(pid, line(name, 16) || 'Khách'); },
    rename(pid, name) {
      names.set(pid, line(name, 16) || 'Khách');
      const ctx = byPid.get(pid), r = ctx && rooms.get(ctx.code), m = r && memberOf(r, pid);
      if (m) { m.name = names.get(pid); pushMembers(r); }
    },
    message: onMessage,
    close(pid) {
      const ctx = byPid.get(pid);
      toks.delete(pid); names.delete(pid);
      if (!ctx) return;
      const r = rooms.get(ctx.code);
      byPid.delete(pid);
      if (!r) return;
      if (ctx.waiting) { r.waitlist.delete(ctx.tok); return pushWait(r); }
      const m = r.members.get(ctx.tok);
      if (!m || m.pid !== pid) return;
      m.state = 'offline'; m.mic = false; m.speaking = false; m.pid = null;
      m.timer = setTimeout(() => release(r, m, 'timeout'), GRACE_MS);
      pushMembers(r);
    },
    /** Deletes an ended / cancelled / scheduled room. Only its host may do this, and never while it is running. */
    remove(pid, code) {
      const r = rooms.get(normCode(code)), tok = toks.get(pid);
      if (!r || r.host !== tok) return 'Chỉ chủ trì mới được xóa phòng.';
      if (r.status === 'active') return 'Phòng đang diễn ra, hãy kết thúc cuộc họp trước.';
      rooms.delete(r.code); persist();
      return null;
    },
    cancel(pid, code) {
      const r = rooms.get(normCode(code)), tok = toks.get(pid);
      if (!r || r.host !== tok || !['scheduled', 'waiting'].includes(r.status)) return false;
      r.status = 'cancelled'; r.endedAt = now(); persist();
      return true;
    },
  };

  setInterval(() => { // polls with a timer, rooms nobody is in
    const t = now();
    for (const r of rooms.values()) {
      if (r.poll && !r.poll.closed && r.poll.endsAt && r.poll.endsAt <= t) { r.poll.closed = true; r.polls.push(pollRecord(r)); pushPoll(r); }
      if (r.status === 'active') {
        if (!online(r).length) { r.emptySince ||= t; if (t - r.emptySince > EMPTY_MS) endRoom(r); }
        else r.emptySince = null;
      }
    }
  }, 1000);

  return api;
}

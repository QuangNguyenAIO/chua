import * as THREE from 'three';
import { BOUNDS, collide } from './world.js';
import { findPath } from './nav.js';
import { BREEDS, ACCESSORIES, breedOf, DogAvatar } from './dogavatar.js';
import { DOG, DW } from './dogzone.js';
import { bark, growl, yelp, sfx } from './audio.js';

// The player's side of the dog district: survival stats, movement, the dog actions (bark, sniff, pee, dig, bite...),
// skills / breeds / accessories, quests and random events. The world (scenery, NPCs, weather) lives in dogworld.js.

const { clamp } = THREE.MathUtils;
const rand = (a, b) => a + Math.random() * (b - a);
const SAVE_KEY = 'dogworld.v1';
const MAX_SKILL = 5;

const SKILLS = [
  { id: 'speed', icon: '💨', name: 'Tốc độ', desc: '+6% tốc độ chạy mỗi cấp' },
  { id: 'stamina', icon: '🫁', name: 'Sức bền', desc: 'Thể lực hao ít hơn và hồi nhanh hơn' },
  { id: 'smell', icon: '👃', name: 'Khứu giác', desc: 'Đánh hơi xa hơn, tìm xương dễ hơn' },
  { id: 'dig', icon: '⛏️', name: 'Đào bới', desc: 'Dễ đào trúng xương, nhiều thưởng hơn' },
  { id: 'swim', icon: '🏊', name: 'Bơi lội', desc: 'Bơi nhanh hơn, đỡ tốn sức' },
  { id: 'bite', icon: '🦷', name: 'Sức cắn', desc: 'Cắn đau hơn' },
  { id: 'vital', icon: '❤️', name: 'Thể trạng', desc: '+10 máu tối đa, hồi máu nhanh hơn' },
];

const QUEST_POOL = [
  { id: 'food', title: 'Kiếm thức ăn', desc: 'Ăn 3 bữa (bát cơm, thùng rác, xúc xích...)', goal: 3, xp: 40, bones: 3 },
  { id: 'dig', title: 'Thợ đào xương', desc: 'Đào được 2 khúc xương chôn dưới đất', goal: 2, xp: 55, bones: 5 },
  { id: 'mark', title: 'Đánh dấu lãnh thổ', desc: 'Đái bậy ở 3 chỗ mới (cột đèn, gốc cây, trụ nước...)', goal: 3, xp: 45, bones: 3 },
  { id: 'cross', title: 'Qua đường an toàn', desc: 'Băng qua đường 3 lần mà không bị xe tông', goal: 3, xp: 50, bones: 4 },
  { id: 'swim', title: 'Vận động viên bơi lội', desc: 'Bơi 15 giây trong ao công viên', goal: 15, xp: 45, bones: 3 },
  { id: 'friend', title: 'Làm quen hàng xóm', desc: 'Ngửi đít 3 chú chó khác nhau', goal: 3, xp: 55, bones: 4 },
  { id: 'beg', title: 'Xin ăn khéo', desc: 'Vẫy đuôi trước người lạ để được cho ăn', goal: 1, xp: 35, bones: 2 },
  { id: 'rain', title: 'Trú mưa', desc: 'Trú trong nhà 10 giây khi trời mưa', goal: 10, xp: 40, bones: 3, when: (w) => w.clock.rain > 0.3 },
];

const xpNeed = (lv) => 50 + 35 * (lv - 1);
const fmt = (n) => String(Math.floor(n)).padStart(2, '0');

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

function loadProfile() {
  const fresh = { level: 1, xp: 0, points: 0, bones: 0, skills: {}, breed: 'ta', owned: [], worn: [], ownerFound: false };
  try { return { ...fresh, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return fresh; }
}

export function createDogGame({ scene, camera, world, send, remoteDogs }) {
  const $ = (id) => document.getElementById(id);
  const hud = $('dogHud'), questBox = $('dogQuests'), prompt = $('dogPrompt'), menu = $('dogMenu'), toastBox = $('dogToast'), fade = $('dogFade'), hurtFx = $('dogHurt');
  const prof = loadProfile();
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(prof)); } catch { /* private mode */ } };
  const lv = (id) => prof.skills[id] || 0;
  const breed = () => breedOf(prof.breed);
  const bonus = (k) => breed().bonus[k] || 1;

  const st = { food: 80, water: 80, energy: 90, stamina: 100, health: 100 };
  const maxHealth = () => Math.round((100 + 10 * lv('vital')) * bonus('hp'));
  const maxStamina = () => Math.round(100 * (1 + 0.1 * lv('stamina')) * bonus('sta'));

  const G = {
    active: false, me: null, netState: '',
    vel: new THREE.Vector3(), vy: 0, stun: 0, invuln: 0, exhausted: false, sleeping: false, locked: 0, running: false, speed: 0,
    swimming: false, swimTime: 0, wet: 0, tasks: [], quests: [], questCd: 3, eventCd: 70, event: null, auto: null,
    promptCd: 0, hudCd: 0, rep: 0, carrying: null, marks: new Set(), friends: new Set(), petCd: 0, begCd: new Map(), puppies: [], pregnant: 0,
    side: null, ball: null, lastSwimMsg: 0, outsideCd: 0, shaken: true,
  };
  const pos = () => G.me.avatar.group.position;
  const av = () => G.me.dogAv; // always the dog model, even while it is being swapped out

  // ---------- small helpers ----------

  const later = (sec, fn) => G.tasks.push({ t: sec, fn });
  const toast = (text, ms = 3200) => {
    if (!text) return;
    const d = document.createElement('div');
    d.textContent = text;
    toastBox.appendChild(d);
    setTimeout(() => d.remove(), ms);
    while (toastBox.children.length > 4) toastBox.firstChild.remove();
  };
  const popText = (text, color) => { const p = pos(); world.fx.text(text, p.x, p.y + 1.9, p.z, color); };
  const say = (who, text, s = 3) => { const a = who.w?.avatar || who.av || who.avatar; a?.say(text, s); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const home = () => world.home;
  const ownerAt = () => world.owner;

  function gainXp(n) {
    prof.xp += n;
    while (prof.xp >= xpNeed(prof.level)) {
      prof.xp -= xpNeed(prof.level);
      prof.level++; prof.points++;
      sfx('level');
      toast(`🎉 Lên cấp ${prof.level}! +1 điểm kỹ năng (nhấn P)`);
      const unlocked = BREEDS.filter((b) => b.lvl === prof.level);
      if (unlocked.length) toast(`🐕 Mở khóa giống chó: ${unlocked.map((b) => b.name).join(', ')}`);
      const p = pos();
      world.fx.stars(p.x, p.y + 1.2, p.z);
    }
    save();
  }
  const gainBones = (n) => { prof.bones += n; if (n > 0) sfx('coin'); save(); };
  const reward = (xp, bones, label) => {
    gainXp(xp);
    if (bones) gainBones(bones);
    popText(`+${xp} XP${bones ? ` +${bones}🦴` : ''}`, '#ffe27a');
    if (label) toast(label);
  };

  function setStat(k, v) { st[k] = clamp(v, 0, k === 'health' ? maxHealth() : k === 'stamina' ? maxStamina() : 100); }

  function hurt(dmg, src) {
    if (G.invuln > 0 || !G.active) return;
    G.invuln = 1.2;
    setStat('health', st.health - dmg);
    yelp(0.8);
    hurtFx.classList.add('on');
    setTimeout(() => hurtFx.classList.remove('on'), 350);
    if (G.sleeping) wake();
    if (st.health <= 0) faint();
  }
  G.hurt = hurt;

  function faint() {
    if (G.locked > 0) return;
    G.locked = 4;
    G.vel.set(0, 0, 0);
    av().setLay('sleep');
    toast('😵 Bạn ngất xỉu... chủ đưa bạn về nhà.');
    fade.classList.add('on');
    later(2, () => {
      const [x, z] = DW(9, -12.5);
      const p = pos();
      p.set(x, 0, z);
      Object.assign(st, { health: Math.round(maxHealth() * 0.5), food: Math.max(st.food, 50), water: Math.max(st.water, 50), energy: Math.max(st.energy, 60), stamina: maxStamina() });
      prof.bones = Math.floor(prof.bones * 0.75);
      endEventsOnFail();
      save();
    });
    later(3.2, () => { fade.classList.remove('on'); av().setLay(''); });
  }

  function wake(msg) {
    if (!G.sleeping) return;
    G.sleeping = false;
    av().setLay('');
    G.netState = '';
    if (msg) toast(msg);
  }

  // ---------- quests ----------

  function addQuest(q) {
    if (G.quests.some((x) => x.id === q.id)) return null;
    const quest = { progress: 0, kind: 'daily', ...q };
    G.quests.push(quest);
    toast(`📜 Nhiệm vụ mới: ${quest.title}`);
    return quest;
  }
  function progress(id, n = 1) {
    const q = G.quests.find((x) => x.id === id);
    if (!q) return;
    q.progress = Math.min(q.goal, q.progress + n);
    if (q.progress >= q.goal) completeQuest(q);
  }
  function completeQuest(q) {
    G.quests = G.quests.filter((x) => x !== q);
    reward(q.xp, q.bones, `✅ Hoàn thành: ${q.title}`);
    G.questCd = 6;
  }
  function failQuest(id, msg) {
    const q = G.quests.find((x) => x.id === id);
    if (!q) return;
    G.quests = G.quests.filter((x) => x !== q);
    toast(msg ?? `❌ Thất bại: ${q.title}`);
  }
  function refillQuests(dt) {
    const regular = G.quests.filter((q) => q.kind === 'daily').length;
    if (!G.quests.some((q) => q.kind === 'main') && regular < 3) {
      G.questCd -= dt;
      if (G.questCd <= 0) {
        const options = QUEST_POOL.filter((q) => !G.quests.some((x) => x.id === q.id) && (!q.when || q.when(world)));
        if (options.length) addQuest({ ...options[Math.floor(Math.random() * options.length)] });
        G.questCd = 4;
      }
    }
  }

  // ---------- owner ----------

  const SPOTS = [[-10, -1.7], [-9.5, 14.8], [-14, -7.4], [3.4, 13.2]];
  function placeOwner() {
    const o = ownerAt(), w = o.w;
    o.mode = prof.ownerFound ? 'home' : 'missing';
    o.timer = rand(8, 18);
    o.say = 0;
    if (prof.ownerFound) { const [x, z] = DW(6, -10); w.pos.set(x, 0, z); w.stop(); }
    else { const [x, z] = DW(...SPOTS[Math.floor(Math.random() * SPOTS.length)]); w.pos.set(x, 0, z); w.stop(); }
    w.avatar.group.visible = true;
  }

  function ownerTick(dt) {
    const o = ownerAt(), p = pos();
    o.say -= dt;
    o.timer -= dt;
    const near = dist(o.pos, p);
    if (o.mode === 'missing') {
      o.w.face(p.x, p.z);
      if (o.say <= 0) { o.say = 9; if (near < 40) o.w.avatar.say(pick(['Cún ơi! Mày ở đâu?', 'Cún ơi, về đây với chủ!', 'Ai thấy con chó vàng nhà tôi không?']), 4); }
      if (near < 3) ownerFound();
    } else if (o.mode === 'toHome') {
      if (o.w.idle) {
        const [hx, hz] = DW(6, -9.5);
        if (!o.entered) { o.entered = true; o.w.goTo(hx, hz, 1.6); }
        else { o.mode = 'home'; o.entered = false; o.timer = 20; if (dist(o.pos, p) < 9) progress('follow'); else failQuest('follow', 'Chủ về nhà rồi. Hãy tự tìm đường về nhà chủ!'); }
      }
    } else if (o.mode === 'home') {
      const bowl = world.items.find((i) => i.id === 'homeBowl');
      if (o.timer <= 0) {
        o.timer = rand(18, 30);
        if (bowl && !bowl.ready) { const [bx, bz] = DW(3.4, -11); o.w.goTo(bx, bz, 1.5); o.feeding = true; }
        else { const [x, z] = DW(rand(2.5, 9.5), rand(-12.5, -6)); o.w.goTo(x, z, 1.1); }
      }
      if (o.feeding && o.w.idle) { o.feeding = false; if (bowl) { bowl.ready = true; bowl.cd = 0; } o.w.avatar.say('Ăn cơm nào, Cún!', 4); }
    } else if (o.mode === 'outing') {
      if (o.w.idle && o.arrived === false) { o.arrived = true; o.timer = 45; }
      if (o.arrived && o.timer <= 0) { o.mode = 'toHome'; o.entered = false; const d = home().door; o.w.goTo(d[0], d[1], 1.6); }
    }
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function ownerFound() {
    const o = ownerAt();
    prof.ownerFound = true;
    save();
    o.w.avatar.say('Cún! Tao tìm mày mãi! Về nhà thôi!', 5);
    world.fx.hearts(o.pos.x, 2, o.pos.z, 8);
    av().wag(4);
    progress('find');
    o.mode = 'toHome'; o.entered = false;
    const d = home().door;
    o.w.goTo(d[0], d[1], 1.8);
    addQuest({ id: 'follow', kind: 'main', title: 'Cùng chủ về nhà', desc: 'Đi theo chủ về nhà (nhà có biển "NHÀ CỦA CHỦ")', goal: 1, xp: 50, bones: 5 });
  }

  // ---------- events ----------

  const thiefInfo = () => world.thief;
  function endEventsOnFail() {
    if (G.event?.type === 'catcher') endCatcher(false);
    for (const id of ['escape']) failQuest(id);
  }
  const GATE = () => DW(23, 6);

  function spawnPerson(p, x, z) { p.w.pos.set(x, 0, z); p.w.stop(); p.w.avatar.group.visible = true; }
  function despawnPerson(p) { p.w.stop(); p.w.avatar.group.visible = false; }

  function startEvent(forced) {
    const options = ['catcher', 'ball', 'truck'];
    if (prof.ownerFound && ownerAt().mode === 'home') options.push('thief', 'thief');
    const type = forced || pick(options);
    const e = (G.event = { type, t: 0 });
    const banner = (s) => toast(s, 4500);
    if (type === 'thief') {
      const o = ownerAt();
      banner('🚶 Chủ ra công viên ngồi chơi...');
      o.mode = 'outing'; o.arrived = false;
      const [x, z] = DW(-6, -6.2);
      o.w.goTo(x, z, 1.8);
      e.stage = 0;
    } else if (type === 'catcher') {
      banner('⚠️ Người bắt chó xuất hiện ở cổng! Tránh xa hắn!');
      const c = world.catcher, [x, z] = GATE();
      spawnPerson(c, x, z);
      c.mode = 'patrol'; c.fear = 0; c.safe = 0; c.stun = 0; c.pathCd = 0;
      c.w.goTo(...DW(rand(-20, 20), 1.5), 2.2);
      e.limit = 120;
      addQuest({ id: 'escape', kind: 'event', title: 'Tránh người bắt chó', desc: 'Chạy xa hắn (trên 25 m) hoặc trốn vào nhà để thoát', goal: 1, xp: 70, bones: 6 });
    } else if (type === 'ball') {
      const k = world.kid;
      banner('⚽ Bé Na làm rơi quả bóng! Nhặt (F) rồi mang trả bé.');
      const [x, z] = DW(rand(-20, -8), rand(-9, -3));
      if (!G.ball) {
        G.ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf26b21, roughness: 0.6 }));
        G.ball.castShadow = true;
        scene.add(G.ball);
      }
      G.ball.position.set(x, 0.22, z);
      G.ball.visible = true;
      k.w.avatar.say('Ôi bóng của mình lăn mất rồi!', 5);
      e.ball = true;
      addQuest({ id: 'fetch', kind: 'event', title: 'Nhặt bóng cho bé', desc: 'Nhặt quả bóng cam (F), mang đến cho Bé Na (đứng gần bé rồi nhấn F)', goal: 1, xp: 60, bones: 5 });
    } else if (type === 'truck') {
      banner('🚚 Xe chở thịt làm rơi hàng trên vỉa hè! Mau đi ăn.');
      for (let i = 0; i < 4; i++) {
        const [x, z] = DW(rand(-20, 20), i % 2 ? rand(0.6, 2.4) : rand(9.6, 11.4));
        world.spawnFood('meat', x, z, 30);
      }
      G.event = null;
      return;
    }
  }

  function endCatcher(escaped) {
    const c = world.catcher;
    if (escaped) { c.w.avatar.say('Hừ! Con chó này nhanh thật!', 3); progress('escape'); }
    c.mode = 'leaving';
    const [x, z] = GATE();
    c.w.goTo(x, z, 2.5);
    G.event = { type: 'catcherLeaving', t: 0 };
  }

  function eventTick(dt) {
    const e = G.event;
    if (!e) {
      if (!prof.ownerFound && G.quests.some((q) => q.id === 'find')) return;
      G.eventCd -= dt;
      if (G.eventCd <= 0 && !G.sleeping && !G.carrying) { G.eventCd = rand(80, 150); startEvent(); }
      return;
    }
    e.t += dt;
    const p = pos();
    if (e.type === 'thief') {
      const o = ownerAt(), th = world.thief;
      if (e.stage === 0 && o.arrived) { // owner sits down in the park, then the thief shows up
        e.stage = 1; e.t = 0;
        const [x, z] = GATE();
        spawnPerson(th, x, z);
        th.fear = 0; th.grab = 0;
        th.w.goTo(o.pos.x, o.pos.z, 2.1);
        toast('🥷 Kẻ lạ mặt đang tiến về phía chủ! Sủa (Q) hoặc cắn (C) để đuổi hắn!', 5000);
        addQuest({ id: 'protect', kind: 'event', title: 'Bảo vệ chủ', desc: 'Sủa hoặc cắn kẻ lạ mặt để đuổi hắn đi trước khi hắn móc túi chủ', goal: 1, xp: 80, bones: 8 });
      } else if (e.stage === 1) {
        if (th.fear >= 3) {
          e.stage = 2; e.t = 0;
          th.w.avatar.say('Á! Chó dữ quá, chạy thôi!', 3);
          const [x, z] = GATE();
          th.w.goTo(x, z, 5.5);
          progress('protect');
          o.w.avatar.say('Cảm ơn Cún đã bảo vệ chủ!', 4);
          world.fx.hearts(o.pos.x, 2, o.pos.z, 6);
        } else {
          if (th.w.idle || e.t % 2 < dt) th.w.goTo(o.pos.x, o.pos.z, 2.1);
          if (dist(th.pos, o.pos) < 1.8) th.grab += dt; else th.grab = Math.max(0, th.grab - dt);
          if (th.grab > 4.5) {
            e.stage = 2; e.t = 0;
            o.w.avatar.say('Ối! Hắn móc mất ví của tôi!', 4);
            th.w.avatar.say('Hehe, cảm ơn nhé!', 3);
            const [x, z] = GATE();
            th.w.goTo(x, z, 5);
            failQuest('protect', '❌ Kẻ trộm đã móc túi chủ!');
          }
        }
      } else if (e.stage === 2) {
        const [gx, gz] = GATE();
        if (th.w.idle || dist(th.pos, { x: gx, z: gz }) < 3 || e.t > 25) { despawnPerson(th); G.event = null; o.mode = 'toHome'; o.entered = false; o.w.goTo(...home().door, 1.8); }
      } else if (e.stage === 0 && e.t > 40) { G.event = null; }
    } else if (e.type === 'catcher') {
      const c = world.catcher;
      const insideBldg = !!world.insideBuilding(p.x, p.z);
      const d = dist(c.pos, p);
      c.stun -= dt; c.pathCd -= dt;
      if (c.stun > 0) { c.w.stop(); return; }
      if (c.mode === 'patrol') {
        if (c.w.idle) c.w.goTo(...DW(rand(-21, 21), pick([1.5, 10.5, 7])), 2.2);
        if (d < 12 && !insideBldg && !G.sleeping) { c.mode = 'chase'; c.w.avatar.say('Con chó hoang kia! Đứng lại!', 3); toast('🚨 Bạn bị người bắt chó phát hiện! CHẠY (Shift)!', 3500); }
      } else if (c.mode === 'chase') {
        if (c.pathCd <= 0) { c.pathCd = 0.6; c.w.goTo(p.x, p.z, 5.2); }
        if (insideBldg || d > 25) c.safe += dt; else c.safe = Math.max(0, c.safe - dt);
        if (c.safe > 3.5) endCatcher(true);
        else if (d < 1.5 && !G.swimming && G.invuln <= 0) caught();
      }
      if (e.t > e.limit && c.mode === 'patrol') { endCatcher(false); failQuest('escape', ''); }
    } else if (e.type === 'catcherLeaving') {
      const c = world.catcher, [gx, gz] = GATE();
      if (c.w.idle || dist(c.pos, { x: gx, z: gz }) < 3 || e.t > 20) { despawnPerson(c); G.event = null; }
    } else if (e.type === 'ball') {
      if (e.t > 150 && !G.carrying) { G.ball.visible = false; G.event = null; failQuest('fetch', '⚽ Bé Na đã tự đi nhặt bóng.'); }
    }
  }

  function caught() {
    toast('🥅 Bạn bị người bắt chó tóm được! Bị tống ra cổng.');
    sfx('poof');
    yelp(1);
    hurt(18);
    setStat('food', st.food - 10); setStat('water', st.water - 10);
    fade.classList.add('on');
    G.locked = 2.5;
    later(1.2, () => { const [x, z] = DW(21, 6); pos().set(x, 0, z); });
    later(2.4, () => fade.classList.remove('on'));
    failQuest('escape', '❌ Bạn bị bắt! Người bắt chó đã thả bạn ở cổng.');
    endCatcher(false);
  }

  // ---------- actions ----------

  const facing = () => { const y = av().group.rotation.y; return { x: Math.sin(y), z: Math.cos(y) }; };

  /** True when the player can start a new action. */
  function free() {
    if (G.locked > 0 || G.stun > 0) return false;
    if (G.sleeping) { wake(); return false; }
    if (av().busy) return false;
    if (G.swimming) { toast('Đang bơi, không làm được!'); return false; }
    return true;
  }
  const act = (name) => { send({ t: 'act', a: name }); };
  const stop = () => { G.vel.set(0, 0, 0); };

  function doBark() {
    if (G.locked > 0 || G.stun > 0 || G.sleeping || !av().play('bark')) return;
    bark(1, 1 / (breed().size ** 0.7));
    act('bark');
    setStat('stamina', st.stamina - 2);
    const p = pos();
    world.dogs.forEach((d) => {
      const k = dist(d.pos, p);
      if (k > 14) return;
      if (d.temper === 'grumpy') { growl(0.6); d.say('Grrrr!'); }
      else if (d.temper !== 'shy' || k > 5) later(0.5 + k * 0.03, () => { bark(clamp(1 - k / 16, 0.1, 0.7), 1.1); d.av.play('bark'); d.say('Gâu gâu!', 2); });
    });
    for (const pr of world.people) {
      const k = dist(pr.pos, p);
      if (k > 12 || !pr.w.avatar.group.visible) continue;
      if (pr.role === 'ped' || pr.role === 'shop' || pr.role === 'neighbor') { if (k < 7 && Math.random() < 0.6) say(pr, pick(['Ối! Chó sủa!', 'Suỵt! Im nào cún!', 'Chó nhà ai thế?']), 2.5); }
      else if (pr.role === 'kid' && k < 10) say(pr, 'Cún sủa to quá! Hihi', 2.5);
      else if (pr.role === 'thief' && k < 14) { world.thief.fear = (world.thief.fear || 0) + 1; say(pr, pick(['Ê, suỵt!', 'Câm cái mồm lại!']), 2); }
      else if (pr.role === 'owner' && ownerAt().mode === 'missing') { ownerAt().w.avatar.say('Tiếng sủa quen quá! Cún đấy hả?', 3); ownerAt().w.face(p.x, p.z); }
      else if (pr.role === 'catcher' && world.catcher.w.avatar.group.visible) say(pr, 'Sủa cũng vô ích!', 2);
    }
    gainXp(1);
  }

  function doWag() {
    if (G.locked > 0 || G.sleeping) return;
    av().wag(3);
    act('wag');
    const p = pos(), o = ownerAt();
    if (dist(o.pos, p) < 3.5 && G.petCd <= 0 && o.w.avatar.group.visible && o.mode !== 'missing') {
      G.petCd = 25;
      setStat('health', st.health + 12);
      o.w.avatar.say(pick(['Ngoan lắm! Lại đây chủ vuốt nào.', 'Cún cưng của chủ!']), 3);
      world.fx.hearts(p.x, 1.6, p.z, 5);
      popText('+12 ❤', '#ff9ab0');
    }
    const who = world.nearestPerson(p.x, p.z, 3.5, ['ped', 'shop', 'neighbor']);
    if (who && (G.begCd.get(who.name) || 0) <= 0 && st.food < 90) {
      G.begCd.set(who.name, 30);
      if (Math.random() < 0.55) {
        say(who, pick(['Tội nghiệp, cho mày này!', 'Đói hả cưng? Ăn đi.']), 3);
        world.spawnFood('sandwich', who.pos.x + Math.sin(who.w.avatar.group.rotation.y) * 0.8, who.pos.z + Math.cos(who.w.avatar.group.rotation.y) * 0.8, 20);
        progress('beg');
      } else say(who, 'Xin lỗi, tôi không có gì đâu.', 2.5);
    }
  }

  const scentColor = { owner: 0xff8fb0, food: 0xffd24a, water: 0x6ad4ff, bone: 0xe8e0c8, thief: 0xff5a4a, ball: 0xff9a3a, kid: 0xb0ff8a };

  function targets() {
    const out = [], p = pos();
    if (ownerAt().mode === 'missing') out.push({ x: ownerAt().pos.x, z: ownerAt().pos.z, kind: 'owner', label: 'mùi của chủ' });
    if (G.quests.some((q) => q.id === 'protect') && world.thief.w.avatar.group.visible) out.push({ x: world.thief.pos.x, z: world.thief.pos.z, kind: 'thief', label: 'mùi kẻ lạ mặt' });
    if (G.quests.some((q) => q.id === 'fetch')) {
      if (G.carrying) out.push({ x: world.kid.pos.x, z: world.kid.pos.z, kind: 'kid', label: 'mùi của Bé Na' });
      else if (G.ball?.visible) out.push({ x: G.ball.position.x, z: G.ball.position.z, kind: 'ball', label: 'mùi quả bóng' });
    }
    const wantFood = st.food < 70, wantWater = st.water < 55;
    if (wantFood) {
      const f = world.items.filter((i) => i.ready && i.food).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (f) out.push({ x: f.x, z: f.z, kind: 'food', label: 'mùi thức ăn' });
    }
    if (wantWater) out.push({ x: world.pond.x - 4, z: world.pond.z + 3, kind: 'water', label: 'mùi nước' });
    return out.slice(0, 3);
  }

  /** Drops a line of glowing marks along the walking route to a target, one every 1.3 m, appearing one after another. */
  function showTrail(t) {
    const p = pos(), path = findPath(p.x, p.z, t.x, t.z);
    if (!path.length) return;
    const pts = [{ x: p.x, z: p.z }, ...path];
    const STEP = 1.3, MAX = 55;
    let n = 0, gap = STEP; // gap: distance still to walk before the next mark
    for (let i = 1; i < pts.length && n < MAX; i++) {
      const a = pts[i - 1], b = pts[i], len = dist(a, b);
      let s = gap;
      for (; s <= len && n < MAX; s += STEP, n++) {
        const k = s / len, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        later(n * 0.035, () => world.fx.emit('glow', x, 0.45, z, { life: 7, size: 0.75, color: scentColor[t.kind], v: [0, 0.1, 0] }));
      }
      gap = s - len;
    }
    later(n * 0.035, () => world.fx.emit('paw', t.x, 1.2, t.z, { life: 7, size: 1, v: [0, 0.1, 0], color: scentColor[t.kind] }));
  }

  function doSniff() {
    if (!free() || !av().play('sniff')) return;
    sfx('sniff');
    act('sniff');
    stop();
    gainXp(2);
    const reach = 12 + 6 * lv('smell');
    later(1.0, () => {
      const list = targets();
      if (list.length) { list.forEach(showTrail); toast(`👃 Bạn ngửi thấy ${list.map((t) => t.label).join(', ')} — theo vệt sáng!`); }
      const p = pos();
      const bones = world.buried.filter((b) => dist(b, p) < reach);
      bones.forEach((b) => world.fx.emit('bone', b.x, 0.6, b.z, { life: 6, size: 0.8, v: [0, 0.2, 0] }));
      if (bones.length) toast(`🦴 Có ${bones.length} mùi xương chôn gần đây! Hãy đào (X).`);
      else if (!list.length) toast('👃 Không ngửi thấy gì đặc biệt. Thử ở chỗ khác?');
    });
  }

  function dogTargets() {
    const p = pos(), list = [];
    for (const d of world.dogs) list.push({ x: d.pos.x, z: d.pos.z, ry: d.av.group.rotation.y, npc: d });
    for (const r of remoteDogs()) list.push({ x: r.x, z: r.z, ry: r.ry, remote: true });
    return list.filter((t) => dist(t, p) < 3.4).sort((a, b) => dist(a, p) - dist(b, p));
  }

  function doSniffButt() {
    if (!free()) return;
    const t = dogTargets()[0];
    if (!t) return toast('Hãy lại gần một chú chó khác để ngửi đít 🍑');
    const bx = t.x - Math.sin(t.ry) * 0.95, bz = t.z - Math.cos(t.ry) * 0.95; // just behind its tail
    G.auto = { x: bx, z: bz, yaw: Math.atan2(t.x - bx, t.z - bz), t: 0.5 };
    stop();
    later(0.55, () => {
      if (!G.active || !av().play('sniffbutt')) return;
      act('sniffbutt');
      sfx('sniff');
      gainXp(6);
      if (t.npc) npcReact(t.npc);
    });
  }

  function npcReact(d) {
    const p = pos();
    if (!G.friends.has(d.name)) { G.friends.add(d.name); progress('friend'); gainXp(8); }
    d.hold(3, p);
    if (d.temper === 'grumpy') { growl(0.9); d.say('Gừ! Đừng có ngửi tao!', 2.5); later(0.6, () => { d.av.play('bite'); hurt(8, d); }); }
    else if (d.temper === 'shy') { d.say('Ngại quá đi...', 2.5); d.av.wag(2); d.affinity++; }
    else if (d.temper === 'female') { d.affinity++; d.say(d.affinity >= 2 ? 'Ưm... anh cũng dễ mến đấy.' : 'Gâu? Ai đây ta...', 3); d.av.wag(2); world.fx.hearts(d.pos.x, 1.4, d.pos.z, d.affinity >= 2 ? 4 : 1); }
    else { d.say('Gâu! Bạn mới hả?', 2.5); d.av.wag(3); d.affinity++; }
  }

  function doPee() {
    if (!free() || !av().play('pee')) return;
    act('pee');
    stop();
    const p = pos(), f = facing();
    const px = p.x - f.x * 0.45 + f.z * 0.45, pz = p.z - f.z * 0.45 - f.x * 0.45;
    later(1.0, () => {
      if (!G.active) return;
      world.addDecal('puddle', px, pz);
      sfx('splash', 0.2);
      const b = world.insideBuilding(p.x, p.z);
      if (b) {
        const who = world.nearestPerson(p.x, p.z, 16, ['owner', 'shop', 'neighbor']);
        if (who) say(who, 'Ê! Đừng đái trong nhà! Hư quá!', 3);
        hurt(4);
        return;
      }
      const spot = world.marks.find((m) => dist(m, p) < 2.0);
      const key = `${Math.round(p.x / 3)},${Math.round(p.z / 3)}`;
      if (G.marks.has(key) && !spot) { popText('Chỗ này đã đánh dấu', '#ddd'); return; }
      G.marks.add(key);
      progress('mark');
      reward(spot ? 12 : 6, 0);
      if (spot) popText(`Đánh dấu ${spot.kind === 'hydrant' ? 'trụ nước' : spot.kind === 'lamp' ? 'cột đèn' : 'gốc cây'}!`, '#ffe27a');
      world.dogs.forEach((d) => { if (dist(d.pos, p) < 8 && d.temper === 'grumpy') d.say('Này! Lãnh thổ của tao!', 2.5); });
    });
  }

  function doBite() {
    if (!free() || !av().play('bite')) return;
    act('bite');
    bark(0.5, 0.8);
    stop();
    setStat('stamina', st.stamina - 4);
    const dmg = 10 * (1 + 0.25 * lv('bite')) * bonus('bite');
    later(0.28, () => {
      if (!G.active) return;
      const p = pos(), f = facing();
      const inFront = (q) => { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); return d < 2.1 && (d < 0.8 || (dx * f.x + dz * f.z) / d > 0.45); };
      let hit = false;
      for (const d of world.dogs) if (inFront(d.pos)) {
        hit = true;
        yelp(0.6);
        if (d.temper === 'grumpy') {
          d.hp -= dmg;
          d.hold(0.5, p);
          if (d.hp <= 0) { d.fled = 25; d.hp = 40; d.say('Ẳng ẳng! Tao thua!', 3); reward(35, 4, '🏆 Hổ Dữ đã bỏ chạy!'); }
          else { d.say('Á! Mày cắn tao hả?!', 2); d.av.play('bite'); later(0.4, () => hurt(8, d)); }
        } else { d.fled = 8; d.affinity = 0; d.say('Ẳng!', 2); }
      }
      for (const pr of world.people) {
        if (!pr.w.avatar.group.visible || !inFront(pr.pos)) continue;
        hit = true;
        if (pr.role === 'thief') { world.thief.fear = (world.thief.fear || 0) + 2; say(pr, 'Á! Đau quá!', 2); }
        else if (pr.role === 'catcher') { world.catcher.stun = 3.5; say(pr, 'Ối! Con chó này cắn thật!', 3); }
        else if (pr.role === 'owner') { say(pr, 'Ê! Không được cắn chủ!', 3); }
        else { say(pr, pick(['Á! Chó cắn người!', 'Đau quá! Cút đi!']), 3); G.rep++; if (Math.random() < 0.6) later(0.4, () => hurt(6)); }
      }
      if (hit) { world.fx.puff(p.x + f.x, 0.6, p.z + f.z, 3, 0xffffff, 0.6); gainXp(3); }
    });
  }

  function doDig() {
    if (!free()) return;
    const p = pos(), g = world.groundAt(p.x, p.z);
    if (!['grass', 'dirt'].includes(g)) return toast(g === 'floor' ? 'Không được đào sàn nhà!' : g === 'water' ? 'Đào dưới nước hả?' : 'Nền cứng, không đào được. Tìm bãi cỏ hoặc đất!');
    if (st.stamina < 12) return toast('Hết sức rồi, nghỉ một chút!');
    if (!av().play('dig')) return;
    act('dig');
    stop();
    setStat('stamina', st.stamina - 12);
    sfx('dig');
    const f = facing(), hx = p.x + f.x * 0.9, hz = p.z + f.z * 0.9;
    for (let i = 0; i < 8; i++) later(i * 0.28, () => world.fx.dirt(hx, 0.2, hz));
    later(2.3, () => {
      if (!G.active) return;
      world.addDecal('hole', hx, hz);
      if (world.digAt(hx, hz, 1.6 + 0.3 * lv('smell'))) {
        const n = 2 + lv('dig');
        gainBones(n);
        setStat('food', st.food + 8);
        reward(22, 0, `🦴 Đào được một khúc xương! +${n} xương`);
        world.fx.stars(hx, 0.7, hz);
        progress('dig');
      } else if (Math.random() < 0.2 + 0.07 * lv('dig')) {
        gainBones(1);
        reward(6, 0, '🦴 Tìm thấy một mẩu xương nhỏ.');
      } else { gainXp(3); popText('Chỉ có đất...', '#ddd'); }
    });
  }

  /** Courtship with any other dog nearby: an NPC stray or another player's dog. Kept cartoonish: hearts, bobbing, a puppy later. */
  function doLove() {
    if (!free()) return;
    const t = dogTargets()[0];
    if (!t) return toast('Chưa có chú chó nào ở gần. Hãy lại gần một bạn chó khác!');
    if (st.health < 40 || st.energy < 25) return toast('Bạn quá mệt. Hãy ăn và nghỉ đã!');
    const d = t.npc;
    if (d?.heat > 0) return d.say('Để em nghỉ chút đã...', 3);
    const ty = t.ry;
    const bx = t.x - Math.sin(ty) * 1.2, bz = t.z - Math.cos(ty) * 1.2;
    G.auto = { x: bx, z: bz, yaw: Math.atan2(t.x - bx, t.z - bz), t: 0.6 };
    stop();
    later(0.65, () => {
      if (!G.active || !av().play('love')) return;
      act('love');
      const mid = () => ({ x: (pos().x + (d ? d.pos.x : t.x)) / 2, z: (pos().z + (d ? d.pos.z : t.z)) / 2 });
      for (let i = 0; i < 9; i++) later(i * 0.55, () => { const m = mid(); world.fx.hearts(m.x, 1.5, m.z, 3); });
      setStat('stamina', st.stamina - 30); setStat('energy', st.energy - 15);
      if (d?.temper === 'grumpy') { d.hold(1, pos()); growl(0.9); d.say('Gừ! Biến đi!', 2.5); d.av.play('bite'); later(0.5, () => hurt(8, d)); return; }
      if (d) { d.hold(5.2, pos()); d.av.play('love', true); d.heat = 300; d.say('Em yêu anh~ ❤', 5); }
      later(5.4, () => {
        reward(60, 5, `💕 Bạn và ${d ? d.name : 'bạn chó'} đã thành đôi! Sắp có chó con...`);
        G.pregnant = 45;
      });
    });
  }

  function spawnPuppy() {
    if (G.puppies.length >= 2) return;
    const look = { breed: pick(['ta', 'shiba', 'corgi']), acc: ['bow'] };
    const pup = new DogAvatar('Chó con', look, 0.5);
    const p = pos();
    pup.group.position.set(p.x - 1, 0, p.z - 1);
    scene.add(pup.group);
    G.puppies.push(pup);
    pup.say('Gâu gâu! Bố ơi!', 4);
    toast('🐶 Cô Mực đã sinh một chú chó con! Nó sẽ đi theo bạn.');
    reward(80, 5);
  }

  function doSleep() {
    if (G.locked > 0 || G.stun > 0) return;
    if (G.sleeping) return wake('Bạn tỉnh dậy.');
    if (G.swimming) return toast('Không ngủ dưới nước được!');
    if (world.catcher.w.avatar.group.visible && dist(world.catcher.pos, pos()) < 14) return toast('Người bắt chó ở gần quá, không dám ngủ!');
    if (st.energy > 92) return toast('Bạn chưa buồn ngủ.');
    G.sleeping = true;
    G.netState = 'sleep';
    G.vel.set(0, 0, 0);
    av().setLay('sleep');
    toast('😴 Bạn ngủ... (nhấn Z hoặc di chuyển để dậy)');
  }

  function drink() {
    if (!av().play('eat')) return;
    act('eat');
    sfx('munch', 0.4);
    later(1.2, () => { setStat('water', st.water + 50); popText('+50 💧', '#8ad4ff'); });
  }

  function doInteract() {
    if (G.locked > 0 || G.stun > 0 || G.sleeping) return G.sleeping && wake();
    if (G.swimming) { if (st.water < 98) { setStat('water', st.water + 12); sfx('splash', 0.3); popText('+ nước', '#8ad4ff'); } return; }
    const p = pos();
    if (G.carrying) { // drop the ball at the kid
      const k = world.kid;
      if (dist(k.pos, p) < 3.5) {
        G.carrying = null; av().setCarry(null); G.ball.visible = false; G.event = null;
        k.w.avatar.say('Cún giỏi quá! Cảm ơn nhé!', 4);
        world.fx.hearts(k.pos.x, 1.6, k.pos.z, 6);
        progress('fetch');
        return;
      }
      G.carrying = null; av().setCarry(null);
      G.ball.position.set(p.x + facing().x, 0.22, p.z + facing().z); G.ball.visible = true; scene.add(G.ball);
      return toast('Bạn thả quả bóng xuống.');
    }
    if (G.ball?.visible && dist(G.ball.position, p) < 2) {
      G.carrying = G.ball; G.ball.visible = true; scene.remove(G.ball); av().setCarry(G.ball); G.ball.position.set(0, -0.02, 0.04);
      return toast('Bạn ngậm quả bóng. Mang đến cho Bé Na (đứng gần bé rồi nhấn F)!');
    }
    const it = nearestItem();
    if (it) return useItem(it);
    if (dist(world.pond, p) < world.pond.r + 1.8 && dist(world.pond, p) > world.pond.r - 1) return drink();
    if (world.insideBuilding(p.x, p.z) === world.petshop) { openMenu('acc'); return; }
    const o = ownerAt();
    if (dist(o.pos, p) < 3 && o.mode !== 'missing') return doWag();
    const hh = world.doghouse;
    if (dist({ x: hh[0], z: hh[1] }, p) < 2.2) return doSleep();
    toast('Không có gì để tương tác ở đây.');
  }

  const nearestItem = () => {
    const p = pos();
    return world.items.filter((i) => i.ready && dist(i, p) < 2.3).sort((a, b) => dist(a, p) - dist(b, p))[0];
  };
  const itemLabel = (i) => i.label || 'Ăn';

  function useItem(it) {
    if (it.food && st.food > 96 && !it.water) return toast('Bạn no căng rồi!');
    if (!av().play('eat')) return;
    act('eat');
    sfx('munch', 0.5);
    stop();
    G.auto = { x: it.x, z: it.z, yaw: Math.atan2(it.x - pos().x, it.z - pos().z), t: 0.35, soft: true };
    later(1.5, () => {
      if (!G.active) return;
      let food = it.food;
      if (it.guard === 'butcher' && Math.random() < it.risk) {
        const k = world.keeper.butcher;
        say(k, 'Chó ăn trộm! Cút ra khỏi tiệm!', 3);
        hurt(10);
        G.stun = 0.8;
        const p = pos();
        G.vel.set(0, 0, 6 * Math.sign(p.z - k.pos.z || -1));
        toast('😾 Chú Tư bán thịt đuổi đánh bạn!');
        food *= 0.5;
      } else if (it.guard === 'neighbor' && Math.random() < it.risk) {
        say(world.keeper.neighbor, 'Ơ, chó nhà ai ăn cơm của tôi thế?', 3);
      } else if (it.risk && Math.random() < it.risk) {
        hurt(8);
        popText('Đồ ôi thiu! 🤢', '#9acf5a');
        food *= 0.5;
      }
      setStat('food', st.food + food);
      if (it.water) setStat('water', st.water + it.water);
      world.consume(it);
      popText(`+${Math.round(food)} 🍖`, '#ffd24a');
      reward(4, 0);
      progress('food');
    });
  }

  // ---------- movement ----------

    function control(dt, dir, keys) {
    const a = av(), p = a.group.position;
    const moveWanted = dir.lengthSq() > 0.01;
    G.invuln = Math.max(0, G.invuln - dt);
    G.stun = Math.max(0, G.stun - dt);
    G.locked = Math.max(0, G.locked - dt);
    G.petCd = Math.max(0, G.petCd - dt);
    for (const [k, v] of G.begCd) G.begCd.set(k, v - dt);

    if (G.sleeping && moveWanted) wake();

    // scripted nudges (walk behind another dog, face the food...)
    if (G.auto) {
      const u = G.auto;
      u.t -= dt;
      const k = 1 - Math.exp(-dt * 8);
      if (!u.soft) { p.x += (u.x - p.x) * k; p.z += (u.z - p.z) * k; }
      a.group.rotation.y = lerpAngle(a.group.rotation.y, u.yaw, k);
      if (u.t <= 0) G.auto = null;
    }

    const doingAction = a.busy && a.action !== 'bark';
    const canMove = !G.sleeping && G.stun <= 0 && G.locked <= 0 && !doingAction && !G.auto;
    const wantRun = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && moveWanted;
    const swimLv = lv('swim');
    // exhaustion: can't run until the stamina bar has recovered a little
    if (st.stamina <= 1) G.exhausted = true;
    else if (st.stamina > 25) G.exhausted = false;
    const water = world.inWater(p.x, p.z);
    const running = canMove && wantRun && !G.exhausted && !water;
    G.running = running;

    let speed = 3.6;
    if (running) speed = 8.2;
    speed *= (1 + 0.06 * lv('speed')) * bonus('spd') * (G.carrying ? 0.92 : 1);
    if (water) speed = 3.0 * (1 + 0.08 * swimLv);
    if (st.food <= 0 || st.water <= 0) speed *= 0.8;
    const want = canMove && moveWanted ? dir.clone().normalize().multiplyScalar(speed) : new THREE.Vector3();
    if (!canMove) want.set(0, 0, 0);
    if (G.stun > 0.3) { /* knocked back: keep velocity */ } else G.vel.lerp(want, 1 - Math.exp(-dt * (moveWanted && canMove ? 8 : 12)));
    if (G.stun > 0) G.vel.multiplyScalar(Math.exp(-dt * 3));
    const sp = G.vel.length();
    G.speed = sp;
    if (sp > 0.01) {
      p.x = clamp(p.x + G.vel.x * dt, -BOUNDS, BOUNDS);
      p.z = clamp(p.z + G.vel.z * dt, -BOUNDS, BOUNDS);
      collide(p, 0.4);
    }
    const moving = sp > 0.6;
    if (moving && !G.auto && G.stun <= 0) a.group.rotation.y = lerpAngle(a.group.rotation.y, Math.atan2(G.vel.x, G.vel.z), 1 - Math.exp(-dt * 12));

    // vertical motion: jump, fall, float
    if (water) {
      if (!G.swimming) { G.swimming = true; sfx('splash', 0.7); world.fx.splash(p.x, p.z); G.vy = 0; }
      p.y += (-0.06 - p.y) * (1 - Math.exp(-dt * 8));
      G.vy = 0;
      G.swimTime += dt;
      if (moving && Math.random() < dt * 3) world.fx.emit('ring', p.x, 0.12, p.z, { life: 1.2, size: 0.5, grow: 1.6, opacity: 0.8 });
      progress('swim', dt);
      G.wet = 1;
      G.shaken = false;
    } else {
      if (G.swimming) { G.swimming = false; world.fx.splash(p.x, p.z); }
      const wantJump = keys.has('Space') && canMove && p.y <= 0.01 && G.vy === 0 && st.stamina >= 10;
      if (wantJump) { G.vy = 7.2; setStat('stamina', st.stamina - 8); }
      if (p.y > 0 || G.vy > 0) {
        G.vy -= 22 * dt;
        p.y += G.vy * dt;
        if (p.y <= 0) { p.y = 0; G.vy = 0; }
      } else p.y += (0 - p.y) * (1 - Math.exp(-dt * 12));
    }
    a.swim = water;
    a.gait = running ? 2 : 1;
    a.air = p.y > 0.03 ? (G.vy || 0.01) : 0;

    // shake off after swimming
    if (!water && !G.shaken && G.wet > 0 && !a.busy && G.stun <= 0 && p.y < 0.05) { G.shaken = true; a.play('shake'); act('shake'); world.fx.splash(p.x, p.z); }

    // cars
    const car = world.carHit(p.x, p.z, p.y);
    if (car && G.invuln <= 0 && G.locked <= 0) {
      sfx('honk');
      const side = Math.sign(p.z - car.z) || 1;
      G.vel.set(car.dir * 1.5, 0, side * 7);
      G.vy = 5.5;
      G.stun = 1.1;
      G.side = null;
      hurt(24, car);
      toast('🚗 Bạn bị xe tông! Cẩn thận khi qua đường!');
    }
    // crossing the street counts when you reach the opposite pavement without being hit
    if (Math.abs(p.x - DOG.cx) < DOG.hw) {
      const lz = p.z - DOG.cz, side = lz < 3 ? 'N' : lz > 9 ? 'S' : null;
      if (side) { if (G.side && G.side !== side) progress('cross'); G.side = side; }
    }

    a.update(dt, moving);
    return moving;
  }

  // ---------- survival tick ----------

  function survival(dt) {
    const p = pos(), cl = world.clock;
    const indoors = !!world.insideBuilding(p.x, p.z) || dist({ x: world.doghouse[0], z: world.doghouse[1] }, p) < 1.6;
    const rain = cl.rain > 0.3 && !indoors;
    const slow = G.sleeping ? 0.35 : 1;
    st.food = Math.max(0, st.food - 0.26 * slow * dt);
    st.water = Math.max(0, st.water - (0.34 + (G.running ? 0.2 : 0)) * slow * dt);
    if (rain && !G.sleeping) st.water = Math.min(100, st.water + 0.25 * dt);
    if (G.sleeping) setStat('energy', st.energy + (indoors ? 4.5 : 2.6) * dt);
    else st.energy = Math.max(0, st.energy - (0.11 + (G.running ? 0.12 : 0)) * dt);
    if (G.running) setStat('stamina', st.stamina - 14 * (1 - 0.07 * lv('stamina')) * dt);
    else if (G.swimming) setStat('stamina', st.stamina - 5 * (1 - 0.1 * lv('swim')) * dt);
    else {
      const rest = G.sleeping ? 26 : G.speed > 0.6 ? 8 : 15;
      setStat('stamina', st.stamina + rest * (1 + 0.1 * lv('stamina')) * (st.food > 25 ? 1 : 0.4) * (rain ? 0.7 : 1) * dt);
    }
    if (st.food <= 0) setStat('health', st.health - 1.0 * dt);
    if (st.water <= 0) setStat('health', st.health - 1.4 * dt);
    if (st.energy <= 0) setStat('health', st.health - 0.5 * dt);
    else if (st.food > 35 && st.water > 35 && st.energy > 15 && !(rain && cl.night > 0.5)) setStat('health', st.health + (0.7 + 0.25 * lv('vital')) * (G.sleeping ? 1.8 : 1) * dt);
    if (G.wet > 0 && !G.swimming) G.wet = Math.max(0, G.wet - dt / 20);
    if (st.health <= 0) faint();
    if (st.energy <= 0 && !G.sleeping && G.locked <= 0) { toast('💤 Kiệt sức! Bạn ngủ gục tại chỗ.'); doSleep(); }
    if (G.sleeping && st.energy >= 100) wake('Ngủ đã đời! Bạn tỉnh dậy sảng khoái.');
    if (G.sleeping && rain && !indoors) { setStat('health', st.health - 0.6 * dt); }
    if (cl.rain > 0.3 && indoors) progress('rain', dt);
  }

  // ---------- HUD ----------

  function bar(cls, icon, label, v, max) {
    return `<div class="bar ${cls}"><i style="width:${(100 * v) / max}%"></i><span>${icon} ${label} ${Math.round(v)}/${max}</span></div>`;
  }
  function weatherLabel(cl) {
    const w = { clear: '☀️ Trời quang', cloudy: '☁️ Nhiều mây', rain: '🌧️ Mưa', storm: '⛈️ Giông bão' }[cl.weather];
    return cl.night > 0.6 ? w.replace('☀️', '🌙') : w;
  }
  function renderHud() {
    const cl = world.clock, h = Math.floor(cl.hour), m = Math.floor((cl.hour % 1) * 60);
    const need = xpNeed(prof.level);
    hud.innerHTML = `<div class="dogTitle">🐕 ${breed().name} · Cấp ${prof.level} · 🦴 ${prof.bones}</div>
      <div class="bar xp"><i style="width:${(100 * prof.xp) / need}%"></i><span>XP ${prof.xp}/${need}${prof.points ? ` · ${prof.points} điểm kỹ năng (P)` : ''}</span></div>
      ${bar('hp', '❤️', 'Sức khỏe', st.health, maxHealth())}${bar('food', '🍖', 'No bụng', st.food, 100)}${bar('water', '💧', 'Nước', st.water, 100)}
      ${bar('energy', '😴', 'Năng lượng', st.energy, 100)}${bar('stamina', '⚡', 'Thể lực', st.stamina, maxStamina())}
      <div class="dogClock">🕒 ${fmt(h)}:${fmt(m)} · ${weatherLabel(cl)}${G.exhausted ? ' · 😮‍💨 Hết hơi' : ''}</div>`;
    questBox.innerHTML = G.quests.length ? `<b>📜 Nhiệm vụ</b>` + G.quests.map((q) => `<div class="q ${q.kind}"><div>${q.title}</div><small>${q.desc}</small><div class="bar mini"><i style="width:${(100 * q.progress) / q.goal}%"></i></div></div>`).join('') : '';
  }

  function renderPrompt() {
    const p = pos();
    let text = '';
    if (G.sleeping) text = 'Z · Thức dậy';
    else if (G.carrying) text = dist(world.kid.pos, p) < 3.5 ? 'F · Đưa bóng cho Bé Na' : 'F · Thả bóng';
    else if (G.ball?.visible && dist(G.ball.position, p) < 2) text = 'F · Ngậm quả bóng';
    else {
      const it = nearestItem();
      if (it) text = `F · ${itemLabel(it)}`;
      else if (dist(world.pond, p) < world.pond.r + 1.8 && dist(world.pond, p) > world.pond.r - 1) text = 'F · Uống nước ao';
      else if (world.insideBuilding(p.x, p.z) === world.petshop) text = 'F · Mở cửa hàng phụ kiện';
      else if (G.swimming) text = 'F · Uống nước (đang bơi)';
      else {
        const t = dogTargets()[0];
        if (t) text = 'B · Ngửi đít' + ' · M · Giao phối';
      }
    }
    prompt.textContent = text;
    prompt.style.display = text ? 'block' : 'none';
  }

  // ---------- menu ----------

  let menuTab = 'skills';
  function openMenu(tab) { if (tab) menuTab = tab; menu.style.display = 'block'; renderMenu(); }
  function closeMenu() { menu.style.display = 'none'; }
  const atShop = () => { const p = pos(); return world.insideBuilding(p.x, p.z) === world.petshop; };
  function renderMenu() {
    const tabs = [['skills', '⭐ Kỹ năng'], ['breeds', '🐕 Giống chó'], ['acc', '🎀 Phụ kiện'], ['quests', '📜 Nhiệm vụ'], ['help', '❓ Hướng dẫn']];
    let body = '';
    if (menuTab === 'skills') {
      body = `<p>Cấp <b>${prof.level}</b> · Điểm kỹ năng: <b>${prof.points}</b> · Xương: <b>${prof.bones}</b>🦴</p>` + SKILLS.map((s) => `<div class="row"><span>${s.icon} <b>${s.name}</b> ${'●'.repeat(lv(s.id))}${'○'.repeat(MAX_SKILL - lv(s.id))}<br><small>${s.desc}</small></span><button data-act="skill" data-id="${s.id}" ${prof.points && lv(s.id) < MAX_SKILL ? '' : 'disabled'}>+</button></div>`).join('');
    } else if (menuTab === 'breeds') {
      body = BREEDS.map((b) => {
        const open = prof.level >= b.lvl;
        return `<div class="row ${prof.breed === b.id ? 'sel' : ''}"><span><b>${b.name}</b> ${open ? '' : `🔒 cấp ${b.lvl}`}<br><small>${b.desc}</small></span><button data-act="breed" data-id="${b.id}" ${open ? '' : 'disabled'}>${prof.breed === b.id ? 'Đang dùng' : 'Chọn'}</button></div>`;
      }).join('');
    } else if (menuTab === 'acc') {
      body = `<p>Xương: <b>${prof.bones}</b>🦴 ${atShop() ? '' : '· <i>Vào cửa hàng thú cưng (PET SHOP) để mua đồ mới</i>'}</p>` + ACCESSORIES.map((a) => {
        const own = prof.owned.includes(a.id), worn = prof.worn.includes(a.id);
        return `<div class="row ${worn ? 'sel' : ''}"><span><b>${a.name}</b>${own ? '' : ` · ${a.price}🦴`}</span>` +
          (own ? `<button data-act="wear" data-id="${a.id}">${worn ? 'Cởi' : 'Đeo'}</button>` : `<button data-act="buy" data-id="${a.id}" ${atShop() && prof.bones >= a.price ? '' : 'disabled'}>Mua</button>`) + '</div>';
      }).join('');
    } else if (menuTab === 'quests') {
      body = G.quests.length ? G.quests.map((q) => `<div class="row"><span><b>${q.title}</b> (${Math.floor(q.progress)}/${q.goal})<br><small>${q.desc} · thưởng ${q.xp} XP${q.bones ? `, ${q.bones}🦴` : ''}</small></span></div>`).join('') : '<p>Chưa có nhiệm vụ. Chờ một lát...</p>';
    } else {
      body = `<div class="help">
        <p><b>Di chuyển:</b> WASD · Shift chạy · Space nhảy · bơi tự động khi xuống ao</p>
        <p><b>Q</b> sủa · <b>R</b> vẫy đuôi · <b>V</b> đánh hơi (hiện vệt mùi tới mục tiêu) · <b>B</b> ngửi đít chó khác · <b>U</b> đái bậy (đánh dấu lãnh thổ) · <b>C</b> cắn · <b>X</b> đào đất · <b>M</b> giao phối (với bất kỳ chú chó nào ở gần) · <b>Z</b> ngủ · <b>F</b> ăn / uống / nhặt / mở cửa hàng · <b>P</b> mở bảng này · Enter chat</p>
        <p><b>Sinh tồn:</b> theo dõi No bụng, Nước, Năng lượng, Thể lực, Sức khỏe. Đói khát sẽ mất máu. Ngủ trong nhà hồi năng lượng nhanh nhất; ngủ ngoài mưa thì mất máu.</p>
        <p><b>Nguy hiểm:</b> xe cộ trên đường, người bắt chó, chó dữ ở hẻm sau tiệm, thức ăn ôi thiu, chủ tiệm đuổi đánh khi ăn trộm.</p>
        <p><b>Phát triển:</b> làm nhiệm vụ & hành động để lấy XP; lên cấp nhận điểm kỹ năng, mở giống chó mới; kiếm xương 🦴 để mua phụ kiện.</p></div>`;
    }
    menu.innerHTML = `<div class="tabs">${tabs.map(([id, n]) => `<button data-act="tab" data-id="${id}" class="${menuTab === id ? 'on' : ''}">${n}</button>`).join('')}<button data-act="close">✕</button></div><div class="body">${body}</div>`;
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { act: a, id } = b.dataset;
    if (a === 'tab') menuTab = id;
    else if (a === 'close') return closeMenu();
    else if (a === 'skill' && prof.points && lv(id) < MAX_SKILL) { prof.skills[id] = lv(id) + 1; prof.points--; if (id === 'vital') setStat('health', st.health + 10); }
    else if (a === 'breed' && prof.level >= breedOf(id).lvl) { prof.breed = id; applyLook(); }
    else if (a === 'wear') { prof.worn = prof.worn.includes(id) ? prof.worn.filter((x) => x !== id) : [...prof.worn, id]; applyLook(); }
    else if (a === 'buy') { const acc = ACCESSORIES.find((x) => x.id === id); if (atShop() && prof.bones >= acc.price && !prof.owned.includes(id)) { prof.bones -= acc.price; prof.owned.push(id); prof.worn.push(id); sfx('coin'); applyLook(); world.keeper.pet.w.avatar.say('Cảm ơn quý khách! Đẹp lắm!', 3); } }
    save();
    renderMenu();
  });

  const look = () => ({ breed: prof.breed, acc: prof.worn });
  function applyLook() {
    if (!G.me) return;
    G.me.avatar.setLook(look());
    send({ t: 'look', b: prof.breed, a: prof.worn });
    setStat('health', st.health);
  }

  // ---------- public API ----------

  const KEYS = {
    KeyQ: doBark, KeyR: doWag, KeyV: doSniff, KeyB: doSniffButt, KeyU: doPee, KeyC: doBite, KeyX: doDig, KeyM: doLove, KeyZ: doSleep, KeyF: doInteract,
    KeyP: () => (menu.style.display === 'block' ? closeMenu() : openMenu()),
    Escape: closeMenu,
  };

  G.begin = (me) => {
    G.active = true;
    G.me = me;
    G.vel.set(0, 0, 0);
    G.tasks.length = 0;
    me.avatar.setLook(look());
    send({ t: 'look', b: prof.breed, a: prof.worn });
    placeOwner();
    if (!prof.ownerFound && !G.quests.some((q) => q.id === 'find')) addQuest({ id: 'find', kind: 'main', title: 'Tìm chủ', desc: 'Bạn bị lạc chủ! Đánh hơi (V) rồi theo vệt mùi tới chỗ chủ. Sủa (Q) để chủ nghe thấy.', goal: 1, xp: 80, bones: 6 });
    hud.style.display = 'block'; questBox.style.display = 'block';
    G.hudCd = 0;
    toast('🐕 Bạn đã biến thành chó! Nhấn P xem hướng dẫn.', 4500);
  };

  G.end = () => {
    if (!G.active) return;
    G.active = false;
    wake();
    closeMenu();
    hud.style.display = 'none'; questBox.style.display = 'none'; prompt.style.display = 'none';
    for (const pup of G.puppies) scene.remove(pup.group);
    G.puppies.length = 0;
    if (G.carrying) { G.carrying = null; G.me?.dogAv.setCarry(null); G.ball.visible = false; }
    if (G.ball) G.ball.visible = false;
    if (G.event?.type === 'catcher') { despawnPerson(world.catcher); }
    if (G.event?.type === 'thief') despawnPerson(world.thief);
    G.event = null;
    G.eventCd = Math.max(G.eventCd, 40);
    G.quests = G.quests.filter((q) => !['escape', 'protect', 'fetch'].includes(q.id));
    G.me = null;
  };

  G.control = control;
  G.key = (code) => { const f = KEYS[code]; if (!f || !G.active) return false; f(); return true; };
  G.look = look;

  G.update = (dt) => {
    if (!G.active || !G.me) return;
    for (let i = G.tasks.length - 1; i >= 0; i--) { const t = G.tasks[i]; t.t -= dt; if (t.t <= 0) { G.tasks.splice(i, 1); t.fn(); } }
    survival(dt);
    ownerTick(dt);
    eventTick(dt);
    refillQuests(dt);
    if (G.pregnant > 0) { G.pregnant -= dt; if (G.pregnant <= 0) spawnPuppy(); }
    const p = pos();
    G.puppies.forEach((pup, i) => { // puppies trot after the player
      const g = pup.group, tx = p.x - Math.sin(av().group.rotation.y) * (1.6 + i), tz = p.z - Math.cos(av().group.rotation.y) * (1.6 + i);
      const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      const sp = Math.min(d * 2.2, 6);
      if (d > 0.5) { g.position.x += (dx / d) * sp * dt; g.position.z += (dz / d) * sp * dt; g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8)); }
      pup.gait = sp > 4 ? 2 : 1; pup.wag(0.1);
      pup.update(dt, d > 0.7);
    });
    G.hudCd -= dt;
    if (G.hudCd <= 0) { G.hudCd = 0.2; renderHud(); renderPrompt(); if (menu.style.display === 'block' && menuTab === 'quests') renderMenu(); }
  };

  /** What the world needs to know about the player each frame. */
  G.info = { get running() { return G.running; }, get calm() { return G.speed < 4 && !G.sleeping; }, hit: (d, src) => hurt(d, src) };

  return G;
}

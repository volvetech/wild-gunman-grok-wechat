const W = 480;
const H = 270;
const FOOT = 236 / 256;
const KEY = "noon-duel-save";

const NAMES = { dust: "DUST", scar: "SCAR", poncho: "PONCHO", boss: "BLACK SUN" };
const CLASSIC = [
  { gunmen: ["dust"], wait: [1.5, 2.8], enemy: 0.56, fakeouts: 0 },
  { gunmen: ["scar"], wait: [1.6, 3.2], enemy: 0.46, fakeouts: 1 },
  { gunmen: ["poncho"], wait: [1.8, 3.6], enemy: 0.38, fakeouts: 1 },
  { gunmen: ["dust", "scar"], wait: [1.6, 3.0], enemy: [0.48, 0.42], fakeouts: 1 },
  { gunmen: ["boss"], wait: [2.6, 5.4], enemy: 0.28, fakeouts: 2 },
];
const DUO = [
  { gunmen: ["dust", "scar"], wait: [1.6, 3.0], enemy: [0.52, 0.48], fakeouts: 0 },
  { gunmen: ["scar", "poncho"], wait: [1.7, 3.4], enemy: [0.44, 0.4], fakeouts: 1 },
  { gunmen: ["poncho", "boss"], wait: [2.2, 4.6], enemy: [0.3, 0.26], fakeouts: 2 },
];
const OPEN_SCENES = ["street", "arizona", "tombstone", "cactus"];

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function spawnX(count, i) {
  return count === 1 ? 0.5 : i === 0 ? 0.34 : 0.66;
}
function getRound(mode, index) {
  const pack = mode === "duo" ? DUO : CLASSIC;
  if (mode === "endless") {
    const pool = index < 3 ? ["dust", "scar"] : ["scar", "poncho", "boss"];
    const duo = index > 2 && index % 3 === 0;
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    const gunmen = duo ? [pick(), pick()] : [pick()];
    if (gunmen[0] === gunmen[1]) gunmen[1] = pool.find((g) => g !== gunmen[0]) || "scar";
    return { gunmen, wait: [1.3, 3.6], enemy: gunmen.map(() => Math.max(0.2, 0.5 - index * 0.02)), fakeouts: index < 3 ? 0 : 1 };
  }
  return pack[Math.min(index, pack.length - 1)];
}
function pickScene(mode) {
  if (mode === "duo") return "corral";
  return OPEN_SCENES[Math.floor(Math.random() * OPEN_SCENES.length)];
}
function storageGet() {
  try {
    return JSON.parse(wx.getStorageSync(KEY) || "null") || { best: 0, fastest: null };
  } catch (e) {
    return { best: 0, fastest: null };
  }
}
function storageSet(data) {
  try {
    wx.setStorageSync(KEY, JSON.stringify(data));
  } catch (e) {}
}

function makeFighter(id, x, enemyTime) {
  return {
    id, x, y: 0.97, scale: 1, pose: "idle", animT: 0, alive: true,
    enemyTime, shot: false, hitMs: null, enter: 0, muzzleT: 0, impactT: 0,
  };
}

function createState() {
  return {
    screen: "title", mode: "classic", scene: pickScene("classic"), phase: "intro",
    round: 0, totalRounds: CLASSIC.length, lives: 3, score: 0, streak: 0,
    fighters: [makeFighter("dust", 0.5, 0.5)],
    waitDuration: 2, waitElapsed: 0, fireElapsed: 0, fireAt: 0,
    reactionMs: null, outcome: null, lastAward: 0, enemyMs: 0,
    pointer: { x: 0.5, y: 0.5 }, paused: false, flash: 0, redFlash: 0,
    save: storageGet(), menu: 0,
  };
}

function startGame(s, mode) {
  s.mode = mode;
  s.scene = pickScene(mode);
  s.screen = "playing";
  s.round = 0;
  s.totalRounds = mode === "classic" ? CLASSIC.length : mode === "duo" ? DUO.length : 99;
  s.lives = 3;
  s.score = 0;
  s.streak = 0;
  beginRound(s);
}

function beginRound(s) {
  const def = getRound(s.mode, s.round);
  const times = Array.isArray(def.enemy) ? def.enemy : def.gunmen.map(() => def.enemy);
  s.fighters = def.gunmen.map((id, i) => makeFighter(id, spawnX(def.gunmen.length, i), times[i] || 0.4));
  s.phase = "intro";
  s.waitDuration = rand(def.wait[0], def.wait[1]);
  s.waitElapsed = 0;
  s.fireElapsed = 0;
  s.fireAt = 0;
  s.reactionMs = null;
  s.outcome = null;
  s.lastAward = 0;
  s.enemyMs = Math.round((times[0] || 0.4) * 1000);
}

function fighterAt(s, nx, ny) {
  for (const f of s.fighters) {
    if (!f.alive || f.shot) continue;
    const cell = 210 * f.scale;
    const cx = f.x;
    const top = f.y - (cell * FOOT) / H;
    const left = cx - (cell * 0.5) / W;
    const bw = (cell * 0.34) / W;
    const bh = (cell * 0.72) / H;
    if (nx > left + 0.08 && nx < left + 0.08 + bw && ny > top + 0.12 && ny < top + 0.12 + bh) return f;
  }
  return null;
}

function resolve(s, outcome, ms) {
  s.phase = "resolve";
  s.outcome = outcome;
  s.reactionMs = ms;
  if (outcome === "hit") {
    s.lastAward = Math.max(50, 800 - Math.floor((ms || 0) / 2));
    s.score += s.lastAward;
    s.streak += 1;
    play("win");
  } else {
    s.streak = 0;
    s.lives -= 1;
    s.lastAward = 0;
    s.redFlash = outcome === "slow" ? 0.4 : 0.7;
    for (const f of s.fighters) {
      if (f.alive && !f.shot) {
        f.animT = 0;
        f.pose = outcome === "chicken" ? "laugh" : outcome === "slow" ? "draw" : "shoot";
        if (f.pose === "shoot") f.muzzleT = 0.28;
      }
    }
    play(outcome === "chicken" ? "laugh" : "fail");
  }
}

function tryShoot(s, nx, ny, now) {
  if (s.screen !== "playing" || s.phase === "resolve") return;
  play("shot");
  s.flash = 0.3;
  if (s.phase === "standoff" || now < s.fireAt - 2) {
    resolve(s, "chicken", null);
    return;
  }
  const target = fighterAt(s, nx, ny);
  const ms = Math.max(0, now - s.fireAt);
  if (!target) {
    resolve(s, "miss", ms);
    return;
  }
  target.shot = true;
  target.alive = false;
  target.pose = "dead";
  target.animT = 0;
  target.hitMs = ms;
  target.impactT = 0.28;
  const left = s.fighters.some((f) => f.alive && !f.shot);
  if (!left) resolve(s, "hit", ms);
}

function continueAfter(s) {
  if (s.lives <= 0) {
    s.screen = "gameover";
    const save = s.save;
    save.best = Math.max(save.best, s.score);
    if (s.reactionMs) save.fastest = save.fastest == null ? s.reactionMs : Math.min(save.fastest, s.reactionMs);
    storageSet(save);
    play("over");
    return;
  }
  const last = s.mode === "endless" ? 999 : s.totalRounds - 1;
  if (s.outcome === "hit" && s.round >= last) {
    s.screen = "victory";
    return;
  }
  if (s.outcome === "hit") s.round += 1;
  beginRound(s);
}

function step(s, dt, now) {
  s.flash = Math.max(0, s.flash - dt);
  s.redFlash = Math.max(0, s.redFlash - dt);
  if (s.screen !== "playing") {
    for (const f of s.fighters) f.animT += dt;
    return;
  }
  for (const f of s.fighters) {
    f.animT += dt;
    f.muzzleT = Math.max(0, f.muzzleT - dt);
    f.impactT = Math.max(0, f.impactT - dt);
    f.enter = s.phase === "intro" ? Math.min(1, f.enter + dt / 0.7) : 1;
  }
  if (s.phase === "intro") {
    if (s.fighters.every((f) => f.enter >= 1)) s.phase = "standoff";
    return;
  }
  if (s.phase === "standoff") {
    s.waitElapsed += dt;
    if (s.waitElapsed >= s.waitDuration) {
      s.phase = "fire";
      s.fireAt = now;
      s.fireElapsed = 0;
      play("fire");
    }
    return;
  }
  if (s.phase === "fire") {
    s.fireElapsed += dt;
    for (const f of s.fighters) {
      if (!f.alive || f.shot) continue;
      if (s.fireElapsed >= f.enemyTime * 0.55) f.pose = "shoot";
      if (s.fireElapsed >= f.enemyTime) {
        f.muzzleT = 0.2;
        resolve(s, "slow", Math.round(s.fireElapsed * 1000));
        return;
      }
    }
    return;
  }
  if (s.phase === "resolve" && s.outcome === "slow") {
    for (const f of s.fighters) {
      if (!f.alive || f.shot || f.pose !== "draw") continue;
      if (f.animT < 0.34) continue;
      f.pose = "shoot";
      f.muzzleT = 0.42;
      play("shot");
      s.redFlash = 0.65;
    }
  }
}

const audioCache = {};
function play(name) {
  try {
    if (!audioCache[name]) {
      const a = wx.createInnerAudioContext();
      a.src = `audio/${name}.mp3`;
      audioCache[name] = a;
    }
    audioCache[name].stop();
    audioCache[name].play();
  } catch (e) {}
}

function loadImg(src) {
  return new Promise((resolve) => {
    const img = wx.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");
const sys = wx.getSystemInfoSync();
canvas.width = sys.windowWidth * (sys.pixelRatio || 2);
canvas.height = sys.windowHeight * (sys.pixelRatio || 2);

const state = createState();
const sheets = { scenes: {}, poses: {} };

function layout() {
  const sw = canvas.width;
  const sh = canvas.height;
  const scale = Math.min(sw / W, (sh * 0.6) / H);
  const cw = W * scale;
  const ch = H * scale;
  return { x: (sw - cw) / 2, y: sh * 0.04, w: cw, h: ch, scale, sw, sh, infoY: sh * 0.64, infoH: sh * 0.36 };
}

function drawStandIn(f, dx, dy, size) {
  ctx.fillStyle = "#c4a574";
  ctx.fillRect(dx + size * 0.35, dy + size * 0.12, size * 0.3, size * 0.7);
  ctx.fillStyle = "#3b2a1a";
  ctx.fillRect(dx + size * 0.3, dy + size * 0.08, size * 0.4, size * 0.12);
  if (f.pose === "laugh") {
    ctx.fillStyle = "#9a3228";
    ctx.fillRect(dx + size * 0.42, dy + size * 0.22, size * 0.16, size * 0.06);
  }
  if (f.pose === "dead") {
    ctx.translate(dx + size / 2, dy + size * 0.9);
    ctx.rotate(-1.2);
    ctx.translate(-(dx + size / 2), -(dy + size * 0.9));
  }
}

function drawScene(L) {
  ctx.save();
  ctx.translate(L.x, L.y);
  ctx.scale(L.scale, L.scale);
  const bg = sheets.scenes[state.scene] || sheets.scenes.street;
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else {
    ctx.fillStyle = "#3d7ec4";
    ctx.fillRect(0, 0, W, H * 0.45);
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  }
  for (const f of state.fighters) {
    const cell = 210 * f.scale;
    const cx = f.x * W;
    const bootY = f.y * H;
    const dx = cx - cell / 2;
    const dy = bootY - cell * FOOT;
    ctx.save();
    ctx.globalAlpha = f.enter || 1;
    const pose = sheets.poses[f.id];
    const img = pose && (pose[f.pose === "dead" ? "fall" : f.pose === "laugh" ? "laugh" : f.pose === "shoot" || f.pose === "draw" ? "shoot" : "idle"]);
    if (img) {
      const frame = f.pose === "dead" ? Math.min(3, Math.floor(f.animT / 0.16)) : 0;
      const col = frame % 2;
      const row = Math.floor(frame / 2) % 2;
      ctx.drawImage(img, col * 256, row * 256, 256, 256, dx, dy, cell, cell);
    } else {
      drawStandIn(f, dx, dy, cell);
    }
    ctx.restore();
  }
  if (state.phase === "fire") {
    ctx.fillStyle = "#9a3228";
    ctx.fillRect(W / 2 - 36, 28, 72, 22);
    ctx.fillStyle = "#f3ead8";
    ctx.font = "12px sans-serif";
    ctx.fillText("FIRE!", W / 2 - 18, 44);
  }
  if ((state.outcome === "slow" || state.outcome === "miss") && state.fighters.some((f) => f.pose === "shoot")) {
    ctx.strokeStyle = "rgba(255,248,236,0.85)";
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.46);
    ctx.lineTo(W / 2 + 40, H * 0.2);
    ctx.moveTo(W / 2, H * 0.46);
    ctx.lineTo(W / 2 - 50, H * 0.7);
    ctx.stroke();
    ctx.fillStyle = "#8a1c14";
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.46, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(243,234,216,${state.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.redFlash > 0) {
    ctx.fillStyle = `rgba(154,50,40,${state.redFlash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.screen === "playing" && state.phase !== "resolve") {
    const px = state.pointer.x * W;
    const py = state.pointer.y * H;
    ctx.strokeStyle = "rgba(243,234,216,0.8)";
    ctx.beginPath();
    ctx.moveTo(px - 8, py);
    ctx.lineTo(px + 8, py);
    ctx.moveTo(px, py - 8);
    ctx.lineTo(px, py + 8);
    ctx.stroke();
  }
  ctx.restore();
}

function hitBtn(L, i) {
  const y = L.infoY + 36 + i * 46;
  return { x: L.sw * 0.15, y, w: L.sw * 0.7, h: 40 };
}

function drawUI(L) {
  ctx.fillStyle = "#1a120e";
  ctx.fillRect(0, L.infoY, L.sw, L.infoH);
  ctx.fillStyle = "#f3ead8";
  ctx.font = `${Math.round(L.sw * 0.045)}px sans-serif`;
  ctx.textAlign = "center";
  const cx = L.sw / 2;
  let y = L.infoY + 28;
  if (state.screen === "title") {
    ctx.fillText("NOON DUEL", cx, y);
    ["Classic duel", "Two-gun duel", "Endless"].forEach((label, i) => {
      const b = hitBtn(L, i);
      ctx.strokeStyle = "#c4a574";
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillText(label, cx, b.y + 26);
    });
    ctx.fillStyle = "#8a7a68";
    ctx.font = `${Math.round(L.sw * 0.03)}px sans-serif`;
    ctx.fillText("Best " + String(state.save.best).padStart(6, "0"), cx, L.sh - 24);
    return;
  }
  if (state.screen === "playing" && state.phase !== "resolve") {
    ctx.fillText("Lives " + state.lives + "   Score " + String(state.score).padStart(6, "0"), cx, y);
    ctx.fillStyle = "#c4a574";
    ctx.fillText("CPU draw " + (state.enemyMs / 1000).toFixed(2) + "s", cx, y + 28);
    ctx.fillStyle = "#8a7a68";
    const tip = state.phase === "fire" ? "FIRE — shoot the body" : "Wait. Do not draw early.";
    ctx.fillText(tip, cx, y + 56);
    return;
  }
  if (state.phase === "resolve" || state.screen === "gameover" || state.screen === "victory") {
    const title = state.screen === "gameover" ? "YOU'RE DOWN" : state.screen === "victory" ? "THE STREET IS YOURS" : state.outcome === "hit" ? "HIT" : state.outcome === "chicken" ? "TOO EARLY" : state.outcome === "miss" ? "MISS" : "TOO SLOW";
    ctx.fillText(title, cx, y);
    ctx.fillStyle = "#c4a574";
    ctx.fillText("You " + (state.reactionMs != null ? (state.reactionMs / 1000).toFixed(2) + "s" : "—"), cx, y + 32);
    ctx.fillText("CPU " + (state.enemyMs / 1000).toFixed(2) + "s", cx, y + 56);
    const label = state.screen === "playing" ? "Next duel" : "Back to noon";
    const b = { x: L.sw * 0.2, y: L.sh - 70, w: L.sw * 0.6, h: 44 };
    ctx.strokeStyle = "#f3ead8";
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#f3ead8";
    ctx.fillText(label, cx, b.y + 30);
  }
}

let last = Date.now();
function loop() {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  step(state, dt, now);
  ctx.fillStyle = "#120e0b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const L = layout();
  drawScene(L);
  drawUI(L);
  canvas.requestAnimationFrame ? canvas.requestAnimationFrame(loop) : setTimeout(loop, 16);
}

function normTouch(t) {
  const L = layout();
  return {
    x: (t.clientX * (sys.pixelRatio || 2) - L.x) / L.w,
    y: (t.clientY * (sys.pixelRatio || 2) - L.y) / L.h,
    sx: t.clientX * (sys.pixelRatio || 2),
    sy: t.clientY * (sys.pixelRatio || 2),
  };
}

wx.onTouchMove((e) => {
  const t = e.touches[0];
  if (!t) return;
  const p = normTouch(t);
  state.pointer.x = Math.max(0, Math.min(1, p.x));
  state.pointer.y = Math.max(0, Math.min(1, p.y));
});

wx.onTouchEnd((e) => {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (!t) return;
  const p = normTouch(t);
  const L = layout();
  if (state.screen === "title") {
    ["classic", "duo", "endless"].forEach((mode, i) => {
      const b = hitBtn(L, i);
      if (p.sx > b.x && p.sx < b.x + b.w && p.sy > b.y && p.sy < b.y + b.h) startGame(state, mode);
    });
    return;
  }
  if (state.screen === "playing" && state.phase === "resolve") {
    continueAfter(state);
    return;
  }
  if (state.screen === "gameover" || state.screen === "victory") {
    state.screen = "title";
    state.scene = pickScene("classic");
    return;
  }
  if (state.screen === "playing") tryShoot(state, p.x, p.y, Date.now());
});

async function boot() {
  const ids = ["dust", "scar", "poncho", "boss"];
  const scenes = ["street", "arizona", "tombstone", "cactus", "corral"];
  await Promise.all(
    scenes.map(async (id) => {
      const src = id === "street" ? "sprites/town.png" : `sprites/scenes/${id}.jpg`;
      sheets.scenes[id] = await loadImg(src);
    }),
  );
  await Promise.all(
    ids.map(async (id) => {
      sheets.poses[id] = {
        idle: await loadImg(`sprites/${id}/idle.png`),
        shoot: await loadImg(`sprites/${id}/shoot.png`),
        fall: await loadImg(`sprites/${id}/fall.png`),
        laugh: await loadImg(`sprites/${id}/laugh.png`),
      };
    }),
  );
  loop();
}

boot();

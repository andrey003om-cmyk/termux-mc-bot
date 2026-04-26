'use strict';
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Bot Control</title>
<style>
  :root { --bg:#0d1117; --pnl:#161b22; --br:#30363d; --txt:#e6edf3; --mut:#8b949e; --acc:#2ea043; --warn:#d29922; --err:#f85149; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; padding:0; background:var(--bg); color:var(--txt); font-family:system-ui,-apple-system,sans-serif; height:100%; }
  body { display:flex; flex-direction:column; }
  header { padding:8px 12px; background:var(--pnl); border-bottom:1px solid var(--br); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
  header .title { font-weight:600; }
  header .stat { font-size:12px; color:var(--mut); }
  header .stat b { color:var(--txt); }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--err); margin-right:4px; }
  .dot.on { background:var(--acc); }
  main { flex:1; display:grid; grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; min-height:0; }
  @media (min-width:900px) { main { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; } }
  .pane { border:1px solid var(--br); display:flex; flex-direction:column; min-height:0; min-width:0; background:var(--pnl); }
  .pane h3 { margin:0; padding:8px 12px; border-bottom:1px solid var(--br); font-size:13px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center; }
  .pane h3 .sub { font-size:11px; font-weight:400; text-transform:none; letter-spacing:0; }
  .pane h3 button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:6px; padding:4px 10px; font-size:11px; font-weight:600; }
  #chat { flex:1; overflow-y:auto; padding:8px 12px; font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; font-size:13px; line-height:1.5; }
  #chat .ln { white-space:pre-wrap; word-break:break-word; }
  #chat .chat { color:var(--txt); }
  #chat .sys { color:var(--mut); }
  #chat .err { color:var(--err); }
  #input { display:flex; gap:6px; padding:8px; border-top:1px solid var(--br); background:#0d1117; }
  #input input { flex:1; background:#0d1117; color:var(--txt); border:1px solid var(--br); border-radius:6px; padding:10px; font-size:14px; }
  #input button { background:var(--acc); color:#fff; border:0; border-radius:6px; padding:10px 14px; font-weight:600; }
  .quick { display:flex; flex-wrap:wrap; gap:6px; padding:8px; border-top:1px solid var(--br); }
  .quick button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:14px; padding:6px 10px; font-size:12px; }
  .quick button:active { background:#30363d; }
  .viewWrap { flex:1; display:flex; flex-direction:column; min-height:0; position:relative; }
  .tabs { display:flex; border-bottom:1px solid var(--br); background:#0d1117; }
  .tabs button { flex:1; background:transparent; color:var(--mut); border:0; border-bottom:2px solid transparent; padding:10px; font-size:13px; font-weight:600; }
  .tabs button.active { color:var(--txt); border-bottom-color:var(--acc); }
  .tabPane { flex:1; min-height:0; display:none; position:relative; }
  .tabPane.active { display:flex; flex-direction:column; }
  #viewer { flex:1; min-height:280px; border:0; background:#000; width:100%; }
  #radarBox { flex:1; min-height:280px; display:flex; align-items:center; justify-content:center; background:#0a0e14; position:relative; }
  #radar { background:radial-gradient(circle at center, #1a2332 0%, #0a0e14 70%); border-radius:6px; }
  .radarLegend { position:absolute; bottom:6px; left:6px; right:6px; font-size:10px; color:var(--mut); display:flex; gap:10px; flex-wrap:wrap; pointer-events:none; }
  .radarLegend span b { color:var(--txt); }
  .radarLegend .me { color:#58a6ff; }
  .radarLegend .pl { color:#3fb950; }
  .radarLegend .ho { color:#f85149; }
  .radarLegend .pa { color:#8b949e; }
  .ctrls { display:grid; grid-template-columns: 160px 1fr; gap:8px; padding:8px; align-items:center; }
  .ctrls .actions { display:grid; grid-template-columns: 1fr 1fr; gap:6px; }
  .ctrls .actions button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:8px; padding:14px; font-size:14px; font-weight:600; user-select:none; }
  .ctrls .actions button:active, .ctrls .actions button.held { background:var(--acc); }
  /* Виртуальный джойстик */
  .joy { width:150px; height:150px; border-radius:50%; background:#0a0e14; border:2px solid var(--br); position:relative; touch-action:none; user-select:none; }
  .joy .thumb { position:absolute; left:50%; top:50%; width:54px; height:54px; margin-left:-27px; margin-top:-27px; border-radius:50%; background:var(--acc); border:2px solid #1a4a26; box-shadow:0 4px 10px rgba(0,0,0,0.5); transition:background 0.15s; }
  .joy.active .thumb { background:#3fb950; }
  .joy .label { position:absolute; bottom:-18px; left:0; right:0; text-align:center; font-size:11px; color:var(--mut); }
  /* Drag-to-look оверлей поверх 3D-вида и радара */
  .lookOverlay { position:absolute; left:0; top:0; right:0; bottom:0; cursor:grab; touch-action:none; background:transparent; }
  .lookHint { position:absolute; top:6px; right:8px; font-size:10px; color:rgba(255,255,255,0.5); background:rgba(0,0,0,0.4); padding:3px 6px; border-radius:3px; pointer-events:none; }
  .meta { padding:8px 12px; font-size:12px; color:var(--mut); border-top:1px solid var(--br); }
  .meta a { color:#58a6ff; }
  .ownerbar { display:flex; gap:6px; padding:8px; border-top:1px solid var(--br); align-items:center; flex-wrap:wrap; }
  .ownerbar button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:6px; padding:8px 12px; font-size:13px; }
</style>
</head>
<body>
<header>
  <div>
    <span class="dot" id="dot"></span>
    <span class="title">BotControl</span>
    <span class="stat" id="srv"></span>
  </div>
  <div class="stat">
    HP: <b id="hp">?</b> &nbsp; Еда: <b id="fd">?</b> &nbsp; Игроков: <b id="pl">0</b> &nbsp;
    Поз: <b id="po">—</b>
  </div>
</header>
<main>
  <section class="pane">
    <h3>Чат и команды <span class="sub" id="connBadge">●</span></h3>
    <div id="chat"></div>
    <div class="quick">
      <button onclick="cmd('логин')">логин</button>
      <button onclick="cmd('регистрация')">/reg</button>
      <button onclick="cmd('онлайн')">онлайн</button>
      <button onclick="cmd('стой')">стой</button>
      <button onclick="cmd('правила')">правила</button>
      <button onclick="cmd('помощь')">помощь</button>
      <button onclick="promptOwner()">слушать только...</button>
      <button onclick="cmd('Слушать всех')">слушать всех</button>
    </div>
    <div class="ownerbar">
      <span style="color:var(--mut);font-size:12px">Хозяин:</span>
      <span id="ownerNow" style="font-size:12px"><b>—</b></span>
      <span class="dot" id="ownerDot"></span>
    </div>
    <form id="input" onsubmit="return send(event)">
      <input id="cmdline" placeholder="Сообщение в чат, или команда (помощь)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="submit">→</button>
    </form>
  </section>
  <section class="pane">
    <h3>
      Где бот
      <button onclick="reloadViewer()">↻ 3D</button>
    </h3>
    <div class="tabs">
      <button id="tabRadar" class="active" onclick="showTab('radar')">📡 Радар (надёжно)</button>
      <button id="tab3d" onclick="showTab('3d')">👁 3D-вид</button>
    </div>
    <div class="viewWrap">
      <div id="paneRadar" class="tabPane active">
        <div id="radarBox">
          <canvas id="radar" width="320" height="320"></canvas>
          <div class="radarLegend">
            <span class="me">●</span><span> бот</span>
            <span class="pl">●</span><span>игроки</span>
            <span class="ho">●</span><span>враги</span>
            <span class="pa">●</span><span>мобы</span>
            <span style="margin-left:auto"><b id="rngTxt">48</b>м</span>
          </div>
        </div>
      </div>
      <div id="pane3d" class="tabPane">
        <iframe id="viewer" src="about:blank" loading="lazy"></iframe>
        <div id="lookOverlay" class="lookOverlay"></div>
        <div class="lookHint">пальцем — повернуть бота</div>
      </div>
    </div>
    <div class="ctrls">
      <div>
        <div id="joy" class="joy"><div class="thumb"></div><div class="label">движение</div></div>
      </div>
      <div class="actions">
        <button data-key="jump">⇧ прыжок</button>
        <button data-key="sprint">▶▶ бег</button>
        <button data-key="sneak">⇩ красться</button>
        <button onclick="stopAll()">■ стоп</button>
      </div>
    </div>
    <div class="meta">
      <b>Джойстик</b> — двигай пальцем куда идти. <b>На 3D</b> — проводи пальцем чтобы повернуть бота.<br>
      3D в новой вкладке: <a id="vlink" href="#" target="_blank">открыть напрямую</a>
    </div>
  </section>
</main>

<script>
const chatEl = document.getElementById('chat');
const dot = document.getElementById('dot');
const srv = document.getElementById('srv');
const hp = document.getElementById('hp');
const fd = document.getElementById('fd');
const pl = document.getElementById('pl');
const po = document.getElementById('po');
const ownerNow = document.getElementById('ownerNow');
const ownerDot = document.getElementById('ownerDot');
const cmdline = document.getElementById('cmdline');
const viewer = document.getElementById('viewer');
const vlink = document.getElementById('vlink');
const radar = document.getElementById('radar');
const rngTxt = document.getElementById('rngTxt');
const connBadge = document.getElementById('connBadge');

let viewerUrl = '';
let viewerEverLoaded = false;

function reloadViewer() {
  if (!viewerUrl) { appendLog('err', '* 3D пока не готов: бот ещё не появился на сервере.'); return; }
  // Принудительная перезагрузка iframe (с cache-bust)
  viewer.src = viewerUrl + '?t=' + Date.now();
  viewerEverLoaded = true;
}

function showTab(name) {
  document.getElementById('tabRadar').classList.toggle('active', name === 'radar');
  document.getElementById('tab3d').classList.toggle('active', name === '3d');
  document.getElementById('paneRadar').classList.toggle('active', name === 'radar');
  document.getElementById('pane3d').classList.toggle('active', name === '3d');
  if (name === '3d' && !viewerEverLoaded && viewerUrl) reloadViewer();
}

function appendLog(kind, line) {
  const div = document.createElement('div');
  div.className = 'ln ' + (kind || 'sys');
  div.textContent = line;
  chatEl.appendChild(div);
  while (chatEl.children.length > 500) chatEl.removeChild(chatEl.firstChild);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function cmd(text) {
  fetch('/api/cmd', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text}) });
}

function send(ev) {
  ev.preventDefault();
  const v = cmdline.value.trim();
  if (!v) return false;
  const known = /^(слушать только|слушать всех|скажи|атакуй|kill|attack|иди|follow|стой|stop|ютуберы|ютубер[+-]|сервер|ник|логин|login|регистрация|register|рег|пароль|правила|стоп бот|выход|exit|quit|помощь|help|\\?)/i;
  const out = known.test(v) || v.startsWith('/') ? v : ('скажи ' + v);
  cmd(out);
  cmdline.value = '';
  return false;
}

function promptOwner() {
  const n = prompt('Имя хозяина:');
  if (n) cmd('Слушать только ' + n.trim());
}

function bindHold(btn) {
  const key = btn.dataset.key;
  if (!key) return;
  let on = false;
  const start = (e) => { e.preventDefault(); if (on) return; on = true; btn.classList.add('held'); fetch('/api/control', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({key, on:true})}); };
  const end   = (e) => { if (e) e.preventDefault(); if (!on) return; on = false; btn.classList.remove('held'); fetch('/api/control', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({key, on:false})}); };
  btn.addEventListener('touchstart', start, {passive:false});
  btn.addEventListener('touchend', end);
  btn.addEventListener('touchcancel', end);
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
}
document.querySelectorAll('.ctrls button[data-key]').forEach(bindHold);

function stopAll() {
  fetch('/api/stop-all', { method:'POST' });
  document.querySelectorAll('.ctrls .actions button.held').forEach(b => b.classList.remove('held'));
}

// ---------- Виртуальный джойстик ----------
(function setupJoystick() {
  const joy = document.getElementById('joy');
  const thumb = joy.querySelector('.thumb');
  const R = 60; // макс. радиус смещения
  let pid = null;
  let lastSendT = 0;
  let lastVec = {x:0, z:0, sprint:false};

  function sendJoy(x, z, sprint) {
    lastVec = { x, z, sprint };
    fetch('/api/joystick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({x, z, sprint})});
  }
  function setThumb(dx, dz) {
    thumb.style.transform = 'translate(' + dx + 'px,' + dz + 'px)';
  }
  function reset() {
    pid = null;
    joy.classList.remove('active');
    setThumb(0, 0);
    sendJoy(0, 0, false);
  }
  function move(clientX, clientY) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = clientX - cx;
    let dz = clientY - cy;
    const m = Math.sqrt(dx*dx + dz*dz);
    if (m > R) { dx = dx * R / m; dz = dz * R / m; }
    setThumb(dx, dz);
    const nx = dx / R;        // -1..1 — вправо
    const nz = dz / R;        // -1..1 — назад на экране = вперёд по координатам Z+ ? Нужно правильно.
    // На 2D-радаре +Z — вниз (в Minecraft +Z = юг). На джойстике вверх = идти вперёд (туда куда смотрит бот).
    // Но "вперёд бота" = вектор взгляда, а мы трактуем джойстик как абсолютные мировые направления:
    // верх джойстика = -Z (север), низ = +Z (юг), вправо = +X (восток), влево = -X (запад).
    // Бот будет поворачиваться в направлении (x, z) и идти.
    // throttle до ~10 Гц, плюс мгновенный send при отпускании
    const now = Date.now();
    if (now - lastSendT > 100) {
      lastSendT = now;
      sendJoy(nx, nz, false);
    } else {
      lastVec = { x: nx, z: nz, sprint:false };
    }
  }
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pid = e.pointerId;
    joy.setPointerCapture(pid);
    joy.classList.add('active');
    move(e.clientX, e.clientY);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    move(e.clientX, e.clientY);
  });
  const release = (e) => {
    if (pid != null && e.pointerId !== pid) return;
    if (pid != null) try { joy.releasePointerCapture(pid); } catch (_) {}
    reset();
  };
  joy.addEventListener('pointerup', release);
  joy.addEventListener('pointercancel', release);
  joy.addEventListener('pointerleave', (e) => { if (pid != null) release(e); });

  // Двойной тап — toggle "бег" пока двигаешь
  let lastTap = 0;
  joy.addEventListener('pointerdown', () => {
    const now = Date.now();
    if (now - lastTap < 350) {
      lastVec.sprint = !lastVec.sprint;
      sendJoy(lastVec.x, lastVec.z, lastVec.sprint);
    }
    lastTap = now;
  });

  // Периодически добиваем джойстик-команду чтобы движение не "залипало" если потеряли пакет
  setInterval(() => { if (pid != null) sendJoy(lastVec.x, lastVec.z, lastVec.sprint); }, 400);
})();

// ---------- Drag-to-look поверх 3D-окна ----------
(function setupLook() {
  const ov = document.getElementById('lookOverlay');
  let pid = null, lx = 0, ly = 0;
  const SENS = 0.006; // радиан на пиксель
  let pendingYaw = 0, pendingPitch = 0;
  let flushTimer = null;
  function flush() {
    if (Math.abs(pendingYaw) < 0.001 && Math.abs(pendingPitch) < 0.001) return;
    const dyaw = pendingYaw, dpitch = pendingPitch;
    pendingYaw = 0; pendingPitch = 0;
    fetch('/api/look-delta', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({dyaw, dpitch})});
  }
  ov.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pid = e.pointerId;
    ov.setPointerCapture(pid);
    lx = e.clientX; ly = e.clientY;
  });
  ov.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    pendingYaw += dx * SENS;
    pendingPitch += dy * SENS;
    if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 60);
  });
  const end = (e) => {
    if (pid != null && e.pointerId !== pid) return;
    if (pid != null) try { ov.releasePointerCapture(pid); } catch (_) {}
    pid = null;
    flush();
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', end);
  ov.addEventListener('pointerleave', end);
})();

function applyState(s) {
  if (!s) return;
  dot.classList.toggle('on', !!s.alive);
  srv.textContent = s.username + ' @ ' + s.server;
  hp.textContent = s.health == null ? '?' : Math.round(s.health);
  fd.textContent = s.food == null ? '?' : Math.round(s.food);
  pl.textContent = (s.players || []).length;
  ownerNow.innerHTML = '<b>' + (s.owner || '—') + '</b>';
  ownerDot.classList.toggle('on', !!s.ownerOnlyMode);
  if (s.viewerUrl && s.viewerUrl !== viewerUrl) {
    viewerUrl = s.viewerUrl;
    vlink.href = viewerUrl;
  }
  // Если бот ожил, а 3D-окошко мы ещё не пробовали грузить — попробуем (с задержкой, чтобы чанки прогрузились)
  if (s.alive && viewerUrl && !viewerEverLoaded) {
    setTimeout(reloadViewer, 3500);
  }
}

// ----- РАДАР: рисуем top-down -----
let lastRadar = null;
function drawRadar() {
  const ctx = radar.getContext('2d');
  const W = radar.width, H = radar.height;
  const cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);
  // grid
  ctx.strokeStyle = '#1f2a3a'; ctx.lineWidth = 1;
  for (let r = 1; r <= 4; r++) {
    ctx.beginPath(); ctx.arc(cx, cy, (Math.min(W, H) / 2 - 4) * r / 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

  if (!lastRadar || !lastRadar.alive) {
    ctx.fillStyle = '#8b949e'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Бот не на сервере', cx, cy);
    return;
  }
  const range = lastRadar.range || 48;
  rngTxt.textContent = range;
  const scale = (Math.min(W, H) / 2 - 8) / range;

  function plot(items, color, label) {
    for (const it of items) {
      const x = cx + it.dx * scale;
      const y = cy + it.dz * scale;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      if (label) {
        ctx.fillStyle = '#e6edf3';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'left';
        const txt = (it.name || '?') + ' ' + it.d + 'м';
        ctx.fillText(txt, x + 6, y + 3);
      }
    }
  }
  plot(lastRadar.passive,  '#8b949e', false);
  plot(lastRadar.hostiles, '#f85149', true);
  plot(lastRadar.players,  '#3fb950', true);

  // Бот в центре + стрелка направления взгляда
  ctx.fillStyle = '#58a6ff';
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  // Yaw в minecraft: 0 = -Z, +90 = -X. На карте +X вправо, +Z вниз.
  // Вектор взгляда: x=-sin(yaw), z=-cos(yaw)
  const ax = -Math.sin(lastRadar.yaw);
  const az = -Math.cos(lastRadar.yaw);
  ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ax * 18, cy + az * 18); ctx.stroke();

  if (lastRadar.pos) {
    po.textContent = Math.round(lastRadar.pos.x) + ' ' + Math.round(lastRadar.pos.y) + ' ' + Math.round(lastRadar.pos.z);
  }
}

async function pullRadar() {
  try {
    const r = await fetch('/api/radar');
    lastRadar = await r.json();
    drawRadar();
  } catch (_) {}
}
pullRadar();
setInterval(pullRadar, 500);

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => { connBadge.style.color = '#3fb950'; };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m.type === 'log') appendLog(m.kind, m.line);
    else if (m.type === 'state') applyState(m.state);
  };
  ws.onclose = () => { connBadge.style.color = '#f85149'; appendLog('err', '* связь с ботом потеряна, переподключаюсь...'); setTimeout(connect, 1500); };
  ws.onerror = () => {};
}
connect();

async function pullState() {
  try {
    const r = await fetch('/api/state');
    const j = await r.json();
    applyState(j);
  } catch (_) {}
}
pullState();
setInterval(pullState, 3000);
</script>
</body>
</html>`;

function startWeb(opts) {
  const {
    host = '127.0.0.1',
    port = 3008,
    runCommand,
    setControl,
    stopAllControls,
    lookAtPlayer,
    setView,
    setMoveDirection,
    getRadar,
    getState,
  } = opts;

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/', (_req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(DASHBOARD_HTML);
  });

  app.get('/api/state', (_req, res) => {
    res.json(getState());
  });

  app.post('/api/cmd', (req, res) => {
    const text = String(req.body?.text || '');
    if (!text) return res.status(400).json({ error: 'no text' });
    runCommand(text);
    res.json({ ok: true });
  });

  app.post('/api/control', (req, res) => {
    const { key, on } = req.body || {};
    if (!key) return res.status(400).json({ error: 'no key' });
    const ok = setControl(key, !!on);
    res.json({ ok });
  });

  app.post('/api/stop-all', (_req, res) => {
    stopAllControls();
    res.json({ ok: true });
  });

  app.post('/api/look', (req, res) => {
    const name = String(req.body?.name || '');
    if (!name) return res.status(400).json({ error: 'no name' });
    const ok = lookAtPlayer(name);
    res.json({ ok });
  });

  app.get('/api/radar', (_req, res) => {
    res.json(getRadar ? getRadar() : { alive: false });
  });

  // Доворот камеры (drag-to-look на 3D-окне).
  app.post('/api/look-delta', (req, res) => {
    const dyaw = Number(req.body?.dyaw || 0);
    const dpitch = Number(req.body?.dpitch || 0);
    const ok = setView ? setView(dyaw, dpitch) : false;
    res.json({ ok });
  });

  // Джойстик: вектор (x,z) в локальных координатах + признак бега. Сервер сам поворачивает бота и идёт вперёд.
  app.post('/api/joystick', (req, res) => {
    const x = Number(req.body?.x || 0);
    const z = Number(req.body?.z || 0);
    const sprint = !!req.body?.sprint;
    const mag = Math.sqrt(x * x + z * z);
    if (mag < 0.18) {
      // отпустили — стоп
      setControl('forward', false);
      setControl('sprint', false);
      return res.json({ ok: true, moving: false });
    }
    if (setMoveDirection) setMoveDirection(x, z);
    setControl('forward', true);
    setControl('sprint', sprint && mag > 0.7);
    res.json({ ok: true, moving: true });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    try { ws.send(JSON.stringify({ type: 'state', state: getState() })); } catch (_) {}
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        try { ws.send(data); } catch (_) {}
      }
    }
  }

  // Periodic state push
  const stateTimer = setInterval(() => {
    if (clients.size === 0) return;
    broadcast({ type: 'state', state: getState() });
  }, 2000);

  server.listen(port, host, () => {
    // started
  });

  return {
    broadcast,
    close: () => { clearInterval(stateTimer); server.close(); },
  };
}

module.exports = startWeb;

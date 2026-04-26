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
  .pane h3 { margin:0; padding:8px 12px; border-bottom:1px solid var(--br); font-size:13px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:0.5px; }
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
  #viewer { flex:1; min-height:300px; border:0; background:#000; }
  .ctrls { display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; padding:8px; }
  .ctrls button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:8px; padding:14px; font-size:18px; font-weight:600; user-select:none; }
  .ctrls button:active, .ctrls button.held { background:var(--acc); }
  .ctrls .blank { visibility:hidden; }
  .meta { padding:8px 12px; font-size:12px; color:var(--mut); border-top:1px solid var(--br); }
  .meta a { color:#58a6ff; }
  .ownerbar { display:flex; gap:6px; padding:8px; border-top:1px solid var(--br); align-items:center; flex-wrap:wrap; }
  .ownerbar input { flex:1; min-width:120px; background:#0d1117; color:var(--txt); border:1px solid var(--br); border-radius:6px; padding:8px; font-size:13px; }
  .ownerbar button { background:#21262d; color:var(--txt); border:1px solid var(--br); border-radius:6px; padding:8px 12px; font-size:13px; }
  .ownerbar .on { background:var(--warn); border-color:var(--warn); color:#000; }
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
    HP: <b id="hp">?</b> &nbsp; Еда: <b id="fd">?</b> &nbsp; Игроков: <b id="pl">0</b>
  </div>
</header>
<main>
  <section class="pane">
    <h3>Чат и команды</h3>
    <div id="chat"></div>
    <div class="quick">
      <button onclick="cmd('логин')">логин</button>
      <button onclick="cmd('регистрация')">/reg</button>
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
    <h3>Глазами бота · 3D</h3>
    <iframe id="viewer" src="" loading="lazy"></iframe>
    <div class="ctrls">
      <button class="blank"></button>
      <button data-key="forward">▲</button>
      <button class="blank"></button>
      <button data-key="left">◀</button>
      <button data-key="back">▼</button>
      <button data-key="right">▶</button>
      <button data-key="sneak">⇩ красться</button>
      <button data-key="jump">⇧ прыжок</button>
      <button data-key="sprint">▶▶ бег</button>
    </div>
    <div class="meta">
      Зажми кнопку — двигается. Отпусти — стоп. <br>
      3D-вид: <a id="vlink" href="#" target="_blank">открыть в новой вкладке</a>
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
const ownerNow = document.getElementById('ownerNow');
const ownerDot = document.getElementById('ownerDot');
const cmdline = document.getElementById('cmdline');
const viewer = document.getElementById('viewer');
const vlink = document.getElementById('vlink');

let viewerSet = false;
function setViewer(url) {
  if (viewerSet || !url) return;
  viewerSet = true;
  viewer.src = url;
  vlink.href = url;
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
  // Если это просто текст — отправляем в чат через "скажи "
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

// Hold-to-press movement controls
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

function applyState(s) {
  if (!s) return;
  dot.classList.toggle('on', !!s.alive);
  srv.textContent = s.username + ' @ ' + s.server;
  hp.textContent = s.health == null ? '?' : Math.round(s.health);
  fd.textContent = s.food == null ? '?' : Math.round(s.food);
  pl.textContent = (s.players || []).length;
  ownerNow.innerHTML = '<b>' + (s.owner || '—') + '</b>';
  ownerDot.classList.toggle('on', !!s.ownerOnlyMode);
  setViewer(s.viewerUrl);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m.type === 'log') appendLog(m.kind, m.line);
    else if (m.type === 'state') applyState(m.state);
  };
  ws.onclose = () => { appendLog('err', '* связь с ботом потеряна, переподключаюсь...'); setTimeout(connect, 1500); };
  ws.onerror = () => {};
}
connect();

// Periodic state pull (fallback)
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

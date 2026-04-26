#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = (() => {
  try { return require('mineflayer-pathfinder'); } catch (_) { return {}; }
})();
const pvpPlugin = require('mineflayer-pvp').plugin;

// ---------- args / config ----------
const argv = process.argv.slice(2);
const cliArgs = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
    cliArgs[key] = val;
  } else if (!cliArgs.server && a.includes(':')) {
    cliArgs.server = a;
  } else if (!cliArgs.username) {
    cliArgs.username = a;
  }
}

const configPath = path.join(__dirname, 'config.json');
let fileConfig = {};
if (fs.existsSync(configPath)) {
  try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (e) { console.error('Не могу прочитать config.json:', e.message); }
} else {
  const example = path.join(__dirname, 'config.example.json');
  if (fs.existsSync(example)) {
    try { fileConfig = JSON.parse(fs.readFileSync(example, 'utf8')); } catch (_) {}
  }
}

const config = {
  server: cliArgs.server || fileConfig.server || 'localhost:25565',
  username: cliArgs.username || fileConfig.username || 'I_m___BotByXX',
  auth: cliArgs.auth || fileConfig.auth || 'offline',
  version: cliArgs.version || fileConfig.version || '1.16.5',
  owner: cliArgs.owner || fileConfig.owner || '',
  ownerOnlyMode: !!(fileConfig.ownerOnlyMode || cliArgs.ownerOnly === 'true'),
  autoReconnect: fileConfig.autoReconnect !== false,
  reconnectDelayMs: Number(fileConfig.reconnectDelayMs || 8000),
  pvp: Object.assign({ enabled: true, reach: 3.5, attackRangeBlocks: 16 }, fileConfig.pvp || {}),
  moderation: Object.assign(
    { enabled: true, warnCooldownSec: 30, youtuberPlayers: [] },
    fileConfig.moderation || {},
  ),
  authPlugin: Object.assign(
    {
      enabled: true,
      password: '123BotLogins123',
      loginCommand: '/login {password}',
      registerCommand: '/reg {password}',
      loginDelayMs: 1500,
      registerDelayMs: 4000,
      retryDelayMs: 6000,
    },
    fileConfig.authPlugin || {},
  ),
  web: Object.assign(
    {
      enabled: true,
      port: 3008,
      viewerPort: 3007,
      firstPerson: true,
      host: '127.0.0.1',
    },
    fileConfig.web || {},
  ),
};

function parseServer(s) {
  const [h, p] = String(s || '').split(':');
  const port = Number(p || 25565);
  if (!h || !port) {
    console.error('Неверный формат сервера. Используй: айпи:порт (например Bon4ikMines.aternos.me:24474)');
    process.exit(1);
  }
  return { host: h, port };
}
let { host, port } = parseServer(config.server);

const { classify, isFlood, isMeaningless, ruleText, rulesList } = require('./rules');

// ---------- runtime state ----------
const state = {
  bot: null,
  reconnectTimer: null,
  ownerOnlyMode: config.ownerOnlyMode,
  owner: (config.owner || '').toLowerCase(),
  warnedAt: new Map(),       // playerLower -> timestamp
  msgHistory: new Map(),     // playerLower -> array of timestamps
  youtubers: new Set((config.moderation.youtuberPlayers || []).map(s => s.toLowerCase())),
  follow: null,              // playerLower or null
  alive: false,
  authed: false,             // авторизация пройдена (плагин AuthMe и т.п.)
  authTimers: [],
};

// ---------- terminal UI ----------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> ',
  terminal: true,
});
let webBroadcast = null; // подменяется при старте веб-панели
function logUI(line, kind = 'sys', extra) {
  process.stdout.write('\r\x1b[K' + line + '\n');
  rl.prompt(true);
  if (webBroadcast) {
    try { webBroadcast({ type: 'log', kind, line, ts: Date.now(), ...(extra || {}) }); } catch (_) {}
  }
}
function logChat(prefix, line) { logUI(`[${prefix}] ${line}`, 'chat', { who: prefix, msg: line }); }
function logSys(line)         { logUI(`* ${line}`, 'sys'); }
function logErr(line)         { logUI(`! ${line}`, 'err'); }

// ---------- helpers ----------
function isYoutuber(name) {
  return state.youtubers.has(String(name).toLowerCase());
}
function canWarn(name) {
  const k = String(name).toLowerCase();
  const last = state.warnedAt.get(k) || 0;
  const cd = (config.moderation.warnCooldownSec || 30) * 1000;
  if (Date.now() - last < cd) return false;
  state.warnedAt.set(k, Date.now());
  return true;
}
function pushMsg(name) {
  const k = String(name).toLowerCase();
  const arr = state.msgHistory.get(k) || [];
  arr.push(Date.now());
  while (arr.length > 30) arr.shift();
  state.msgHistory.set(k, arr);
  return arr;
}
function safeChat(text) {
  if (!state.bot || !state.alive) return;
  const chunks = String(text).match(/.{1,240}/g) || [];
  for (const c of chunks) {
    try { state.bot.chat(c); } catch (e) { logErr('chat fail: ' + e.message); }
  }
}

// ---------- auth plugin (AuthMe / nLogin) ----------
function fillAuthCmd(tpl) {
  return String(tpl || '').replace(/\{password\}/g, config.authPlugin.password);
}
function clearAuthTimers() {
  for (const t of state.authTimers) clearTimeout(t);
  state.authTimers = [];
}
function sendLogin() {
  const cmd = fillAuthCmd(config.authPlugin.loginCommand);
  logSys('Авторизация: ' + cmd.replace(config.authPlugin.password, '***'));
  safeChat(cmd);
}
function sendRegister() {
  const cmd = fillAuthCmd(config.authPlugin.registerCommand);
  logSys('Регистрация: ' + cmd.replace(config.authPlugin.password, '***'));
  safeChat(cmd);
}
function scheduleAuth() {
  if (!config.authPlugin.enabled) return;
  clearAuthTimers();
  state.authed = false;
  // 1) Сначала пробуем войти
  state.authTimers.push(setTimeout(() => {
    if (!state.alive || state.authed) return;
    sendLogin();
  }, config.authPlugin.loginDelayMs));
  // 2) Если не вошли — пробуем зарегистрироваться
  state.authTimers.push(setTimeout(() => {
    if (!state.alive || state.authed) return;
    sendRegister();
  }, config.authPlugin.registerDelayMs));
  // 3) После регистрации — повторный логин (на случай если плагин не логинит автоматически)
  state.authTimers.push(setTimeout(() => {
    if (!state.alive || state.authed) return;
    sendLogin();
  }, config.authPlugin.retryDelayMs));
}
// Распознать сообщения сервера про авторизацию и среагировать
function handleAuthSystemMessage(text) {
  if (!config.authPlugin.enabled) return false;
  const t = String(text || '').toLowerCase();
  if (!t) return false;

  // Успех
  if (/успешн.*(авториз|вход|логин)|(авториз|вход|логин).*успешн|вы вошли|logged in|successfully (logged|authorized|registered)|зарегистрирован[аы]? успешно/.test(t)) {
    if (!state.authed) {
      state.authed = true;
      clearAuthTimers();
      logSys('Авторизация прошла успешно.');
    }
    return true;
  }
  // Просьба зарегистрироваться
  if (/зарегистрируй|зарегистрируйт|please register|use \/reg|команд.*\/reg|not registered|не зарегистрирован/.test(t)) {
    clearAuthTimers();
    state.authTimers.push(setTimeout(sendRegister, 400));
    state.authTimers.push(setTimeout(sendLogin, 1800));
    return true;
  }
  // Просьба войти
  if (/авторизуй|войдите|please login|please log in|use \/login|команд.*\/login|already registered|уже зарегистрирован/.test(t)) {
    clearAuthTimers();
    state.authTimers.push(setTimeout(sendLogin, 400));
    return true;
  }
  return false;
}

// ---------- moderation reaction ----------
function reactToPlayerMessage(name, message) {
  if (!config.moderation.enabled) return;
  if (!message) return;
  if (state.bot && name === state.bot.username) return;

  const history = pushMsg(name);

  // flood
  if (isFlood(history) && canWarn(name)) {
    safeChat(`${name}, не флуди. ${ruleText(3)}`);
    return;
  }

  // meaningless
  if (isMeaningless(message) && canWarn(name)) {
    safeChat(`${name}, бессмысленные сообщения запрещены. ${ruleText(7)}`);
    return;
  }

  const verdict = classify(message);
  if (!verdict) return;

  // exception: youtubers may post links
  if (verdict.rule === 4 && isYoutuber(name)) return;

  if (!canWarn(name)) return;
  safeChat(`${name}, нарушение. ${ruleText(verdict.rule)}`);
}

// ---------- owner-command handling ----------
function handleOwnerChat(name, message) {
  // Owner can give in-game commands like "иди ко мне", "стой", "скажи привет"
  const t = message.trim();
  const lower = t.toLowerCase();

  if (/^(скажи|say)\s+/i.test(t)) {
    const rest = t.replace(/^(скажи|say)\s+/i, '');
    safeChat(rest);
    return;
  }
  if (/^(иди ко мне|come|come here|ко мне)$/i.test(lower)) {
    followPlayer(name);
    safeChat(`Иду к тебе, ${name}.`);
    return;
  }
  if (/^(стой|stop|стоп)$/i.test(lower)) {
    stopFollow();
    stopPvP();
    safeChat('Стою.');
    return;
  }
  if (/^(атакуй|attack|kill)\s+(.+)$/i.test(lower)) {
    const target = t.match(/^(?:атакуй|attack|kill)\s+(.+)$/i)[1].trim();
    attackPlayer(target);
    return;
  }
  if (/^(защищайся|defend|guard)$/i.test(lower)) {
    safeChat('В режиме самозащиты.');
    return;
  }
  if (/^(правила|rules)$/i.test(lower)) {
    safeChat('Правила: ' + rulesList());
    return;
  }
  // Otherwise, repeat as chat from bot
  safeChat(t);
}

// ---------- combat ----------
function nearestHostile() {
  if (!state.bot) return null;
  const me = state.bot.entity?.position;
  if (!me) return null;
  const range = config.pvp.attackRangeBlocks || 16;
  let best = null;
  for (const e of Object.values(state.bot.entities)) {
    if (!e || e === state.bot.entity) continue;
    if (e.type !== 'mob' && e.type !== 'hostile') continue;
    const d = e.position.distanceTo(me);
    if (d > range) continue;
    if (!best || d < best.d) best = { e, d };
  }
  return best ? best.e : null;
}

function attackPlayer(name) {
  if (!state.bot || !config.pvp.enabled) return;
  const target = state.bot.players[name]?.entity;
  if (!target) { safeChat(`Не вижу игрока ${name}.`); return; }
  try {
    state.bot.pvp.attack(target);
    logSys(`Атакую игрока ${name}`);
  } catch (e) { logErr('pvp.attack: ' + e.message); }
}
function attackEntity(ent) {
  if (!state.bot || !config.pvp.enabled || !ent) return;
  try { state.bot.pvp.attack(ent); } catch (e) { logErr('pvp.attack: ' + e.message); }
}
function stopPvP() {
  if (!state.bot) return;
  try { state.bot.pvp.stop(); } catch (_) {}
}

// ---------- follow ----------
function followPlayer(name) {
  if (!state.bot) return;
  const p = state.bot.players[name];
  if (!p || !p.entity) { safeChat(`Не вижу ${name} рядом.`); return; }
  state.follow = name.toLowerCase();
  if (pathfinder && state.bot.pathfinder) {
    try {
      const mcData = require('minecraft-data')(state.bot.version);
      const movements = new Movements(state.bot, mcData);
      state.bot.pathfinder.setMovements(movements);
      state.bot.pathfinder.setGoal(new goals.GoalFollow(p.entity, 2), true);
    } catch (e) { logErr('pathfinder: ' + e.message); }
  }
}
function stopFollow() {
  state.follow = null;
  if (state.bot && state.bot.pathfinder) {
    try { state.bot.pathfinder.setGoal(null); } catch (_) {}
  }
}

// ---------- bot lifecycle ----------
function createBot() {
  logSys(`Подключаюсь к ${host}:${port} как ${config.username} (${config.auth})...`);
  const bot = mineflayer.createBot({
    host,
    port,
    username: config.username,
    auth: config.auth,
    version: config.version || false,
    checkTimeoutInterval: 60_000,
  });
  state.bot = bot;
  state.alive = false;

  try { bot.loadPlugin(pvpPlugin); } catch (e) { logErr('pvp plugin: ' + e.message); }
  if (pathfinder) {
    try { bot.loadPlugin(pathfinder); } catch (e) { logErr('pathfinder plugin: ' + e.message); }
  }

  bot.once('login', () => {
    logSys(`Залогинился как ${bot.username}`);
  });

  bot.once('spawn', () => {
    state.alive = true;
    logSys('Заспавнился. Готов.');
    if (state.ownerOnlyMode && state.owner) {
      logSys(`Режим: слушаю только "${state.owner}".`);
    } else {
      logSys('Режим: общий чат + модерация.');
    }
    if (config.authPlugin.enabled) {
      logSys('Авто-авторизация включена. Пробую войти/зарегистрироваться...');
      scheduleAuth();
    }
    // 3D вид «глазами бота» через prismarine-viewer
    if (config.web.enabled) {
      try {
        const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
        mineflayerViewer(bot, {
          port: config.web.viewerPort,
          firstPerson: !!config.web.firstPerson,
        });
        logSys(`3D-вид: http://${config.web.host}:${config.web.viewerPort}`);
      } catch (e) {
        logErr('prismarine-viewer не запустился: ' + e.message);
      }
    }
  });

  // ----- Универсальный обработчик чата -----
  // Дедупликация (одно и то же сообщение может прийти и в `chat`, и в `messagestr`)
  const seenMsgs = new Map(); // text -> timestamp
  function seenRecently(text) {
    const k = String(text).slice(0, 240);
    const now = Date.now();
    const ts = seenMsgs.get(k);
    if (ts && now - ts < 4000) return true;
    seenMsgs.set(k, now);
    if (seenMsgs.size > 200) {
      for (const [kk, tt] of seenMsgs) {
        if (now - tt > 8000) seenMsgs.delete(kk);
      }
    }
    return false;
  }

  function processChat(username, message, source) {
    if (!username || !message) return;
    if (state.bot && username === state.bot.username) return;

    const lower = String(username).toLowerCase();

    // Режим хозяина: команды слушаем ТОЛЬКО от хозяина,
    // но модерация работает для всех остальных.
    if (state.ownerOnlyMode && state.owner) {
      if (lower === state.owner) {
        handleOwnerChat(username, message);
        return;
      }
      reactToPlayerMessage(username, message);
      return;
    }
    // Без режима хозяина — модерируем всех.
    reactToPlayerMessage(username, message);
  }

  // Стандартный чат
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    seenRecently(`<${username}> ${message}`);
    seenRecently(`${username}: ${message}`);
    seenRecently(message);
    logChat(username, message);
    processChat(username, message, 'chat');
  });

  // Личные сообщения (/msg /tell /w)
  bot.on('whisper', (username, message) => {
    if (username === bot.username) return;
    seenRecently(message);
    logChat('w:' + username, message);
    if (state.ownerOnlyMode && state.owner && String(username).toLowerCase() === state.owner) {
      handleOwnerChat(username, message);
    } else {
      processChat(username, message, 'whisper');
    }
  });

  // ВСЕ сообщения от сервера: системные, нестандартный формат чата,
  // объявления, action bar и т.д. Бот читает абсолютно всё.
  bot.on('messagestr', (text /* , position, jsonMsg */) => {
    const t = String(text || '').trim();
    if (!t) return;

    // Сначала пробуем распознать запрос на авторизацию/регистрацию
    handleAuthSystemMessage(t);

    // Если это сообщение уже обработали как обычный чат — не дублируем
    if (seenRecently(t)) return;

    // Логируем абсолютно всё, что прилетает (так пользователь видит каждое сообщение)
    logChat('msg', t);

    // Пробуем выдрать ник + текст из нестандартных форматов чата:
    //   <Nick> текст
    //   [Rank] Nick: текст       |  [Rank] Nick » текст     |  [Rank] Nick > текст
    //   Nick: текст              |  Nick » текст            |  Nick > текст
    //   [Tag1] [Tag2] Nick: текст
    const NICK = '([A-Za-z0-9_]{2,16})';
    const patterns = [
      new RegExp(`^<${NICK}>\\s*(.+)$`),
      new RegExp(`^(?:\\[[^\\]]+\\]\\s*)+${NICK}\\s*[:»>]\\s*(.+)$`),
      new RegExp(`^${NICK}\\s*[:»>]\\s*(.+)$`),
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (!m) continue;
      const u = m[1];
      const msg = m[2].trim();
      if (!msg) return;
      if (state.bot && u === state.bot.username) return;
      processChat(u, msg, 'messagestr');
      return;
    }
  });

  bot.on('playerJoined', (p) => logSys('+ зашёл: ' + p.username));
  bot.on('playerLeft',   (p) => logSys('- вышел: ' + p.username));

  // Self-defense: hit back when attacked
  bot.on('entityHurt', (entity) => {
    if (!config.pvp.enabled) return;
    if (!state.bot || entity !== state.bot.entity) return;
    // find closest entity that just hit us
    let closest = null;
    let best = Infinity;
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity) continue;
      if (e.type !== 'player' && e.type !== 'mob' && e.type !== 'hostile') continue;
      const d = e.position.distanceTo(bot.entity.position);
      if (d < best && d <= (config.pvp.attackRangeBlocks || 16)) {
        best = d; closest = e;
      }
    }
    if (closest) {
      // Don't auto-attack the owner
      const cn = (closest.username || '').toLowerCase();
      if (cn && cn === state.owner) return;
      attackEntity(closest);
    }
  });

  // Periodic hostile sweep
  const sweep = setInterval(() => {
    if (!state.alive || !config.pvp.enabled) return;
    if (state.bot?.pvp?.target) return;
    const enemy = nearestHostile();
    if (enemy) attackEntity(enemy);
  }, 1500);

  bot.on('death', () => logSys('Я умер. Респаун...'));
  bot.on('kicked', (reason) => logErr('Кик: ' + reason));
  bot.on('error',  (err)    => logErr('Ошибка: ' + (err?.message || err)));

  bot.on('end', (reason) => {
    state.alive = false;
    state.authed = false;
    clearAuthTimers();
    clearInterval(sweep);
    logErr('Соединение закрыто: ' + (reason || ''));
    state.bot = null;
    if (config.autoReconnect) {
      logSys(`Переподключение через ${Math.round(config.reconnectDelayMs / 1000)} сек.`);
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(createBot, config.reconnectDelayMs);
    }
  });
}

// ---------- terminal commands ----------
function printHelp() {
  logSys('Команды:');
  logSys('  Слушать только <Ник>      — слушать только этого игрока (хозяин)');
  logSys('  Слушать всех              — выключить режим хозяина');
  logSys('  скажи <текст>             — отправить текст в чат сервера');
  logSys('  атакуй <Ник>              — напасть на игрока');
  logSys('  иди <Ник>                 — следовать за игроком');
  logSys('  стой                      — остановиться');
  logSys('  ютуберы                   — список игроков с ютуберкой');
  logSys('  ютубер+ <Ник>             — добавить ютубера');
  logSys('  ютубер- <Ник>             — убрать ютубера');
  logSys('  сервер <айпи:порт>        — сменить сервер и переподключиться');
  logSys('  ник <Ник>                 — сменить ник и переподключиться');
  logSys('  логин                     — отправить /login вручную');
  logSys('  регистрация               — отправить /reg вручную');
  logSys('  пароль <новый>            — сменить пароль авторизации');
  logSys('  правила                   — показать список правил');
  logSys('  стоп бот / выход          — выключить бота');
  logSys('  помощь                    — это сообщение');
}

function reconnect() {
  if (state.bot) {
    try { state.bot.quit('reconnect'); } catch (_) {}
  } else {
    clearTimeout(state.reconnectTimer);
    createBot();
  }
}

function runCommand(raw, source = 'cli') {
  const line = String(raw || '').trim();
  if (!line) return;
  let m;
  if ((m = line.match(/^Слушать только\s+(\S+)\s*$/i))) {
    state.owner = m[1].toLowerCase();
    state.ownerOnlyMode = true;
    logSys(`Теперь слушаю только: ${m[1]}`);
  } else if (/^Слушать всех\s*$/i.test(line)) {
    state.ownerOnlyMode = false;
    logSys('Слушаю всех (общий режим).');
  } else if ((m = line.match(/^скажи\s+(.+)$/i))) {
    safeChat(m[1]);
  } else if ((m = line.match(/^(атакуй|kill|attack)\s+(\S+)\s*$/i))) {
    attackPlayer(m[2]);
  } else if ((m = line.match(/^(иди|follow)\s+(\S+)\s*$/i))) {
    followPlayer(m[2]);
  } else if (/^(стой|stop)\s*$/i.test(line)) {
    stopFollow(); stopPvP(); stopAllControls(); logSys('Остановился.');
  } else if (/^ютуберы\s*$/i.test(line)) {
    logSys('Ютуберы: ' + (state.youtubers.size ? [...state.youtubers].join(', ') : '(нет)'));
  } else if ((m = line.match(/^ютубер\+\s+(\S+)\s*$/i))) {
    state.youtubers.add(m[1].toLowerCase()); logSys(`Добавлен ютубер: ${m[1]}`);
  } else if ((m = line.match(/^ютубер-\s+(\S+)\s*$/i))) {
    state.youtubers.delete(m[1].toLowerCase()); logSys(`Убран ютубер: ${m[1]}`);
  } else if ((m = line.match(/^сервер\s+(\S+:\d+)\s*$/i))) {
    config.server = m[1];
    const parsed = parseServer(m[1]);
    host = parsed.host;
    port = parsed.port;
    logSys(`Сервер сменён на ${host}:${port}, переподключаюсь...`);
    if (state.bot) { try { state.bot.quit('switch server'); } catch (_) {} }
    else { clearTimeout(state.reconnectTimer); createBot(); }
  } else if ((m = line.match(/^ник\s+(\S+)\s*$/i))) {
    config.username = m[1];
    logSys(`Ник сменён на ${m[1]}, переподключаюсь...`);
    if (state.bot) { try { state.bot.quit('rename'); } catch (_) {} }
    else { clearTimeout(state.reconnectTimer); createBot(); }
  } else if (/^(логин|login)\s*$/i.test(line)) {
    if (!state.alive) logErr('Бот не на сервере.');
    else sendLogin();
  } else if (/^(регистрация|register|рег)\s*$/i.test(line)) {
    if (!state.alive) logErr('Бот не на сервере.');
    else sendRegister();
  } else if ((m = line.match(/^пароль\s+(\S+)\s*$/i))) {
    config.authPlugin.password = m[1];
    logSys('Пароль авторизации обновлён.');
  } else if (/^правила\s*$/i.test(line)) {
    logSys(rulesList());
  } else if (/^(стоп бот|выход|exit|quit)\s*$/i.test(line)) {
    logSys('Выключаюсь...');
    config.autoReconnect = false;
    if (state.bot) { try { state.bot.quit('bye'); } catch (_) {} }
    setTimeout(() => process.exit(0), 500);
    return;
  } else if (/^(помощь|help|\?)\s*$/i.test(line)) {
    printHelp();
  } else if (line.startsWith('/')) {
    // Прямая отправка команды на сервер из любого источника
    safeChat(line);
  } else {
    logSys('Неизвестная команда. Напиши "помощь".');
  }
}

// ---------- WASD управление ботом из веб-панели ----------
const CONTROL_KEYS = ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'];
function setControl(key, on) {
  if (!CONTROL_KEYS.includes(key)) return false;
  if (!state.bot || !state.alive) return false;
  try { state.bot.setControlState(key, !!on); return true; }
  catch (e) { logErr('control: ' + e.message); return false; }
}
function stopAllControls() {
  if (!state.bot) return;
  for (const k of CONTROL_KEYS) {
    try { state.bot.setControlState(k, false); } catch (_) {}
  }
}
function lookAtPlayer(name) {
  if (!state.bot || !state.alive) return false;
  const p = state.bot.players[name];
  if (!p || !p.entity) return false;
  try { state.bot.lookAt(p.entity.position.offset(0, 1.6, 0), true); return true; }
  catch (e) { logErr('look: ' + e.message); return false; }
}

rl.on('line', (raw) => {
  runCommand(raw, 'cli');
  rl.prompt();
});

rl.on('SIGINT', () => {
  logSys('Прерывание. Выключаюсь...');
  config.autoReconnect = false;
  if (state.bot) { try { state.bot.quit('sigint'); } catch (_) {} }
  setTimeout(() => process.exit(0), 300);
});

// ---------- start ----------
console.log('=== Termux Minecraft Bot ===');
console.log(`Сервер: ${config.server}`);
console.log(`Ник:    ${config.username}`);
if (state.ownerOnlyMode && state.owner) {
  console.log(`Режим:  слушаю только "${state.owner}"`);
} else {
  console.log('Режим:  общий чат + модерация');
}
console.log('Напиши "помощь" для списка команд.');
printHelp();
rl.prompt();

// Стартуем веб-панель управления (если включена)
if (config.web.enabled) {
  try {
    const startWeb = require('./web');
    const handle = startWeb({
      host: config.web.host,
      port: config.web.port,
      viewerPort: config.web.viewerPort,
      runCommand: (text) => runCommand(text, 'web'),
      setControl,
      stopAllControls,
      lookAtPlayer,
      getState: () => ({
        server: `${host}:${port}`,
        username: config.username,
        alive: state.alive,
        authed: state.authed,
        ownerOnlyMode: state.ownerOnlyMode,
        owner: state.owner,
        youtubers: [...state.youtubers],
        viewerUrl: `http://${config.web.host}:${config.web.viewerPort}`,
        players: state.bot && state.alive ? Object.keys(state.bot.players).filter(p => p !== state.bot.username) : [],
        health: state.bot?.health ?? null,
        food: state.bot?.food ?? null,
      }),
    });
    webBroadcast = handle.broadcast;
    logSys(`Веб-панель: http://${config.web.host}:${config.web.port}`);
  } catch (e) {
    logErr('Веб-панель не запустилась: ' + e.message);
  }
}

createBot();

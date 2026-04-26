const RULES = [
  { n: 1, text: 'Читерство — бан 50–100 дней, в зависимости от чита.' },
  { n: 2, text: 'Продажа аккаунта или попытка его продать — бан 70 дней.' },
  { n: 3, text: 'Флуд в чате — мут 3 часа в общем чате.' },
  { n: 4, text: 'Ссылки или пиар — бан 15 дней (кроме игроков с ютуберкой).' },
  { n: 5, text: 'Пропаганда терроризма — бан до 60 дней.' },
  { n: 6, text: 'Уклон от проверки на читы — бан 50 дней.' },
  { n: 7, text: 'Бессмысленные сообщения в общем чате — мут 5 часов.' },
  { n: 9, text: 'Нецензурщина — мут 2–3 дня.' },
  { n: 12, text: 'Унижение или оскорбление админов — бан 30 дней.' },
  { n: 13, text: 'Ложные жалобы на читерство — бан 60 дней.' },
  { n: 14, text: 'Попытка крашинга или взлома сервера — бан НАВСЕГДА.' },
  { n: 15, text: 'Взлом аккаунта игрока — бан НАВСЕГДА.' },
  { n: 16, text: 'Рейдинг сервера или попытка взлома — бан НАВСЕГДА.' },
  { n: 17, text: 'Багоюзание или дюп предметов — бан 40 дней.' },
  { n: 18, text: 'Превышение полномочий админом — съёмка или бан 30 дней.' },
];

const PROFANITY = [
  'бляд', 'сука', 'хуй', 'хуе', 'пизд', 'еба', 'ебал', 'ебан', 'ёба',
  'нахуй', 'пидор', 'пидар', 'мраз', 'долбо', 'fuck', 'shit', 'bitch',
  'cunt', 'asshole',
];

const URL_REGEX = /\b((https?:\/\/|www\.)\S+|[a-z0-9-]+\.(ru|com|net|org|me|io|gg|tv|club|site|xyz|top|info|biz|live|app|dev)(\/\S*)?)/i;
const TERROR_PATTERNS = [
  'игил', 'isis', 'теракт', 'террорист', 'взорв', 'бомб', 'джихад',
  'al-qaeda', 'аль-каида',
];
const HACK_PATTERNS = [
  'crash', 'краш', 'эксплойт', 'exploit', 'ddos', 'дос-атака', 'снифер',
  'sniffer', 'инжект', 'inject', 'rce',
];
const ACCOUNT_SELL_PATTERNS = [
  'продам акк', 'продам аккаунт', 'купи акк', 'продаю акк', 'sell acc',
  'sell account', 'аккаунт за', 'акк за',
];
const RAID_PATTERNS = ['рейд', 'raid', 'снос', 'нагнём сервер', 'снесём серв'];
const DUPE_PATTERNS = ['дюп', 'dupe', 'багоюз', 'баг-юз'];
const FALSE_REPORT = ['ложная жалоба', 'фейк жалоба', 'обманная жалоба'];
const ADMIN_INSULT_HINTS = ['админ лох', 'админ дурак', 'админ говн', 'админ туп', 'админка лох'];
const CHEAT_DODGE = ['не пойду на проверку', 'не буду проходить проверку', 'не хочу на проверку'];

function classify(text) {
  const t = (text || '').toLowerCase();
  if (HACK_PATTERNS.some(p => t.includes(p))) return { rule: 14, severity: 'high' };
  if (RAID_PATTERNS.some(p => t.includes(p))) return { rule: 16, severity: 'high' };
  if (TERROR_PATTERNS.some(p => t.includes(p))) return { rule: 5, severity: 'high' };
  if (ACCOUNT_SELL_PATTERNS.some(p => t.includes(p))) return { rule: 2, severity: 'mid' };
  if (DUPE_PATTERNS.some(p => t.includes(p))) return { rule: 17, severity: 'mid' };
  if (FALSE_REPORT.some(p => t.includes(p))) return { rule: 13, severity: 'mid' };
  if (CHEAT_DODGE.some(p => t.includes(p))) return { rule: 6, severity: 'mid' };
  if (ADMIN_INSULT_HINTS.some(p => t.includes(p))) return { rule: 12, severity: 'mid' };
  if (URL_REGEX.test(t)) return { rule: 4, severity: 'low' };
  if (PROFANITY.some(p => t.includes(p))) return { rule: 9, severity: 'low' };
  return null;
}

function isFlood(history, windowMs = 8000, threshold = 5) {
  const now = Date.now();
  const recent = history.filter(ts => now - ts < windowMs);
  return recent.length >= threshold;
}

function isMeaningless(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.length < 3) return false;
  const letters = t.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (!letters) return /^[!?.,1-9\W_]{4,}$/.test(t);
  const unique = new Set(letters.toLowerCase()).size;
  if (letters.length >= 6 && unique <= 2) return true;
  if (/(.)\1{4,}/.test(t)) return true;
  return false;
}

function ruleText(n) {
  const r = RULES.find(r => r.n === n);
  return r ? `Правило ${r.n}: ${r.text}` : null;
}

function rulesList() {
  return RULES.map(r => `${r.n}) ${r.text}`).join(' | ');
}

module.exports = {
  RULES,
  classify,
  isFlood,
  isMeaningless,
  ruleText,
  rulesList,
};

// Estatísticas de estudo: tempo por dia, sequência, meta diária e assuntos treinados.
// Não mexe no DOM nem no localStorage (isso é do app.js), então dá para testar em Node.

export const PRACTICE_MIN_SEC = 60; // um dia só entra na sequência com pelo menos 1 minuto de conversa
const KEEP_DAYS = 400;

const DAY_MS = 86400000;

export function dayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Data local de `n` dias atrás (montada pelo calendário, então horário de verão não desalinha).
function daysAgo(n, now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

export function emptyStats() {
  return { days: {}, topics: {} };
}

// O que vem do localStorage pode estar velho ou corrompido: só aceita números finitos.
export function normalizeStats(raw) {
  const stats = emptyStats();
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (raw && typeof raw === 'object') {
    for (const [key, d] of Object.entries(raw.days || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && d) stats.days[key] = { sec: num(d.sec), words: num(d.words), convs: num(d.convs) };
    }
    for (const [id, t] of Object.entries(raw.topics || {})) {
      if (t) stats.topics[id] = { sec: num(t.sec), convs: num(t.convs) };
    }
  }
  return stats;
}

/** Soma uma conversa ao dia de hoje e ao assunto. Devolve o mesmo objeto. */
export function recordSession(stats, { sec, words = 0, topic = '', now = new Date() }) {
  const key = dayKey(now);
  const day = stats.days[key] || (stats.days[key] = { sec: 0, words: 0, convs: 0 });
  day.sec += sec;
  day.words += words;
  day.convs += 1;
  if (topic) {
    const t = stats.topics[topic] || (stats.topics[topic] = { sec: 0, convs: 0 });
    t.sec += sec;
    t.convs += 1;
  }
  const oldest = dayKey(daysAgo(KEEP_DAYS, now));
  for (const k of Object.keys(stats.days)) if (k < oldest) delete stats.days[k];
  return stats;
}

function practiced(stats, date) {
  const d = stats.days[dayKey(date)];
  return !!d && d.sec >= PRACTICE_MIN_SEC;
}

export function todaySec(stats, now = new Date()) {
  const d = stats.days[dayKey(now)];
  return d ? d.sec : 0;
}

/** Quanto da meta diária (em minutos) já foi feito hoje. */
export function goalProgress(stats, goalMin, now = new Date()) {
  const goalSec = Math.max(1, Number(goalMin) || 10) * 60;
  const sec = todaySec(stats, now);
  return { sec, goalSec, frac: Math.min(1, sec / goalSec), done: sec >= goalSec, leftSec: Math.max(0, goalSec - sec) };
}

/** Dias seguidos praticando. Se hoje ainda não teve prática, a sequência de ontem continua valendo. */
export function streak(stats, now = new Date()) {
  let i = practiced(stats, daysAgo(0, now)) ? 0 : 1;
  let n = 0;
  while (practiced(stats, daysAgo(i, now))) {
    n++;
    i++;
  }
  return n;
}

export function bestStreak(stats) {
  const keys = Object.keys(stats.days).filter((k) => stats.days[k].sec >= PRACTICE_MIN_SEC).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number);
    const at = new Date(y, m - 1, d, 12).getTime();
    run = prev !== null && Math.round((at - prev) / DAY_MS) === 1 ? run + 1 : 1;
    prev = at;
    best = Math.max(best, run);
  }
  return best;
}

/** Os últimos `n` dias, do mais antigo ao de hoje. */
export function lastDays(stats, n = 7, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = daysAgo(i, now);
    const d = stats.days[dayKey(date)];
    out.push({ key: dayKey(date), weekday: date.getDay(), sec: d ? d.sec : 0, today: i === 0 });
  }
  return out;
}

export function totals(stats) {
  const sum = { convs: 0, sec: 0, words: 0 };
  for (const d of Object.values(stats.days)) {
    sum.convs += d.convs;
    sum.sec += d.sec;
    sum.words += d.words;
  }
  return sum;
}

/** Assuntos mais treinados, do que tem mais tempo para o que tem menos. */
export function topTopics(stats, max = 5) {
  return Object.entries(stats.topics)
    .map(([id, t]) => ({ id, ...t }))
    .filter((t) => t.sec > 0)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, max);
}

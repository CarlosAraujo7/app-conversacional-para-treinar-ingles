// Repetição espaçada simples (caixas de Leitner) para o caderno de vocabulário.
// Uma palavra sobe de caixa quando você acerta e as revisões vão ficando mais espaçadas;
// se errar, volta para a caixa 1. Não mexe no DOM nem no localStorage.

export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]; // caixa 0 = palavra nova
export const MAX_BOX = INTERVAL_DAYS.length - 1;

export const STAGES = ['new', 'learning', 'firm', 'mastered'];

export function boxOf(item) {
  return Math.min(MAX_BOX, Math.max(0, Number(item.box) | 0));
}

/** nova | aprendendo | firme | dominada, para as barras e pontinhos de progresso. */
export function stageOf(item) {
  const box = boxOf(item);
  if (box === 0) return 'new';
  if (box <= 2) return 'learning';
  if (box <= 4) return 'firm';
  return 'mastered';
}

export function isDue(item, now = Date.now()) {
  return !item.due || item.due <= now;
}

// A próxima revisão cai no começo do dia (hora local): estudar à noite deixa a palavra pronta de manhã.
function dueAt(now, days) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** result: 'again' (errei), 'hard' (quase) ou 'good' (acertei). Devolve os campos a atualizar no item. */
export function grade(item, result, now = Date.now()) {
  let box = boxOf(item);
  if (result === 'again') box = 1;
  else if (result === 'hard') box = Math.max(1, box);
  else box = Math.min(MAX_BOX, box + 1);
  return {
    box,
    due: dueAt(now, INTERVAL_DAYS[box]),
    seen: (Number(item.seen) | 0) + 1,
    miss: (Number(item.miss) | 0) + (result === 'again' ? 1 : 0),
  };
}

export function counts(vocab, now = Date.now()) {
  const c = { total: vocab.length, due: 0, new: 0, learning: 0, firm: 0, mastered: 0 };
  for (const item of vocab) {
    c[stageOf(item)]++;
    if (isDue(item, now)) c.due++;
  }
  return c;
}

/** Fila de revisão: o que venceu há mais tempo primeiro, depois as palavras novas. */
export function buildQueue(vocab, now = Date.now(), limit = 20) {
  const due = vocab.filter((v) => isDue(v, now));
  const seen = due.filter((v) => boxOf(v) > 0).sort((a, b) => (a.due || 0) - (b.due || 0));
  const fresh = due.filter((v) => boxOf(v) === 0);
  return [...seen, ...fresh].slice(0, limit);
}

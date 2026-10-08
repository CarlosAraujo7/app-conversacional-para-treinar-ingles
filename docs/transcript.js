// Modelo da conversa: junta os pedaços de transcrição em "turnos" e protege contra
// repetições. Não mexe no DOM (isso é do view.js), então dá para testar em Node.
//
// Proteções:
//  - trecho acumulado: se o servidor reenviar o texto inteiro até agora, substitui em vez de somar;
//  - trecho atrasado: transcrição que chega logo depois do turnComplete entra no turno certo;
//  - resposta repetida: um segundo turno do tutor parecido com o anterior, sem você ter falado
//    nada no meio, é marcado como repetido (o áudio dele é cortado pelo app);
//  - eco: fala sua "transcrita" que é quase idêntica ao que o tutor está dizendo.

const LATE_USER_MS = 1500; // transcrição sua que chega logo depois de o tutor começar a responder
const LATE_TUTOR_MS = 2000; // transcrição do tutor que chega logo depois do turnComplete
const LATE_SETTLE_MS = 1000; // um turno reaberto por trecho atrasado fecha de novo depois desse silêncio
const SWALLOW_MAX_MS = 15000; // limite para descartar o resto de um turno repetido
const ECHO_WINDOW_MS = 15000;
const REPEAT_MIN_TOKENS = 5;
const REPEAT_OVERLAP = 0.6;
const ECHO_OVERLAP = 0.8;

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

// Quanto do menor texto está contido no outro (0 a 1), contando palavras distintas.
export function overlap(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  const small = A.size <= B.size ? A : B;
  const big = small === A ? B : A;
  if (!small.size) return 0;
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size;
}

// Soma um trecho ao texto atual, tratando trechos acumulados ou repetidos.
export function appendSmart(existing, chunk) {
  if (!existing) return chunk;
  const e = normalize(existing);
  const c = normalize(chunk);
  // O servidor reenviou tudo desde o início (acumulado): precisa de texto suficiente para não confundir
  // com uma continuação legítima que por acaso começa igual ("I" + "it is ...").
  if (e.length >= 8 && c.length >= e.length + 4 && c.startsWith(`${e} `)) return chunk;
  // Trecho idêntico ao final do que já temos: duplicado.
  if (c.length >= 12 && normalize(existing.slice(-chunk.length - 2)).endsWith(c)) return existing;
  return existing + chunk;
}

export function displayText(turn) {
  return turn.text.replace(/\s+/g, ' ').trim();
}

export class Conversation {
  /**
   * hooks: onAdd(turn), onUpdate(turn), onClose(turn), onEcho(turn), onRepeat(turn)
   */
  constructor(hooks = {}) {
    this.h = hooks;
    this.turns = [];
    this.nextId = 1;
    this.openTutor = null;
    this.lastClosedTutor = null;
    this.swallow = false; // descartando o resto de um turno repetido
    this.userActivity = false; // você falou/digitou desde o último turno do tutor?
  }

  last() {
    return this.turns.at(-1);
  }

  newTurn(role, now, extra = {}) {
    const turn = { id: this.nextId++, role, text: '', open: role === 'tutor', born: now, closedAt: null, cut: false, echo: false, dup: false, typed: false, ...extra };
    this.turns.push(turn);
    this.h.onAdd?.(turn);
    return turn;
  }

  markUserActivity(now = performance.now()) {
    this.userActivity = true;
    this.swallow = false;
    this.settleLate(now);
  }

  // Um turno reaberto só para receber um trecho atrasado não é um turno em andamento de verdade:
  // fecha quando você age ou depois de um tempo sem novos trechos (tick).
  settleLate(now, idleMs = 0) {
    const t = this.openTutor;
    if (!t) return;
    const reopened = t.lateFrom !== undefined;
    if ((reopened || t.dup) && now - (t.lastChunkAt ?? 0) >= idleMs) this.closeTutor(t, now, false);
  }

  /** Chamado periodicamente pelo app. */
  tick(now = performance.now()) {
    this.settleLate(now, LATE_SETTLE_MS);
  }

  addTyped(text, now = performance.now()) {
    this.markUserActivity(now);
    const turn = this.newTurn('user', now, { typed: true });
    turn.text = text;
    this.h.onUpdate?.(turn);
    return turn;
  }

  /** Pedaço de transcrição da sua fala. opts.speaking: o tutor está falando agora (ou acabou de falar). */
  userText(chunk, opts = {}, now = performance.now()) {
    this.settleLate(now);
    const last = this.last();
    let turn;
    if (last && last.role === 'user' && !last.typed) {
      turn = last;
    } else {
      const prev = this.turns.at(-2);
      const late = last && last === this.openTutor && prev && prev.role === 'user' && !prev.typed
        && now - last.born < LATE_USER_MS;
      turn = late ? prev : this.newTurn('user', now);
    }
    turn.text = appendSmart(turn.text, chunk);
    if (!turn.echo) this.checkEcho(turn, opts, now);
    if (!turn.echo) {
      this.userActivity = true;
      this.swallow = false;
    }
    this.h.onUpdate?.(turn);
    return turn;
  }

  checkEcho(turn, opts, now) {
    if (!opts.speaking) return;
    const mine = tokens(turn.text);
    if (mine.length < 3) return;
    const pool = this.turns
      .filter((t) => t.role === 'tutor' && !t.dup && (t.open || now - (t.closedAt ?? now) < ECHO_WINDOW_MS))
      .map((t) => t.text)
      .join(' ');
    if (!pool) return;
    if (overlap(turn.text, pool) >= ECHO_OVERLAP) {
      turn.echo = true;
      this.h.onEcho?.(turn);
    }
  }

  /** Pedaço de transcrição do tutor. Devolve { repeat } quando detecta resposta repetida. */
  tutorText(chunk, now = performance.now()) {
    if (this.swallow && now - this.swallowAt < SWALLOW_MAX_MS) return { repeat: true }; // resto de um turno repetido: descarta
    this.swallow = false;
    // Turno reaberto por trecho atrasado e parado há tempo: o que chega agora é um turno novo.
    this.settleLate(now, LATE_TUTOR_MS);
    let turn = this.openTutor;
    if (!turn) {
      const lc = this.lastClosedTutor;
      if (lc && !lc.cut && !lc.reopened && this.last() === lc && now - lc.closedAt < LATE_TUTOR_MS) {
        turn = lc; // pode ser um trecho atrasado do mesmo turno (ou uma repetição, ver abaixo)
        turn.open = true;
        turn.reopened = true; // só uma reabertura por turno
        turn.closedAt = null;
        turn.lateFrom = turn.text.length;
      } else {
        turn = this.newTurn('tutor', now);
      }
      this.openTutor = turn;
    }
    turn.lastChunkAt = now;
    if (turn.dup) return { repeat: true };

    turn.text = appendSmart(turn.text, chunk);

    // Um "trecho atrasado" grande que repete o que o turno já disse é na verdade uma resposta
    // duplicada: volta o texto ao que era e descarta o resto desse turno.
    if (turn.lateFrom !== undefined) {
      const earlier = turn.text.slice(0, turn.lateFrom);
      const late = turn.text.slice(turn.lateFrom);
      if (tokens(late).length >= REPEAT_MIN_TOKENS && overlap(late, earlier) >= REPEAT_OVERLAP) {
        turn.text = earlier;
        this.h.onRepeat?.(turn);
        this.closeTutor(turn, now, true); // volta a fechado, sem reanotar: o texto não mudou
        this.swallow = true;
        this.swallowAt = now;
        return { repeat: true };
      }
    }

    const repeat = this.checkRepeat(turn);
    this.h.onUpdate?.(turn);
    return { repeat };
  }

  checkRepeat(turn) {
    if (this.userActivity) return false;
    const prev = this.lastClosedTutor && this.lastClosedTutor !== turn ? this.lastClosedTutor : null;
    if (!prev || prev.dup) return false;
    if (tokens(turn.text).length < REPEAT_MIN_TOKENS) return false;
    if (overlap(turn.text, prev.text) < REPEAT_OVERLAP) return false;
    turn.dup = true;
    this.h.onRepeat?.(turn);
    return true;
  }

  turnComplete(now = performance.now()) {
    const turn = this.openTutor;
    this.userActivity = false;
    const swallowed = this.swallow;
    this.swallow = false;
    if (!turn) return;
    this.closeTutor(turn, now, swallowed);
  }

  interrupted(now = performance.now()) {
    const turn = this.openTutor;
    this.swallow = false;
    if (!turn) return;
    turn.cut = true;
    this.closeTutor(turn, now, false);
  }

  // quiet: o turno só foi reaberto para descartar uma repetição; o texto não mudou, não reanota.
  closeTutor(turn, now, quiet) {
    turn.open = false;
    turn.closedAt = now;
    turn.lateFrom = undefined;
    this.openTutor = null;
    if (turn.dup) {
      this.h.onUpdate?.(turn);
      return;
    }
    this.lastClosedTutor = turn;
    this.h.onUpdate?.(turn);
    if (!quiet && turn.text.trim()) this.h.onClose?.(turn);
  }

  /** Começa uma conversa nova: zera o estado de fluxo e devolve o índice de onde ela começa. */
  beginSession() {
    this.openTutor = null;
    this.lastClosedTutor = null;
    this.swallow = false;
    this.userActivity = false;
    return this.turns.length;
  }

  /** Últimos turnos úteis (sem eco nem repetição) a partir de `since`, para dar contexto ao reiniciar. */
  recent(max = 16, maxChars = 300, since = 0) {
    return this.turns
      .slice(since)
      .filter((t) => !t.echo && !t.dup && t.text.trim())
      .slice(-max)
      .map((t) => ({ role: t.role, text: displayText(t).slice(0, maxChars) }));
  }

  /** O que você disse por último antes de um turno do tutor. */
  learnerBefore(turn) {
    const i = this.turns.indexOf(turn);
    for (let k = i - 1; k >= 0; k--) {
      const t = this.turns[k];
      if (t.role === 'user' && !t.echo && t.text.trim()) return displayText(t);
    }
    return '';
  }
}

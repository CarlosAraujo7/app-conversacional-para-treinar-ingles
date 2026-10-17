// Revisão do caderno em cartões: você tenta lembrar, vira o cartão e diz se acertou.
// O agendamento (quando cada palavra volta) é do srs.js; aqui só se desenha e se pergunta.

import { grade, INTERVAL_DAYS } from './srs.js';
import { el, icon, iconButton, speak, pct } from './ui.js';

const ANSWERS = [
  { result: 'again', label: 'Errei', key: '1' },
  { result: 'hard', label: 'Quase', key: '2' },
  { result: 'good', label: 'Acertei', key: '3' },
];

function whenLabel(item, result) {
  const days = INTERVAL_DAYS[grade(item, result).box];
  return days === 1 ? 'amanhã' : `em ${days} dias`;
}

/**
 * hooks: onGrade(item, result) -> grava o resultado (só na primeira resposta de cada palavra)
 *        onDirChange(dir)      -> 'pt-en' (produzir) ou 'en-pt' (reconhecer)
 *        onClose()             -> a janela fechou
 */
export function createReview(dialog, hooks = {}) {
  let state = null;

  /** extra: nada tinha vencido, então é um treino com as palavras mais antigas */
  function open({ queue, dir, extra = false }) {
    state = { queue: [...queue], total: queue.length, graded: new Set(), tally: { again: 0, hard: 0, good: 0 }, dir, extra, shown: false };
    if (!dialog.open) dialog.showModal();
    render();
  }

  function header() {
    const head = el('div', 'rv-head');
    head.append(el('h2', '', 'Revisar palavras'));

    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Direção da revisão');
    for (const [dir, label, hint] of [
      ['pt-en', 'PT → EN', 'Você vê o português e lembra o inglês (treina falar)'],
      ['en-pt', 'EN → PT', 'Você vê o inglês e lembra o significado (treina entender)'],
    ]) {
      const b = el('button', '', label);
      b.type = 'button';
      b.title = hint;
      b.setAttribute('aria-pressed', String(state.dir === dir));
      b.addEventListener('click', () => {
        if (state.dir === dir) return;
        state.dir = dir;
        hooks.onDirChange?.(dir);
        render();
      });
      seg.append(b);
    }

    const close = el('button', 'icon-btn');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar revisão');
    close.append(icon('close', 20));
    close.addEventListener('click', () => dialog.close());
    head.append(seg, close);
    return head;
  }

  function progress() {
    const wrap = el('div', 'rv-progress');
    const bar = el('div', 'rv-bar');
    const fill = el('div', 'rv-fill');
    fill.style.width = `${pct(state.graded.size, state.total)}%`;
    bar.append(fill);
    const left = state.queue.length;
    const note = state.extra ? ' · treino extra' : left > state.total - state.graded.size ? ' · repetindo as que errou' : '';
    wrap.append(bar, el('span', 'rv-count', `${state.graded.size} de ${state.total}${note}`));
    return wrap;
  }

  function render() {
    dialog.replaceChildren();
    const box = el('div', 'rv-box');
    box.append(header());
    if (!state.queue.length) {
      renderEnd(box);
    } else {
      box.append(progress());
      renderCard(box, state.queue[0]);
    }
    dialog.append(box);
    const card = dialog.querySelector('.rv-card');
    if (card) card.focus({ preventScroll: true });
  }

  function renderCard(box, item) {
    const ptFirst = state.dir === 'pt-en' && !!item.pt;
    const front = ptFirst ? item.pt : item.en;
    const back = ptFirst ? item.en : item.pt;
    const ask = ptFirst ? 'Como se diz em inglês?' : item.pt ? 'O que significa?' : 'Você lembra o significado?';

    const card = el('div', 'rv-card');
    card.tabIndex = -1;
    card.append(el('div', 'rv-ask', ask), el('div', 'rv-front', front));
    if (ptFirst && !state.shown) card.append(el('div', 'rv-tip', 'Diga a resposta em voz alta antes de virar.'));

    if (state.shown) {
      const answer = el('div', 'rv-answer');
      if (back) answer.append(el('div', 'rv-back', back));
      if (item.example) answer.append(el('div', 'rv-example', item.example));
      const listen = iconButton('volume', 'Ouvir em inglês');
      listen.addEventListener('click', () => speak(item.en));
      answer.append(listen);
      card.append(answer);
    }
    box.append(card);

    const actions = el('div', 'rv-actions');
    if (!state.shown) {
      const show = el('button', 'primary big', 'Mostrar resposta');
      show.type = 'button';
      show.addEventListener('click', () => {
        state.shown = true;
        render();
      });
      actions.append(show);
    } else {
      for (const a of ANSWERS) {
        const b = el('button', `rv-ans ${a.result}`);
        b.type = 'button';
        b.append(el('span', 'rv-ans-label', a.label), el('span', 'rv-ans-when', whenLabel(item, a.result)), el('kbd', '', a.key));
        b.addEventListener('click', () => answer(a.result));
        actions.append(b);
      }
    }
    box.append(actions);
  }

  function answer(result) {
    const item = state.queue.shift();
    if (!state.graded.has(item)) {
      state.graded.add(item);
      state.tally[result]++;
      hooks.onGrade?.(item, result); // só a primeira resposta decide a agenda
    }
    if (result === 'again') state.queue.push(item); // volta no fim da fila até você acertar
    state.shown = false;
    render();
  }

  function renderEnd(box) {
    const { again, hard, good } = state.tally;
    const done = el('div', 'rv-end');
    if (!state.total) {
      done.append(el('h3', '', 'Nada para revisar agora'), el('p', '', 'As palavras do caderno voltam aqui quando chegar a hora de lembrar delas. Converse mais para juntar vocabulário novo.'));
    } else {
      done.append(
        el('h3', '', 'Revisão concluída!'),
        el('p', '', `Você acertou ${good} de ${state.total} de primeira${hard ? `, quase em ${hard}` : ''}${again ? ` e errou ${again}` : ''}.`),
        el('p', 'rv-note', 'As que você errou voltam amanhã; as que acertou voltam cada vez mais espaçadas.'),
      );
    }
    const close = el('button', 'primary big', 'Fechar');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    done.append(close);
    box.append(done);
  }

  // Atalhos: Espaço/Enter viram o cartão, 1/2/3 dão a nota.
  dialog.addEventListener('keydown', (ev) => {
    if (!state || !state.queue.length || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!state.shown && (ev.key === ' ' || ev.key === 'Enter') && ev.target.tagName !== 'BUTTON') {
      ev.preventDefault();
      state.shown = true;
      render();
    } else if (state.shown) {
      const a = ANSWERS.find((x) => x.key === ev.key);
      if (a) {
        ev.preventDefault();
        answer(a.result);
      }
    }
  });

  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    state = null;
    window.speechSynthesis?.cancel();
    hooks.onClose?.();
  });

  return { open };
}

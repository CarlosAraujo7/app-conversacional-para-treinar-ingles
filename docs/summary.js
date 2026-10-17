// Resumo que aparece quando a conversa termina: tempo, quanto você falou, palavras novas e o que melhorar.

import { diffWords } from './diff.js';
import { el, icon, fmtDuration, pct, ringWithText, setTalkBar, talkBar, wordSpans } from './ui.js';

const MAX_FIXES = 4;

function talkMessage(share) {
  if (share >= 50) return 'Você falou mais que o Sam. É assim que se ganha fluência!';
  if (share >= 35) return 'Bom equilíbrio. Na próxima, tente passar dos 50%: o Sam fica feliz em ouvir.';
  return 'O Sam falou bastante. Tente dar respostas mais longas na próxima conversa.';
}

function stat(value, label) {
  const box = el('div', 'tile');
  box.append(el('div', 'tile-value', value), el('div', 'tile-label', label));
  return box;
}

/**
 * hooks: onReview() -> abre a revisão; onNew() -> começa outra conversa; onProgress() -> abre a aba Progresso
 */
export function createSummary(dialog, hooks = {}) {
  /**
   * data: { sec, userWords, tutorWords, newWords: string[], fixes: [{ said, better, tip }],
   *         goal: { frac, done, sec, goalSec }, streak, due }
   */
  function show(data) {
    dialog.replaceChildren();
    const box = el('div', 'sm-box');

    const head = el('div', 'rv-head');
    head.append(el('h2', '', 'Conversa concluída'));
    const close = el('button', 'icon-btn');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar resumo');
    close.append(icon('close', 20));
    close.addEventListener('click', () => dialog.close());
    head.append(close);
    box.append(head);

    const tiles = el('div', 'sm-tiles');
    box.append(tiles);
    const one = (n, a, b) => (n === 1 ? a : b);
    tiles.append(
      stat(fmtDuration(data.sec), 'de conversa'),
      stat(String(data.userWords), one(data.userWords, 'palavra sua', 'palavras suas')),
      stat(String(data.newWords.length), one(data.newWords.length, 'palavra nova', 'palavras novas')),
    );

    // Quanto cada um falou
    const total = data.userWords + data.tutorWords;
    const share = pct(data.userWords, total);
    const talk = el('section', 'sm-section');
    talk.append(el('h3', '', 'Quem falou mais'));
    const bar = talkBar();
    setTalkBar(bar, data.userWords, data.tutorWords);
    const legend = el('ul', 'legend');
    for (const [cls, label, words, p] of [['you', 'Você', data.userWords, share], ['sam', 'Sam', data.tutorWords, 100 - share]]) {
      const li = el('li', '');
      li.append(el('span', `swatch talk-${cls}`), `${label} `, el('b', '', `${total ? p : 0}%`), ` · ${words} palavras`);
      legend.append(li);
    }
    talk.append(bar, legend, el('p', 'note', talkMessage(share)));
    box.append(talk);

    // Meta do dia
    const goal = el('section', 'sm-section sm-goal');
    const ringBox = ringWithText(72, 8);
    ringBox.set(data.goal.frac, `${Math.floor(data.goal.sec / 60)}\nmin`);
    const text = el('div', '');
    text.append(
      el('h3', '', data.goal.done ? 'Meta de hoje batida!' : 'Meta de hoje'),
      el('p', '', data.goal.done ? 'Você já passou da meta diária.' : `${fmtDuration(Math.max(0, data.goal.goalSec - data.goal.sec))} para bater a meta.`),
      el('p', 'note', data.streak ? `Sequência: ${data.streak} ${data.streak === 1 ? 'dia' : 'dias'} seguidos.` : 'Volte amanhã para começar uma sequência.'),
    );
    goal.append(ringBox.node, text);
    box.append(goal);

    // Palavras novas
    if (data.newWords.length) {
      const words = el('section', 'sm-section');
      words.append(el('h3', '', 'Palavras novas no caderno'));
      const chips = el('div', 'chips');
      for (const w of data.newWords) chips.append(el('span', 'saved', w));
      words.append(chips);
      box.append(words);
    }

    // O que melhorar
    if (data.fixes.length) {
      const fixes = el('section', 'sm-section');
      fixes.append(el('h3', '', 'Para melhorar'));
      for (const f of data.fixes.slice(0, MAX_FIXES)) {
        const diff = diffWords(f.said, f.better);
        const card = el('div', 'fb-card');
        card.append(wordSpans(diff.after, 'fb-after'), el('div', 'fb-label', 'Você disse'), wordSpans(diff.before, 'fb-before'));
        if (f.tip) card.append(el('div', 'fb-tip', f.tip));
        fixes.append(card);
      }
      if (data.fixes.length > MAX_FIXES) fixes.append(el('p', 'note', `Mais ${data.fixes.length - MAX_FIXES} correções ficaram na conversa.`));
      box.append(fixes);
    }

    // Ações
    const actions = el('div', 'sm-actions');
    if (data.due) {
      const review = el('button', 'ghost', `Revisar ${data.due} ${data.due === 1 ? 'palavra' : 'palavras'}`);
      review.type = 'button';
      review.addEventListener('click', () => {
        dialog.close();
        hooks.onReview?.();
      });
      actions.append(review);
    }
    const progress = el('button', 'ghost', 'Ver progresso');
    progress.type = 'button';
    progress.addEventListener('click', () => {
      dialog.close();
      hooks.onProgress?.();
    });
    const again = el('button', 'primary', 'Nova conversa');
    again.type = 'button';
    again.addEventListener('click', () => {
      dialog.close();
      hooks.onNew?.();
    });
    actions.append(progress, again);
    box.append(actions);

    dialog.append(box);
    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  return { show };
}

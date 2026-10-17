// Desenha a conversa no DOM. Todo texto que vem do modelo entra por textContent (nunca innerHTML).

import { displayText } from './transcript.js';
import { segmentize } from './coach.js';
import { diffWords } from './diff.js';
import { el, icon, iconButton, textButton, speak, wordSpans } from './ui.js';

const SLOW_RATE = 0.7;
const EXAMPLE_MAX = 160;

// Frase do Sam que contém o termo, para servir de exemplo no caderno.
function sentenceWith(text, term) {
  const hit = text.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(term.toLowerCase()));
  return hit && hit.length <= EXAMPLE_MAX ? hit : '';
}

/**
 * hooks: onSaveEntry({ en, pt, example }) -> guarda no caderno
 *        onReplay(turn, rate)               -> toca de novo a fala guardada do Sam
 *        onReact(mood)                      -> o robô reage ('happy', 'hmm')
 */
export function createView(root, hooks = {}) {
  const parts = new Map(); // turn.id -> elementos do balão
  const termTurn = new WeakMap(); // termo sublinhado -> turno a que pertence

  // Mantém a rolagem no fim só se você já estava no fim (para poder reler o que passou).
  // Rola de uma vez: com a rolagem suave do CSS, várias atualizações seguidas (texto, tradução, cartão de
  // correção) paravam a animação no meio e o fim da conversa ficava para baixo da tela.
  function keepBottom(fn) {
    const near = root.scrollHeight - root.scrollTop - root.clientHeight < 140;
    fn();
    if (near) {
      root.style.scrollBehavior = 'auto';
      root.scrollTop = root.scrollHeight;
      root.style.scrollBehavior = '';
    }
  }

  function renderText(turn, p) {
    const text = displayText(turn);
    if (popTerm && p.text.contains(popTerm)) closePopover(); // o termo aberto vai ser refeito
    p.text.replaceChildren();
    const terms = turn.ann && turn.ann.terms;
    if (turn.role === 'tutor' && !turn.open && terms && terms.length) {
      for (const seg of segmentize(text, terms)) {
        if (!seg.gloss) {
          p.text.append(seg.text);
          continue;
        }
        const term = el('ruby', 'term');
        term.tabIndex = 0;
        term.dataset.gloss = seg.gloss;
        term.dataset.src = seg.text;
        termTurn.set(term, turn);
        term.append(seg.text, el('rt', '', seg.gloss));
        p.text.append(term);
      }
    } else {
      p.text.textContent = text;
    }
  }

  function renderFlags(turn, p) {
    p.root.classList.toggle('cut', turn.cut);
    p.root.classList.toggle('echo', turn.echo);
    p.root.hidden = turn.dup;
    if (turn.role === 'user') p.who.textContent = turn.echo ? 'Você · eco do alto-falante?' : 'Você';
  }

  function add(turn) {
    keepBottom(() => {
      const empty = document.getElementById('empty');
      if (empty) empty.remove();
      const article = el('article', `bubble ${turn.role}`);
      const who = el('div', 'who', turn.role === 'tutor' ? 'Sam' : 'Você');
      const text = el('div', 'text');
      const chips = el('div', 'chips');
      const p = { root: article, who, text, chips };

      if (turn.role === 'tutor') {
        article.tabIndex = 0; // no celular o toque dá foco, e o foco revela o texto escondido
        const head = el('div', 'bubble-head');
        p.actions = el('div', 'actions');
        p.actions.hidden = true;
        head.append(who, p.actions);
        p.translation = el('div', 'translation');
        p.translation.lang = 'pt-BR';
        p.suggest = el('div', 'suggest');
        p.toggle = el('button', 'tr-btn', 'Traduzir');
        p.toggle.type = 'button';
        p.toggle.hidden = true;
        p.toggle.addEventListener('click', () => {
          const on = article.classList.toggle('show-tr');
          p.toggle.textContent = on ? 'Ocultar tradução' : 'Traduzir';
        });
        article.append(head, text, p.translation, p.toggle, p.suggest, chips);
      } else {
        p.feedback = el('div', 'feedback');
        article.append(who, text, p.feedback, chips);
      }
      root.append(article);
      parts.set(turn.id, p);
    });
  }

  function update(turn) {
    const p = parts.get(turn.id);
    if (!p) return;
    keepBottom(() => {
      renderText(turn, p);
      renderFlags(turn, p);
    });
  }

  function setAnnotation(turn) {
    const p = parts.get(turn.id);
    if (!p || !turn.ann) return;
    keepBottom(() => {
      renderText(turn, p);

      p.translation.textContent = turn.ann.translation;
      p.toggle.hidden = !turn.ann.translation;

      // Só a sugestão mais recente fica na tela.
      if (turn.ann.suggestions.length) {
        for (const other of parts.values()) if (other !== p) other.suggest?.replaceChildren();
        p.suggest.replaceChildren(el('div', 'suggest-title', 'Que tal responder assim?'));
        for (const s of turn.ann.suggestions) {
          const card = el('div', 'card');
          const body = el('div', 'card-body');
          body.append(el('div', 'en', s.en), el('div', 'pt', s.pt));
          const listen = textButton('volume', 'Ouvir', 'speak');
          listen.setAttribute('aria-label', `Ouvir: ${s.en}`);
          listen.addEventListener('click', () => speak(s.en));
          card.append(body, listen);
          p.suggest.append(card);
        }
      }
    });
  }

  // Abaixo da sua fala: "Soou natural" ou a frase corrigida, com o que mudou em destaque.
  function setFeedback(turn) {
    const p = parts.get(turn.id);
    const fb = turn.fb;
    if (!p || !p.feedback || !fb) return;
    keepBottom(() => {
      p.feedback.replaceChildren();
      if (fb.verdict === 'good') {
        const ok = el('span', 'fb-good');
        ok.append(icon('check', 14), el('span', '', 'Soou natural'));
        p.feedback.append(ok);
        hooks.onReact?.('happy');
        return;
      }
      if (fb.verdict !== 'improve') return;

      const diff = diffWords(displayText(turn), fb.better);
      const after = wordSpans(diff.after, 'fb-after');
      const listen = iconButton('volume', 'Ouvir a frase certa');
      listen.addEventListener('click', () => speak(fb.better));
      after.append(' ', listen);

      const card = el('div', 'fb-card');
      card.append(wordSpans(diff.before, 'fb-before'), after);
      if (fb.tip) card.append(el('div', 'fb-tip', fb.tip));
      p.feedback.append(card);
      hooks.onReact?.('hmm');
    });
  }

  // Botões no cabeçalho do balão: ouvir a fala do Sam de novo (na voz dele, guardada na memória) e mais devagar.
  function setReplay(turn) {
    const p = parts.get(turn.id);
    if (!p || !p.actions) return;
    p.actions.replaceChildren();
    p.actions.hidden = !turn.audio;
    if (!turn.audio) return;
    const again = iconButton('volume', 'Ouvir de novo');
    again.dataset.rate = '1';
    again.addEventListener('click', () => hooks.onReplay?.(turn, 1));
    const slow = iconButton('slow', 'Ouvir mais devagar');
    slow.dataset.rate = String(SLOW_RATE);
    slow.addEventListener('click', () => hooks.onReplay?.(turn, SLOW_RATE));
    p.actions.append(again, slow);
  }

  /** Marca qual fala está tocando (e em que velocidade); `null` limpa. */
  function setPlaying(turn, rate = 1) {
    for (const [id, p] of parts) {
      const on = !!turn && id === turn.id;
      p.root.classList.toggle('playing', on);
      for (const btn of p.actions ? p.actions.children : []) {
        btn.classList.toggle('on', on && Number(btn.dataset.rate) === rate);
      }
    }
  }

  function addChip(turn, text) {
    const p = parts.get(turn.id);
    if (!p) return;
    keepBottom(() => p.chips.append(el('span', 'saved', text)));
  }

  function setPending(turn, on) {
    const p = parts.get(turn.id);
    if (p) p.root.classList.toggle('pending', on);
  }

  function divider(text) {
    keepBottom(() => root.append(el('div', 'divider', text)));
  }

  // ---------- popover dos termos: toque para ver, ouvir e salvar ----------

  const pop = el('div', 'popover');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Termo');
  document.body.append(pop);
  let popTerm = null;

  function closePopover() {
    if (!popTerm) return;
    popTerm.classList.remove('open');
    popTerm = null;
    pop.hidden = true;
  }

  function openPopover(term, turn) {
    closePopover();
    const gloss = term.dataset.gloss;
    const src = term.dataset.src;
    const ptTutor = turn.ann && turn.ann.tutorLang === 'pt';
    const en = ptTutor ? gloss : src; // o lado em inglês, que é o que se ouve e se guarda
    const pt = ptTutor ? src : gloss;
    const example = ptTutor ? '' : sentenceWith(displayText(turn), src);

    pop.replaceChildren();
    const head = el('div', 'pop-head');
    head.append(el('div', 'pop-en', en), el('div', 'pop-pt', pt));
    const listen = textButton('volume', 'Ouvir');
    listen.addEventListener('click', () => speak(en));
    const save = textButton('plus', 'Salvar no caderno');
    save.addEventListener('click', () => {
      hooks.onSaveEntry?.({ en, pt, example });
      addChip(turn, `Salvo no caderno: ${en}`);
      hooks.onReact?.('happy');
      save.disabled = true;
      save.replaceChildren(icon('check', 14), el('span', '', 'Salvo'));
    });
    const row = el('div', 'pop-actions');
    row.append(listen, save);
    pop.append(head, row);

    pop.style.visibility = 'hidden';
    pop.hidden = false;
    const r = term.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8 + h <= window.innerHeight - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
    pop.style.visibility = '';
    term.classList.add('open');
    popTerm = term;
  }

  root.addEventListener('click', (ev) => {
    const term = ev.target.closest && ev.target.closest('.term');
    if (!term) return;
    if (term === popTerm) closePopover();
    else openPopover(term, termTurn.get(term));
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const term = ev.target.closest && ev.target.closest('.term');
    if (!term) return;
    ev.preventDefault();
    term.click();
  });
  root.addEventListener('scroll', closePopover, { passive: true });
  window.addEventListener('resize', closePopover);
  document.addEventListener('pointerdown', (ev) => {
    if (popTerm && !pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.term'))) closePopover();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePopover();
  });

  return { add, update, setAnnotation, setFeedback, setReplay, setPlaying, addChip, setPending, divider };
}

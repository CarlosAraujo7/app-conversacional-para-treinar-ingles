// Desenha a conversa no DOM. Todo texto que vem do modelo entra por textContent (nunca innerHTML).

import { displayText } from './transcript.js';
import { segmentize } from './coach.js';

function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 0.95;
  const voice = speechSynthesis.getVoices().find((v) => /^en[-_]US/i.test(v.lang));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createView(root) {
  const parts = new Map(); // turn.id -> elementos do balão

  // Mantém a rolagem no fim só se você já estava no fim (para poder reler o que passou).
  function keepBottom(fn) {
    const near = root.scrollHeight - root.scrollTop - root.clientHeight < 140;
    fn();
    if (near) root.scrollTop = root.scrollHeight;
  }

  function renderText(turn, p) {
    const text = displayText(turn);
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
      if (turn.role === 'tutor') article.tabIndex = 0; // no celular o toque dá foco, e o foco revela o texto escondido
      const who = el('div', 'who', turn.role === 'tutor' ? 'Sam' : 'Você');
      const text = el('div', 'text');
      const translation = el('div', 'translation');
      translation.lang = turn.role === 'tutor' ? 'pt-BR' : 'en';
      const suggest = el('div', 'suggest');
      const chips = el('div', 'chips');
      const toggle = el('button', 'tr-btn', 'Traduzir');
      toggle.type = 'button';
      toggle.hidden = true;
      toggle.addEventListener('click', () => {
        const on = article.classList.toggle('show-tr');
        toggle.textContent = on ? 'Ocultar tradução' : 'Traduzir';
      });
      article.append(who, text, translation, toggle, suggest, chips);
      root.append(article);
      parts.set(turn.id, { root: article, who, text, translation, toggle, suggest, chips });
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
        for (const other of parts.values()) if (other !== p) other.suggest.replaceChildren();
        p.suggest.replaceChildren(el('div', 'suggest-title', 'Que tal responder assim?'));
        for (const s of turn.ann.suggestions) {
          const card = el('div', 'card');
          const body = el('div', 'card-body');
          body.append(el('div', 'en', s.en), el('div', 'pt', s.pt));
          const speak = el('button', 'speak', 'Ouvir');
          speak.type = 'button';
          speak.setAttribute('aria-label', `Ouvir: ${s.en}`);
          speak.addEventListener('click', () => speakEnglish(s.en));
          card.append(body, speak);
          p.suggest.append(card);
        }
      }
    });
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

  return { add, update, setAnnotation, addChip, setPending, divider };
}

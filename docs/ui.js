// Pequenos auxiliares de interface usados por vários arquivos.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Ícones de traço, todos em 24x24. O markup é fixo (nunca vem do modelo), então innerHTML é seguro aqui.
const ICONS = {
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  flame: '<path d="M12 3c.6 3.6 5 5.6 5 10a5 5 0 0 1-10 0c0-1.8.8-3 1.9-4 .2 1.3.9 2.1 1.9 2.3C10.7 8.7 11 5.7 12 3z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  cards: '<rect x="3.5" y="8" width="13" height="12" rx="2"/><path d="M7.5 5h11a2 2 0 0 1 2 2v9"/>',
  bars: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  bookmark: '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
  turtle: '<path d="M4 15h16M6 15a6 6 0 0 1 12 0M20 15l2-1.5M4 15l-1.5 1"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
};

export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/** Botão pequeno com ícone e texto. */
export function iconButton(name, label, className = 'mini') {
  const btn = el('button', className);
  btn.type = 'button';
  btn.append(icon(name, 14), el('span', '', label));
  return btn;
}

/** Fala um texto com a voz do navegador (para frases e palavras, não para as falas do Sam). */
export function speak(text, { lang = 'en-US', rate = 0.95 } = {}) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const prefix = lang.slice(0, 2).toLowerCase();
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()))
    || speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

/** 125 -> "2:05" */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 45 -> "45 s"; 600 -> "10 min"; 4500 -> "1 h 15 min" */
export function fmtDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${Math.floor(m / 60)} h`;
}

/** Frase como uma linha de palavras; as que mudaram (ver diff.js) ganham a classe "changed". */
export function wordSpans(list, className) {
  const line = el('div', className);
  list.forEach((w, i) => {
    if (i) line.append(' ');
    line.append(el('span', w.changed ? 'w changed' : 'w', w.text));
  });
  return line;
}

/** Barra "quanto cada um falou": dois trechos lado a lado, proporcionais ao número de palavras. */
export function talkBar() {
  const bar = el('div', 'talk');
  bar.append(el('span', 'talk-you'), el('span', 'talk-sam'));
  return bar;
}

export function setTalkBar(bar, you, sam) {
  bar.style.setProperty('--you', String(you));
  bar.style.setProperty('--sam', String(sam));
  const total = you + sam;
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', total ? `Você falou ${Math.round((you / total) * 100)}% das palavras, o Sam ${Math.round((sam / total) * 100)}%` : 'Ninguém falou ainda');
}

/** Percentual inteiro de `part` em `whole` (0 quando não há nada). */
export function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/** Anel de progresso com texto no centro. `set(fração, texto)` atualiza. */
export function ringWithText(size = 84, stroke = 9) {
  const node = el('div', 'ring-wrap');
  node.style.width = node.style.height = `${size}px`;
  const svg = ring(size, stroke);
  const label = el('span', 'ring-text');
  node.append(svg, label);
  return {
    node,
    set(frac, text) {
      svg.setValue(frac);
      label.textContent = text;
      node.classList.toggle('done', frac >= 1);
    },
  };
}

/** Anel de progresso em SVG (para meta diária). Devolve o elemento; `setValue(0..1)` atualiza. */
export function ring(size = 84, stroke = 9) {
  const NS = 'http://www.w3.org/2000/svg';
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ring');
  const mk = (cls) => {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', size / 2);
    circle.setAttribute('cy', size / 2);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', stroke);
    circle.setAttribute('class', cls);
    return circle;
  };
  const track = mk('ring-track');
  const fill = mk('ring-fill');
  fill.setAttribute('stroke-linecap', 'round');
  fill.setAttribute('stroke-dasharray', c.toFixed(2));
  fill.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.append(track, fill);
  svg.setValue = (v) => {
    const f = Math.max(0, Math.min(1, v));
    fill.setAttribute('stroke-dashoffset', (c * (1 - f)).toFixed(2));
    fill.style.opacity = f > 0 ? '1' : '0'; // linha de zero não deve aparecer como um pontinho
  };
  svg.setValue(0);
  return svg;
}

// Pequenos auxiliares de interface usados por mais de um arquivo.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Ícones de traço, todos em 24x24. O markup é fixo (nunca vem do modelo), então innerHTML é seguro aqui.
const ICONS = {
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  slow: '<path d="M4 15h16M6 15a6 6 0 0 1 12 0M20 15l2-1.5M4 15l-1.5 1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
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

/** Botão só com ícone (o texto fica no title e no aria-label). */
export function iconButton(name, label, className = 'icon-mini') {
  const btn = el('button', className);
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.append(icon(name, 15));
  return btn;
}

/** Botão pequeno com ícone e texto. */
export function textButton(name, label, className = 'mini') {
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
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()))
    || voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
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

/** 125000 (ms) -> "2:05" */
export function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

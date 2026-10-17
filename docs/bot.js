// O robozinho que dá rosto à voz do Sam. Só desenha: o app.js diz em que estado ele está.
//   - os olhos seguem o ponteiro (ou o dedo) e piscam;
//   - a boca abre conforme o volume da voz (sincronia labial simples);
//   - a expressão muda com o estado (ouvindo, falando, pensando, mudo, erro) e com reações rápidas;
//   - parado por um tempo, ele cochila e acorda quando você mexe.
// Os estilos de cada expressão estão em styles.css (seção "robô"), escolhidos por data-state e data-mood.

// Markup fixo (nunca vem do modelo), então innerHTML é seguro aqui. 100x100, cabeça redonda com viseira.
const MARKUP = `
<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <circle class="halo" cx="50" cy="57" r="42"/>
  <g class="think"><circle cx="68" cy="13" r="2"/><circle cx="76" cy="9" r="2.6"/><circle cx="85" cy="4" r="3.3"/></g>
  <g class="zzz"><text x="70" y="19">z</text><text x="79" y="11">z</text></g>
  <g class="head">
    <line class="antenna" x1="50" y1="19" x2="50" y2="10"/>
    <circle class="tip" cx="50" cy="8" r="4"/>
    <circle class="body" cx="50" cy="57" r="40"/>
    <path class="shade" d="M14 63 Q50 104 86 63 Q82 94 50 97 Q18 94 14 63Z"/>
    <path class="shine" d="M23 42 Q27 29 41 24"/>
    <ellipse class="visor" cx="50" cy="55" rx="29" ry="24"/>
    <g class="eyes">
      <g transform="translate(39 51)"><g class="eye">
        <ellipse class="e-open" rx="5.4" ry="7.2"/>
        <path class="e-happy" d="M-6 3 Q0 -6 6 3"/>
        <path class="e-closed" d="M-6 1 H6"/>
      </g></g>
      <g transform="translate(61 51)"><g class="eye">
        <ellipse class="e-open" rx="5.4" ry="7.2"/>
        <path class="e-happy" d="M-6 3 Q0 -6 6 3"/>
        <path class="e-closed" d="M-6 1 H6"/>
      </g></g>
    </g>
    <ellipse class="cheek" cx="30" cy="63" rx="4.2" ry="2.6"/>
    <ellipse class="cheek" cx="70" cy="63" rx="4.2" ry="2.6"/>
    <g class="mouth" transform="translate(50 67)">
      <path class="m-smile" d="M-7 0 Q0 6 7 0"/>
      <path class="m-big" d="M-9 -1 Q0 12 9 -1Z"/>
      <ellipse class="m-open" rx="5.2" ry="6.4"/>
      <path class="m-flat" d="M-5.5 2 H5.5"/>
      <path class="m-sad" d="M-7 4 Q0 -2 7 4"/>
      <circle class="m-o" r="3.2"/>
    </g>
  </g>
</svg>`;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

// Para onde os olhos olham em vez de seguir o ponteiro: [x, y] de -1 a 1.
const LOOK = { thinking: [-0.75, -0.8], sleeping: [0, 0.55], muted: [0, 0.4] };
const FOLLOW_RANGE = 240; // px: o olhar chega ao limite quando o ponteiro está a essa distância
const SLEEP_MS = 25000; // parado assim, o robô cochila

/**
 * host: elemento (div ou span) que vira o robô.
 * Estados: idle, connecting, listening, ready, recording, speaking, thinking, muted, error.
 * Reações rápidas (por cima do estado): happy, hmm, sad.
 */
export function createBot(host) {
  host.classList.add('bot');
  host.innerHTML = MARKUP;
  host.dataset.state = 'idle';

  let state = 'idle';
  let shown = 'idle'; // o que está na tela (idle vira sleeping depois de um tempo parado)
  let asleep = false;
  let level = 0;
  let lastActive = performance.now();
  let moodTimer = 0;
  let raf = 0;
  let pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };

  function step() {
    raf = 0;
    const k = REDUCED.matches ? 1 : 0.2;
    look.x += (look.tx - look.x) * k;
    look.y += (look.ty - look.y) * k;
    host.style.setProperty('--lx', look.x.toFixed(3));
    host.style.setProperty('--ly', look.y.toFixed(3));
    if (Math.abs(look.tx - look.x) > 0.004 || Math.abs(look.ty - look.y) > 0.004) raf = requestAnimationFrame(step);
  }

  function retarget() {
    const forced = LOOK[shown];
    look.tx = forced ? forced[0] : pointer.x;
    look.ty = forced ? forced[1] : pointer.y;
    if (!raf) raf = requestAnimationFrame(step);
  }

  function paint() {
    const next = state === 'idle' && asleep ? 'sleeping' : state;
    if (next === shown) return;
    shown = next;
    host.dataset.state = next;
    retarget();
  }

  function wake() {
    lastActive = performance.now();
    if (asleep) {
      asleep = false;
      paint();
    }
  }

  function onPointer(ev) {
    if (!host.isConnected) { // a tela onde ele estava saiu da página
      destroy();
      return;
    }
    wake();
    if (REDUCED.matches) return;
    const r = host.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / FOLLOW_RANGE);
    pointer = { x: (dx / dist) * k, y: (dy / dist) * k };
    if (!LOOK[shown]) retarget();
  }

  const sleepTimer = setInterval(() => {
    if (!host.isConnected) {
      destroy();
    } else if (state === 'idle' && !asleep && performance.now() - lastActive > SLEEP_MS) {
      asleep = true;
      paint();
    }
  }, 2000);

  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerdown', onPointer, { passive: true });
  document.addEventListener('keydown', wake, { passive: true });

  function destroy() {
    clearInterval(sleepTimer);
    clearTimeout(moodTimer);
    document.removeEventListener('pointermove', onPointer);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', wake);
  }

  return {
    /** state: ver acima. level: 0 a 1, o volume da voz (boca) ou do microfone (brilho ao redor). */
    set(next, lv = 0) {
      if (next !== state) {
        state = next;
        lastActive = performance.now();
        if (next !== 'idle') asleep = false;
        paint();
      }
      const l = Math.max(0, Math.min(1, lv));
      if (Math.abs(l - level) > 0.015) {
        level = l;
        host.style.setProperty('--lvl', l.toFixed(2));
      }
    },
    /** Expressão rápida por cima do estado: 'happy', 'hmm' ou 'sad'. */
    react(mood, ms = 1800) {
      wake();
      host.dataset.mood = mood;
      clearTimeout(moodTimer);
      moodTimer = setTimeout(() => delete host.dataset.mood, ms);
    },
    wake,
    destroy,
  };
}

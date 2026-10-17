// Ondas de som ao redor do robô: barras que saem dele para os dois lados e sobem com a voz de verdade
// (a do Sam, a sua ou uma fala tocada de novo), lidas do espectro do áudio. Parado, viram pontinhos.
// Só desenha: o app.js entrega o espectro a cada quadro.

const STEP = 7; // px entre uma barra e a próxima
const BAR_W = 3.6;
const FIRST = 58; // px do centro até a primeira barra (o robô cobre o meio)
const LO_BIN = 2; // faixa da voz no espectro de 512 faixas (~90 Hz a ~4 kHz)
const HI_BIN = 90;
const MIN_H = 3.2;
const MAX_FRAC = 0.8; // altura máxima, em fração da altura do desenho

/** Volume geral (0 a 1) de um espectro, para a boca do robô. */
export function spectrumLevel(spectrum) {
  if (!spectrum) return 0;
  let sum = 0;
  for (let i = LO_BIN; i < HI_BIN; i++) sum += spectrum[i];
  return Math.min(1, (sum / (HI_BIN - LO_BIN) / 255) * 2.4);
}

export function createWave(canvas) {
  const g = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let heights = [];
  let settled = false; // já desenhou o estado parado e nada mudou desde então

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    heights = new Array(Math.max(0, Math.floor((w / 2 - FIRST) / STEP))).fill(0);
    settled = false;
  }
  new ResizeObserver(resize).observe(canvas);

  function bar(x, y, bw, bh) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, bw, bh, bw / 2);
    else g.rect(x, y, bw, bh);
    g.fill();
  }

  /**
   * mode: 'live' (sobe com o espectro), 'connecting' (onda passando) ou 'idle' (pontinhos).
   * spectrum: Uint8Array de getByteFrequencyData, ou null. color: cor CSS das barras.
   */
  function draw({ mode, spectrum, color }) {
    const n = heights.length;
    const now = performance.now();
    let moving = false;
    for (let k = 0; k < n; k++) {
      const f = k / Math.max(1, n - 1);
      let target = 0;
      if (mode === 'live' && spectrum) {
        // perto do robô ficam os graves da voz (mais fortes); nas pontas, os agudos
        const bin = LO_BIN + Math.floor(f ** 1.4 * (HI_BIN - LO_BIN));
        const v = (spectrum[bin] + spectrum[bin + 1]) / 510;
        target = Math.min(1, v * 1.3) * (1 - 0.3 * f);
        if (target < 0.05) target = 0; // ignora o chiado de fundo
      } else if (mode === 'connecting') {
        target = 0.14 + 0.1 * Math.sin(now / 150 - k * 0.7);
      }
      const prev = heights[k];
      heights[k] = target > prev ? prev + (target - prev) * 0.55 : prev * 0.86; // sobe rápido, desce devagar
      if (heights[k] > 0.004) moving = true;
    }
    if (!moving && settled) return;
    settled = !moving;

    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    const cx = w / 2;
    const maxH = h * MAX_FRAC;
    for (let k = 0; k < n; k++) {
      const bh = MIN_H + heights[k] * (maxH - MIN_H);
      const y = (h - bh) / 2;
      g.globalAlpha = 0.28 + 0.72 * Math.min(1, heights[k] * 1.6);
      bar(cx - FIRST - k * STEP - BAR_W, y, BAR_W, bh);
      bar(cx + FIRST + k * STEP, y, BAR_W, bh);
    }
    g.globalAlpha = 1;
  }

  return { draw };
}

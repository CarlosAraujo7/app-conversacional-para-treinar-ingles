// Compara a sua frase com a versão corrigida, palavra por palavra, para destacar o que mudou.
// A transcrição da fala não tem pontuação nem maiúsculas confiáveis, então isso não conta como diferença.

const key = (word) => word.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

const split = (text) => String(text).trim().split(/\s+/).filter(Boolean);

/** As duas frases são iguais ignorando maiúsculas e pontuação? */
export function sameText(a, b) {
  const x = split(a).map(key).filter(Boolean);
  const y = split(b).map(key).filter(Boolean);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

/** Devolve { before, after }: listas de { text, changed } cobrindo cada frase inteira. */
export function diffWords(original, better) {
  const a = split(original);
  const b = split(better);
  const ka = a.map(key);
  const kb = b.map(key);

  // Maior subsequência comum: o que está nela ficou igual, o resto mudou.
  const len = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      len[i][j] = ka[i] === kb[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
    }
  }

  const before = a.map((text) => ({ text, changed: true }));
  const after = b.map((text) => ({ text, changed: true }));
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      before[i].changed = false;
      after[j].changed = false;
      i++;
      j++;
    } else if (len[i + 1][j] >= len[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { before, after };
}

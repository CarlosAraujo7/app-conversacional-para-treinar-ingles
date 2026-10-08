// Apoio em português: depois que o tutor termina de falar, uma chamada de texto (modelo
// leve, API REST) devolve tradução, glossário por termo, vocabulário a salvar e sugestões
// de resposta. Fica fora da sessão de voz de propósito: não interfere no áudio.

const REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 20000;

const COACH_SYSTEM = `You are a bilingual (English / Brazilian Portuguese) language coach inside a speaking-practice app. You receive JSON describing ONE spoken line from the tutor plus context, and you return JSON only.

Input fields: tutor_language ("en" or "pt"), learner_level (A2, B1, B2 or C1), tutor_text, learner_last (what the learner said just before; may be empty), recent (a few previous turns), want_suggestions (boolean).

Output fields:
- translation: a natural translation of tutor_text into the OTHER language (en -> Brazilian Portuguese; pt -> English).
- terms: glosses for terms inside tutor_text, in order of appearance, never overlapping. "text" MUST be copied exactly (same spelling and case) from tutor_text. "meaning" is a short gloss (1 to 4 words) in the other language that fits THIS context, not a dictionary list. Treat idioms, phrasal verbs and fixed expressions as ONE term. Coverage by learner_level: A2 = almost every word; B1 = skip only trivial words (a, the, is, to, of, and, I, you); B2 = only words and phrases a B1 learner might not know; C1 = only uncommon words, idioms and technical terms. When tutor_language is "pt", gloss every content word the learner would need in order to answer in English (give the English equivalents).
- vocab: 0 to 2 items for the learner's notebook. ONLY the term the learner asked about ("how do I say ...") or a term the tutor explicitly taught ("we say ...", "the word for that is ...", "in English: ..."). Never add words that merely appear in the sentence. Fields: english, portuguese, example (a short English sentence). Otherwise [].
- suggestions: when want_suggestions is true or tutor_language is "pt": 2 or 3 short English replies the learner could say to the tutor's last question or comment, at learner_level, each with its Portuguese meaning in "pt", varied in length and stance; for optimization topics make them technically sensible. Otherwise [].`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    translation: { type: 'STRING' },
    terms: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, meaning: { type: 'STRING' } }, required: ['text', 'meaning'] },
    },
    vocab: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { english: { type: 'STRING' }, portuguese: { type: 'STRING' }, example: { type: 'STRING' } },
        required: ['english', 'portuguese'],
      },
    },
    suggestions: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, pt: { type: 'STRING' } }, required: ['en', 'pt'] },
    },
  },
  required: ['translation', 'terms', 'vocab', 'suggestions'],
};

export class CoachError extends Error {
  constructor(message, status, fatal = false) {
    super(message);
    this.status = status;
    this.fatal = fatal; // chave inválida etc.: não adianta tentar outro modelo
  }
}

async function readError(res) {
  let message = `HTTP ${res.status}`;
  let status = '';
  try {
    const body = await res.json();
    if (body.error) {
      message = body.error.message || message;
      status = body.error.status || '';
    }
  } catch { /* corpo não é JSON */ }
  const badKey = /API key|API_KEY/i.test(message) || res.status === 401 || res.status === 403;
  return new CoachError(message, res.status, badKey || status === 'RESOURCE_EXHAUSTED');
}

async function post(url, apiKey, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new CoachError(err.name === 'AbortError' ? 'tempo esgotado' : `sem conexão (${err.message})`, 0);
  } finally {
    clearTimeout(timer);
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function sanitize(raw) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    translation: str(raw.translation),
    terms: arr(raw.terms).map((t) => ({ text: str(t && t.text), meaning: str(t && t.meaning) })).filter((t) => t.text && t.meaning),
    vocab: arr(raw.vocab).map((v) => ({ en: str(v && v.english), pt: str(v && v.portuguese), example: str(v && v.example) })).filter((v) => v.en).slice(0, 2),
    suggestions: arr(raw.suggestions).map((s) => ({ en: str(s && s.en), pt: str(s && s.pt) })).filter((s) => s.en).slice(0, 3),
  };
}

function parseJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

/**
 * input: { tutor_language, learner_level, tutor_text, learner_last, recent, want_suggestions }
 * Tenta cada modelo da lista até um responder; devolve { result, model }.
 */
export async function annotate({ apiKey, models, input, restBase = REST_BASE }) {
  let lastErr = new CoachError('nenhum modelo de apoio configurado', 0);
  for (const model of models) {
    const res = await post(`${restBase}/models/${model}:generateContent`, apiKey, {
      systemInstruction: { parts: [{ text: COACH_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 2500 },
    });
    if (!res.ok) {
      lastErr = await readError(res);
      if (lastErr.fatal || lastErr.status >= 500) throw lastErr;
      continue; // 404/400: modelo indisponível, tenta o próximo
    }
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || '').join('');
    try {
      return { result: sanitize(parseJson(text)), model };
    } catch {
      lastErr = new CoachError('resposta do modelo de apoio não era JSON válido', 200);
    }
  }
  throw lastErr;
}

/** Fala uma frase de amostra com a voz escolhida. Devolve { pcm: Uint8Array, rate }. */
export async function previewVoice({ apiKey, models, voice, text, restBase = REST_BASE }) {
  let lastErr = new CoachError('nenhum modelo de voz configurado', 0);
  for (const model of models) {
    const res = await post(`${restBase}/models/${model}:generateContent`, apiKey, {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    if (!res.ok) {
      lastErr = await readError(res);
      if (lastErr.fatal || lastErr.status >= 500) throw lastErr;
      continue;
    }
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const inline = parts.map((p) => p.inlineData).find((d) => d && d.data);
    if (!inline) {
      lastErr = new CoachError('o modelo de voz não devolveu áudio', 200);
      continue;
    }
    const bin = atob(inline.data);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1]) || 24000;
    return { pcm, rate };
  }
  throw lastErr;
}

/** Toca PCM 16-bit mono. Devolve { stop(), done: Promise }. */
export function playPcm(pcm, rate) {
  const ctx = new AudioContext();
  const n = pcm.length >> 1;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, n);
  const buffer = ctx.createBuffer(1, n, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = samples[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const done = new Promise((resolve) => {
    src.onended = () => { ctx.close().catch(() => {}); resolve(); };
  });
  ctx.resume().then(() => src.start());
  return {
    done,
    stop() {
      src.onended = null;
      try { src.stop(); } catch { /* ainda não começou */ }
      ctx.close().catch(() => {});
    },
  };
}

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Encaixa as glosas no texto. Cada termo é procurado como palavra inteira, sem sobrepor outros;
 * glosas que não casam são descartadas. Devolve [{ text, gloss? }] cobrindo o texto todo.
 */
export function segmentize(text, terms) {
  const lower = text.toLowerCase();
  const ranges = [];
  const free = (a, b) => ranges.every((r) => b <= r.start || a >= r.end);

  for (const term of terms) {
    const needle = (term.text || '').trim().toLowerCase();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      if (!isWordChar(text[i - 1]) && !isWordChar(text[end]) && free(i, end)) {
        ranges.push({ start: i, end, gloss: term.meaning });
        break;
      }
      from = i + 1;
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  const segs = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) segs.push({ text: text.slice(pos, r.start) });
    segs.push({ text: text.slice(r.start, r.end), gloss: r.gloss });
    pos = r.end;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}

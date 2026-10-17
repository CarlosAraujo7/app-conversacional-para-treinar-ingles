// Interface: ajustes, controles de conversa, robô e ondas de voz, apoio em português e caderno de vocabulário.

import { LiveClient } from './live.js';
import { Conversation, displayText } from './transcript.js';
import { annotate, previewVoice, playPcm } from './coach.js';
import { createView } from './view.js';
import { createBot } from './bot.js';
import { createWave, spectrumLevel } from './wave.js';
import { createReplayer, pcmToWav } from './audio.js';
import { sameText } from './diff.js';
import { icon, speak, fmtClock } from './ui.js';
import {
  MODELS, COACH_MODELS, TTS_MODELS, VOICES, LEVELS, TOPICS, ACTIVITIES, VIBES, PACES, CORRECTIONS, PATIENCE,
  THEMES, TEXT_SIZES, DEFAULT_SETTINGS, GREETING, restartNudge, buildSystemInstruction, buildMinimalInstruction,
} from './tutor.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'entalk.settings.v3';
const V2_KEY = 'entalk.settings.v2';
const V1_KEY = 'entalk.settings.v1';
const VOCAB_KEY = 'entalk.vocab.v1';

const MAX_REPLAYS = 30; // quantas falas do Sam ficam guardadas na memória para ouvir de novo
const THINKING_MS = 9000; // depois que você fala, o robô "pensa" até o Sam começar a responder

// ---------- armazenamento (pode falhar em janela anônima, então sempre com try/catch) ----------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem persistência */ }
}

function override(name) {
  try { return localStorage.getItem(`entalk.${name}`) || undefined; } catch { return undefined; }
}

// ---------- ajustes ----------

function loadSettings() {
  const current = load(SETTINGS_KEY, null);
  if (current) return { ...DEFAULT_SETTINGS, ...current };
  // A v3 passou a abrir com o Sam falando inglês e a tradução completa: aplica esses dois padrões uma vez.
  const v2 = load(V2_KEY, null);
  if (v2) return { ...DEFAULT_SETTINGS, ...v2, help: DEFAULT_SETTINGS.help, tutorLang: DEFAULT_SETTINGS.tutorLang };
  const old = load(V1_KEY, {});
  const keep = {};
  for (const k of ['apiKey', 'level', 'corrections', 'patience', 'speakerMode']) if (k in old) keep[k] = old[k];
  return { ...DEFAULT_SETTINGS, ...keep };
}

const settings = loadSettings();

function addOptions(select, entries, parent = select) {
  for (const [value, label] of entries) parent.append(new Option(label, value));
}

function addGroup(select, label, entries) {
  const group = document.createElement('optgroup');
  group.label = label;
  addOptions(select, entries, group);
  select.append(group);
}

addOptions($('level'), Object.entries(LEVELS).map(([k, v]) => [k, v.label]));
for (const g of TOPICS) addGroup($('topic'), g.group, g.items.map((i) => [i[0], i[1]]));
addOptions($('activity'), Object.entries(ACTIVITIES).map(([k, v]) => [k, v.label]));
addOptions($('vibe'), Object.entries(VIBES).map(([k, v]) => [k, v.label]));
addOptions($('pace'), Object.entries(PACES).map(([k, v]) => [k, v.label]));
addOptions($('corrections'), Object.entries(CORRECTIONS).map(([k, v]) => [k, v.label]));
addOptions($('patience'), Object.entries(PATIENCE).map(([k, v]) => [k, v.label]));
addGroup($('voice'), 'Recomendadas para conversar', VOICES.recommended.map(([n, s]) => [n, `${n} · ${s}`]));
addGroup($('voice'), 'Outras vozes', VOICES.others.map(([n, s]) => [n, `${n} · ${s}`]));
addOptions($('modelList'), MODELS.map((m) => [m, m]));
addOptions($('coachList'), COACH_MODELS.map((m) => [m, m]));
addOptions($('theme'), Object.entries(THEMES).map(([k, v]) => [k, v.label]));
addOptions($('textSize'), Object.entries(TEXT_SIZES).map(([k, v]) => [k, v.label]));

const SELECTS = ['level', 'topic', 'activity', 'vibe', 'pace', 'corrections', 'patience', 'voice', 'theme', 'textSize'];
const TEXTS = ['apiKey', 'model', 'coachModel'];
const CHECKS = ['speakerMode', 'longSession', 'affective', 'feedback'];
// Mudanças nestes campos só entram em vigor numa sessão nova.
const SESSION_FIELDS = new Set(['level', 'topic', 'activity', 'vibe', 'pace', 'corrections', 'patience', 'voice', 'model', 'longSession', 'affective']);

for (const id of SELECTS) {
  $(id).value = settings[id];
  settings[id] = $(id).value; // valor salvo que não existe mais volta para o primeiro item
}
for (const id of TEXTS) $(id).value = settings[id];
for (const id of CHECKS) $(id).checked = settings[id];

function persist() {
  save(SETTINGS_KEY, settings);
}

function readField(id) {
  if (SELECTS.includes(id) || TEXTS.includes(id)) settings[id] = $(id).value.trim();
  else settings[id] = $(id).checked;
  persist();
}

// Tema e tamanho do texto valem na hora (o index.html já aplica os salvos antes de desenhar a página).
function applyAppearance() {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  if (settings.textSize === 'l' || settings.textSize === 'xl') root.dataset.size = settings.textSize;
  else delete root.dataset.size;
}

applyAppearance();

for (const id of [...SELECTS, ...TEXTS, ...CHECKS]) {
  $(id).addEventListener('change', () => {
    readField(id);
    if (id === 'theme' || id === 'textSize') applyAppearance();
    if (id === 'speakerMode') client.setSpeakerMode(settings.speakerMode);
    if (client.active && SESSION_FIELDS.has(id)) {
      $('applyNow').hidden = false;
      $('applyNote').textContent = 'Esta mudança só vale depois de reiniciar a conexão.';
    }
  });
}

$('keyToggle').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('keyToggle').textContent = show ? 'Ocultar' : 'Mostrar';
});

// A tela inicial pede a chave só enquanto ela não existe; depois mostra "toque no robô".
function syncKeyUI() {
  const has = !!settings.apiKey;
  if ($('apiKey').value !== settings.apiKey) $('apiKey').value = settings.apiKey;
  if ($('keyStep')) $('keyStep').hidden = has;
  if ($('readyStep')) $('readyStep').hidden = !has;
  if ($('quickKey') && has) $('quickKey').value = '';
}

$('keyStep').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const value = $('quickKey').value.trim();
  if (!value) return;
  settings.apiKey = value;
  persist();
  syncKeyUI();
  heroBot.react('happy', 2400);
});

$('keyClear').addEventListener('click', () => {
  if (!settings.apiKey || !confirm('Apagar a chave da API deste navegador?')) return;
  settings.apiKey = '';
  persist();
  syncKeyUI();
});

$('apiKey').addEventListener('change', syncKeyUI);
syncKeyUI();

// ---------- menu lateral (guia, ajustes, caderno) ----------

const drawer = $('side');
let currentTab = 'guide';

function selectTab(name) {
  currentTab = name;
  for (const btn of document.querySelectorAll('[data-tab]')) {
    const on = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
}

function drawerOpen() {
  return drawer.classList.contains('open');
}

function openDrawer(tab) {
  selectTab(tab || currentTab);
  drawer.inert = false;
  drawer.classList.add('open');
  $('scrim').hidden = false;
  $('menuBtn').setAttribute('aria-expanded', 'true');
  $(`tab-${currentTab}`).focus();
}

function closeDrawer() {
  if (!drawerOpen()) return;
  drawer.classList.remove('open');
  drawer.inert = true;
  $('scrim').hidden = true;
  $('menuBtn').setAttribute('aria-expanded', 'false');
  $('menuBtn').focus();
}

$('menuBtn').addEventListener('click', () => (drawerOpen() ? closeDrawer() : openDrawer()));
$('drawerClose').addEventListener('click', closeDrawer);
$('scrim').addEventListener('click', closeDrawer);
$('openGuide').addEventListener('click', () => openDrawer('guide'));

for (const btn of document.querySelectorAll('[data-tab]')) {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
}

// Setas esquerda/direita trocam de aba, como em qualquer lista de abas.
$('side').querySelector('[role=tablist]').addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
  const names = [...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab);
  const next = names[(names.indexOf(currentTab) + (ev.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length];
  selectTab(next);
  $(`tab-${next}`).focus();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeDrawer();
});

// ---------- log e avisos ----------

function log(msg) {
  const pre = $('log');
  const t = new Date().toLocaleTimeString('pt-BR');
  pre.textContent += `[${t}] ${msg}\n`;
  const lines = pre.textContent.split('\n');
  if (lines.length > 300) pre.textContent = lines.slice(-300).join('\n');
  pre.scrollTop = pre.scrollHeight;
}

$('logCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('log').textContent);
    $('logCopy').textContent = 'Copiado';
  } catch {
    $('logCopy').textContent = 'Não consegui copiar';
  }
  setTimeout(() => { $('logCopy').textContent = 'Copiar registro'; }, 1800);
});

function showBanner(msg, action) {
  $('bannerText').textContent = msg;
  const btn = $('bannerAction');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { action.onClick(); $('banner').hidden = true; };
  } else {
    btn.onclick = null;
  }
  $('banner').hidden = false;
}

$('bannerClose').addEventListener('click', () => { $('banner').hidden = true; });

// ---------- vocabulário ----------

let vocab = load(VOCAB_KEY, []);

function renderVocab() {
  const list = $('vocabList');
  list.replaceChildren();
  for (const item of vocab) {
    const li = document.createElement('li');
    const en = document.createElement('span');
    en.className = 'en';
    en.textContent = item.en;
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.title = 'Ouvir';
    listen.setAttribute('aria-label', `Ouvir ${item.en}`);
    listen.append(icon('volume', 16));
    listen.addEventListener('click', () => speak(item.en));
    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.setAttribute('aria-label', `Remover ${item.en}`);
    del.textContent = '×';
    del.addEventListener('click', () => {
      vocab = vocab.filter((v) => v !== item);
      save(VOCAB_KEY, vocab);
      renderVocab();
    });
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.append(listen, del);
    li.append(en, tools);
    if (item.pt) {
      const pt = document.createElement('span');
      pt.className = 'pt';
      pt.textContent = item.pt;
      li.append(pt);
    }
    if (item.example) {
      const ex = document.createElement('span');
      ex.className = 'ex';
      ex.textContent = item.example;
      li.append(ex);
    }
    list.append(li);
  }
  $('vocabCount').textContent = String(vocab.length);
  $('vocabEmpty').hidden = vocab.length > 0;
}

function addVocab(entry) {
  const key = entry.en.toLowerCase();
  vocab = [{ ...entry, ts: Date.now() }, ...vocab.filter((v) => v.en.toLowerCase() !== key)];
  save(VOCAB_KEY, vocab);
  renderVocab();
}

$('vocabExport').addEventListener('click', () => {
  if (!vocab.length) return;
  const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
  const tsv = vocab.map((v) => `${clean(v.en)}\t${clean(v.pt)}\t${clean(v.example)}`).join('\n');
  const url = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'vocabulario.tsv' });
  a.click();
  URL.revokeObjectURL(url);
});

$('vocabClear').addEventListener('click', () => {
  if (!vocab.length || !confirm('Apagar todo o caderno de vocabulário?')) return;
  vocab = [];
  save(VOCAB_KEY, vocab);
  renderVocab();
});

renderVocab();

// ---------- apoio em português (tradução, glossário, vocabulário, sugestões) ----------

let coachWarned = false;

async function runAnnotate(turn, { suggest = false } = {}) {
  const text = displayText(turn);
  if (!text || turn.dup || !settings.apiKey) return;
  const version = (turn.annVersion = (turn.annVersion || 0) + 1);
  view.setPending(turn, true);

  const pt = settings.tutorLang === 'pt';
  const said = conv.learnerTurnBefore(turn); // a sua fala a que este turno do Sam respondeu
  const input = {
    tutor_language: pt ? 'pt' : 'en',
    learner_level: settings.level,
    tutor_text: text,
    learner_last: said ? displayText(said) : '',
    recent: conv.recent(6, 160, sessionStart),
    want_suggestions: suggest || pt,
    want_feedback: settings.feedback && !!said && !said.fb,
  };

  try {
    const models = [...new Set([settings.coachModel, ...COACH_MODELS].filter(Boolean))];
    const { result, model } = await annotate({ apiKey: settings.apiKey, models, input, restBase: override('restBase') });
    if (model !== settings.coachModel) {
      log(`Modelo de apoio em uso: ${model}`);
      settings.coachModel = model;
      $('coachModel').value = model;
      persist();
    }
    if (version !== turn.annVersion) return;
    turn.ann = { ...result, tutorLang: pt ? 'pt' : 'en' };
    view.setAnnotation(turn);
    giveFeedback(said, result.feedback);
    turn.saved = turn.saved || new Set();
    for (const v of result.vocab) {
      addVocab(v);
      if (!turn.saved.has(v.en.toLowerCase())) {
        turn.saved.add(v.en.toLowerCase());
        view.addChip(turn, `Salvo no caderno: ${v.en}`);
      }
    }
  } catch (err) {
    log(`Apoio em português falhou: ${err.message}`);
    if (!coachWarned) {
      coachWarned = true;
      showBanner(`O apoio em português não funcionou (${err.message}). A conversa continua normal. Se persistir, troque o modelo em Ajustes > Avançado > Modelo de apoio.`);
    }
  } finally {
    if (version === turn.annVersion) view.setPending(turn, false);
  }
}

// Correção na sua fala: uma vez só por fala, e uma "versão melhor" igual ao que você disse conta como natural.
function giveFeedback(said, fb) {
  if (!settings.feedback || !said || said.fb || fb.verdict === 'skip') return;
  said.fb = fb.verdict === 'improve' && sameText(displayText(said), fb.better) ? { verdict: 'good', better: '', tip: '' } : fb;
  view.setFeedback(said);
}

function scheduleAnnotate(turn) {
  clearTimeout(turn.annTimer);
  if (settings.help === 'off') return;
  turn.annTimer = setTimeout(() => runAnnotate(turn), 700);
}

function lastTutorTurn() {
  return [...conv.turns].reverse().find((t) => t.role === 'tutor' && !t.dup && t.text.trim());
}

$('suggestBtn').addEventListener('click', () => {
  const turn = lastTutorTurn();
  if (!turn) {
    showBanner('Ainda não há nada do Sam para sugerir uma resposta.');
    return;
  }
  runAnnotate(turn, { suggest: true });
});

// ---------- conversa ----------

// O Sam deve terminar cada fala com uma pergunta. Quando não termina, anota no registro (só informativo).
function noteMissingQuestion(turn) {
  if (turn.cut) return;
  const text = displayText(turn);
  if (text && !/[?？]["'”’)\]]*\s*$/.test(text)) log(`Fala do Sam sem pergunta no final: "…${text.slice(-70)}"`);
}

// ---------- robô, ondas de voz e fala guardada ----------

const heroBot = createBot($('heroBot')); // o da tela inicial
const dockBot = createBot($('dockBot')); // o botão de falar
const wave = createWave($('wave'));
let lastUserAt = 0; // quando você falou ou escreveu por último: o robô "pensa" até o Sam responder

let playing = null; // { turn, rate } enquanto uma fala guardada toca
const replayer = createReplayer({ onEnd: () => endReplay() });

function endReplay() {
  playing = null;
  client.setHold(false);
  view.setPlaying(null);
}

function stopReplay() {
  if (!playing) return;
  replayer.stop();
  endReplay();
}

function replay(turn, rate) {
  if (!turn.audio) return;
  if (playing && playing.turn === turn && playing.rate === rate) {
    stopReplay();
    return;
  }
  window.speechSynthesis?.cancel();
  playing = { turn, rate };
  client.setHold(true); // senão o microfone captaria a fala tocada e o Sam responderia a ela
  view.setPlaying(turn, rate);
  replayer.play(pcmToWav(turn.audio), rate).catch((err) => {
    log(`Não consegui tocar a fala de novo: ${err.message || err}`);
    endReplay();
  });
}

// Guarda o áudio da fala que acabou de terminar (só as últimas, para não encher a memória).
function keepTurnAudio(chunks) {
  const turn = conv.openTutor;
  if (!turn || turn.dup) return;
  turn.audio = chunks;
  view.setReplay(turn);
  for (const old of conv.turns.filter((t) => t.audio).slice(0, -MAX_REPLAYS)) {
    old.audio = null;
    view.setReplay(old);
  }
}

const view = createView($('transcript'), {
  onSaveEntry: addVocab,
  onReplay: replay,
  onReact: (mood) => dockBot.react(mood),
});
let sessionStart = 0;
let echoWarned = false;

const conv = new Conversation({
  onAdd: (turn) => view.add(turn),
  onUpdate: (turn) => {
    if (turn.open) clearTimeout(turn.annTimer); // chegou texto atrasado: espera fechar de novo
    view.update(turn);
  },
  onClose: (turn) => {
    noteMissingQuestion(turn);
    scheduleAnnotate(turn);
  },
  onEcho: (turn) => {
    log(`Possível eco do alto-falante: "${displayText(turn).slice(0, 80)}"`);
    if (echoWarned || settings.speakerMode) return;
    echoWarned = true;
    showBanner('Parece que o microfone está captando a voz do Sam. Use fones ou ative o modo sem fones.', {
      label: 'Ativar modo sem fones',
      onClick: () => {
        $('speakerMode').checked = true;
        readField('speakerMode');
        client.setSpeakerMode(true);
      },
    });
  },
  onRepeat: (turn) => log(`Resposta repetida do Sam ignorada: "${displayText(turn).slice(0, 80)}"`),
});

// Fecha turnos reabertos por trechos atrasados quando param de chegar novos (e dispara o apoio em português).
setInterval(() => conv.tick(), 500);

const client = new LiveClient({
  onStatus: (status) => updateStatus(status),
  onUserText: (chunk) => {
    lastUserAt = performance.now();
    conv.userText(chunk, { speaking: client.isSpeaking(1.5) });
  },
  onTutorText: (chunk) => {
    stopReplay(); // o Sam voltou a falar de verdade: a conversa ao vivo tem prioridade sobre a fala guardada
    if (conv.tutorText(chunk).repeat) client.suppressTurnAudio();
  },
  onTurnAudio: keepTurnAudio,
  onTurnComplete: () => conv.turnComplete(),
  onInterrupted: () => conv.interrupted(),
  onNotice: (msg) => { showBanner(msg); log(msg); },
  onDegrade: (patch, label) => {
    if (patch.systemInstruction) {
      // O que resolveu foi reduzir o prompt, então os passos anteriores não tinham culpa: não salva nada.
      showBanner('O servidor do Google recusou o prompt completo do Sam; conectei com instruções reduzidas (ele fica mais simples, sem os assuntos e atividades). Abra o Registro técnico em Ajustes, copie e me envie para eu investigar.');
      log(`Recuperação: ${label} (nada salvo nos ajustes)`);
      return;
    }
    // O servidor só aceitou depois de simplificar: guarda isso para as próximas conversas não falharem de novo.
    const changed = [];
    if (patch.affective === false && settings.affective) { settings.affective = false; $('affective').checked = false; changed.push('voz expressiva desligada'); }
    if (patch.voice && settings.voice !== patch.voice) { settings.voice = patch.voice; $('voice').value = patch.voice; changed.push(`voz trocada para ${patch.voice}`); }
    if (patch.longSession === false && settings.longSession) { settings.longSession = false; $('longSession').checked = false; changed.push('sessões longas desligadas'); }
    persist();
    const saved = changed.length ? ` Já deixei isso salvo nos ajustes: ${changed.join(', ')}.` : '';
    showBanner(`O servidor do Google derrubou a conexão com a configuração completa; conectei ${label}.${saved}`);
    log(`Recuperação: ${label}${changed.length ? ` (salvo: ${changed.join(', ')})` : ''}`);
  },
  onError: (msg) => {
    showBanner(`${msg}. O registro técnico em Ajustes tem mais detalhes.`);
    log(`ERRO: ${msg}`);
    dockBot.react('sad', 3000);
  },
  onLog: log,
});

function buildCfg(nudge, carryContext) {
  return {
    apiKey: settings.apiKey,
    model: settings.model,
    voice: settings.voice,
    systemInstruction: buildSystemInstruction({
      ...settings,
      notebook: vocab.map((v) => v.en),
      context: carryContext ? conv.recent(16, 300, sessionStart) : [],
    }),
    fallbackInstruction: buildMinimalInstruction(settings),
    vad: PATIENCE[settings.patience].vad,
    manual: settings.inputMode === 'manual',
    greeting: nudge === undefined ? GREETING[settings.tutorLang] : nudge,
    longSession: settings.longSession,
    affective: settings.affective,
    speakerMode: settings.speakerMode,
    wsBase: override('wsBase'),
  };
}

async function startSession() {
  for (const id of [...SELECTS, ...TEXTS]) readField(id);
  if (!settings.apiKey) {
    showBanner('Cole sua chave do Gemini para começar.');
    if ($('keyStep') && !$('keyStep').hidden) {
      $('quickKey').focus();
    } else {
      openDrawer('settings');
      $('apiKey').focus();
    }
    return;
  }
  $('banner').hidden = true;
  $('applyNow').hidden = true;
  $('applyNote').textContent = 'Mudanças valem na próxima conversa.';
  coachWarned = false;
  echoWarned = false;
  if (conv.turns.length) view.divider('Nova conversa');
  sessionStart = conv.beginSession();
  lastUserAt = 0;
  stopReplay();

  try {
    await client.start(buildCfg(undefined, false));
  } catch (err) {
    showBanner(`Não consegui iniciar o áudio: ${err.message || err}`);
    log(`ERRO: ${err.stack || err}`);
  }
}

// Reinicia a conexão com outra configuração (estilo, idioma...) levando a conversa junto no prompt.
function restartSession(reason) {
  if (!client.active) return;
  const labels = {
    mode: settings.inputMode === 'manual' ? 'Estilo manual: você clica para falar e clica para enviar' : 'Estilo automático: o Sam percebe quando você para',
    lang: settings.tutorLang === 'pt' ? 'Sam agora fala português; você responde em inglês' : 'Sam agora fala inglês',
    settings: 'Ajustes aplicados',
  };
  conv.turnComplete(); // fecha o turno do tutor que estava aberto
  conv.markUserActivity(); // a resposta ao reinício não é uma repetição
  view.divider(labels[reason]);
  $('applyNow').hidden = true;
  $('applyNote').textContent = 'Mudanças valem na próxima conversa.';
  log(`Reiniciando a conexão: ${reason}`);
  client.reconnect(buildCfg(restartNudge(settings, reason) ?? null, true));
}

$('applyNow').addEventListener('click', () => restartSession('settings'));

// ---------- controles da conversa ----------

function applyDerivedUI() {
  document.body.classList.remove('help-off', 'help-tap', 'help-terms', 'help-full');
  document.body.classList.add(`help-${settings.help}`);
  $('patienceField').classList.toggle('dim', settings.inputMode === 'manual');
  for (const btn of document.querySelectorAll('[data-seg]')) {
    btn.setAttribute('aria-pressed', String(settings[btn.dataset.seg] === btn.dataset.value));
  }
  updateControls();
}

for (const btn of document.querySelectorAll('[data-seg]')) {
  btn.addEventListener('click', () => {
    const key = btn.dataset.seg;
    const value = btn.dataset.value;
    if (settings[key] === value) return;
    settings[key] = value;
    persist();
    applyDerivedUI();
    if (key === 'help' && value !== 'off') {
      const turn = lastTutorTurn();
      if (turn && !turn.ann && !turn.open) scheduleAnnotate(turn);
    }
    if (key === 'inputMode') restartSession('mode');
    if (key === 'tutorLang') restartSession('lang');
  });
}

let status = 'idle';
let muted = false;

function updateStatus(next) {
  status = next;
  const labels = { idle: 'Desconectado', connecting: 'Conectando…', live: 'Ao vivo' };
  $('status').textContent = labels[next];
  $('status').dataset.state = next;
  document.body.dataset.status = next;
  if (next === 'idle') {
    muted = false;
    $('muteBtn').setAttribute('aria-pressed', 'false');
    $('muteBtn').textContent = 'Mutar microfone';
  }
  if (next === 'live') dockBot.react('happy', 1600); // conectou: o robô cumprimenta
  updateControls();
  paintOrb(client.getLevels());
}

function updateControls() {
  const live = status === 'live';
  const manual = settings.inputMode === 'manual';
  $('textInput').disabled = !live;
  $('sendBtn').disabled = !live;
  $('muteBtn').disabled = !live || !client.hasMic || manual;
  $('suggestBtn').disabled = !live;
  $('endBtn').hidden = status === 'idle';
  $('orb').setAttribute('aria-label', status === 'idle' ? 'Começar conversa' : manual ? 'Falar ou enviar' : 'Encerrar conversa');
}

// Cor das ondas = a cor do estado (--orb no palco), relida de vez em quando porque o tema pode mudar.
let waveTone = { state: '', at: 0, value: '#1f7a63' };
function toneFor(state) {
  const now = performance.now();
  if (waveTone.state !== state || now - waveTone.at > 1000) {
    waveTone = { state, at: now, value: getComputedStyle($('orbStage')).getPropertyValue('--orb').trim() || waveTone.value };
  }
  return waveTone.value;
}

// Decide o que o robô, o botão e as ondas mostram, a cada quadro.
function paintOrb(levels) {
  const manual = settings.inputMode === 'manual';
  let state = 'idle';
  let badge = 'mic';
  let hint = 'Toque para começar';
  let level = 0; // 0 a 1
  let source = null; // de onde vêm as ondas: 'out' (voz do Sam), 'mic' (você) ou 'replay' (fala tocada de novo)

  if (status === 'connecting') {
    state = 'connecting';
    hint = 'Conectando…';
  } else if (status === 'live') {
    badge = manual ? 'mic' : 'stop';
    if (manual && levels.talking) {
      state = 'recording';
      badge = 'stop';
      source = 'mic';
      level = levels.mic;
      hint = `Gravando ${fmtClock(levels.talkMs)}. Toque de novo para enviar.`;
    } else if (levels.speaking) {
      state = 'speaking';
      source = 'out';
      level = levels.out;
      hint = manual ? 'Sam está falando. Toque para interromper e responder.' : 'Sam está falando. Pode interromper.';
    } else if (lastUserAt && performance.now() - lastUserAt < THINKING_MS && levels.mic < 0.012) {
      state = 'thinking'; // você acabou de falar e o Sam ainda não respondeu
      hint = 'Sam está pensando…';
    } else if (!client.hasMic) {
      state = 'listening';
      hint = 'Sem microfone: use o campo de texto';
    } else if (manual) {
      state = 'ready';
      hint = 'Toque para falar (ou aperte Espaço)';
    } else if (muted) {
      state = 'muted';
      hint = 'Microfone mudo';
    } else {
      state = 'listening';
      source = 'mic';
      level = levels.mic;
      hint = 'Ouvindo. Fale à vontade.';
    }
  }

  // Uma fala guardada do Sam tocando de novo também dá voz ao robô.
  if (playing && state !== 'speaking' && state !== 'recording') {
    state = 'speaking';
    source = 'replay';
    hint = 'Tocando a fala do Sam de novo. Toque no ícone para parar.';
  }

  const spectrum = source === 'replay' ? replayer.getSpectrum() : source ? client.getSpectrum(source) : null;
  const stage = $('orbStage');
  if (stage.dataset.state !== state) stage.dataset.state = state;
  $('orb').dataset.icon = badge;
  dockBot.set(state, source === 'replay' ? spectrumLevel(spectrum) : Math.min(1, level * 5));
  wave.draw({ mode: state === 'connecting' ? 'connecting' : spectrum ? 'live' : 'idle', spectrum, color: toneFor(state) });
  if ($('orbHint').textContent !== hint) $('orbHint').textContent = hint;
}

// Anima o robô e as ondas com o volume do microfone (você) ou da voz do tutor, suavizado.
let smooth = 0;
function tick() {
  const raw = client.getLevels();
  smooth += ((raw.speaking ? raw.out : raw.mic) - smooth) * 0.35;
  paintOrb({ ...raw, mic: smooth, out: smooth });
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function toggleTalk() {
  if (client.talking) {
    client.endTalk();
    lastUserAt = performance.now();
  } else if (!client.hasMic) {
    showBanner('Sem microfone: libere o acesso no navegador ou use o campo de texto.');
    return;
  } else if (client.beginTalk()) {
    conv.markUserActivity();
  }
  paintOrb(client.getLevels());
}

$('orb').addEventListener('click', () => {
  if (!client.active) startSession();
  else if (settings.inputMode === 'manual') toggleTalk();
  else client.stop();
});

$('endBtn').addEventListener('click', () => client.stop());

// Espaço liga/desliga a gravação no estilo manual (nos botões, o próprio navegador já trata).
document.addEventListener('keydown', (ev) => {
  if (ev.code !== 'Space' || ev.repeat || settings.inputMode !== 'manual' || status !== 'live' || drawerOpen()) return;
  const tag = ev.target && ev.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY'].includes(tag)) return;
  ev.preventDefault();
  toggleTalk();
});

$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  client.setMuted(muted);
  $('muteBtn').setAttribute('aria-pressed', String(muted));
  $('muteBtn').textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
});

$('hideBtn').addEventListener('click', () => {
  const on = document.body.classList.toggle('hide-tutor');
  $('hideBtn').setAttribute('aria-pressed', String(on));
});

$('textForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = $('textInput').value.trim();
  if (!text || status !== 'live') return;
  $('textInput').value = '';
  lastUserAt = performance.now();
  conv.addTyped(text);
  client.sendText(text);
});

// ---------- amostra de voz ----------

let preview = null;

function resetPreviewButton() {
  $('voicePreview').disabled = false;
  $('voicePreview').textContent = 'Ouvir';
}

$('voicePreview').addEventListener('click', async () => {
  if (preview) {
    preview.stop();
    preview = null;
    resetPreviewButton();
    return;
  }
  readField('apiKey');
  if (!settings.apiKey) {
    showBanner('Cole sua chave da API do Gemini para ouvir as vozes.');
    return;
  }
  $('voicePreview').disabled = true;
  $('voicePreview').textContent = '…';
  const line = settings.tutorLang === 'pt'
    ? 'Oi! Eu sou o Sam. Bora conversar um pouco em inglês?'
    : "Hi! I'm Sam. Ready to have some fun with English? Tell me, what's your favorite food?";
  try {
    const { pcm, rate } = await previewVoice({
      apiKey: settings.apiKey,
      models: TTS_MODELS,
      voice: settings.voice,
      text: `Say in a warm, upbeat, friendly voice: ${line}`,
      restBase: override('restBase'),
    });
    const player = playPcm(pcm, rate);
    preview = player;
    $('voicePreview').disabled = false;
    $('voicePreview').textContent = 'Parar';
    await player.done;
  } catch (err) {
    log(`Amostra de voz falhou: ${err.message}`);
    showBanner(`Não consegui tocar a amostra da voz (${err.message}). A voz continua valendo na conversa.`);
  } finally {
    preview = null;
    resetPreviewButton();
  }
});

applyDerivedUI();
heroBot.react('happy', 2000); // cumprimenta quem acabou de abrir o app

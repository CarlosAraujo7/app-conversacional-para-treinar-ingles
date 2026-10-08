// Camada de rede + áudio: conversa com a Live API do Gemini por WebSocket.
//   microfone -> PCM 16 kHz mono -> Gemini
//   Gemini -> PCM 24 kHz mono -> alto-falante (+ transcrição dos dois lados)
//
// Dois estilos de entrada:
//   automático: o Gemini detecta quando você começa/termina de falar (e você pode interrompê-lo);
//   manual: a detecção automática fica desligada; você marca o início e o fim da fala
//           (activityStart / activityEnd) e pode demorar o quanto quiser entre eles.

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const IN_RATE = 16000;
const OUT_RATE = 24000;
const CHUNK_SAMPLES = 512; // ~32 ms de áudio por pacote enviado
const MAX_RETRIES = 3;
const ECHO_TAIL_S = 0.35; // no "modo alto-falante", folga depois que o tutor termina de falar

// Roda na thread de áudio: reduz a taxa do microfone para 16 kHz (média por janela) e
// entrega blocos Int16.
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${IN_RATE};
    this.phase = 0;
    this.sum = 0;
    this.n = 0;
    this.out = new Int16Array(${CHUNK_SAMPLES});
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i];
      this.n++;
      this.phase++;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.n));
        this.sum = 0;
        this.n = 0;
        this.out[this.len++] = v < 0 ? v * 32768 : v * 32767;
        if (this.len === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(${CHUNK_SAMPLES});
          this.len = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
`;

export { CAPTURE_WORKLET };

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rms(analyser, buf) {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

const KNOWN_KEYS = new Set(['setupComplete', 'serverContent', 'sessionResumptionUpdate', 'goAway', 'usageMetadata']);
const KNOWN_CONTENT_KEYS = new Set(['modelTurn', 'inputTranscription', 'outputTranscription', 'turnComplete', 'interrupted', 'generationComplete']);

export class LiveClient {
  /**
   * handlers: onStatus(status), onUserText(chunk), onTutorText(chunk), onTurnComplete(),
   *           onInterrupted(), onNotice(msg), onError(msg, code), onLog(msg)
   * status: 'idle' | 'connecting' | 'live'
   */
  constructor(handlers) {
    this.h = handlers;
    this.status = 'idle';
    this.ws = null;
    this.next = null; // socket de substituição durante renovação de sessão
    this.stopped = true;
    this.muted = false;
    this.talking = false;
    this.talkStart = 0;
    this.suppress = false;
    this.stat = { tx: 0, audio: 0 };
    this.seenKeys = new Set();
  }

  get active() {
    return this.status !== 'idle';
  }

  async start(cfg) {
    if (this.active) return;
    this.cfg = cfg;
    this.stopped = false;
    this.muted = false;
    this.hasMic = false;
    this.resetSession();
    this.setStatus('connecting');
    try {
      await this.initAudio();
    } catch (err) {
      this.teardown();
      throw err;
    }
    this.open(null, false);
  }

  resetSession() {
    this.retries = 0;
    this.resumeHandle = null;
    this.greeted = false;
    this.ladder = null; // escada de recuo (ver onClose)
    this.ladderIdx = 0;
    this.baseCfg = null;
    this.attempts = [];
    this.talking = false;
    this.suppress = false;
    this.stat = { tx: 0, audio: 0 };
  }

  /**
   * Quando o servidor derruba a conexão antes de ela abrir (erro interno ou configuração recusada),
   * o app tenta de novo, tirando recursos opcionais aos poucos até a configuração mais simples.
   * Cada passo é cumulativo; o primeiro só repete a mesma configuração (pode ter sido falha passageira).
   */
  buildLadder(cfg) {
    const steps = [{ label: 'a mesma configuração de novo', patch: {} }];
    let acc = {};
    const add = (label, patch, applies) => {
      if (!applies) return;
      acc = { ...acc, ...patch };
      steps.push({ label, patch: { ...acc } });
    };
    add('sem voz expressiva', { affective: false }, cfg.affective);
    add('com a voz Puck', { voice: 'Puck' }, cfg.voice !== 'Puck');
    add('sem sessões longas', { longSession: false }, cfg.longSession);
    add('com a detecção de fala padrão', { vad: {} }, !cfg.manual && cfg.vad && Object.keys(cfg.vad).length > 0);
    add('com instruções reduzidas para o tutor', { systemInstruction: cfg.fallbackInstruction }, !!cfg.fallbackInstruction);
    return steps;
  }

  /** Abre uma sessão nova com outra configuração (estilo, idioma...), mantendo o microfone ligado. */
  reconnect(cfg) {
    if (!this.active) return;
    this.cfg = cfg;
    this.resetSession();
    for (const ws of [this.ws, this.next]) {
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        try { ws.close(1000); } catch { /* já fechado */ }
      }
    }
    this.ws = null;
    this.next = null;
    this.flushAudio();
    this.setStatus('connecting');
    this.open(null, false);
  }

  stop() {
    this.teardown();
  }

  sendText(text) {
    this.sendRaw({ realtimeInput: { text } });
  }

  setMuted(muted) {
    this.muted = muted;
    const track = this.stream && this.stream.getAudioTracks()[0];
    if (track) track.enabled = !muted;
    if (muted && !this.cfg.manual) this.sendRaw({ realtimeInput: { audioStreamEnd: true } });
  }

  setSpeakerMode(on) {
    if (this.cfg) this.cfg.speakerMode = on;
  }

  /** Estilo manual: começa a enviar sua fala. Falar por cima do tutor o interrompe. */
  beginTalk() {
    if (!this.cfg || !this.cfg.manual || !this.ws || !this.ws.ready || this.talking) return false;
    this.flushAudio();
    this.suppress = false;
    this.talking = true;
    this.talkStart = performance.now();
    this.sendRaw({ realtimeInput: { activityStart: {} } });
    return true;
  }

  /** Estilo manual: fim da sua fala; o tutor responde. */
  endTalk() {
    if (!this.talking) return false;
    this.talking = false;
    this.sendRaw({ realtimeInput: { activityEnd: {} } });
    return true;
  }

  /** Corta o áudio do turno atual do tutor (usado quando o texto mostra que é uma resposta repetida). */
  suppressTurnAudio() {
    if (this.suppress) return;
    this.suppress = true;
    this.flushAudio();
    this.log('Resposta repetida detectada: áudio desse turno cortado');
  }

  getLevels() {
    if (!this.ctx) return { mic: 0, out: 0, speaking: false, talking: false, talkMs: 0 };
    return {
      mic: this.muted ? 0 : rms(this.micAnalyser, this.levelBuf),
      out: rms(this.outAnalyser, this.levelBuf),
      speaking: this.isSpeaking(),
      talking: this.talking,
      talkMs: this.talking ? performance.now() - this.talkStart : 0,
    };
  }

  // ---------- áudio ----------

  async initAudio() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();

    this.levelBuf = new Float32Array(1024);
    this.outGain = this.ctx.createGain();
    this.outAnalyser = this.ctx.createAnalyser();
    this.outAnalyser.fftSize = 1024;
    this.outGain.connect(this.outAnalyser);
    this.outAnalyser.connect(this.ctx.destination);
    this.sources = new Set();
    this.nextTime = 0;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      this.h.onNotice?.(`Microfone indisponível (${err.name || err}). Você ainda pode conversar por texto.`);
      return;
    }

    this.workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(this.workletUrl);

    this.micSource = this.ctx.createMediaStreamSource(this.stream);
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    this.micSource.connect(this.micAnalyser);

    this.micNode = new AudioWorkletNode(this.ctx, 'capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    this.micNode.port.onmessage = (ev) => this.onMicChunk(ev.data);
    this.micSource.connect(this.micNode);
    // O nó precisa estar ligado ao destino para ser processado; ganho 0 evita ouvir o microfone.
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.micNode.connect(this.silent);
    this.silent.connect(this.ctx.destination);
    this.hasMic = true;
  }

  onMicChunk(buffer) {
    if (!this.canSendMic()) return;
    this.sendRaw({
      realtimeInput: { audio: { data: toBase64(new Uint8Array(buffer)), mimeType: `audio/pcm;rate=${IN_RATE}` } },
    });
  }

  canSendMic() {
    if (!this.ws || !this.ws.ready) return false;
    if (this.cfg.manual) return this.talking; // só envia enquanto você estiver "gravando"
    if (this.muted) return false;
    // Com alto-falante (sem fones), o microfone captura a voz do tutor. Nesse modo, não
    // enviamos áudio enquanto ele fala: evita o eco, mas também a interrupção por voz.
    if (this.cfg.speakerMode && this.isSpeaking(ECHO_TAIL_S)) return false;
    return true;
  }

  isSpeaking(tail = 0) {
    // nextTime === 0 significa "nada agendado" (início da sessão ou depois de uma interrupção)
    return !!this.ctx && this.nextTime > 0 && this.nextTime + tail > this.ctx.currentTime;
  }

  enqueueAudio(b64) {
    if (!this.ctx || this.suppress) return;
    const bytes = fromBase64(b64);
    const n = bytes.length >> 1;
    if (!n) return;
    const pcm = new Int16Array(bytes.buffer, 0, n);
    const buffer = this.ctx.createBuffer(1, n, OUT_RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = pcm[i] / 32768;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outGain);
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.06; // pequena folga ao iniciar uma fala
    src.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  flushAudio() {
    if (!this.sources) return;
    for (const src of this.sources) {
      src.onended = null;
      try { src.stop(); } catch { /* já terminou */ }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  // ---------- conexão ----------

  buildSetup(resumeHandle) {
    const c = this.cfg;
    const generationConfig = {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
    };
    if (c.affective) generationConfig.enableAffectiveDialog = true;

    const setup = {
      model: `models/${c.model}`,
      generationConfig,
      systemInstruction: { parts: [{ text: c.systemInstruction }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: c.manual ? { disabled: true } : { disabled: false, ...c.vad },
      },
    };
    if (c.longSession) {
      // Sessões de áudio duram ~15 min. Com isso o app renova a conexão sozinho e comprime o histórico.
      setup.sessionResumption = resumeHandle ? { handle: resumeHandle } : {};
      setup.contextWindowCompression = { slidingWindow: {} };
    }
    return setup;
  }

  open(resumeHandle, seamless) {
    const base = this.cfg.wsBase || WS_BASE;
    const ws = new WebSocket(`${base}?key=${encodeURIComponent(this.cfg.apiKey)}`);
    ws.binaryType = 'arraybuffer';
    ws.ready = false;
    if (seamless) this.next = ws;
    else this.ws = ws;

    ws.onopen = () => {
      const setup = this.buildSetup(resumeHandle);
      const summary = { ...setup, systemInstruction: `<${setup.systemInstruction.parts[0].text.length} caracteres>` };
      this.log(`${resumeHandle ? 'Conectado, retomando sessão' : 'Conectado, enviando configuração'}: ${JSON.stringify(summary)}`);
      ws.send(JSON.stringify({ setup }));
    };
    ws.onmessage = (ev) => this.onMessage(ws, ev.data);
    ws.onerror = () => this.log('Erro de WebSocket (o motivo aparece quando a conexão fecha)');
    ws.onclose = (ev) => this.onClose(ws, ev);
  }

  onClose(ws, ev) {
    if (ws === this.next) {
      this.next = null;
      this.log(`Renovação da sessão falhou (código ${ev.code}); seguindo na conexão atual`);
      return;
    }
    if (ws !== this.ws) return; // socket antigo, já substituído
    this.ws = null;
    this.talking = false;
    const why = `${ev.reason || 'sem detalhes'} (código ${ev.code})`;
    this.log(`Conexão fechada: ${why}`);
    if (this.stopped) return;

    // Caiu antes de abrir por erro interno (1011) ou configuração recusada (1007): escada de recuo.
    // Chave inválida e modelo inexistente não adiantam tentar de novo.
    const reason = ev.reason || '';
    const retryable = (ev.code === 1011 || ev.code === 1007 || /unknown name|invalid json|invalid value|invalid argument/i.test(reason))
      && !/api key|is not found|not supported for/i.test(reason);
    if (!ws.ready && retryable) {
      if (!this.ladder) {
        this.baseCfg = this.cfg;
        this.ladder = this.buildLadder(this.cfg);
      }
      if (this.ladderIdx < this.ladder.length) {
        const step = this.ladder[this.ladderIdx++];
        this.cfg = { ...this.baseCfg, ...step.patch };
        this.attempts.push(step.label);
        this.log(`Servidor derrubou a conexão (${why}). Tentando ${step.label}`);
        this.open(null, false);
        return;
      }
      this.fail(`Não foi possível iniciar: ${why}. Tentei também: ${this.attempts.join('; ')}`, ev.code);
      return;
    }

    if (ws.ready && this.resumeHandle && this.retries < MAX_RETRIES) {
      this.retries++;
      this.log(`Reconectando (${this.retries}/${MAX_RETRIES})`);
      this.setStatus('connecting');
      this.open(this.resumeHandle, false);
      return;
    }
    this.fail(ws.ready ? `A conexão caiu: ${why}` : `Não foi possível iniciar: ${why}`, ev.code);
  }

  onMessage(ws, data) {
    if (ws !== this.ws && ws !== this.next) return;
    let msg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch {
      return;
    }

    for (const key of Object.keys(msg)) {
      if (!KNOWN_KEYS.has(key) && !this.seenKeys.has(key)) {
        this.seenKeys.add(key);
        this.log(`Mensagem do servidor com campo não tratado: ${key}`);
      }
    }

    if (msg.setupComplete) {
      ws.ready = true;
      this.retries = 0;
      if (ws === this.next) {
        const old = this.ws;
        this.ws = ws;
        this.next = null;
        if (old) old.close(1000);
        this.log('Sessão renovada sem interrupção');
      } else {
        this.setStatus('live');
        this.reportRecovery();
        if (!this.greeted) {
          this.greeted = true;
          if (this.cfg.greeting) this.sendText(this.cfg.greeting);
        }
      }
      return;
    }

    if (msg.sessionResumptionUpdate) {
      const u = msg.sessionResumptionUpdate;
      if (u.newHandle && u.resumable !== false) this.resumeHandle = u.newHandle;
    }

    if (msg.goAway) {
      this.log(`O servidor vai encerrar esta sessão (restam ${msg.goAway.timeLeft ?? '?'})`);
      if (this.resumeHandle && !this.next) this.open(this.resumeHandle, true);
    }

    const sc = msg.serverContent;
    if (!sc) return;
    for (const key of Object.keys(sc)) {
      if (!KNOWN_CONTENT_KEYS.has(key) && !this.seenKeys.has(`sc.${key}`)) {
        this.seenKeys.add(`sc.${key}`);
        this.log(`serverContent com campo não tratado: ${key}`);
      }
    }

    if (sc.interrupted) {
      this.flushAudio();
      this.suppress = false;
      this.h.onInterrupted?.();
    }
    if (sc.inputTranscription && sc.inputTranscription.text) this.h.onUserText?.(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) {
      this.stat.tx++;
      this.h.onTutorText?.(sc.outputTranscription.text);
    }
    // Só o áudio entra aqui: o texto de modelTurn (se vier) seria duplicata da transcrição.
    const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        this.stat.audio++;
        this.enqueueAudio(p.inlineData.data);
      }
    }
    if (sc.turnComplete) {
      this.log(`Turno do tutor: ${this.stat.tx} trechos de texto, ${this.stat.audio} blocos de áudio`);
      this.stat = { tx: 0, audio: 0 };
      this.suppress = false;
      this.h.onTurnComplete?.();
    }
  }

  // Depois de uma recuperação, avisa o que foi preciso mudar (o app guarda isso nos ajustes).
  reportRecovery() {
    if (!this.ladder || this.ladderIdx === 0) return;
    const step = this.ladder[this.ladderIdx - 1];
    const keys = Object.keys(step.patch);
    this.ladder = null;
    if (!keys.length) {
      this.log('Conectou na segunda tentativa com a mesma configuração: foi uma falha passageira do servidor');
      return;
    }
    this.log(`Conectou ${step.label}`);
    this.h.onDegrade?.(step.patch, step.label);
  }

  sendRaw(obj) {
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && ws.ready) ws.send(JSON.stringify(obj));
  }

  fail(message, code) {
    this.h.onError?.(message, code);
    this.teardown();
  }

  teardown() {
    this.stopped = true;
    this.talking = false;
    for (const ws of [this.ws, this.next]) {
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        try { ws.close(1000); } catch { /* já fechado */ }
      }
    }
    this.ws = null;
    this.next = null;
    this.flushAudio();
    if (this.micNode) this.micNode.port.onmessage = null;
    for (const node of [this.micNode, this.micSource, this.silent]) {
      if (node) node.disconnect();
    }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
    this.ctx = this.stream = this.micNode = this.micSource = this.micAnalyser = this.silent = null;
    this.outGain = this.outAnalyser = this.workletUrl = null;
    this.setStatus('idle');
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.h.onStatus?.(status);
  }

  log(msg) {
    this.h.onLog?.(msg);
  }
}

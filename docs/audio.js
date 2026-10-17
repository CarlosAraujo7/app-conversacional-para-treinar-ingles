// Áudio guardado das falas do Sam, para ouvir de novo (inclusive mais devagar).

const OUT_RATE = 24000; // taxa do áudio que o Gemini devolve (PCM 16 bits, mono)

/** Junta os blocos PCM de uma fala num arquivo WAV tocável por <audio>. */
export function pcmToWav(chunks, rate = OUT_RATE) {
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const head = new DataView(new ArrayBuffer(44));
  const text = (at, s) => { for (let i = 0; i < s.length; i++) head.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  head.setUint32(4, 36 + size, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  head.setUint32(16, 16, true);
  head.setUint16(20, 1, true); // PCM
  head.setUint16(22, 1, true); // mono
  head.setUint32(24, rate, true);
  head.setUint32(28, rate * 2, true);
  head.setUint16(32, 2, true);
  head.setUint16(34, 16, true);
  text(36, 'data');
  head.setUint32(40, size, true);
  return new Blob([head, ...chunks], { type: 'audio/wav' });
}

/** Toca um trecho por vez. O <audio> mantém o tom da voz quando a velocidade muda. */
export function createReplayer({ onEnd } = {}) {
  let audio = null;
  let url = null;

  function stop() {
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (url) {
      URL.revokeObjectURL(url);
      url = null;
    }
  }

  async function play(blob, rate = 1) {
    stop();
    url = URL.createObjectURL(blob);
    const mine = new Audio(url);
    audio = mine;
    mine.playbackRate = rate;
    const finish = () => {
      if (audio !== mine) return;
      stop();
      onEnd?.();
    };
    mine.onended = finish;
    mine.onerror = finish;
    try {
      await mine.play();
    } catch (err) {
      finish();
      throw err;
    }
  }

  return { play, stop, get playing() { return !!audio; } };
}

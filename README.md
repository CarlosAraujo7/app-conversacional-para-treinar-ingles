# App conversacional para treinar inglês

O **English Talk** (nome que aparece no app) treina conversação em inglês por voz, sem pausas, com o Gemini. O Sam conversa sobre o dia a dia e vai para otimização combinatória, fala inglês e traduz tudo para o português na tela. Quem usa precisa só de um navegador e de uma chave gratuita do Google AI Studio.

Um robozinho dá rosto à voz do Sam: os olhos seguem o seu dedo ou o mouse, a boca mexe com a voz, a expressão muda (ouvindo, falando, pensando, mudo, erro) e barras de som ao lado dele sobem com a voz de verdade, a do Sam e a sua.

Para estudar, o app mostra a correção das suas frases (a versão mais natural, com o que mudou em destaque), deixa ouvir de novo cada fala do Sam, inclusive mais devagar, e guarda no caderno os termos em que você tocar.

O guia de cada função está **dentro do app**: botão **Menu** > **Guia**.

## Usar no seu computador

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js). O navegador abre em `http://localhost:8765`.
2. Cole sua chave do Gemini na tela inicial ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
3. Toque no robô, libere o microfone e fale.

## Onde mexer

| Arquivo | O que controla |
|---|---|
| `docs/tutor.js` | Personalidade e regras do Sam (prompt), assuntos, atividades, tons, níveis, vozes, modelos, tema e tamanho do texto |
| `docs/live.js` | Conexão WebSocket com o Gemini, áudio (e o áudio guardado de cada fala), espectro para as ondas, estilos automático/manual, recuperação de erros |
| `docs/transcript.js` | Montagem da conversa e proteções contra duplicação e eco |
| `docs/coach.js` | Tradução, glossário, vocabulário, sugestões e correção das suas frases; amostra de voz |
| `docs/bot.js` | O robô: rosto em SVG, olhos que seguem o ponteiro, boca com a voz, estados e reações |
| `docs/wave.js` | As barras de som ao lado do robô, desenhadas com o espectro do áudio |
| `docs/view.js` | Desenho da conversa (balões, glossário, correção, ouvir de novo, popover dos termos) |
| `docs/app.js` | Menu, ajustes, controles, caderno de vocabulário; liga os módulos |
| `docs/audio.js`, `docs/diff.js`, `docs/ui.js` | Fala guardada em WAV e replay, comparação entre a frase dita e a corrigida, auxiliares de interface |
| `docs/index.html`, `docs/styles.css` | Estrutura, texto do guia e visual (as expressões do robô estão na seção "robô" do CSS) |
| `server.js`, `iniciar.bat` | Servidor local (não são usados no GitHub Pages) |

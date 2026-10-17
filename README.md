# App conversacional para treinar inglês

O **English Talk** (nome que aparece no app) treina conversação em inglês por voz, sem pausas, com o Gemini. O Sam conversa sobre o dia a dia e vai para otimização combinatória, fala inglês e traduz tudo para o português na tela. Quem usa precisa só de um navegador e de uma chave gratuita do Google AI Studio.

Além de conversar, o app ajuda a estudar:

- **Correção das suas frases**: depois que você fala, um cartão mostra uma versão mais natural, com o que mudou em destaque.
- **Ouvir de novo / Devagar**: toque para ouvir de novo a fala do Sam, na voz dele, ou em velocidade mais lenta.
- **Termos clicáveis**: toque num termo sublinhado para ouvir a pronúncia e salvar no caderno.
- **Revisão em cartões**: o caderno usa repetição espaçada (PT → EN para treinar falar, EN → PT para entender).
- **Progresso**: meta diária, sequência de dias, gráfico dos últimos 7 dias, estágio de cada palavra e assuntos mais treinados.
- **Barra de quem fala mais** durante a conversa e **resumo** ao encerrar.
- Tema claro/escuro e três tamanhos de texto em **Ajustes > Aparência**.

O guia de cada função está **dentro do app**: botão **Menu** > **Guia**.

## Usar no seu computador

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js). O navegador abre em `http://localhost:8765`.
2. Cole sua chave do Gemini na tela inicial ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
3. Toque no botão verde, libere o microfone e fale.

## Onde mexer

| Arquivo | O que controla |
|---|---|
| `docs/tutor.js` | Personalidade e regras do Sam (prompt), assuntos, atividades, tons, níveis, vozes, modelos, tema e meta diária |
| `docs/live.js` | Conexão WebSocket com o Gemini, áudio (e o áudio guardado de cada fala do Sam), estilos automático/manual, recuperação de erros |
| `docs/transcript.js` | Montagem da conversa e proteções contra duplicação e eco |
| `docs/coach.js` | Tradução, glossário, vocabulário, sugestões e correção das suas frases; amostra de voz |
| `docs/view.js` | Desenho da conversa (balões, glossário, cartões de correção, botões de ouvir, popover dos termos) |
| `docs/app.js` | Menu, ajustes, controles, caderno de vocabulário, tela inicial; liga todos os módulos |
| `docs/stats.js` | Contas do progresso: tempo por dia, sequência, meta diária, assuntos (sem DOM) |
| `docs/srs.js` | Repetição espaçada do caderno: caixas, vencimento, fila de revisão (sem DOM) |
| `docs/diff.js` | Comparação palavra por palavra entre a sua frase e a corrigida (sem DOM) |
| `docs/audio.js` | Converte o áudio guardado em WAV e toca (inclusive mais devagar) |
| `docs/progress.js`, `docs/review.js`, `docs/summary.js` | Aba Progresso, janela de revisão em cartões e resumo da conversa |
| `docs/ui.js` | Auxiliares de interface: ícones, anel de progresso, voz do navegador |
| `docs/index.html`, `docs/styles.css` | Estrutura, texto do guia e visual |
| `server.js`, `iniciar.bat` | Servidor local (não são usados no GitHub Pages) |

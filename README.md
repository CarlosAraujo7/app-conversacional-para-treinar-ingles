# App conversacional para treinar inglês

O **English Talk** (nome que aparece no app) treina conversação em inglês por voz, sem pausas, com o Gemini. O Sam conversa sobre o dia a dia e vai para otimização combinatória, fala inglês e traduz tudo para o português na tela. Quem usa precisa só de um navegador e de uma chave gratuita do Google AI Studio.

O guia de cada função está **dentro do app**: botão **Menu** > **Guia**.

## Usar no seu computador

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js). O navegador abre em `http://localhost:8765`.
2. Cole sua chave do Gemini na tela inicial ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
3. Toque no botão verde, libere o microfone e fale.

## Onde mexer

| Arquivo | O que controla |
|---|---|
| `docs/tutor.js` | Personalidade e regras do Sam (prompt), assuntos, atividades, tons, níveis, vozes, modelos |
| `docs/live.js` | Conexão WebSocket com o Gemini, áudio, estilos automático/manual, recuperação de erros |
| `docs/transcript.js` | Montagem da conversa e proteções contra duplicação e eco |
| `docs/coach.js` | Tradução, glossário, vocabulário e sugestões; amostra de voz |
| `docs/view.js` | Desenho da conversa (balões, glossário, cartões) |
| `docs/app.js` | Menu, ajustes, controles, caderno de vocabulário |
| `docs/index.html`, `docs/styles.css` | Estrutura, texto do guia e visual |
| `server.js`, `iniciar.bat` | Servidor local (não são usados no GitHub Pages) |

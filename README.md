# App conversacional para treinar inglês

O **English Talk** (nome que aparece no app) treina conversação em inglês por voz, sem pausas, com o Gemini. O Sam conversa sobre o dia a dia e vai para otimização combinatória, fala inglês e traduz tudo para o português na tela. Quem usa precisa só de um navegador e de uma chave gratuita do Google AI Studio.

O guia de cada função está **dentro do app**: botão **Menu** > **Guia**.

## Usar no seu computador

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js). O navegador abre em `http://localhost:8765`.
2. Cole sua chave do Gemini na tela inicial ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)).
3. Toque no botão verde, libere o microfone e fale.

## Publicar no GitHub Pages (para o orientador usar por um link)

O app é 100% estático (HTML, CSS e JavaScript), então o GitHub Pages serve. O endereço usa HTTPS, que é o que o navegador exige para liberar o microfone. O que o Pages publica é a pasta **`docs/`**.

1. No GitHub, clique em **New repository**:
   - *Repository name*: `app-conversacional-para-treinar-ingles`. O GitHub não aceita espaços nem acentos no nome (ele trocaria "inglês" por "ingl-s"), por isso o nome técnico não tem acento.
   - *Description*: `App conversacional para treinar inglês` (aqui pode ter acento e espaços).
   - Deixe **Public** (o Pages gratuito só publica repositórios públicos) e **não** marque "Add a README" (o projeto já tem um).
2. O repositório git e o primeiro commit já estão feitos nesta pasta, no branch `main`. Falta ligá-lo ao GitHub; rode no terminal, dentro da pasta (troque `SEU-USUARIO`):

```bash
git remote add origin https://github.com/SEU-USUARIO/app-conversacional-para-treinar-ingles.git
git push -u origin main
```

3. No repositório, vá em **Settings > Pages > Build and deployment**. Em *Source* escolha **Deploy from a branch**, em *Branch* escolha **main** e a pasta **/docs**, e clique em **Save**.
4. Em cerca de 1 minuto o site fica em `https://SEU-USUARIO.github.io/app-conversacional-para-treinar-ingles/`.
5. Abra o link no Chrome, cole a chave, fale. Para atualizar o site depois, basta `git add .`, `git commit` e `git push`; use Ctrl+F5 para ver a versão nova.

**O que mandar ao orientador:** o link, mais três avisos: precisa de uma **chave própria e gratuita** do Google AI Studio (aistudio.google.com/apikey), de preferência no **Chrome ou Edge**, e com **fones de ouvido**.

### Cuidados

- **Nunca coloque sua chave no repositório.** O app não guarda chave em arquivo nenhum: cada pessoa cola a sua na tela inicial, e ela fica só no `localStorage` do navegador dela, enviada apenas ao Google. Por isso cada pessoa usa a própria cota.
- Se você preferir dar a **sua** chave ao orientador, crie uma chave só para isso, avise que o uso sai da sua cota e apague a chave depois.
- O repositório é público, então o código fica visível. Não há segredo nele.
- O `localStorage` é compartilhado por todo o endereço `SEU-USUARIO.github.io`. Se você hospedar outras páginas nesse mesmo usuário, elas conseguiriam ler a chave guardada por este app no mesmo navegador. Se isso importa, use um usuário ou organização só para o projeto.
- Se a sua chave tiver restrição por site no Google Cloud, adicione `https://SEU-USUARIO.github.io/*`.
- Foi testado que, a partir de outro endereço (como o `github.io`), o navegador consegue chamar a API do Google (chamadas de texto e WebSocket de voz). O fluxo completo no `github.io` só dá para confirmar depois de publicado.

## Se der erro

O aviso vermelho mostra o motivo devolvido pelo Google. Em **Menu > Ajustes > Registro técnico** há o histórico da conexão, com um botão para copiá-lo.

| Mensagem | O que fazer |
|---|---|
| `API key not valid` | Chave errada ou sem acesso à Live API. Gere outra no AI Studio. |
| `... is not found ... bidiGenerateContent` | O modelo de voz não está disponível para a chave. Troque em **Ajustes > Avançado > Modelo de voz**. |
| `Internal error encountered` (código 1011) ao iniciar | Erro do servidor do Google. O app tenta de novo e simplifica a configuração passo a passo, avisa o que mudou e salva o ajuste que resolveu. |
| "O apoio em português não funcionou" | A conversa segue normal. Troque o **Modelo de apoio** em Avançado (o app já tenta um reserva). |
| Microfone indisponível | Libere o microfone no cadeado da barra de endereço. O app segue funcionando por texto. |
| O Sam se interrompe sozinho | Eco do alto-falante: use fones ou marque "Estou sem fones". |

## Privacidade

A chave fica no navegador de quem usa e só é enviada ao Google. Áudio e texto vão direto do navegador para o Gemini; não existe servidor intermediário (o `server.js` só serve os arquivos no uso local). O uso é cobrado ou limitado conforme o plano da chave.

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

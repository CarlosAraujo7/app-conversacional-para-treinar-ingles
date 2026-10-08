// Servidor estático mínimo, sem dependências, só para uso local: serve a pasta docs/ em
// http://localhost (o navegador exige contexto seguro para liberar o microfone).
// A mesma pasta docs/ é o que o GitHub Pages publica; este servidor não é necessário lá.
// A chave da API nunca passa por aqui: o navegador fala direto com o Gemini.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 8765;
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, 'docs');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (rel === '/') rel = '/index.html';

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`A porta ${PORT} já está em uso (provavelmente o app já está aberto). Abrindo o navegador.`);
    openBrowser(`http://localhost:${PORT}`);
    return;
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`English Talk rodando em ${url}`);
  console.log('Feche esta janela para encerrar o app.');
  if (!process.env.NO_OPEN) openBrowser(url);
});

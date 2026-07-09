import { createServer } from 'http';

/**
 * Servidor HTTP mínimo só pra healthcheck (usado pelo pipeline de deploy
 * pra confirmar que o processo subiu depois de um restart).
 */
export function startHealthServer(port, getStatus = () => ({ status: 'ok' })) {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStatus()));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    console.log(`[Health] Servidor de health check rodando na porta ${port}`);
  });

  return server;
}

import { createServer } from 'node:http';

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (request.method === 'POST' && request.url === '/siteverify') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      const token = new URLSearchParams(body).get('response');
      const forged = token === 'forged-token';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          forged
            ? { success: false, 'error-codes': ['invalid-input-response'] }
            : {
                success: true,
                action: 'change-password',
                hostname: 'localhost',
                // A real token is issued before verification starts; keep the stub timestamp in the past.
                challenge_ts: new Date(Date.now() - 1_000).toISOString(),
              },
        ),
      );
    });
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(3100, '127.0.0.1');

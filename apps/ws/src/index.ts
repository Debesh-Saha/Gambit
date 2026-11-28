import { WebSocket, WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import { extractAuthUser } from './auth';

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const wss = new WebSocketServer({ port: Number(process.env.PORT) || 8080 });
const gameManager = new GameManager();

// Heartbeat: find connections that died without saying goodbye
const alive = new WeakMap<WebSocket, boolean>();
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (alive.get(ws) === false) {
      ws.terminate(); // triggers the normal 'close' handling
      return;
    }
    alive.set(ws, false);
    ws.ping();
  });
}, 10_000);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', function connection(ws, req) {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));

  const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Missing token');
    return;
  }

  let user;
  try {
    user = extractAuthUser(token, ws);
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }

  gameManager.addUser(user);

  ws.on('close', () => {
    gameManager.removeUser(ws);
  });
});

console.log('ws server listening');
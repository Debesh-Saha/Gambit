import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import { extractAuthUser } from './auth';

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const wss = new WebSocketServer({ port: 8080 });
const gameManager = new GameManager();

wss.on('connection', function connection(ws, req) {
  const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Missing token');
    return;
  }

  let user;
  try {
    user = extractAuthUser(token, ws);
  } catch (err) {
    ws.close(1008, 'Invalid token');
    return;
  }

  gameManager.addUser(user);

  ws.on('close', () => {
    gameManager.removeUser(ws);
  });
});

console.log('done');

//For testing purpose
/* import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { AuthProvider } from '@repo/db';
import { GameManager } from './GameManager';
import { extractAuthUser } from './auth';
import { User } from './SocketManager';
import { db } from './db';

const SKIP_AUTH = process.env.SKIP_AUTH === 'true';
console.log('SKIP_AUTH =', SKIP_AUTH);
const wss = new WebSocketServer({ port: 8080 });
const gameManager = new GameManager();

wss.on('connection', async function connection(ws, req) {
  const params = new URL(req.url ?? '', 'http://localhost').searchParams;
  let user: User;

  try {
    if (SKIP_AUTH) {
      const userId = params.get('userId') ?? randomUUID();
      const name = params.get('name') ?? `guest-${userId.slice(0, 4)}`;

      await db.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          name,
          email: `${userId}@dev.local`,
          provider: AuthProvider.GUEST,
        },
      });

      user = new User(ws, { userId, name, isGuest: true });
    } else {
      const token = params.get('token');
      if (!token) {
        ws.close(1008, 'Missing token');
        return;
      }
      user = extractAuthUser(token, ws);
    }
  } catch (err) {
    console.error('Connection setup failed:', err);
    ws.close(1008, 'Auth failed');
    return;
  }

  gameManager.addUser(user);

  ws.on('close', () => {
    gameManager.removeUser(ws);
  });
});

console.log('done'); */
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth.js';
import { query } from './db.js';
import type { DbUser } from './types.js';

type Portal = 'user' | 'admin';

type Client = {
  ws: WebSocket;
  userId: string;
  role: string;
  portal: Portal;
  tradeId: string | null;
};

async function bindClient(
  ws: WebSocket,
  token: string,
  portal: Portal | 'auto',
  clients: Set<Client>,
) {
  let user: DbUser;
  let resolved: Portal;
  try {
    const payload = verifyToken(token);
    const result = await query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!result.rows[0] || result.rows[0].status === 'deleted') {
      ws.close(4401, 'Unauthorized');
      return;
    }
    user = result.rows[0];
    resolved = portal === 'auto' ? (user.role === 'admin' ? 'admin' : 'user') : portal;
  } catch {
    ws.close(4401, 'Unauthorized');
    return;
  }

  if (resolved === 'admin' && user.role !== 'admin') {
    ws.close(4403, 'Admin socket requires admin role');
    return;
  }
  if (resolved === 'user' && user.role === 'admin') {
    ws.close(4403, 'Use /api/ws/admin for admin sessions');
    return;
  }

  const client: Client = {
    ws,
    userId: user.id,
    role: user.role,
    portal: resolved,
    tradeId: null,
  };
  clients.add(client);

  ws.on('message', async (raw) => {
    let msg: { type?: string; tradeId?: string; body?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    if (msg.type === 'join' && msg.tradeId) {
      const tradeR = await query(`SELECT * FROM trades WHERE id = $1`, [msg.tradeId]);
      const trade = tradeR.rows[0];
      if (
        !trade ||
        (user.role !== 'admin' &&
          trade.buyer_user_id !== user.id &&
          trade.seller_user_id !== user.id)
      ) {
        ws.send(JSON.stringify({ type: 'error', error: 'Forbidden trade' }));
        return;
      }
      client.tradeId = msg.tradeId;
      ws.send(JSON.stringify({ type: 'joined', tradeId: msg.tradeId, portal: resolved }));
      return;
    }

    if (msg.type === 'chat' && msg.tradeId && msg.body?.trim()) {
      const tradeR = await query(`SELECT * FROM trades WHERE id = $1`, [msg.tradeId]);
      const trade = tradeR.rows[0];
      if (
        !trade ||
        (user.role !== 'admin' &&
          trade.buyer_user_id !== user.id &&
          trade.seller_user_id !== user.id)
      ) {
        ws.send(JSON.stringify({ type: 'error', error: 'Forbidden' }));
        return;
      }
      const body = msg.body.trim().slice(0, 4000);
      const inserted = await query(
        `INSERT INTO chat_messages (trade_id, sender_user_id, body)
         VALUES ($1,$2,$3) RETURNING *`,
        [msg.tradeId, user.id, body],
      );
      const payload = {
        type: 'chat',
        message: {
          ...inserted.rows[0],
          sender_name: user.display_name,
        },
      };
      const data = JSON.stringify(payload);
      for (const c of clients) {
        if (c.tradeId === msg.tradeId && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(data);
        }
      }
    }
  });

  ws.on('close', () => clients.delete(client));
}

function attachPath(
  server: Server,
  path: string,
  portal: Portal | 'auto',
  clients: Set<Client>,
) {
  const wss = new WebSocketServer({ server, path });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4401, 'Unauthorized');
      return;
    }
    void bindClient(ws, token, portal, clients);
  });
  return wss;
}

export function attachWs(server: Server) {
  const clients = new Set<Client>();
  attachPath(server, '/api/ws/user', 'user', clients);
  attachPath(server, '/api/ws/admin', 'admin', clients);
  // Legacy single path — role selects portal slot
  attachPath(server, '/api/ws', 'auto', clients);
  return { clients };
}

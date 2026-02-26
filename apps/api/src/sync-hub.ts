/**
 * VaultSyncHub — Durable Object for real-time WebSocket sync notifications.
 * One instance per user (named by userId).
 * Uses WebSocket Hibernation API for cost-efficient operation.
 *
 * IMPORTANT: This DO does NOT relay encrypted vault data.
 * It only sends sync notifications — clients re-fetch from the REST API.
 */

export type SyncMessage = {
  type: 'item-changed' | 'item-deleted' | 'sync-required';
  itemId?: string;
  revisionDate?: string;
};

export class VaultSyncHub {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Use Hibernation API — DO can sleep between messages
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /** Called when a connected client sends a message. Broadcasts to all OTHER clients. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const sockets = this.state.getWebSockets();
    for (const socket of sockets) {
      if (socket === ws) continue; // Don't echo back to sender
      try {
        socket.send(typeof message === 'string' ? message : message);
      } catch {
        // Socket may have closed — ignore
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Already closed
    }
  }
}

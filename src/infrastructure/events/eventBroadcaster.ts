import { Response } from 'express';

interface SSEClient {
  id: string;
  res: Response;
}

class EventBroadcaster {
  private clients: SSEClient[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('ping', { timestamp: new Date().toISOString() });
    }, 15000);
  }

  public addClient(id: string, res: Response) {
    // Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on Nginx/cPanel proxies
    res.flushHeaders?.();

    const client: SSEClient = { id, res };
    this.clients.push(client);

    // Initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', id })}\n\n`);

    res.on('close', () => {
      this.removeClient(id);
    });
  }

  public removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
  }

  public broadcast(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.res.write(payload);
      } catch (err) {
        this.removeClient(client.id);
      }
    });
  }

  public getConnectedClientsCount(): number {
    return this.clients.length;
  }
}

export const eventBroadcaster = new EventBroadcaster();

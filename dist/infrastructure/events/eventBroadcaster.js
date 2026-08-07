"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBroadcaster = void 0;
class EventBroadcaster {
    clients = [];
    heartbeatInterval = null;
    constructor() {
        this.startHeartbeat();
    }
    startHeartbeat() {
        if (this.heartbeatInterval)
            return;
        this.heartbeatInterval = setInterval(() => {
            this.broadcast('ping', { timestamp: new Date().toISOString() });
        }, 15000);
    }
    addClient(id, res) {
        // Configure SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on Nginx/cPanel proxies
        res.flushHeaders?.();
        const client = { id, res };
        this.clients.push(client);
        // Initial connection event
        res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', id })}\n\n`);
        res.on('close', () => {
            this.removeClient(id);
        });
    }
    removeClient(id) {
        this.clients = this.clients.filter((c) => c.id !== id);
    }
    broadcast(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach((client) => {
            try {
                client.res.write(payload);
            }
            catch (err) {
                this.removeClient(client.id);
            }
        });
    }
    getConnectedClientsCount() {
        return this.clients.length;
    }
}
exports.eventBroadcaster = new EventBroadcaster();
//# sourceMappingURL=eventBroadcaster.js.map
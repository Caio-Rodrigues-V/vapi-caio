"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamRouter = void 0;
const express_1 = require("express");
const eventBroadcaster_1 = require("../../infrastructure/events/eventBroadcaster");
exports.streamRouter = (0, express_1.Router)();
exports.streamRouter.get('/stream', (req, res) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    eventBroadcaster_1.eventBroadcaster.addClient(clientId, res);
});
exports.streamRouter.get('/stream/status', (_req, res) => {
    return res.json({
        ok: true,
        connectedClients: eventBroadcaster_1.eventBroadcaster.getConnectedClientsCount(),
    });
});
//# sourceMappingURL=stream.js.map
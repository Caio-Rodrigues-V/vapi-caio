import { Router, Request, Response } from 'express';
import { eventBroadcaster } from '../../infrastructure/events/eventBroadcaster';

export const streamRouter = Router();

streamRouter.get('/stream', (req: Request, res: Response) => {
  const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  eventBroadcaster.addClient(clientId, res);
});

streamRouter.get('/stream/status', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    connectedClients: eventBroadcaster.getConnectedClientsCount(),
  });
});

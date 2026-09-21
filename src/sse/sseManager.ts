import { Response } from 'express';

interface SseClient {
  userId: number;
  res: Response;
}

class SseManager {
  private clients: Map<number, Set<Response>> = new Map();

  addClient(userId: number, res: Response): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(res);

    // Initial keep-alive
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to TaskMe Realtime Engine' })}\n\n`);

    res.on('close', () => {
      this.removeClient(userId, res);
    });
  }

  removeClient(userId: number, res: Response): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  sendToUser(userId: number, event: string, data: any): void {
    const userClients = this.clients.get(userId);
    if (userClients && userClients.size > 0) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      userClients.forEach((res) => {
        try {
          res.write(message);
        } catch (err) {
          console.error(`Error sending SSE to user ${userId}:`, err);
        }
      });
    }
  }

  broadcastToUsers(userIds: number[], event: string, data: any): void {
    userIds.forEach((id) => this.sendToUser(id, event, data));
  }
}

export const sseManager = new SseManager();

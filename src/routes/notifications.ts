import { Router, Response } from 'express';
import { query, queryOne, execute } from '../db/database.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

export const notificationRouter = Router();

notificationRouter.use(authMiddleware);

// GET /api/notifications
notificationRouter.get('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const filter = (req.query.filter as string) || 'all'; // 'all' | 'task' | 'classroom'

    let sql = `
      SELECT n.*, c.name as classroom_name, c.subject as classroom_subject, t.title as task_title
      FROM notifications n
      LEFT JOIN classrooms c ON c.id = n.classroom_id
      LEFT JOIN tasks t ON t.id = n.task_id
      WHERE n.user_id = ?
    `;

    if (filter === 'task') {
      sql += ` AND n.type = 'TASK_CREATED'`;
    } else if (filter === 'classroom') {
      sql += ` AND n.type = 'CLASSROOM_JOINED'`;
    }

    sql += ` ORDER BY n.created_at DESC LIMIT 50`;

    const notifications = query(sql, [userId]);

    const unreadRes = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );

    res.json({
      notifications: notifications.map(n => ({
        ...n,
        read: Boolean(n.read)
      })),
      unread_count: unreadRes?.count || 0
    });
  } catch (err: any) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Không thể tải thông báo' });
  }
});

// PUT /api/notifications/:id/read
notificationRouter.put('/:id/read', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const notifId = parseInt(req.params.id, 10);

    if (isNaN(notifId)) {
      res.status(400).json({ error: 'ID thông báo không hợp lệ' });
      return;
    }

    execute('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [notifId, userId]);
    res.json({ success: true, message: 'Đã đánh dấu là đã đọc' });
  } catch (err: any) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật thông báo' });
  }
});

// PUT /api/notifications/read-all
notificationRouter.put('/read-all', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    execute('UPDATE notifications SET read = 1 WHERE user_id = ?', [userId]);
    res.json({ success: true, message: 'Đã đánh dấu tất cả là đã đọc' });
  } catch (err: any) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật thông báo' });
  }
});

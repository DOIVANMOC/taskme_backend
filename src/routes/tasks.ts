import { Router, Response } from 'express';
import { query, queryOne, execute } from '../db/database.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { sseManager } from '../sse/sseManager.js';

export const taskRouter = Router();

taskRouter.use(authMiddleware);

// POST /api/tasks - Create new task (Only Room Owner)
taskRouter.post('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { classroom_id, title, description, deadline, attachment_name, attachment_url } = req.body;

    if (!classroom_id || !title || !deadline) {
      res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: Phòng học, Tiêu đề và Hạn nộp' });
      return;
    }

    // Security check: Only the classroom owner can create tasks! (Section 19 & 25)
    const classroom = queryOne<{ id: number; name: string; subject: string; owner_id: number }>(
      'SELECT id, name, subject, owner_id FROM classrooms WHERE id = ?',
      [classroom_id]
    );

    if (!classroom) {
      res.status(404).json({ error: 'Phòng học không tồn tại' });
      return;
    }

    if (classroom.owner_id !== userId) {
      res.status(403).json({ error: 'Chỉ chủ phòng mới có quyền đăng nhiệm vụ trong phòng học này' });
      return;
    }

    const now = new Date().toISOString();

    const insertRes = execute(
      `INSERT INTO tasks (classroom_id, creator_id, title, description, deadline, attachment_name, attachment_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classroom_id,
        userId,
        title.trim(),
        description ? description.trim() : '',
        deadline,
        attachment_name || null,
        attachment_url || null,
        now
      ]
    );

    const taskId = insertRes.lastInsertRowid;

    // Fetch all members of this classroom to notify them (Section 12: Notification Logic)
    const members = query<{ user_id: number }>(
      'SELECT user_id FROM classroom_members WHERE classroom_id = ? AND user_id != ?',
      [classroom_id, userId]
    );

    const notifMessage = `${classroom.name} vừa có một nhiệm vụ mới: "${title.trim()}"`;
    const memberIds: number[] = [];

    members.forEach((m) => {
      memberIds.push(m.user_id);
      execute(
        `INSERT INTO notifications (user_id, task_id, classroom_id, type, title, message, read, created_at)
         VALUES (?, ?, ?, 'TASK_CREATED', 'Nhiệm vụ mới', ?, 0, ?)`,
        [m.user_id, taskId, classroom_id, notifMessage, now]
      );
    });

    const createdTask = queryOne(
      `SELECT t.*, c.name as classroom_name, c.subject as classroom_subject, u.name as creator_name
       FROM tasks t
       JOIN classrooms c ON c.id = t.classroom_id
       JOIN users u ON u.id = t.creator_id
       WHERE t.id = ?`,
      [taskId]
    );

    // Real-time Push via SSE (Section 20)
    sseManager.broadcastToUsers(memberIds, 'new_task', {
      task: createdTask,
      notification: {
        task_id: taskId,
        classroom_id,
        classroom_name: classroom.name,
        title: 'Nhiệm vụ mới',
        message: notifMessage,
        created_at: now
      }
    });

    res.status(201).json({
      message: 'Đăng nhiệm vụ thành công!',
      task: createdTask
    });
  } catch (err: any) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhiệm vụ' });
  }
});

// GET /api/tasks - List all tasks across enrolled classrooms
taskRouter.get('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { filter } = req.query; // 'all' | 'pending' | 'completed' | 'due_soon'

    let sql = `
      SELECT t.*, c.name as classroom_name, c.subject as classroom_subject,
             u.name as creator_name, u.avatar as creator_avatar,
             COALESCE(tc.completed, 0) as user_completed,
             tc.completed_at as user_completed_at
      FROM tasks t
      JOIN classrooms c ON c.id = t.classroom_id
      JOIN classroom_members cm ON cm.classroom_id = c.id
      JOIN users u ON u.id = t.creator_id
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE cm.user_id = ?
    `;

    const nowStr = new Date().toISOString().split('T')[0];

    if (filter === 'completed') {
      sql += ` AND tc.completed = 1`;
    } else if (filter === 'pending') {
      sql += ` AND (tc.completed IS NULL OR tc.completed = 0)`;
    } else if (filter === 'due_soon') {
      // Due within next 3 days and not yet completed
      const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      sql += ` AND (tc.completed IS NULL OR tc.completed = 0) AND t.deadline >= '${nowStr}' AND t.deadline <= '${in3Days}'`;
    }

    sql += ` ORDER BY t.deadline ASC, t.created_at DESC`;

    const rawTasks = query(sql, [userId, userId]);

    const tasks = rawTasks.map((t) => {
      const deadlineDate = new Date(t.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      deadlineDate.setHours(0, 0, 0, 0);

      const diffTime = deadlineDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        ...t,
        user_completed: Boolean(t.user_completed),
        days_remaining: diffDays,
        is_overdue: diffDays < 0,
        is_due_soon: diffDays >= 0 && diffDays <= 3
      };
    });

    res.json({ tasks });
  } catch (err: any) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách nhiệm vụ' });
  }
});

// POST /api/tasks/:id/toggle - Toggle completion status (Section 14)
taskRouter.post('/:id/toggle', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const taskId = parseInt(req.params.id, 10);

    if (isNaN(taskId)) {
      res.status(400).json({ error: 'ID nhiệm vụ không hợp lệ' });
      return;
    }

    // Verify task exists and user is member of that classroom
    const task = queryOne<{ id: number; classroom_id: number; title: string }>(
      `SELECT t.id, t.classroom_id, t.title
       FROM tasks t
       JOIN classroom_members cm ON cm.classroom_id = t.classroom_id
       WHERE t.id = ? AND cm.user_id = ?`,
      [taskId, userId]
    );

    if (!task) {
      res.status(404).json({ error: 'Nhiệm vụ không tồn tại hoặc bạn không thuộc lớp học này' });
      return;
    }

    const existing = queryOne<{ id: number; completed: number }>(
      'SELECT id, completed FROM task_completions WHERE task_id = ? AND user_id = ?',
      [taskId, userId]
    );

    const now = new Date().toISOString();
    let newCompleted = 1;

    if (existing) {
      newCompleted = existing.completed === 1 ? 0 : 1;
      execute(
        'UPDATE task_completions SET completed = ?, completed_at = ? WHERE id = ?',
        [newCompleted, newCompleted ? now : null, existing.id]
      );
    } else {
      execute(
        'INSERT INTO task_completions (task_id, user_id, completed, completed_at) VALUES (?, ?, 1, ?)',
        [taskId, userId, now]
      );
    }

    res.json({
      message: newCompleted ? '✓ Đã đánh dấu hoàn thành nhiệm vụ!' : 'Đã chuyển sang trạng thái chưa hoàn thành',
      task_id: taskId,
      completed: Boolean(newCompleted),
      completed_at: newCompleted ? now : null
    });
  } catch (err: any) {
    console.error('Toggle task completion error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái nhiệm vụ' });
  }
});

// GET /api/tasks/:id/progress - Room owner progress view (Section 15)
taskRouter.get('/:id/progress', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const taskId = parseInt(req.params.id, 10);

    if (isNaN(taskId)) {
      res.status(400).json({ error: 'ID nhiệm vụ không hợp lệ' });
      return;
    }

    const task = queryOne<{ id: number; classroom_id: number; title: string; deadline: string; owner_id: number }>(
      `SELECT t.id, t.classroom_id, t.title, t.deadline, c.owner_id
       FROM tasks t
       JOIN classrooms c ON c.id = t.classroom_id
       WHERE t.id = ?`,
      [taskId]
    );

    if (!task) {
      res.status(404).json({ error: 'Nhiệm vụ không tồn tại' });
      return;
    }

    // Security check: Only room owner can view completion progress of other members!
    if (task.owner_id !== userId) {
      res.status(403).json({ error: 'Chỉ chủ phòng mới có quyền xem tiến độ chi tiết của thành viên' });
      return;
    }

    const filter = (req.query.filter as string) || 'all'; // 'all' | 'completed' | 'incomplete'

    // Fetch members of classroom excluding owner
    let sql = `
      SELECT u.id as user_id, u.name, u.email, u.avatar,
             COALESCE(tc.completed, 0) as completed,
             tc.completed_at
      FROM classroom_members cm
      JOIN users u ON u.id = cm.user_id
      LEFT JOIN task_completions tc ON tc.task_id = ? AND tc.user_id = u.id
      WHERE cm.classroom_id = ? AND u.id != ?
    `;

    const allMembers = query(sql, [taskId, task.classroom_id, userId]);

    const totalMembers = allMembers.length;
    const completedCount = allMembers.filter(m => m.completed === 1).length;
    const percentage = totalMembers > 0 ? Math.round((completedCount / totalMembers) * 100) : 0;

    let filteredMembers = allMembers;
    if (filter === 'completed') {
      filteredMembers = allMembers.filter(m => m.completed === 1);
    } else if (filter === 'incomplete') {
      filteredMembers = allMembers.filter(m => m.completed === 0);
    }

    res.json({
      task: {
        id: task.id,
        title: task.title,
        deadline: task.deadline,
        total_members: totalMembers,
        completed_count: completedCount,
        progress_percentage: percentage
      },
      members: filteredMembers.map(m => ({
        ...m,
        completed: Boolean(m.completed)
      }))
    });
  } catch (err: any) {
    console.error('Get task progress error:', err);
    res.status(500).json({ error: 'Không thể tải tiến độ nhiệm vụ' });
  }
});

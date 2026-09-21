import { Router, Response } from 'express';
import { query, queryOne, execute } from '../db/database.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

export const classroomRouter = Router();

classroomRouter.use(authMiddleware);

function generateJoinCode(className: string): string {
  // Extract alphanumeric prefix from classroom name, e.g. "Lớp 10A1" -> "10A1"
  let cleanPrefix = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  if (!cleanPrefix) cleanPrefix = 'ROOM';

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous 0, 1, I, O
  let randomSuffix = '';
  for (let i = 0; i < 5; i++) {
    randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${cleanPrefix}-${randomSuffix}`;
}

// GET /api/classrooms - List all classrooms user is enrolled in or owns
classroomRouter.get('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;

    const classrooms = query(
      `SELECT c.id, c.name, c.subject, c.description, c.image, c.join_code, c.owner_id, c.created_at,
              u.name as owner_name, u.avatar as owner_avatar,
              (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = c.id) as member_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.classroom_id = c.id) as task_count,
              CASE WHEN c.owner_id = ? THEN 1 ELSE 0 END as is_owner
       FROM classrooms c
       JOIN classroom_members cm ON cm.classroom_id = c.id
       JOIN users u ON u.id = c.owner_id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`,
      [userId, userId]
    );

    res.json({ classrooms });
  } catch (err: any) {
    console.error('Get classrooms error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách phòng học' });
  }
});

// POST /api/classrooms - Create new classroom
classroomRouter.post('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { name, subject, description, image } = req.body;

    if (!name || !subject) {
      res.status(400).json({ error: 'Tên phòng học và môn học là bắt buộc' });
      return;
    }

    // Generate unique join code
    let joinCode = generateJoinCode(name);
    let attempts = 0;
    while (queryOne('SELECT id FROM classrooms WHERE join_code = ?', [joinCode]) && attempts < 10) {
      joinCode = generateJoinCode(name);
      attempts++;
    }

    const defaultImages = [
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&auto=format&fit=crop&q=80'
    ];
    const roomImage = image || defaultImages[Math.floor(Math.random() * defaultImages.length)];
    const now = new Date().toISOString();

    const insertRes = execute(
      `INSERT INTO classrooms (name, subject, description, image, join_code, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), subject.trim(), description ? description.trim() : '', roomImage, joinCode, userId, now]
    );

    const classroomId = insertRes.lastInsertRowid;

    // Add creator as member
    execute(
      `INSERT INTO classroom_members (classroom_id, user_id, joined_at)
       VALUES (?, ?, ?)`,
      [classroomId, userId, now]
    );

    // Update user role to ROOM_OWNER if not already
    execute(`UPDATE users SET role = 'ROOM_OWNER' WHERE id = ? AND role = 'STUDENT'`, [userId]);

    const createdClassroom = queryOne(
      `SELECT c.*, u.name as owner_name, 1 as member_count, 0 as task_count, 1 as is_owner
       FROM classrooms c
       JOIN users u ON u.id = c.owner_id
       WHERE c.id = ?`,
      [classroomId]
    );

    res.status(201).json({
      message: 'Tạo phòng học thành công',
      classroom: createdClassroom
    });
  } catch (err: any) {
    console.error('Create classroom error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi tạo phòng học' });
  }
});

// POST /api/classrooms/join - Join classroom with join_code
classroomRouter.post('/join', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { join_code } = req.body;

    if (!join_code || typeof join_code !== 'string') {
      res.status(400).json({ error: 'Vui lòng nhập mã phòng hợp lệ' });
      return;
    }

    const cleanCode = join_code.trim().toUpperCase();

    const classroom = queryOne<{ id: number; name: string; subject: string; owner_id: number }>(
      'SELECT id, name, subject, owner_id FROM classrooms WHERE UPPER(join_code) = ?',
      [cleanCode]
    );

    if (!classroom) {
      res.status(404).json({ error: 'Không tìm thấy phòng học với mã này. Vui lòng kiểm tra lại!' });
      return;
    }

    const isMember = queryOne(
      'SELECT id FROM classroom_members WHERE classroom_id = ? AND user_id = ?',
      [classroom.id, userId]
    );

    if (isMember) {
      res.status(400).json({ error: 'Bạn đã là thành viên của phòng học này rồi' });
      return;
    }

    const now = new Date().toISOString();
    execute(
      'INSERT INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)',
      [classroom.id, userId, now]
    );

    // Add join notification
    execute(
      `INSERT INTO notifications (user_id, classroom_id, type, title, message, read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [
        userId,
        classroom.id,
        'CLASSROOM_JOINED',
        'Tham gia phòng thành công',
        `Bạn đã tham gia vào phòng: ${classroom.name} (${classroom.subject})`,
        now
      ]
    );

    res.json({
      message: `Tham gia phòng "${classroom.name}" thành công!`,
      classroom
    });
  } catch (err: any) {
    console.error('Join classroom error:', err);
    res.status(500).json({ error: 'Lỗi khi tham gia phòng học' });
  }
});

// GET /api/classrooms/:id - Classroom details with tasks and members
classroomRouter.get('/:id', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const classroomId = parseInt(req.params.id, 10);

    if (isNaN(classroomId)) {
      res.status(400).json({ error: 'ID phòng học không hợp lệ' });
      return;
    }

    const classroom = queryOne(
      `SELECT c.*, u.name as owner_name, u.avatar as owner_avatar,
              CASE WHEN c.owner_id = ? THEN 1 ELSE 0 END as is_owner
       FROM classrooms c
       JOIN users u ON u.id = c.owner_id
       WHERE c.id = ?`,
      [userId, classroomId]
    );

    if (!classroom) {
      res.status(404).json({ error: 'Phòng học không tồn tại' });
      return;
    }

    // Security check: Must be member or owner
    const isMember = queryOne(
      'SELECT id FROM classroom_members WHERE classroom_id = ? AND user_id = ?',
      [classroomId, userId]
    );

    if (!isMember && !classroom.is_owner) {
      res.status(403).json({ error: 'Bạn không có quyền truy cập vào phòng học này' });
      return;
    }

    // Members list
    const members = query(
      `SELECT u.id, u.name, u.email, u.username, u.avatar, u.role, cm.joined_at,
              CASE WHEN u.id = ? THEN 1 ELSE 0 END as is_room_owner
       FROM classroom_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.classroom_id = ?
       ORDER BY is_room_owner DESC, u.name ASC`,
      [classroom.owner_id, classroomId]
    );

    // Total non-owner members for completion calculations
    const memberCount = members.filter(m => m.id !== classroom.owner_id).length || members.length;

    // Tasks list in this classroom
    const tasks = query(
      `SELECT t.*, u.name as creator_name, u.avatar as creator_avatar,
              COALESCE(tc.completed, 0) as user_completed,
              tc.completed_at as user_completed_at,
              (SELECT COUNT(*) FROM task_completions tc2 WHERE tc2.task_id = t.id AND tc2.completed = 1) as completed_count
       FROM tasks t
       JOIN users u ON u.id = t.creator_id
       LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
       WHERE t.classroom_id = ?
       ORDER BY t.created_at DESC`,
      [userId, classroomId]
    );

    res.json({
      classroom: {
        ...classroom,
        member_count: members.length,
        task_count: tasks.length
      },
      members,
      tasks: tasks.map(t => ({
        ...t,
        user_completed: Boolean(t.user_completed),
        total_members: memberCount,
        progress_percentage: memberCount > 0 ? Math.round((t.completed_count / memberCount) * 100) : 0
      }))
    });
  } catch (err: any) {
    console.error('Get classroom detail error:', err);
    res.status(500).json({ error: 'Không thể tải chi tiết phòng học' });
  }
});

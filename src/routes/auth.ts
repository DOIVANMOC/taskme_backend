import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, execute } from '../db/database.js';
import { authMiddleware, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req, res): Promise<void> => {
  try {
    const { name, email, username, password, role } = req.body;

    if (!name || !email || !username || !password) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ tất cả các trường bắt buộc' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự' });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim().toLowerCase();

    const existingEmail = queryOne('SELECT id FROM users WHERE LOWER(email) = ?', [trimmedEmail]);
    if (existingEmail) {
      res.status(400).json({ error: 'Email này đã được sử dụng bởi một tài khoản khác' });
      return;
    }

    const existingUsername = queryOne('SELECT id FROM users WHERE LOWER(username) = ?', [trimmedUsername]);
    if (existingUsername) {
      res.status(400).json({ error: 'Tên đăng nhập này đã tồn tại, vui lòng chọn tên khác' });
      return;
    }

    const userRole = role === 'ROOM_OWNER' ? 'ROOM_OWNER' : 'STUDENT';
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=2563eb,3b82f6,1d4ed8`;

    const result = execute(
      `INSERT INTO users (name, email, username, password_hash, avatar, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), trimmedEmail, trimmedUsername, passwordHash, defaultAvatar, userRole, now]
    );

    const newUserId = result.lastInsertRowid;
    const user = {
      id: newUserId,
      name: name.trim(),
      email: trimmedEmail,
      username: trimmedUsername,
      avatar: defaultAvatar,
      role: userRole
    };

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Đăng ký tài khoản thành công',
      token,
      user
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng ký tài khoản' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Vui lòng nhập email/tên đăng nhập và mật khẩu' });
      return;
    }

    const trimmedIdentifier = identifier.trim().toLowerCase();
    const user = queryOne<{
      id: number;
      name: string;
      email: string;
      username: string;
      password_hash: string;
      avatar: string;
      role: 'STUDENT' | 'ROOM_OWNER';
    }>(
      `SELECT id, name, email, username, password_hash, avatar, role
       FROM users
       WHERE LOWER(email) = ? OR LOWER(username) = ?`,
      [trimmedIdentifier, trimmedIdentifier]
    );

    if (!user) {
      res.status(401).json({ error: 'Tài khoản không tồn tại. Vui lòng kiểm tra lại email/tên đăng nhập hoặc đăng ký mới' });
      return;
    }

    const cleanPassword = typeof password === 'string' ? password.trim() : '';
    const isMatch = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Mật khẩu không chính xác. Bạn có thể bấm "Quên mật khẩu" bên dưới để đặt lại mật khẩu mới.' });
      return;
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhập' });
  }
});

// POST /api/auth/reset-password
authRouter.post('/reset-password', async (req, res): Promise<void> => {
  try {
    const { identifier, newPassword } = req.body;

    if (!identifier || !newPassword) {
      res.status(400).json({ error: 'Vui lòng cung cấp email/tên đăng nhập và mật khẩu mới' });
      return;
    }

    const cleanPass = typeof newPassword === 'string' ? newPassword.trim() : '';
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
      return;
    }

    const trimmedIdentifier = identifier.trim().toLowerCase();
    const user = queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [trimmedIdentifier, trimmedIdentifier]
    );

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản với email hoặc tên đăng nhập này' });
      return;
    }

    const newHash = await bcrypt.hash(cleanPass, 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

    res.json({ message: 'Đặt lại mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.' });
  } catch (err: any) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đặt lại mật khẩu' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ user: req.user });
});

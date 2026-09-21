import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'taskme_super_secret_jwt_key_2026';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  username: string;
  avatar: string | null;
  role: 'STUDENT' | 'ROOM_OWNER';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const user = queryOne<AuthUser>(
      'SELECT id, name, email, username, avatar, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      res.status(401).json({ error: 'Người dùng không tồn tại hoặc phiên đăng nhập đã hết hạn' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc đã hết hạn' });
  }
}

export function requireRole(requiredRole: 'ROOM_OWNER' | 'STUDENT') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu đăng nhập' });
      return;
    }
    if (req.user.role !== requiredRole && req.user.role !== 'ROOM_OWNER') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này (Yêu cầu quyền Chủ phòng)' });
      return;
    }
    next();
  };
}

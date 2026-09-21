import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, execute } from '../db/database.js';
import { authMiddleware, AuthenticatedRequest, JWT_SECRET } from '../middleware/auth.js';
import { sendOtpEmail } from '../services/emailService.js';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req, res): Promise<void> => {
  try {
    const { name, email, username, password, role, recoveryPin } = req.body;

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

    const cleanPin = (recoveryPin && typeof recoveryPin === 'string' && /^\d{4,6}$/.test(recoveryPin.trim()))
      ? recoveryPin.trim()
      : '123456';

    const userRole = role === 'ROOM_OWNER' ? 'ROOM_OWNER' : 'STUDENT';
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=2563eb,3b82f6,1d4ed8`;

    const result = execute(
      `INSERT INTO users (name, email, username, password_hash, avatar, role, recovery_pin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), trimmedEmail, trimmedUsername, passwordHash, defaultAvatar, userRole, cleanPin, now]
    );

    const newUserId = result.lastInsertRowid;
    const user = {
      id: newUserId,
      name: name.trim(),
      email: trimmedEmail,
      username: trimmedUsername,
      avatar: defaultAvatar,
      role: userRole,
      recovery_pin: cleanPin,
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

// Helper function to mask email for privacy (e.g. h***3@gmail.com)
function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [name, domain] = parts;
  if (name.length <= 2) {
    return `${name[0]}***@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

// POST /api/auth/send-otp
authRouter.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      res.status(400).json({ error: 'Vui lòng cung cấp email hoặc tên đăng nhập' });
      return;
    }

    const trimmed = identifier.trim().toLowerCase();
    const user = queryOne<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [trimmed, trimmed]
    );

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản với email hoặc tên đăng nhập này' });
      return;
    }

    // Rate-limit check: Has an OTP been sent in the last 45 seconds?
    const existing = queryOne<{ id: number; created_at: string }>(
      'SELECT id, created_at FROM password_resets WHERE email = ? ORDER BY id DESC LIMIT 1',
      [user.email]
    );
    if (existing) {
      const diffSeconds = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
      if (diffSeconds < 45) {
        res.status(429).json({
          error: `Vui lòng chờ ${Math.ceil(45 - diffSeconds)} giây trước khi yêu cầu mã OTP mới`,
        });
        return;
      }
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // Clean up any old OTPs for this email
    execute('DELETE FROM password_resets WHERE email = ?', [user.email]);

    // Insert new OTP record
    execute(
      'INSERT INTO password_resets (email, otp_code, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
      [user.email, otp, expiresAt, now]
    );

    // Send email
    await sendOtpEmail(user.email, otp, user.name);

    res.json({
      message: `Mã OTP đã được gửi đến email ${maskEmail(user.email)}`,
      maskedEmail: maskEmail(user.email),
    });
  } catch (err: any) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: err.message || 'Lỗi hệ thống khi gửi mã xác thực OTP' });
  }
});

// POST /api/auth/verify-otp-reset
authRouter.post('/verify-otp-reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, otp, newPassword } = req.body;

    if (!identifier || !otp || !newPassword) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ mã OTP và mật khẩu mới' });
      return;
    }

    const cleanPass = newPassword.trim();
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
      return;
    }

    const trimmed = identifier.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    const user = queryOne<{ id: number; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [trimmed, trimmed]
    );

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng' });
      return;
    }

    // Look for reset record
    const resetRecord = queryOne<{
      id: number;
      otp_code: string;
      expires_at: string;
      attempts: number;
    }>(
      'SELECT id, otp_code, expires_at, attempts FROM password_resets WHERE email = ? ORDER BY id DESC LIMIT 1',
      [user.email]
    );

    if (!resetRecord) {
      res.status(400).json({ error: 'Chưa có yêu cầu mã xác thực nào. Vui lòng bấm "Gửi mã OTP" trước.' });
      return;
    }

    // Check attempts limit (e.g., max 5 attempts)
    if (resetRecord.attempts >= 5) {
      execute('DELETE FROM password_resets WHERE email = ?', [user.email]);
      res.status(400).json({ error: 'Bạn đã nhập sai mã OTP quá 5 lần. Mã này đã bị hủy vì lý do an toàn. Vui lòng yêu cầu mã mới.' });
      return;
    }

    // Check expiration
    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      execute('DELETE FROM password_resets WHERE email = ?', [user.email]);
      res.status(400).json({ error: 'Mã xác thực OTP đã hết hạn (chỉ có hiệu lực 5 phút). Vui lòng yêu cầu mã mới.' });
      return;
    }

    // Verify OTP code
    if (resetRecord.otp_code !== cleanOtp) {
      const remainingAttempts = 5 - (resetRecord.attempts + 1);
      execute('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [resetRecord.id]);
      res.status(400).json({
        error: `Mã OTP không chính xác. Bạn còn ${remainingAttempts} lần thử.`,
      });
      return;
    }

    // OTP is valid! Update password
    const newHash = await bcrypt.hash(cleanPass, 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

    // Clean up reset record
    execute('DELETE FROM password_resets WHERE email = ?', [user.email]);

    res.json({
      message: 'Đặt lại mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.',
    });
  } catch (err: any) {
    console.error('Verify OTP and reset password error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi xác thực và đặt lại mật khẩu' });
  }
});

// POST /api/auth/reset-password (Secure password reset via Recovery PIN)
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, recoveryPin, newPassword } = req.body;

    if (!identifier || !recoveryPin || !newPassword) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ Email/Tên đăng nhập, Mã PIN bảo mật và Mật khẩu mới' });
      return;
    }

    const cleanPass = typeof newPassword === 'string' ? newPassword.trim() : '';
    if (cleanPass.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
      return;
    }

    const cleanPin = typeof recoveryPin === 'string' ? recoveryPin.trim() : '';
    if (!/^\d{4,6}$/.test(cleanPin)) {
      res.status(400).json({ error: 'Mã PIN bảo mật phải gồm từ 4 đến 6 chữ số' });
      return;
    }

    const trimmed = identifier.trim().toLowerCase();
    const user = queryOne<{ id: number; name: string; email: string; username: string; recovery_pin: string }>(
      'SELECT id, name, email, username, recovery_pin FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [trimmed, trimmed]
    );

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản với email hoặc tên đăng nhập này' });
      return;
    }

    const correctPin = (user.recovery_pin && user.recovery_pin.trim()) || '123456';
    if (cleanPin !== correctPin) {
      res.status(400).json({ error: 'Mã PIN bảo mật không chính xác! Vui lòng kiểm tra lại mã PIN của bạn.' });
      return;
    }

    // PIN is correct! Hash and update password
    const newHash = await bcrypt.hash(cleanPass, 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

    res.json({
      message: 'Đặt lại mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.',
    });
  } catch (err: any) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đặt lại mật khẩu' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ user: req.user });
});

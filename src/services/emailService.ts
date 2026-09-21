import nodemailer, { type Transporter } from 'nodemailer';

function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;

  if (!user || !pass) return null;

  if (host.includes('gmail')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(to: string, otp: string, userName: string): Promise<{ success: boolean }> {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error(
      'Hệ thống chưa được cấu hình tài khoản gửi Email (SMTP). Vui lòng thêm biến môi trường SMTP_USER và SMTP_PASS (Mật khẩu ứng dụng Gmail) trên Render.'
    );
  }

  const user = process.env.SMTP_USER?.trim() || '';
  const fromAddress = process.env.SMTP_FROM || `"TaskMe Edu" <${user}>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .content { padding: 32px 24px; }
        .otp-box { background: #f1f5f9; border: 2px dashed #93c5fd; border-radius: 16px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb; margin: 0; }
        .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>TaskMe</h1>
          <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.85;">Nền tảng học tập chuẩn mực</p>
        </div>
        <div class="content">
          <p style="font-size: 15px; margin: 0 0 16px;">Xin chào <strong>${userName}</strong>,</p>
          <p style="font-size: 14px; color: #475569; margin: 0 0 16px; line-height: 1.6;">
            Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản học tập TaskMe. Đây là mã xác thực OTP bảo mật của bạn:
          </p>
          
          <div class="otp-box">
            <p style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin: 0 0 8px;">Mã xác thực OTP</p>
            <div class="otp-code">${otp}</div>
            <p style="font-size: 11px; color: #64748b; margin: 8px 0 0;">Có hiệu lực trong vòng <strong>5 phút</strong></p>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
            ⚠️ <strong>Lưu ý:</strong> Tuyệt đối không cung cấp mã này cho người khác. Nếu bạn không gửi yêu cầu này, hãy bỏ qua email này để đảm bảo tài khoản được an toàn.
          </p>
        </div>
        <div class="footer">
          © 2026 TaskMe Edu Platform. Email tự động, vui lòng không phản hồi.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject: `[TaskMe] Mã xác thực đặt lại mật khẩu của bạn: ${otp}`,
      html: htmlContent,
    });
    console.log(`[EMAIL_SERVICE] OTP successfully sent via SMTP to ${to}`);
    return { success: true };
  } catch (err: any) {
    console.error('[EMAIL_SERVICE] Failed to send email via SMTP:', err);
    throw new Error(`Không thể gửi email: ${err.message || 'Lỗi kết nối máy chủ gửi thư'}`);
  }
}

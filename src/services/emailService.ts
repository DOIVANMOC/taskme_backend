import nodemailer, { type Transporter } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || `"TaskMe Edu" <${SMTP_USER || 'no-reply@taskme.edu.vn'}>`;

let transporter: Transporter | null = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export async function sendOtpEmail(to: string, otp: string, userName: string): Promise<{ success: boolean; previewOtp?: string }> {
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

  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: `[TaskMe] Mã xác thực đặt lại mật khẩu của bạn: ${otp}`,
        html: htmlContent,
      });
      console.log(`[EMAIL_SERVICE] OTP successfully sent via SMTP to ${to}`);
      return { success: true };
    } catch (err) {
      console.error('[EMAIL_SERVICE] Failed to send email via SMTP:', err);
    }
  }

  // Fallback: If SMTP is not yet configured, log OTP to console
  console.log(`========================================`);
  console.log(`[EMAIL_SERVICE - FALLBACK] OTP for ${to}: ${otp}`);
  console.log(`========================================`);
  return { success: true, previewOtp: !SMTP_USER ? otp : undefined };
}

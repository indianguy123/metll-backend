/**
 * Email utility for sending OTP
 * 
 * Note: In production, integrate with a service like:
 * - SendGrid
 * - AWS SES
 * - Nodemailer with SMTP
 * - Resend
 * 
 * For now, this is a placeholder that logs the OTP
 */
export const sendOTPEmail = async (email: string, otp: string): Promise<void> => {
  // TODO: Implement actual email sending service
  // For development, we'll just log it
  console.log(`📧 OTP for ${email}: ${otp}`);
  
  // Example with nodemailer (uncomment and configure):
  /*
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Metll Verification Code',
    html: `
      <h2>Your verification code</h2>
      <p>Your OTP code is: <strong>${otp}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `,
  });
  */
};


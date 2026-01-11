import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Fast2SMS API key (free for Indian numbers)
const fast2smsApiKey = process.env.FAST2SMS_API_KEY;

// SMS Provider: 'twilio', 'fast2sms', or 'dev' (console only)
const smsProvider = process.env.SMS_PROVIDER || 'dev';

// Initialize Twilio client
const twilioClient = accountSid && authToken 
  ? twilio(accountSid, authToken)
  : null;

/**
 * Send OTP via Fast2SMS (FREE for Indian numbers)
 * Sign up at: https://www.fast2sms.com/
 */
const sendViaFast2SMS = async (phoneNumber: string, otp: string): Promise<void> => {
  if (!fast2smsApiKey) {
    throw new Error('Fast2SMS API key not configured. Set FAST2SMS_API_KEY in .env');
  }

  // Remove country code (+91) for Fast2SMS - it only works with 10-digit Indian numbers
  const phone = phoneNumber.replace(/^\+91/, '');
  
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      'authorization': fast2smsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'otp',
      variables_values: otp,
      numbers: phone,
    }),
  });

  const data = await response.json() as { return: boolean; message?: string };
  
  if (!data.return) {
    console.error('Fast2SMS error:', data);
    throw new Error(data.message || 'Failed to send SMS via Fast2SMS');
  }
  
  console.log(`✅ OTP sent to ${phoneNumber} via Fast2SMS`);
};

/**
 * Send OTP via Twilio (paid)
 */
const sendViaTwilio = async (phoneNumber: string, otp: string): Promise<void> => {
  if (!twilioClient || !twilioPhoneNumber) {
    throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env');
  }

  await twilioClient.messages.create({
    body: `Your Metll verification code is: ${otp}. This code will expire in 10 minutes.`,
    from: twilioPhoneNumber,
    to: phoneNumber,
  });
  
  console.log(`✅ OTP sent to ${phoneNumber} via Twilio`);
};

/**
 * Send OTP via SMS
 * 
 * Supports multiple providers:
 * - 'dev': Development mode - logs OTP to console (FREE)
 * - 'fast2sms': Fast2SMS for Indian numbers (FREE tier available)
 * - 'twilio': Twilio (paid)
 * 
 * Set SMS_PROVIDER in .env to choose provider
 */
export const sendOTPSMS = async (phoneNumber: string, otp: string): Promise<void> => {
  console.log(`📱 Sending OTP to ${phoneNumber} using provider: ${smsProvider}`);
  
  switch (smsProvider) {
    case 'fast2sms':
      await sendViaFast2SMS(phoneNumber, otp);
      break;
      
    case 'twilio':
      await sendViaTwilio(phoneNumber, otp);
      break;
      
    case 'dev':
    default:
      // Development mode - just log the OTP
      console.log('');
      console.log('╔════════════════════════════════════════╗');
      console.log('║         📱 DEVELOPMENT OTP             ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║  Phone: ${phoneNumber.padEnd(26)}  ║`);
      console.log(`║  OTP:   ${otp.padEnd(26)}  ║`);
      console.log('╚════════════════════════════════════════╝');
      console.log('');
      console.log('💡 To send real SMS, set SMS_PROVIDER=fast2sms or SMS_PROVIDER=twilio in .env');
      break;
  }
};

/**
 * Validate phone number format (E.164 format)
 * Supports international numbers
 */
export const validatePhoneNumber = (phoneNumber: string): boolean => {
  // E.164 format: +[country code][number]
  // Example: +1234567890, +919876543210
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

/**
 * Normalize phone number to E.164 format
 * Removes spaces, dashes, and parentheses
 * 
 * Note: For production, consider using libphonenumber-js for better
 * international number parsing and validation
 */
export const normalizePhoneNumber = (phoneNumber: string): string => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Invalid phone number');
  }

  // Remove all non-digit characters except +
  let normalized = phoneNumber.trim().replace(/[^\d+]/g, '');
  
  // Remove leading zeros after country code
  if (normalized.startsWith('+0')) {
    normalized = '+' + normalized.substring(2).replace(/^0+/, '');
  }
  
  // If it doesn't start with +, add +1 (US default)
  // In production, you should use libphonenumber-js to detect country code
  if (!normalized.startsWith('+')) {
    // Remove leading 1 if present (US numbers sometimes start with 1)
    if (normalized.startsWith('1') && normalized.length === 11) {
      normalized = '+' + normalized;
    } else {
      normalized = '+1' + normalized;
    }
  }
  
  // Validate the normalized number
  if (!validatePhoneNumber(normalized)) {
    throw new Error('Invalid phone number format after normalization');
  }
  
  return normalized;
};


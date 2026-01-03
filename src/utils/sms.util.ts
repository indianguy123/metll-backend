import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
const client = accountSid && authToken 
  ? twilio(accountSid, authToken)
  : null;

/**
 * Send OTP via SMS using Twilio
 * 
 * Security best practices:
 * - Rate limiting is handled at route level
 * - OTP expiration is handled at database level
 * - Phone numbers are validated before sending
 */
export const sendOTPSMS = async (phoneNumber: string, otp: string): Promise<void> => {
  if (!client) {
    // In development, log the OTP instead of sending SMS
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 SMS OTP for ${phoneNumber}: ${otp}`);
      console.log('⚠️  Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env');
      return;
    }
    throw new Error('SMS service not configured');
  }

  if (!twilioPhoneNumber) {
    throw new Error('Twilio phone number not configured');
  }

  try {
    await client.messages.create({
      body: `Your Metll verification code is: ${otp}. This code will expire in 10 minutes.`,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
  } catch (error: any) {
    console.error('Twilio SMS error:', error);
    throw new Error(`Failed to send SMS: ${error.message}`);
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


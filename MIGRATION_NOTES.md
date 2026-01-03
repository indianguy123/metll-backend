# Migration from Email to Phone Number Authentication

## Important: Database Migration Required

After updating the Prisma schema, you **must** run a migration:

```bash
npm run prisma:migrate
```

This will:
- Remove the `email` field
- Add the `phoneNumber` field
- Add `otpAttempts` and `lastOtpSentAt` fields for security

⚠️ **Warning**: This migration will delete existing user data. If you have production data, create a data migration script first.

## Changes Made

### 1. Prisma Schema
- ✅ Replaced `email` with `phoneNumber` (unique)
- ✅ Added `otpAttempts` (Int, default 0) for brute force protection
- ✅ Added `lastOtpSentAt` (DateTime) for rate limiting

### 2. Authentication Flow
- ✅ Registration now requires phone number instead of email
- ✅ OTP sent via SMS (Twilio) instead of email
- ✅ Phone number validation (E.164 format)
- ✅ Phone number normalization

### 3. Security Enhancements
- ✅ Rate limiting for OTP requests (3 per 15 min)
- ✅ Rate limiting for login attempts (5 per 15 min)
- ✅ Rate limiting for registration (3 per hour)
- ✅ OTP attempt tracking (max 5 attempts per OTP)
- ✅ 1-minute cooldown between OTP resend requests
- ✅ Password strength validation (min 8 characters)

### 4. Dependencies Added
- ✅ `twilio` - SMS service
- ✅ `express-rate-limit` - Rate limiting middleware
- ✅ `@types/express-rate-limit` - TypeScript types

## Environment Variables

Add these to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID="your-account-sid"
TWILIO_AUTH_TOKEN="your-auth-token"
TWILIO_PHONE_NUMBER="+1234567890"  # Your Twilio phone number
```

## Testing

1. Install dependencies:
```bash
npm install
```

2. Run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

3. In development mode, if Twilio is not configured, OTPs will be logged to console.

## API Changes

### Request Body Changes

**Before (Email):**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**After (Phone Number):**
```json
{
  "phoneNumber": "+1234567890",
  "password": "password123"
}
```

### Response Changes

All responses that previously included `email` now include `phoneNumber` instead.

## Phone Number Format

- Must be in E.164 format: `+[country code][number]`
- Examples:
  - US: `+1234567890`
  - India: `+919876543210`
  - UK: `+441234567890`

The system will attempt to normalize phone numbers, but it's recommended to send them in E.164 format from the client.


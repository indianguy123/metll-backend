# Metll Backend Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database (Neon DB with pooled connection)
- Cloudinary account
- Twilio account (for SMS OTP)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require&pgbouncer=true"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Twilio (for SMS OTP)
TWILIO_ACCOUNT_SID="your-account-sid"
TWILIO_AUTH_TOKEN="your-auth-token"
TWILIO_PHONE_NUMBER="+1234567890"  # Your Twilio phone number in E.164 format

# Server
PORT=3000
NODE_ENV=development
```

3. Generate Prisma Client:
```bash
npm run prisma:generate
```

4. Run database migrations:
```bash
npm run prisma:migrate
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user with phone number
- `POST /api/auth/verify-otp` - Verify OTP and activate account
- `POST /api/auth/login` - Login with phone number/password
- `POST /api/auth/resend-otp` - Resend OTP via SMS
- `GET /api/auth/profile` - Get authenticated user profile (protected)
- `PUT /api/auth/profile` - Update profile with image upload (protected)
- `POST /api/auth/logout` - Logout (client-side token removal)

### Confessions

- `POST /api/confessions` - Create a new confession (protected)
- `GET /api/confessions` - Get user's confessions (protected)

## Features Implemented

✅ Image upload system with Multer (memory storage)
✅ Cloudinary integration with auto-optimization
✅ JWT authentication with bcrypt password hashing
✅ SMS OTP-based phone number verification (Twilio)
✅ User profile management
✅ Confession system (basic structure)
✅ Protected routes with middleware
✅ Rate limiting for OTP and login attempts
✅ Phone number validation and normalization

## Security Features

- **Rate Limiting**: 
  - OTP requests: 3 per 15 minutes per phone number
  - Login attempts: 5 per 15 minutes per phone number
  - Registration: 3 per hour per IP
- **OTP Security**:
  - 6-digit OTP with 10-minute expiration
  - Maximum 5 verification attempts per OTP
  - 1-minute cooldown between OTP resend requests
- **Password Security**: Minimum 8 characters, bcrypt hashing (12 rounds)
- **Phone Number**: E.164 format validation and normalization

## Notes

- **SMS OTP**: In development mode, OTPs are logged to console if Twilio is not configured. Configure Twilio credentials for production.
- **Phone Numbers**: Must be in E.164 format (e.g., +1234567890, +919876543210)
- **Images**: Stored in Cloudinary folder: `metll/users/{userId}/profile`
- **Image Limits**: Maximum 6 images per user profile, 5MB per file
- **JWT Tokens**: Expire after 7 days


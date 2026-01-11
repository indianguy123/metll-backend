import multer from 'multer';
import { Request } from 'express';

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter to only allow images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 6, // Max 6 files
  },
});

// Middleware for profile image uploads (max 6 images)
export const uploadProfileImages = upload.array('images', 6);

// Error handler for multer errors
export const handleUploadError = (
  err: Error,
  _req: Request,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB per file.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 6 images allowed.',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
      });
    }
  }
  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

// Configure multer for verification photo (single image, 5MB)
const verificationPhotoFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG/PNG images are allowed for verification!'));
  }
};

const verificationPhotoUpload = multer({
  storage,
  fileFilter: verificationPhotoFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
});

// Configure multer for verification video (single video, 100MB)
const verificationVideoFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only MP4/MOV video files are allowed for verification!'));
  }
};

const verificationVideoUpload = multer({
  storage,
  fileFilter: verificationVideoFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1,
  },
});

// Middleware for verification photo upload
export const uploadVerificationPhoto = verificationPhotoUpload.single('photo');

// Middleware for verification video upload
export const uploadVerificationVideo = verificationVideoUpload.single('video');

// Error handler for verification uploads
export const handleVerificationUploadError = (
  err: Error,
  _req: Request,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB for photos, 100MB for videos.',
      });
    }
  }
  if (err.message.includes('Only JPG/PNG') || err.message.includes('Only MP4/MOV')) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};
// Configure multer for chat media (images/videos, 20MB)
const chatMediaFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/quicktime', 'video/x-m4v'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images and videos are allowed!'));
  }
};

const chatMediaUpload = multer({
  storage,
  fileFilter: chatMediaFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 1,
  },
});

export const uploadChatMedia = chatMediaUpload.single('file');

export const handleChatMediaUploadError = (
  err: Error,
  _req: Request,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 20MB.',
      });
    }
  }
  if (err.message === 'Only images and videos are allowed!') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

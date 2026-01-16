import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import cloudinary from '../config/cloudinary.config';
import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Convert buffer to stream for Cloudinary upload
 */
const bufferToStream = (buffer: Buffer): Readable => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

/**
 * Upload image to Cloudinary with optimization
 */
export const uploadImageToCloudinary = async (
  buffer: Buffer,
  userId: number,
  folder: string = 'profile'
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `metll/users/${userId}/${folder}`,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(new Error('Cloudinary upload failed: No result returned'));
        }
      }
    );

    bufferToStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete image from Cloudinary
 */
export const deleteImageFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error(`Failed to delete image ${publicId} from Cloudinary:`, error);
    // Don't throw - we don't want to fail the request if cleanup fails
  }
};

/**
 * Delete multiple images from Cloudinary
 */
export const deleteImagesFromCloudinary = async (publicIds: string[]): Promise<void> => {
  if (publicIds.length === 0) return;

  try {
    await cloudinary.api.delete_resources(publicIds);
  } catch (error) {
    console.error(`Failed to delete images from Cloudinary:`, error);
    // Don't throw - we don't want to fail the request if cleanup fails
  }
};

/**
 * Upload video to Cloudinary for verification
 */
export const uploadVideoToCloudinary = async (
  buffer: Buffer,
  userId: number,
  folder: string = 'verification'
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `metll/users/${userId}/${folder}`,
        resource_type: 'video',
        format: 'mp4',
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(new Error(`Cloudinary video upload failed: ${error.message}`));
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(new Error('Cloudinary video upload failed: No result returned'));
        }
      }
    );

    bufferToStream(buffer).pipe(uploadStream);
  });
};

/**
 * Upload audio to Cloudinary for voice notes
 */
export const uploadAudioToCloudinary = async (
  buffer: Buffer,
  userId: number,
  folder: string = 'voice_notes'
): Promise<UploadResult & { duration?: number }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `metll/users/${userId}/${folder}`,
        resource_type: 'video', // Cloudinary uses 'video' for audio files
        format: 'mp3',
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(new Error(`Cloudinary audio upload failed: ${error.message}`));
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            duration: Math.round(result.duration || 0),
          });
        } else {
          reject(new Error('Cloudinary audio upload failed: No result returned'));
        }
      }
    );

    bufferToStream(buffer).pipe(uploadStream);
  });
};
/**
 * Extract publicId from Cloudinary URL
 */
export const extractPublicIdFromUrl = (url: string): string | null => {
  try {
    // Example: https://res.cloudinary.com/cloudname/image/upload/v12345678/folder/filename.jpg
    const parts = url.split('/');
    const filenameWithVersion = parts[parts.length - 1];
    const filenameParts = filenameWithVersion.split('.');

    // Join all parts except the last one (extension) to get the filename
    // Actually, Cloudinary publicID usually includes the folder path if defined.
    // Better regex approach:

    // Regex to capture everything after 'upload/' and version (v1234/), up to the extension
    const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/;
    const match = url.match(regex);

    if (match && match[1]) {
      return match[1];
    }

    return null;
  } catch (error) {
    console.error('Error extracting publicId from URL:', error);
    return null;
  }
};

/**
 * Delete resources (images, video, audio) from Cloudinary
 * Note: delete_resources default resource_type is 'image'. For video/audio need to specify.
 */
export const deleteResourcesFromCloudinary = async (publicIds: string[], resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<void> => {
  if (publicIds.length === 0) return;

  try {
    await cloudinary.api.delete_resources(publicIds, { resource_type: resourceType });
  } catch (error) {
    console.error(`Failed to delete ${resourceType} resources from Cloudinary:`, error);
  }
};

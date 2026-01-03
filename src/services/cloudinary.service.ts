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


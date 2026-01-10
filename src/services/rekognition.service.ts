import {
    DetectFacesCommand,
    CompareFacesCommand,
    FaceDetail,
    CompareFacesMatch,
    Attribute,
} from '@aws-sdk/client-rekognition';
import rekognitionClient from '../config/rekognition.config';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface FaceDetectionResult {
    success: boolean;
    faceCount: number;
    faceDetails: FaceDetail[];
    qualityScore: number;
    message: string;
}

export interface FaceComparisonResult {
    success: boolean;
    similarity: number;
    isMatch: boolean;
    message: string;
}

export interface FrameExtractionResult {
    frames: Buffer[];
    success: boolean;
    message: string;
}

// Minimum quality thresholds
const MIN_QUALITY_BRIGHTNESS = 40;
const MIN_QUALITY_SHARPNESS = 40;
const MIN_FACE_CONFIDENCE = 90;
const FACE_SIMILARITY_THRESHOLD = 95;

/**
 * Detect faces in an image and check quality
 * Returns success if exactly one face is detected with >80% quality
 */
export const detectFaces = async (imageBuffer: Buffer): Promise<FaceDetectionResult> => {
    try {
        const command = new DetectFacesCommand({
            Image: {
                Bytes: imageBuffer,
            },
            Attributes: ['ALL' as Attribute],
        });

        const response = await rekognitionClient.send(command);
        const faceDetails = response.FaceDetails || [];

        if (faceDetails.length === 0) {
            return {
                success: false,
                faceCount: 0,
                faceDetails: [],
                qualityScore: 0,
                message: 'No face detected in the image. Please upload a clear photo of your face.',
            };
        }

        if (faceDetails.length > 1) {
            return {
                success: false,
                faceCount: faceDetails.length,
                faceDetails,
                qualityScore: 0,
                message: 'Multiple faces detected. Please upload a photo with only your face.',
            };
        }

        const face = faceDetails[0];
        const confidence = face.Confidence || 0;
        const quality = face.Quality || {};
        const brightness = quality.Brightness || 0;
        const sharpness = quality.Sharpness || 0;

        // Calculate overall quality score (0-100)
        const qualityScore = Math.round((brightness + sharpness + confidence) / 3);

        // Check quality thresholds
        if (confidence < MIN_FACE_CONFIDENCE) {
            return {
                success: false,
                faceCount: 1,
                faceDetails,
                qualityScore,
                message: `Face detection confidence too low (${confidence.toFixed(1)}%). Please use a clearer photo.`,
            };
        }

        if (brightness < MIN_QUALITY_BRIGHTNESS) {
            return {
                success: false,
                faceCount: 1,
                faceDetails,
                qualityScore,
                message: 'Photo is too dark. Please use a well-lit photo.',
            };
        }

        if (sharpness < MIN_QUALITY_SHARPNESS) {
            return {
                success: false,
                faceCount: 1,
                faceDetails,
                qualityScore,
                message: 'Photo is too blurry. Please use a sharper photo.',
            };
        }

        // Check if face is fully visible (not cropped)
        const boundingBox = face.BoundingBox;
        if (boundingBox) {
            const faceArea = (boundingBox.Width || 0) * (boundingBox.Height || 0);
            if (faceArea < 0.1) {
                return {
                    success: false,
                    faceCount: 1,
                    faceDetails,
                    qualityScore,
                    message: 'Face is too small in the photo. Please upload a closer photo.',
                };
            }
        }

        return {
            success: true,
            faceCount: 1,
            faceDetails,
            qualityScore,
            message: 'Face detected successfully with good quality.',
        };
    } catch (error: any) {
        console.error('AWS Rekognition DetectFaces error:', error);
        return {
            success: false,
            faceCount: 0,
            faceDetails: [],
            qualityScore: 0,
            message: `Face detection failed: ${error.message || 'Unknown error'}`,
        };
    }
};

/**
 * Compare two faces and return similarity score
 */
export const compareFaces = async (
    sourceBuffer: Buffer,
    targetBuffer: Buffer
): Promise<FaceComparisonResult> => {
    try {
        const command = new CompareFacesCommand({
            SourceImage: {
                Bytes: sourceBuffer,
            },
            TargetImage: {
                Bytes: targetBuffer,
            },
            SimilarityThreshold: 70, // Get matches with at least 70% similarity
        });

        const response = await rekognitionClient.send(command);
        const faceMatches: CompareFacesMatch[] = response.FaceMatches || [];

        if (faceMatches.length === 0) {
            return {
                success: false,
                similarity: 0,
                isMatch: false,
                message: 'No matching face found. Please ensure your face is clearly visible.',
            };
        }

        // Get the highest similarity match
        const bestMatch = faceMatches.reduce((best, current) => {
            return (current.Similarity || 0) > (best.Similarity || 0) ? current : best;
        });

        const similarity = bestMatch.Similarity || 0;
        const isMatch = similarity >= FACE_SIMILARITY_THRESHOLD;

        return {
            success: true,
            similarity: Math.round(similarity * 100) / 100,
            isMatch,
            message: isMatch
                ? 'Face verification successful!'
                : `Face similarity (${similarity.toFixed(1)}%) is below the required threshold (${FACE_SIMILARITY_THRESHOLD}%).`,
        };
    } catch (error: any) {
        console.error('AWS Rekognition CompareFaces error:', error);
        return {
            success: false,
            similarity: 0,
            isMatch: false,
            message: `Face comparison failed: ${error.message || 'Unknown error'}`,
        };
    }
};

/**
 * Extract frames from a video buffer at start, middle, and end positions
 */
export const extractVideoFrames = async (videoBuffer: Buffer): Promise<FrameExtractionResult> => {
    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, `verification_video_${Date.now()}.mp4`);
    const frames: Buffer[] = [];

    try {
        // Write video buffer to temp file
        fs.writeFileSync(tempVideoPath, videoBuffer);

        // Get video duration
        const duration = await getVideoDuration(tempVideoPath);

        if (duration < 2 || duration > 15) {
            return {
                frames: [],
                success: false,
                message: `Video duration (${duration.toFixed(1)}s) must be between 2-15 seconds.`,
            };
        }

        // Extract frames at start (0.5s), middle, and near end
        const timestamps = [0.5, duration / 2, duration - 0.5];

        for (const timestamp of timestamps) {
            const frameBuffer = await extractFrameAt(tempVideoPath, timestamp);
            if (frameBuffer) {
                frames.push(frameBuffer);
            }
        }

        if (frames.length < 2) {
            return {
                frames: [],
                success: false,
                message: 'Failed to extract enough frames from the video.',
            };
        }

        return {
            frames,
            success: true,
            message: `Successfully extracted ${frames.length} frames from video.`,
        };
    } catch (error: any) {
        console.error('Video frame extraction error:', error);
        return {
            frames: [],
            success: false,
            message: `Frame extraction failed: ${error.message || 'Unknown error'}`,
        };
    } finally {
        // Clean up temp video file
        try {
            if (fs.existsSync(tempVideoPath)) {
                fs.unlinkSync(tempVideoPath);
            }
        } catch (e) {
            console.error('Failed to clean up temp video file:', e);
        }
    }
};

/**
 * Get video duration using ffprobe
 */
const getVideoDuration = (videoPath: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration || 0;
                resolve(duration);
            }
        });
    });
};

/**
 * Extract a single frame at a specific timestamp
 */
const extractFrameAt = (videoPath: string, timestamp: number): Promise<Buffer | null> => {
    return new Promise((resolve) => {
        const tempDir = os.tmpdir();
        const outputPath = path.join(tempDir, `frame_${Date.now()}_${timestamp}.jpg`);

        ffmpeg(videoPath)
            .seekInput(timestamp)
            .frames(1)
            .output(outputPath)
            .outputOptions(['-q:v', '2']) // High quality JPEG
            .on('end', () => {
                try {
                    const frameBuffer = fs.readFileSync(outputPath);
                    fs.unlinkSync(outputPath); // Clean up
                    resolve(frameBuffer);
                } catch (e) {
                    resolve(null);
                }
            })
            .on('error', (err) => {
                console.error('Frame extraction error at', timestamp, ':', err.message);
                resolve(null);
            })
            .run();
    });
};

/**
 * Verify liveness by comparing video frames with profile photo
 * Returns average similarity across all frames
 */
export const verifyLiveness = async (
    profilePhotoBuffer: Buffer,
    videoBuffer: Buffer
): Promise<FaceComparisonResult> => {
    // Extract frames from video
    const extractionResult = await extractVideoFrames(videoBuffer);

    if (!extractionResult.success || extractionResult.frames.length === 0) {
        return {
            success: false,
            similarity: 0,
            isMatch: false,
            message: extractionResult.message,
        };
    }

    const similarities: number[] = [];
    let failedComparisons = 0;

    // Compare each frame with profile photo
    for (const frame of extractionResult.frames) {
        const comparisonResult = await compareFaces(profilePhotoBuffer, frame);

        if (comparisonResult.success) {
            similarities.push(comparisonResult.similarity);
        } else {
            failedComparisons++;
        }
    }

    if (similarities.length === 0) {
        return {
            success: false,
            similarity: 0,
            isMatch: false,
            message: 'Could not detect face in any video frames. Please ensure your face is clearly visible.',
        };
    }

    // Calculate average similarity
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const minSimilarity = Math.min(...similarities);
    const isMatch = avgSimilarity >= FACE_SIMILARITY_THRESHOLD && minSimilarity >= 80;

    return {
        success: true,
        similarity: Math.round(avgSimilarity * 100) / 100,
        isMatch,
        message: isMatch
            ? 'Liveness verification successful!'
            : `Average face similarity (${avgSimilarity.toFixed(1)}%) is below the required threshold.`,
    };
};

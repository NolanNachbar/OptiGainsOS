import { supabase } from '@/api/supabaseClient';

const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const PHOTO_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const AVATAR_DIMENSION = 256;
const PHOTO_MAX_WIDTH = 1200;

/**
 * Resize an image file using Canvas API.
 * Returns a JPEG Blob at the specified quality.
 */
export function resizeImage(file, maxWidth, maxHeight, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create image blob'));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Resize an image to a square crop (center-cropped) for avatars.
 */
function resizeToSquare(file, size, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      const cropSize = Math.min(width, height);
      const sx = (width - cropSize) / 2;
      const sy = (height - cropSize) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create image blob'));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function validateFile(file, maxSize) {
  if (!file) throw new Error('No file provided');
  if (!file.type.startsWith('image/')) throw new Error('File must be an image');
  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / 1024 / 1024);
    throw new Error(`Image must be smaller than ${sizeMB}MB`);
  }
}

/**
 * Upload a user avatar to Supabase Storage.
 * Resizes to 256x256 square crop, JPEG 80%.
 * Returns the public URL.
 */
export async function uploadAvatar(userId, file) {
  validateFile(file, AVATAR_MAX_SIZE);

  const blob = await resizeToSquare(file, AVATAR_DIMENSION, 0.8);
  const filePath = `${userId}.jpg`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  // Append cache-buster so browsers show the new avatar immediately
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Upload a workout photo to Supabase Storage.
 * Resizes to max 1200px wide, JPEG 85%.
 * Returns the storage path (use getWorkoutPhotoUrl to get signed URL for display).
 */
export async function uploadWorkoutPhoto(userId, sharedWorkoutId, file) {
  validateFile(file, PHOTO_MAX_SIZE);

  const blob = await resizeImage(file, PHOTO_MAX_WIDTH, PHOTO_MAX_WIDTH, 0.85);
  const uuid = crypto.randomUUID();
  const filePath = `${userId}/${sharedWorkoutId}/${uuid}.jpg`;

  const { error } = await supabase.storage
    .from('workout-photos')
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
    });

  if (error) throw error;
  return filePath;
}

/**
 * Get a signed URL for a workout photo (1 hour expiry).
 */
export async function getWorkoutPhotoUrl(path) {
  const { data, error } = await supabase.storage
    .from('workout-photos')
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

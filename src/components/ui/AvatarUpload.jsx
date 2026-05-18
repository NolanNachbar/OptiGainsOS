import { useRef, useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { uploadAvatar } from '@/utils/imageUpload';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateProfile } from '@/lib/queryKeys';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';

// Helper function to create image from cropped area
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(imageSrc, pixelCrop, maxSizeKB = 2000) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Target size for avatar (larger for better quality, will be compressed if needed)
  const targetSize = 512;

  canvas.width = targetSize;
  canvas.height = targetSize;

  // Draw the cropped area scaled to target size
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  // Start with high quality and reduce if needed
  let quality = 0.95;
  let blob;

  do {
    blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });

    // If still too large, reduce quality
    if (blob.size > maxSizeKB * 1024 && quality > 0.5) {
      quality -= 0.05;
    } else {
      break;
    }
  } while (quality > 0.5);

  return blob;
}

export function AvatarUpload({ currentUrl, username, profileId }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!previewUrl || !croppedAreaPixels) return;

    setUploading(true);
    try {
      // Get cropped image as blob
      const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);

      // Convert blob to file
      const croppedFile = new File([croppedBlob], selectedFile?.name || 'avatar.jpg', {
        type: 'image/jpeg',
      });

      const publicUrl = await uploadAvatar(user.id, croppedFile);
      await db.entities.UserProfile.update(profileId, { avatar_url: publicUrl });
      invalidateProfile(queryClient);
      toast.success('Avatar updated!');
    } catch (err) {
      toast.error(err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
      handleCancel();
    }
  };

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <div className="relative group">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative cursor-pointer"
        >
          <UserAvatar url={currentUrl} username={username} size="lg" />
          <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Crop + Confirm Modal */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="max-w-md flex flex-col p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4 shrink-0">
            <p className="text-lg font-semibold text-white text-center">
              Adjust Your Photo
            </p>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Cropper Area */}
            <div className="relative w-full h-80 bg-[#202020]  rounded-lg overflow-hidden">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            {/* Zoom Slider */}
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0]  mb-2">
                Zoom
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#2a2a2a]  rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center px-6 py-4 border-t bg-[#1a1a1a]  shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={uploading}
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : null}
              {uploading ? 'Uploading...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

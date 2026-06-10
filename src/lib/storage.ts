import { storage } from './firebase';

export interface UploadProgress {
  progress: number;
  url?: string;
  error?: string;
}

export const uploadFile = (
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Firestore has a 1MB limit per document. We limit files to 800KB for safety.
    const MAX_SIZE = 800 * 1024; 
    if (file.size > MAX_SIZE) {
      reject(new Error(`File "${file.name}" is too large (${(file.size / 1024).toFixed(1)}KB). Because you are on the free plan, uploads use database storage with a maximum limit of 800KB per file.`));
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => onProgress?.(10);
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        onProgress?.(progress);
      }
    };
    reader.onload = () => {
      onProgress?.(100);
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
};

export const deleteFile = async (url: string): Promise<void> => {
  // Local Base64 strings are deleted automatically when the database record is updated or deleted
};

export const generateStoragePath = (folder: string, fileName: string): string => {
  const timestamp = Date.now();
  const ext = fileName.split('.').pop();
  return `${folder}/${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`;
};

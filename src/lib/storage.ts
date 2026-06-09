import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
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
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error("Upload timed out. Please check if Firebase Storage is enabled in your Firebase Console, your storage rules allow write access, and your CORS configuration is set up correctly."));
    }, 15000);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      async () => {
        clearTimeout(timeout);
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const deleteFile = async (url: string): Promise<void> => {
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch {
    // Ignore if file doesn't exist
  }
};

export const generateStoragePath = (folder: string, fileName: string): string => {
  const timestamp = Date.now();
  const ext = fileName.split('.').pop();
  return `${folder}/${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`;
};

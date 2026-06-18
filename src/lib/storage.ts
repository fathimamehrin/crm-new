export interface UploadProgress {
  progress: number;
  url?: string;
  error?: string;
}

// Upload file to Cloudflare R2 via backend-generated presigned URL
export const uploadFile = async (
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const folder = path.split('/')[0] || 'general';
  const fileName = path.split('/').slice(1).join('/') || file.name;

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const presignRes = await fetch(
    `${apiUrl}/api/presign-upload?fileName=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(file.type)}&folder=${encodeURIComponent(folder)}`
  );
  if (!presignRes.ok) {
    throw new Error('Failed to get presigned upload URL');
  }
  const { uploadUrl, objectKey } = await presignRes.json();

  // Directly PUT file content to the presigned URL
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentage = (event.loaded / event.total) * 100;
          onProgress(percentage);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(file);
  });

  return objectKey; // Store the object key in the database rather than absolute URL
};

// Delete object from R2 via backend api
export const deleteFile = async (key: string): Promise<void> => {
  if (!key) return;
  // If it's a full Firebase URL, do not call backend
  if (key.startsWith('http')) return;

  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    await fetch(`${apiUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch (err) {
    console.error('Failed to delete file:', err);
  }
};

// Batch resolve R2 keys to temporary presigned GET URLs
export const resolvePresignedUrls = async (keys: string[]): Promise<Record<string, string>> => {
  if (!keys || keys.length === 0) return {};
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${apiUrl}/api/presign-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    if (!res.ok) {
      throw new Error('Failed to resolve presigned URLs');
    }
    const data = await res.json();
    return data.urls || {};
  } catch (err) {
    console.error('Error in resolvePresignedUrls:', err);
    // Fallback: return the keys directly (so legac/Firebase URLs still display)
    const fallback: Record<string, string> = {};
    keys.forEach((key) => {
      fallback[key] = key;
    });
    return fallback;
  }
};

export const generateStoragePath = (folder: string, fileName: string): string => {
  const timestamp = Date.now();
  const ext = fileName.split('.').pop();
  return `${folder}/${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`;
};

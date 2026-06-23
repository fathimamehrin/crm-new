import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import admin from 'firebase-admin';

// Resolve environment variables from the root folder .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Use service account key file if path is set
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Use inline service account JSON from env
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Fallback: use project ID (works in Google Cloud environments)
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'vn-crm-3d78b',
    });
  }
  console.log('Firebase Admin SDK initialized');
} catch (err) {
  console.error('Firebase Admin SDK initialization error:', err.message);
}

const PORT = process.env.PORT || 3000;

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  // forcePathStyle: true, // Optional but useful for R2/S3 compatibility depending on endpoints
});

const generateStoragePath = (folder, fileName) => {
  const timestamp = Date.now();
  const ext = fileName.split('.').pop();
  return `${folder}/${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`;
};

// Endpoint 1: Generate a presigned PUT URL for client-side uploads
app.get('/api/presign-upload', async (req, res) => {
  const { fileName, contentType, folder } = req.query;

  if (!fileName || !contentType || !folder) {
    return res.status(400).json({ error: 'Missing fileName, contentType, or folder' });
  }

  try {
    const objectKey = generateStoragePath(folder, fileName);
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    });

    // Generate signed URL (valid for 15 minutes)
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

    res.json({ uploadUrl, objectKey });
  } catch (error) {
    console.error('Error generating upload signed URL:', error);
    res.status(500).json({ error: 'Failed to generate upload signed URL' });
  }
});

// Endpoint 2: Batch resolve a list of R2 object keys into temporary presigned GET URLs
app.post('/api/presign-view', async (req, res) => {
  const { keys } = req.body;

  if (!Array.isArray(keys)) {
    return res.status(400).json({ error: 'Keys must be an array' });
  }

  try {
    const urls = {};
    const bucket = process.env.R2_BUCKET_NAME;

    const promises = keys.map(async (key) => {
      // If it's empty or already a full HTTP URL (like from legacy Firebase storage), keep it as is
      if (!key || key.startsWith('http://') || key.startsWith('https://')) {
        urls[key] = key;
        return;
      }

      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });

        // Generate signed GET URL (valid for 1 hour / 3600 seconds)
        const viewUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
        urls[key] = viewUrl;
      } catch (err) {
        console.error(`Error generating signed GET URL for key ${key}:`, err);
        urls[key] = ''; // fallback
      }
    });

    await Promise.all(promises);
    res.json({ urls });
  } catch (error) {
    console.error('Error batch generating view signed URLs:', error);
    res.status(500).json({ error: 'Failed to generate view signed URLs' });
  }
});

// Endpoint 3: Delete an object from R2
app.delete('/api/delete', async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Missing key' });
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

// Endpoint 4: Reset user password directly (Admin SDK)
app.post('/api/reset-password', async (req, res) => {
  const { uid, newPassword } = req.body;

  if (!uid || !newPassword) {
    return res.status(400).json({ error: 'Missing uid or newPassword' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

app.listen(PORT, () => {
  console.log(`R2 Presigning Server running on port ${PORT}`);
});

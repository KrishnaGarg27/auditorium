import { v2 as cloudinary } from 'cloudinary';

let configured = false;

/**
 * Initialize Cloudinary. Requires CLOUDINARY_URL env var
 * (format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
 * or individual CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 */
export function initCloudinary(): void {
  if (configured) return;

  if (process.env.CLOUDINARY_URL) {
    // Parse CLOUDINARY_URL explicitly — the SDK only auto-reads it when
    // cloudinary.config() is called, which may not happen if the env var
    // was set after module load. Explicit parsing is more reliable.
    const match = process.env.CLOUDINARY_URL.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
    if (match) {
      cloudinary.config({
        cloud_name: match[3],
        api_key: match[1],
        api_secret: match[2],
        secure: true,
      });
    } else {
      // Fallback: let the SDK try to parse it
      cloudinary.config({ secure: true });
    }
    configured = true;
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
}

/**
 * Upload a buffer to Cloudinary and return the secure URL.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder: string;
    publicId: string;
    resourceType: 'image' | 'video' | 'raw' | 'auto';
    format?: string;
  },
): Promise<string> {
  initCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: options.resourceType,
        format: options.format,
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve(result.secure_url);
        else reject(new Error('No result from Cloudinary'));
      },
    );
    stream.end(buffer);
  });
}

/**
 * Delete a resource from Cloudinary by public ID.
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'raw',
): Promise<void> {
  initCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Delete all resources in a folder.
 */
export async function deleteCloudinaryFolder(folder: string): Promise<void> {
  initCloudinary();
  try {
    await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: 'raw' });
    await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: 'image' });
    await cloudinary.api.delete_folder(folder);
  } catch {
    // Folder might not exist — that's fine
  }
}

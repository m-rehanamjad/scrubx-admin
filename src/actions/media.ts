"use server";

import { requireStaff, requireAdmin } from "@/lib/auth-guard";
import { imagekit } from "@/lib/imagekit";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface ServerUploadResult {
  success: boolean;
  data?: {
    fileId: string;
    url: string;
    thumbnailUrl: string;
    name: string;
    size?: number;
  };
  error?: string;
}

/**
 * Server Action: Upload media asset directly through the Next.js server runtime.
 * Useful for server-side processing or background tasks.
 */
export async function uploadServerMediaAction(
  formData: FormData,
  folder: string = "/scrubx/products"
): Promise<ServerUploadResult> {
  try {
    // 1. Authorize user
    await requireStaff();

    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string") {
      return { success: false, error: "No valid file payload received." };
    }

    // 2. Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Unsupported file type '${file.type}'. Allowed: JPEG, PNG, WebP, AVIF, SVG.`,
      };
    }

    // 3. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 5MB limit.`,
      };
    }

    // 4. Sanitize and prepare file name
    const sanitizedName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .replace(/-+/g, "-");
    const fileName = `${Date.now()}-${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 5. Upload via ImageKit SDK
    const uploadRes = await imagekit.upload({
      file: buffer,
      fileName,
      folder,
      useUniqueFileName: true,
    });

    return {
      success: true,
      data: {
        fileId: uploadRes.fileId,
        url: uploadRes.url,
        thumbnailUrl: uploadRes.thumbnailUrl,
        name: uploadRes.name,
        size: uploadRes.size,
      },
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[uploadServerMediaAction Error]:", error);
    return { success: false, error: error.message || "Server upload failed." };
  }
}

/**
 * Server Action: Permanently delete an asset from ImageKit.
 * Restricted to administrative users.
 */
export async function deleteMediaAction(fileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    if (!fileId || typeof fileId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return { success: false, error: "Invalid ImageKit file identifier." };
    }

    await imagekit.deleteFile(fileId);
    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[deleteMediaAction Error for file ${fileId}]:`, error);
    return { success: false, error: error.message || "Failed to delete file from ImageKit." };
  }
}

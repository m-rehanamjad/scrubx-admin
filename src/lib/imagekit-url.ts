/**
 * ImageKit URL Transformation & Delivery Utility
 *
 * Constructs optimized edge-transformed CDN URLs for responsive image delivery,
 * format auto-selection (WebP/AVIF), dimension resizing, and quality compression.
 */

export interface ImageKitTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 1 to 100
  format?: "auto" | "webp" | "avif" | "png" | "jpg";
  crop?: "maintain_ratio" | "force" | "at_least" | "at_max";
  blur?: number;
  aspectRatio?: string; // e.g. "1-1", "16-9"
}

function getEndpoint(): string {
  return (
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "") ||
    "https://ik.imagekit.io/scrubxpk"
  );
}

/**
 * Transforms an image path or ImageKit URL with specified optimization parameters.
 * Preserves external URLs and local paths without error.
 */
export function getImageKitUrl(
  pathOrUrl: string | null | undefined,
  options: ImageKitTransformOptions = {}
): string {
  if (!pathOrUrl) return "";

  const endpoint = getEndpoint();
  const isImageKitUrl = pathOrUrl.startsWith(endpoint) || pathOrUrl.includes("ik.imagekit.io");
  const isRelative = pathOrUrl.startsWith("/") && !pathOrUrl.startsWith("//");

  // Build transformation string (ImageKit standard path format: tr:w-...,h-...)
  const trParts: string[] = [];
  if (options.width) trParts.push(`w-${options.width}`);
  if (options.height) trParts.push(`h-${options.height}`);
  if (options.quality) trParts.push(`q-${options.quality}`);
  if (options.format) trParts.push(`f-${options.format}`);
  if (options.crop) trParts.push(`c-${options.crop}`);
  if (options.blur) trParts.push(`bl-${options.blur}`);
  if (options.aspectRatio) trParts.push(`ar-${options.aspectRatio}`);

  if (trParts.length === 0) {
    if (isRelative && !pathOrUrl.startsWith("/products/") && !pathOrUrl.startsWith("/proofs/")) {
      return `${endpoint}${pathOrUrl}`;
    }
    return pathOrUrl;
  }

  const trString = `tr:${trParts.join(",")}`;

  // 1. If it starts with our configured endpoint
  if (pathOrUrl.startsWith(endpoint)) {
    const afterEndpoint = pathOrUrl.slice(endpoint.length);
    const cleanPath = afterEndpoint.replace(/^\/tr:[^/]+/, "");
    const formattedPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
    return `${endpoint}/${trString}${formattedPath}`;
  }

  // 2. If it's another ImageKit URL
  if (isImageKitUrl) {
    if (pathOrUrl.includes("/tr:")) {
      return pathOrUrl.replace(/\/tr:[^/]+/, `/${trString}`);
    }
    try {
      const urlObj = new URL(pathOrUrl);
      const segments = urlObj.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const id = segments[0];
        const rest = segments.slice(1).join("/");
        return `${urlObj.origin}/${id}/${trString}/${rest}${urlObj.search}`;
      }
      return `${urlObj.origin}/${trString}${urlObj.pathname}${urlObj.search}`;
    } catch {
      return pathOrUrl;
    }
  }

  // 3. If it's a relative ImageKit path (e.g. "/scrubx/products/file.jpg" or "scrubx/products/file.jpg")
  if (pathOrUrl.startsWith("/scrubx/") || pathOrUrl.startsWith("scrubx/")) {
    const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${endpoint}/${trString}${cleanPath}`;
  }

  // Fallback for non-ImageKit URLs
  return pathOrUrl;
}

/**
 * Thumbnail preset: 150x150 square, WebP/AVIF auto, quality 80
 */
export function getImageThumbnailUrl(url: string | null | undefined, size: number = 150): string {
  return getImageKitUrl(url, {
    width: size,
    height: size,
    crop: "maintain_ratio",
    quality: 80,
    format: "auto",
  });
}

/**
 * Product card preset: 400x500 portrait, WebP/AVIF auto, quality 85
 */
export function getProductCardImageUrl(url: string | null | undefined): string {
  return getImageKitUrl(url, {
    width: 400,
    height: 500,
    crop: "maintain_ratio",
    quality: 85,
    format: "auto",
  });
}

/**
 * Product detail hero preset: 800x1000 high-res, WebP/AVIF auto, quality 90
 */
export function getProductHeroImageUrl(url: string | null | undefined): string {
  return getImageKitUrl(url, {
    width: 800,
    height: 1000,
    crop: "maintain_ratio",
    quality: 90,
    format: "auto",
  });
}

/**
 * Category banner preset: 600x300 landscape, WebP/AVIF auto, quality 85
 */
export function getCategoryBannerUrl(url: string | null | undefined): string {
  return getImageKitUrl(url, {
    width: 600,
    height: 300,
    crop: "maintain_ratio",
    quality: 85,
    format: "auto",
  });
}

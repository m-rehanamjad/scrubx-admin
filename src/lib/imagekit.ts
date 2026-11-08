import ImageKit from "imagekit";

// 1. Strict Server-Side Boundary Guard
if (typeof window !== "undefined") {
  throw new Error(
    "Security Violation: ImageKit server SDK cannot be imported into client components. Keep private credentials strictly on the server."
  );
}

let _instance: ImageKit | null = null;

/**
 * Returns or initializes the ImageKit server singleton
 */
export function getImageKitInstance(): ImageKit {
  if (_instance) return _instance;

  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

  if (!privateKey) {
    throw new Error("Missing required environment variable: IMAGEKIT_PRIVATE_KEY");
  }

  if (!publicKey) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY");
  }

  if (!urlEndpoint) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT");
  }

  _instance = new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });

  return _instance;
}

/**
 * Server-side ImageKit SDK Singleton Proxy.
 * Lazily evaluates environment variables upon first method call.
 */
export const imagekit: ImageKit = new Proxy({} as ImageKit, {
  get(_target, prop) {
    const instance = getImageKitInstance();
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export default imagekit;

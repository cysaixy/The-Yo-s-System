import crypto from "node:crypto";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadProductImage(req, res, next) {
  try {
    const { dataUrl } = req.body || {};
    const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: "Choose a JPG, PNG, or WebP image." });
    if (!ALLOWED_TYPES.has(match[1])) return res.status(400).json({ error: "Unsupported image type." });
    if (Buffer.byteLength(match[2], "base64") > MAX_IMAGE_BYTES) return res.status(400).json({ error: "Image must be 5 MB or smaller." });

    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
    if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: "Image upload is not configured yet." });

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "the-yos/products";
    const signature = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
    const payload = new URLSearchParams({ file: dataUrl, api_key: apiKey, timestamp: String(timestamp), folder, signature });
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: payload });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Cloudinary rejected the image.");
    return res.status(201).json({ image_url: result.secure_url, public_id: result.public_id });
  } catch (error) { next(error); }
}

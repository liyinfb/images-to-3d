/**
 * AI Texture Generation Service
 *
 * Uses the built-in image generation API to create multi-view texture views
 * from a single source photo. The source photo shows the front of the object;
 * the AI generates plausible back, left, and right views.
 *
 * These views are then composited into a 2x2 texture atlas:
 *   ┌───────┬───────┐
 *   │ Front │ Right │
 *   ├───────┼───────┤
 *   │ Back  │ Left  │
 *   └───────┴───────┘
 *
 * The UV mapping in textureApply.ts uses vertex normals to determine which
 * quadrant of the atlas each face should sample from, creating a seamless
 * wrap-around texture.
 */

import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import sharp from "sharp";

const TILE_SIZE = 512;
const ATLAS_SIZE = TILE_SIZE * 2; // 1024x1024

/**
 * Upload a buffer to S3 and return the URL (needed to pass images to generateImage)
 */
async function uploadBufferForAI(buffer: Buffer, filename: string): Promise<string> {
  const key = `temp-ai-texture/${Date.now()}-${filename}`;
  const { url } = await storagePut(key, buffer, "image/png");
  return url;
}

/**
 * Download an image from a URL and return it as a Buffer
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Resize an image buffer to a square tile using sharp
 */
async function resizeToTile(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(TILE_SIZE, TILE_SIZE, { fit: "cover" })
    .png()
    .toBuffer();
}

/**
 * Create a solid gray tile as fallback
 */
async function createGrayTile(): Promise<Buffer> {
  return sharp({
    create: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

/**
 * Generate a multi-view texture atlas from a source image.
 *
 * Takes the front-facing photo and uses AI to generate back, left, and right views,
 * then composites them into a 2x2 atlas texture.
 *
 * Returns the atlas as a PNG buffer.
 */
export async function generateMultiViewTexture(
  sourceImageBuffer: Buffer,
  onProgress?: (message: string) => void
): Promise<Buffer> {
  const log = (msg: string) => {
    console.log(`[AI Texture] ${msg}`);
    onProgress?.(msg);
  };

  log("Uploading source image for AI processing...");
  const sourceUrl = await uploadBufferForAI(sourceImageBuffer, "source.png");

  // Generate all three views in parallel
  log("Generating back view...");
  log("Generating right side view...");
  log("Generating left side view...");

  const [backView, rightView, leftView] = await Promise.all([
    generateImage({
      prompt: "Show the back view of this exact same object/character. Rotate it 180 degrees to show what the back looks like. Keep the same style, colors, proportions, and lighting. Plain white background. No other objects.",
      originalImages: [{ url: sourceUrl, mimeType: "image/png" }],
    }).catch(err => {
      console.warn("[AI Texture] Back view generation failed:", err.message);
      return null;
    }),
    generateImage({
      prompt: "Show the right side view of this exact same object/character. Rotate it 90 degrees clockwise to show the right side profile. Keep the same style, colors, proportions, and lighting. Plain white background. No other objects.",
      originalImages: [{ url: sourceUrl, mimeType: "image/png" }],
    }).catch(err => {
      console.warn("[AI Texture] Right view generation failed:", err.message);
      return null;
    }),
    generateImage({
      prompt: "Show the left side view of this exact same object/character. Rotate it 90 degrees counter-clockwise to show the left side profile. Keep the same style, colors, proportions, and lighting. Plain white background. No other objects.",
      originalImages: [{ url: sourceUrl, mimeType: "image/png" }],
    }).catch(err => {
      console.warn("[AI Texture] Left view generation failed:", err.message);
      return null;
    }),
  ]);

  log("Downloading generated views...");

  // Download all generated images
  const [backBuffer, rightBuffer, leftBuffer] = await Promise.all([
    backView?.url ? downloadImage(backView.url) : null,
    rightView?.url ? downloadImage(rightView.url) : null,
    leftView?.url ? downloadImage(leftView.url) : null,
  ]);

  log("Compositing texture atlas...");

  // Resize all tiles to TILE_SIZE x TILE_SIZE
  const grayTile = await createGrayTile();

  const frontTile = await resizeToTile(sourceImageBuffer);
  const backTile = backBuffer ? await resizeToTile(backBuffer) : grayTile;
  const rightTile = rightBuffer ? await resizeToTile(rightBuffer) : grayTile;
  const leftTile = leftBuffer ? await resizeToTile(leftBuffer) : grayTile;

  // Composite into 2x2 atlas using sharp
  // Layout: Front(TL), Right(TR), Back(BL), Left(BR)
  const atlas = await sharp({
    create: {
      width: ATLAS_SIZE,
      height: ATLAS_SIZE,
      channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
  })
    .composite([
      { input: frontTile, left: 0, top: 0 },
      { input: rightTile, left: TILE_SIZE, top: 0 },
      { input: backTile, left: 0, top: TILE_SIZE },
      { input: leftTile, left: TILE_SIZE, top: TILE_SIZE },
    ])
    .png()
    .toBuffer();

  log(`Texture atlas generated (${atlas.length} bytes)`);
  return atlas;
}

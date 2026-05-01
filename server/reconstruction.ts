/**
 * 3D Reconstruction Service
 *
 * Supports two modes:
 * 1. Single-image: Uses frogleo/Image-to-3D (primary) with TRELLIS fallback
 * 2. Multi-image: Uses TRELLIS community space which supports multi-view gallery input
 *
 * Primary Space: https://huggingface.co/spaces/frogleo/Image-to-3D
 * Multi-view Space: https://huggingface.co/spaces/trellis-community/TRELLIS
 */

// Primary space (frogleo/Image-to-3D - Gradio 4.x, no prefix needed)
const PRIMARY_SPACE_URL = "https://frogleo-image-to-3d.hf.space";

// TRELLIS space (Gradio 5.x, needs /gradio_api/ prefix) - supports multi-image
const TRELLIS_SPACE_URL = "https://trellis-community-trellis.hf.space";

/**
 * Upload a file to a Gradio space
 */
async function uploadToSpace(
  spaceUrl: string,
  imageBuffer: Buffer,
  filename: string,
  useGradioApiPrefix: boolean = false
): Promise<string[]> {
  const uploadUrl = useGradioApiPrefix
    ? `${spaceUrl}/gradio_api/upload`
    : `${spaceUrl}/upload`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("files", blob, filename);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }

  return await response.json();
}

/**
 * Upload multiple files to a Gradio space
 */
async function uploadMultipleToSpace(
  spaceUrl: string,
  images: { buffer: Buffer; filename: string }[],
  useGradioApiPrefix: boolean = false
): Promise<string[]> {
  const uploadUrl = useGradioApiPrefix
    ? `${spaceUrl}/gradio_api/upload`
    : `${spaceUrl}/upload`;

  const formData = new FormData();
  for (const img of images) {
    const blob = new Blob([new Uint8Array(img.buffer)], { type: "image/png" });
    formData.append("files", blob, img.filename);
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Multi-upload failed: ${response.status} ${text}`);
  }

  return await response.json();
}

/**
 * Submit a job to a Gradio queue and wait for the result via SSE
 */
async function submitAndWait(
  spaceUrl: string,
  fnIndex: number,
  data: any[],
  sessionHash: string,
  timeoutMs: number = 5 * 60 * 1000,
  useGradioApiPrefix: boolean = false,
  onProgress?: (message: string) => void
): Promise<any> {
  const baseUrl = useGradioApiPrefix ? `${spaceUrl}/gradio_api` : spaceUrl;

  // Join queue
  const joinResponse = await fetch(`${baseUrl}/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data,
      fn_index: fnIndex,
      session_hash: sessionHash,
      event_data: null,
    }),
  });

  if (!joinResponse.ok) {
    const text = await joinResponse.text();
    throw new Error(`Queue join failed: ${joinResponse.status} ${text}`);
  }

  const { event_id: eventId } = await joinResponse.json();
  console.log(`[Reconstruction] Queued fn_index=${fnIndex}, event_id=${eventId}`);

  // Listen for result via SSE
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    fetch(`${baseUrl}/queue/data?session_hash=${sessionHash}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          clearTimeout(timer);
          reject(new Error(`SSE connection failed: ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              let eventData: any;
              try {
                eventData = JSON.parse(line.slice(6));
              } catch {
                continue;
              }

              if (eventData.event_id !== eventId) continue;

              switch (eventData.msg) {
                case "process_completed":
                  clearTimeout(timer);
                  reader.cancel().catch(() => {});

                  if (eventData.success === false) {
                    reject(new Error(eventData.output?.error || "Processing failed"));
                  } else {
                    resolve(eventData.output);
                  }
                  return;

                case "process_starts":
                  console.log(`[Reconstruction] Processing started`);
                  onProgress?.("Generating 3D model...");
                  break;

                case "estimation":
                  const eta = Math.ceil(eventData.rank_eta || 0);
                  console.log(`[Reconstruction] Queue rank=${eventData.rank}, eta=${eta}s`);
                  onProgress?.(`In queue (position ${(eventData.rank || 0) + 1}, ~${eta}s remaining)`);
                  break;
              }
            }
          }

          clearTimeout(timer);
          reject(new Error("SSE stream ended without result"));
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Download a file from a Gradio space
 */
async function downloadFile(spaceUrl: string, filePath: string): Promise<Buffer> {
  let url: string;
  if (filePath.startsWith("http")) {
    url = filePath;
  } else if (filePath.startsWith("/static/")) {
    // Static files are served directly at the path
    url = `${spaceUrl}${filePath}`;
  } else if (filePath.startsWith("/tmp/") || filePath.startsWith("/")) {
    // Temp files need the /file= prefix
    url = `${spaceUrl}/file=${filePath}`;
  } else {
    url = `${spaceUrl}/${filePath}`;
  }

  console.log(`[Reconstruction] Downloading from: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    // Try alternative URL format
    const altUrl = filePath.startsWith("/")
      ? `${spaceUrl}${filePath}`
      : `${spaceUrl}/file=${filePath}`;
    console.log(`[Reconstruction] Retrying with: ${altUrl}`);
    const altResponse = await fetch(altUrl);
    if (!altResponse.ok) {
      throw new Error(`Download failed: ${response.status} from ${url}, alt: ${altResponse.status}`);
    }
    return Buffer.from(await altResponse.arrayBuffer());
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Find GLB path from output data
 */
function findGlbPath(outputData: any[]): string | null {
  for (const item of outputData) {
    if (!item) continue;
    if (typeof item === "string" && item.includes(".glb")) {
      return item;
    }
    if (typeof item === "object") {
      const p = item.path || item.url || (item.value && (item.value.path || item.value.url));
      if (p && typeof p === "string" && p.includes(".glb")) {
        return p;
      }
    }
  }
  return null;
}

export interface ReconstructionResult {
  glbBuffer: Buffer;
  filename: string;
}

/**
 * Single-image reconstruction using frogleo/Image-to-3D space.
 * Simple single-call API with no session management needed.
 */
async function reconstructSingleImage(
  imageBuffer: Buffer,
  filename: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  const sessionHash = `primary_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  onProgress?.(10, "Uploading image...");

  // Upload image
  const paths = await uploadToSpace(PRIMARY_SPACE_URL, imageBuffer, filename, false);
  if (!paths || paths.length === 0) throw new Error("Upload failed");
  const filePath = paths[0];
  console.log("[Reconstruction] Primary: uploaded to", filePath);

  onProgress?.(20, "Starting 3D reconstruction...");

  // Build image reference
  const imageRef = {
    path: filePath,
    url: `${PRIMARY_SPACE_URL}/file=${filePath}`,
    orig_name: filename,
    size: imageBuffer.length,
    mime_type: "image/png",
    meta: { _type: "gradio.FileData" },
  };

  // Call gen_shape (fn_index=1)
  const result = await submitAndWait(
    PRIMARY_SPACE_URL,
    1,
    [imageRef, 5, 5.5, 1234, 256, 8000, 10000, true],
    sessionHash,
    3 * 60 * 1000,
    false,
    (msg) => onProgress?.(40, msg)
  );

  onProgress?.(80, "Downloading 3D model...");

  const outputData = result?.data || [];
  console.log("[Reconstruction] Primary: generation complete, outputs:", outputData.length);

  // Output[2] is the GLB path
  let glbPath = findGlbPath(outputData);

  // Check output[2] specifically
  if (!glbPath && outputData[2] && typeof outputData[2] === "string" && outputData[2].includes(".glb")) {
    glbPath = outputData[2];
  }

  if (!glbPath) {
    console.error("[Reconstruction] Primary: no GLB found in outputs:", JSON.stringify(outputData).substring(0, 500));
    throw new Error("No GLB file found in reconstruction output");
  }

  console.log("[Reconstruction] Primary: downloading GLB from", glbPath);
  const glbBuffer = await downloadFile(PRIMARY_SPACE_URL, glbPath);

  if (!glbBuffer || glbBuffer.length === 0) {
    throw new Error("Downloaded GLB file is empty");
  }

  onProgress?.(100, "3D model ready!");

  return {
    glbBuffer,
    filename: `model_${Date.now()}.glb`,
  };
}

/**
 * Multi-image reconstruction using TRELLIS community space.
 * Uses the gallery input (component 8) and preprocess_images (fn=9).
 *
 * TRELLIS generate_and_extract_glb (fn=11) inputs:
 *   [image(6), gallery(8), state(39), seed(11), guidance_strength(15),
 *    sampling_steps(16), guidance_strength_2(20), sampling_steps_2(21),
 *    multi_image_algorithm(23), simplify(27), texture_size(28)]
 */
async function reconstructMultiImage(
  images: { buffer: Buffer; filename: string }[],
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  const sessionHash = `trellis_multi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  onProgress?.(5, "Uploading images to TRELLIS...");

  // Upload all images
  const paths = await uploadMultipleToSpace(TRELLIS_SPACE_URL, images, true);
  if (!paths || paths.length === 0) throw new Error("Multi-image upload failed");
  console.log(`[Reconstruction] Multi: uploaded ${paths.length} images`);

  onProgress?.(15, "Initializing GPU session...");

  // Start session (fn=4)
  await submitAndWait(TRELLIS_SPACE_URL, 4, [], sessionHash, 30_000, true);

  onProgress?.(20, "Preprocessing images...");

  // Build gallery references
  const galleryRefs = paths.map((filePath, i) => ({
    image: {
      path: filePath,
      url: `${TRELLIS_SPACE_URL}/file=${filePath}`,
      orig_name: images[i].filename,
      size: images[i].buffer.length,
      mime_type: "image/png",
      meta: { _type: "gradio.FileData" },
    },
    caption: null,
  }));

  // Preprocess images (fn=9) - takes gallery component
  const preprocessResult = await submitAndWait(
    TRELLIS_SPACE_URL,
    9,
    [galleryRefs],
    sessionHash,
    60_000,
    true
  );
  const preprocessedGallery = preprocessResult?.data?.[0] || galleryRefs;
  console.log("[Reconstruction] Multi: images preprocessed");

  onProgress?.(30, "Generating 3D model from multiple views (1-3 minutes)...");

  // Generate 3D model (fn=11)
  // Inputs: [image(null for multi), gallery, state(null), seed, guidance1, steps1, guidance2, steps2, algorithm, simplify, texture_size]
  const genResult = await submitAndWait(
    TRELLIS_SPACE_URL,
    11,
    [
      null,                    // image (component 6) - null for multi-image mode
      preprocessedGallery,    // gallery (component 8) - preprocessed images
      null,                   // state (component 39)
      0,                      // seed (component 11)
      7.5,                    // guidance_strength (component 15)
      12,                     // sampling_steps (component 16)
      3.0,                    // guidance_strength_2 (component 20)
      12,                     // sampling_steps_2 (component 21)
      "stochastic",           // multi_image_algorithm (component 23)
      0.95,                   // simplify (component 27)
      1024,                   // texture_size (component 28)
    ],
    sessionHash,
    5 * 60 * 1000,
    true,
    (msg) => onProgress?.(50, msg)
  );

  onProgress?.(85, "Downloading 3D model...");

  const outputData = genResult?.data || [];
  console.log("[Reconstruction] Multi: generation complete, outputs:", outputData.length);

  // Find GLB in outputs
  let glbPath = findGlbPath(outputData);

  if (!glbPath) {
    // Try downloading each file output and checking for GLB magic bytes
    for (const item of outputData) {
      if (!item || typeof item !== "object") continue;
      const path = item.path || item.url;
      if (!path || typeof path !== "string") continue;
      try {
        const buf = await downloadFile(TRELLIS_SPACE_URL, path);
        if (buf.length > 4 && buf.readUInt32LE(0) === 0x46546c67) {
          return { glbBuffer: buf, filename: `model_multi_${Date.now()}.glb` };
        }
      } catch {
        continue;
      }
    }
    throw new Error("No GLB file found in TRELLIS multi-image output");
  }

  const glbBuffer = await downloadFile(TRELLIS_SPACE_URL, glbPath);
  if (!glbBuffer || glbBuffer.length === 0) throw new Error("Downloaded GLB is empty");

  onProgress?.(100, "3D model ready!");
  return { glbBuffer, filename: `model_multi_${Date.now()}.glb` };
}

/**
 * TRELLIS single-image fallback reconstruction.
 */
async function reconstructWithTrellisSingle(
  imageBuffer: Buffer,
  filename: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  const sessionHash = `trellis_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  onProgress?.(10, "Uploading image (fallback)...");

  // Upload
  const paths = await uploadToSpace(TRELLIS_SPACE_URL, imageBuffer, filename, true);
  if (!paths || paths.length === 0) throw new Error("Upload failed");
  const filePath = paths[0];

  onProgress?.(15, "Initializing GPU session...");

  // Start session
  await submitAndWait(TRELLIS_SPACE_URL, 4, [], sessionHash, 30_000, true);

  onProgress?.(20, "Preprocessing image...");

  // Preprocess single image (fn=8)
  const imageRef = {
    path: filePath,
    url: `${TRELLIS_SPACE_URL}/file=${filePath}`,
    orig_name: filename,
    size: imageBuffer.length,
    mime_type: "image/png",
    meta: { _type: "gradio.FileData" },
  };

  const preprocessResult = await submitAndWait(TRELLIS_SPACE_URL, 8, [imageRef], sessionHash, 60_000, true);
  const preprocessedImage = preprocessResult?.data?.[0] || imageRef;

  onProgress?.(30, "Generating 3D model (1-3 minutes)...");

  // Generate with single image
  const genResult = await submitAndWait(
    TRELLIS_SPACE_URL,
    11,
    [preprocessedImage, [], null, 0, 7.5, 12, 3.0, 12, "stochastic", 0.95, 1024],
    sessionHash,
    5 * 60 * 1000,
    true,
    (msg) => onProgress?.(50, msg)
  );

  onProgress?.(85, "Downloading 3D model...");

  const outputData = genResult?.data || [];
  let glbPath = findGlbPath(outputData);

  if (!glbPath) {
    for (const item of outputData) {
      if (!item || typeof item !== "object") continue;
      const path = item.path || item.url;
      if (!path || typeof path !== "string") continue;
      try {
        const buf = await downloadFile(TRELLIS_SPACE_URL, path);
        if (buf.length > 4 && buf.readUInt32LE(0) === 0x46546c67) {
          return { glbBuffer: buf, filename: `model_${Date.now()}.glb` };
        }
      } catch {
        continue;
      }
    }
    throw new Error("No GLB file found in TRELLIS output");
  }

  const glbBuffer = await downloadFile(TRELLIS_SPACE_URL, glbPath);
  if (!glbBuffer || glbBuffer.length === 0) throw new Error("Downloaded GLB is empty");

  onProgress?.(100, "3D model ready!");
  return { glbBuffer, filename: `model_${Date.now()}.glb` };
}

/**
 * Main reconstruction function for single image with automatic fallback.
 */
export async function reconstructImage(
  imageBuffer: Buffer,
  filename: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  // Try primary space first
  try {
    onProgress?.(5, "Connecting to reconstruction service...");
    return await reconstructSingleImage(imageBuffer, filename, onProgress);
  } catch (primaryError) {
    const errorMsg = (primaryError as Error).message;
    console.error("[Reconstruction] Primary failed:", errorMsg);

    // If it's a quota error or service unavailable, try fallback
    if (
      errorMsg.includes("GPU quota") ||
      errorMsg.includes("503") ||
      errorMsg.includes("502") ||
      errorMsg.includes("timeout") ||
      errorMsg.includes("SSE") ||
      errorMsg.includes("Upload failed")
    ) {
      console.log("[Reconstruction] Trying fallback (TRELLIS single)...");
      onProgress?.(5, "Primary service busy, trying alternative...");

      try {
        return await reconstructWithTrellisSingle(imageBuffer, filename, onProgress);
      } catch (fallbackError) {
        const fbMsg = (fallbackError as Error).message;
        console.error("[Reconstruction] Fallback also failed:", fbMsg);

        if (fbMsg.includes("GPU quota")) {
          throw new Error(
            "Both reconstruction services have exceeded their GPU quota. " +
            "This is a limitation of free HuggingFace Spaces. Please try again in a few hours."
          );
        }
        throw new Error(
          `Reconstruction failed on both services. Primary: ${errorMsg}. Fallback: ${fbMsg}`
        );
      }
    }

    if (errorMsg.includes("GPU quota")) {
      throw new Error(
        "The reconstruction service has exceeded its GPU quota. " +
        "This is a limitation of free HuggingFace Spaces. Please try again in a few hours."
      );
    }

    throw primaryError;
  }
}

/**
 * Multi-image reconstruction function.
 * Uses TRELLIS which natively supports multi-view input.
 * Falls back to frogleo single-image using the primary (first) image if TRELLIS is unavailable.
 */
export async function reconstructMultipleImages(
  images: { buffer: Buffer; filename: string }[],
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  if (images.length === 0) {
    throw new Error("At least one image is required");
  }

  if (images.length === 1) {
    // For single image, use the standard pipeline with fallback
    return reconstructImage(images[0].buffer, images[0].filename, onProgress);
  }

  // For multiple images, try TRELLIS multi-view first, then fall back to frogleo with primary image
  onProgress?.(5, "Connecting to multi-view reconstruction service...");
  try {
    return await reconstructMultiImage(images, onProgress);
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error("[Reconstruction] Multi-image TRELLIS failed:", errorMsg);

    // Fall back to single-image reconstruction using the primary (first) image
    console.log("[Reconstruction] Falling back to single-image mode with primary image...");
    onProgress?.(10, "Multi-view service unavailable, using primary image for reconstruction...");

    try {
      return await reconstructSingleImage(images[0].buffer, images[0].filename, onProgress);
    } catch (fallbackError) {
      const fbMsg = (fallbackError as Error).message;
      console.error("[Reconstruction] Single-image fallback also failed:", fbMsg);

      if (fbMsg.includes("GPU quota") || errorMsg.includes("GPU quota")) {
        throw new Error(
          "Both reconstruction services have exceeded their GPU quota. " +
          "This is a limitation of free HuggingFace Spaces. Please try again in a few hours."
        );
      }

      throw new Error(
        `Multi-view failed: ${errorMsg}. Single-image fallback also failed: ${fbMsg}`
      );
    }
  }
}

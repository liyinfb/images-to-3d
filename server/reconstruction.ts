/**
 * 3D Reconstruction Service
 *
 * Integrates with the TRELLIS model on Hugging Face via the Gradio HTTP API
 * to convert 2D images into 3D GLB models.
 *
 * API Discovery (from /config):
 *   fn_index=4:  start_session (inputs=0)
 *   fn_index=8:  preprocess_image (inputs=[image])
 *   fn_index=11: generate_and_extract_glb (11 inputs, 4 outputs)
 *
 * generate_and_extract_glb inputs (11 total):
 *   [0] image (comp 6) - preprocessed image
 *   [1] gallery (comp 8) - multi-image gallery (empty for single)
 *   [2] state (comp 39) - session state (null)
 *   [3] seed slider (comp 11) - seed (0 = random)
 *   [4] guidance_strength slider (comp 15) - default 7.5
 *   [5] sampling_steps slider (comp 16) - default 12
 *   [6] slat_guidance slider (comp 20) - default 3.0
 *   [7] slat_sampling slider (comp 21) - default 12
 *   [8] multi_image_mode radio (comp 23) - "stochastic"
 *   [9] simplify slider (comp 27) - default 0.95
 *   [10] texture_size slider (comp 28) - default 1024
 *
 * Outputs: [state, video, litmodel3d(GLB), downloadbutton(GLB file)]
 */

const HF_SPACE_URL = "https://trellis-community-trellis.hf.space";

interface GradioUploadResponse {
  path: string;
  url: string;
  size: number;
  orig_name: string;
  mime_type: string;
}

interface GradioApiResponse {
  data: any[];
  is_generating: boolean;
  duration: number;
  average_duration: number;
}

/**
 * Upload a file to the Gradio space
 */
async function uploadToGradio(
  imageBuffer: Buffer,
  filename: string
): Promise<GradioUploadResponse[]> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
  formData.append("files", blob, filename);

  const response = await fetch(`${HF_SPACE_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload to Gradio: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Call a Gradio API endpoint via queue and wait for the result via SSE
 */
async function callGradioApi(
  fnIndex: number,
  data: any[],
  sessionHash: string
): Promise<GradioApiResponse> {
  // Join the queue
  const joinResponse = await fetch(`${HF_SPACE_URL}/queue/join`, {
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
    throw new Error(`Failed to join queue: ${joinResponse.status} ${text}`);
  }

  const joinResult = await joinResponse.json();
  const eventId = joinResult.event_id;

  // Stream results via SSE
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Reconstruction timed out after 8 minutes"));
    }, 8 * 60 * 1000);

    const eventSource = `${HF_SPACE_URL}/queue/data?session_hash=${sessionHash}`;

    fetch(eventSource, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          clearTimeout(timeout);
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
              if (line.startsWith("data: ")) {
                try {
                  const eventData = JSON.parse(line.slice(6));

                  if (eventData.event_id !== eventId) continue;

                  if (eventData.msg === "process_completed") {
                    clearTimeout(timeout);
                    reader.cancel();
                    if (eventData.output?.error) {
                      reject(new Error(eventData.output.error));
                    } else {
                      resolve(eventData.output as GradioApiResponse);
                    }
                    return;
                  }

                  if (eventData.msg === "process_starts") {
                    console.log("[Reconstruction] Processing started...");
                  }

                  if (eventData.msg === "estimation") {
                    console.log(
                      `[Reconstruction] Queue position: ${eventData.rank}, ETA: ${eventData.rank_eta}s`
                    );
                  }
                } catch {
                  // Skip malformed JSON lines
                }
              }
            }
          }
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      })
      .catch((e) => {
        clearTimeout(timeout);
        reject(e);
      });
  });
}

/**
 * Download a file from the Gradio space
 */
async function downloadFromGradio(filePath: string): Promise<Buffer> {
  const url = filePath.startsWith("http")
    ? filePath
    : `${HF_SPACE_URL}/file=${filePath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ReconstructionResult {
  glbBuffer: Buffer;
  filename: string;
}

/**
 * Find a GLB file reference in the Gradio response data.
 * The output format varies; we check multiple patterns.
 */
function findGlbInResponse(data: any[]): string | null {
  for (const item of data) {
    if (!item) continue;

    // Direct file reference with .glb path
    if (typeof item === "object") {
      // Check top-level path/url
      for (const key of ["path", "url", "name"]) {
        const val = item[key];
        if (typeof val === "string" && val.includes(".glb")) return val;
      }

      // Check value.path / value.url
      if (item.value && typeof item.value === "object") {
        for (const key of ["path", "url", "name"]) {
          const val = item.value[key];
          if (typeof val === "string" && val.includes(".glb")) return val;
        }
      }

      // Check orig_name
      if (item.orig_name && typeof item.orig_name === "string" && item.orig_name.includes(".glb")) {
        return item.path || item.url || null;
      }
    }

    // Direct URL string
    if (typeof item === "string" && item.includes(".glb")) return item;
  }

  return null;
}

/**
 * Main reconstruction function.
 * Takes an image buffer and returns a GLB model buffer.
 */
export async function reconstructImage(
  imageBuffer: Buffer,
  filename: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ReconstructionResult> {
  const sessionHash = Math.random().toString(36).substring(2, 15);

  onProgress?.(5, "Uploading image to reconstruction service...");

  // Step 1: Upload the image
  const uploadResult = await uploadToGradio(imageBuffer, filename);
  if (!uploadResult || uploadResult.length === 0) {
    throw new Error("Failed to upload image");
  }

  const uploadedFile = uploadResult[0];
  console.log("[Reconstruction] Image uploaded:", uploadedFile.path);

  onProgress?.(10, "Starting reconstruction session...");

  // Step 2: Start a session (fn_index=4)
  try {
    await callGradioApi(4, [], sessionHash);
    console.log("[Reconstruction] Session started");
  } catch (e) {
    console.log(
      "[Reconstruction] Session start note:",
      (e as Error).message
    );
  }

  onProgress?.(15, "Preprocessing image...");

  // Step 3: Preprocess the image (fn_index=8)
  const imageRef = {
    path: uploadedFile.path,
    url: uploadedFile.url || `${HF_SPACE_URL}/file=${uploadedFile.path}`,
    orig_name: filename,
    size: uploadedFile.size,
    mime_type: uploadedFile.mime_type || "image/png",
    meta: { _type: "gradio.FileData" },
  };

  let preprocessedImage = imageRef;
  try {
    const preprocessResult = await callGradioApi(8, [imageRef], sessionHash);
    if (preprocessResult.data && preprocessResult.data[0]) {
      preprocessedImage = preprocessResult.data[0];
      console.log("[Reconstruction] Image preprocessed");
    }
  } catch (e) {
    console.log(
      "[Reconstruction] Preprocess skipped:",
      (e as Error).message
    );
  }

  onProgress?.(20, "Generating 3D model (this may take 1-3 minutes)...");

  // Step 4: Generate and extract GLB (fn_index=11)
  // 11 inputs matching the component order from config
  const generationResult = await callGradioApi(
    11,
    [
      preprocessedImage, // [0] image (comp 6)
      [],                // [1] gallery (comp 8) - empty for single image
      null,              // [2] state (comp 39) - session state
      0,                 // [3] seed (comp 11) - 0 = random
      7.5,               // [4] guidance_strength (comp 15)
      12,                // [5] sampling_steps (comp 16)
      3.0,               // [6] slat_guidance (comp 20)
      12,                // [7] slat_sampling (comp 21)
      "stochastic",      // [8] multi_image_mode (comp 23)
      0.95,              // [9] simplify (comp 27)
      1024,              // [10] texture_size (comp 28)
    ],
    sessionHash
  );

  onProgress?.(80, "Downloading 3D model...");

  console.log(
    "[Reconstruction] Generation completed. Output types:",
    generationResult.data?.map((d: any) =>
      d === null ? "null" : typeof d === "object" ? JSON.stringify(Object.keys(d)).substring(0, 80) : typeof d
    )
  );

  // Step 5: Find and download the GLB file from the result
  const glbPath = findGlbInResponse(generationResult.data || []);

  let glbBuffer: Buffer | null = null;

  if (glbPath) {
    glbBuffer = await downloadFromGradio(glbPath);
  } else {
    // Fallback: try each output item that looks like a file
    for (const item of generationResult.data || []) {
      if (!item || typeof item !== "object") continue;
      const path = item.path || item.url;
      if (path && typeof path === "string") {
        try {
          const buf = await downloadFromGradio(path);
          // Check if it starts with glTF magic bytes
          if (buf.length > 4 && buf.readUInt32LE(0) === 0x46546c67) {
            glbBuffer = buf;
            break;
          }
        } catch {
          continue;
        }
      }
    }
  }

  if (!glbBuffer || glbBuffer.length === 0) {
    throw new Error(
      "Failed to extract GLB model from reconstruction result. The service may have returned an unexpected format."
    );
  }

  onProgress?.(100, "3D model ready!");

  return {
    glbBuffer,
    filename: `model_${Date.now()}.glb`,
  };
}

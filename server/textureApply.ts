/**
 * Texture Application Service
 *
 * Takes a geometry-only GLB and a texture image, then:
 * 1. Generates UV coordinates using the selected projection mode
 * 2. Computes vertex normals for proper lighting
 * 3. Embeds the texture image
 * 4. Outputs a fully textured GLB file
 *
 * Projection modes:
 * - "atlas": Multi-view atlas mode. Expects a 2x2 texture atlas with:
 *     ┌───────┬───────┐
 *     │ Front │ Right │
 *     ├───────┼───────┤
 *     │ Back  │ Left  │
 *     └───────┴───────┘
 *   Each face is mapped to the quadrant matching its dominant normal direction.
 *
 * - "triplanar": Legacy triplanar projection from a single image.
 * - "front": Simple front-facing planar projection.
 * - "spherical": Spherical wrapping.
 */

export type ProjectionMode = "atlas" | "triplanar" | "spherical" | "front";

/**
 * Check if a GLB file already has textures/materials embedded.
 */
export function hasExistingTexture(glbBuffer: Buffer): boolean {
  try {
    const { gltf } = parseGlb(glbBuffer);
    if (gltf.materials && gltf.materials.length > 0) {
      for (const mat of gltf.materials) {
        if (mat.pbrMetallicRoughness?.baseColorTexture) return true;
        if (mat.emissiveTexture) return true;
        if (mat.normalTexture) return true;
      }
    }
    if (gltf.images && gltf.images.length > 0) return true;
    if (gltf.textures && gltf.textures.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse a GLB file into its JSON (glTF) and binary chunks
 */
function parseGlb(buffer: Buffer): { gltf: any; binChunk: Buffer } {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a valid GLB file");

  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);

  const chunk0Length = buffer.readUInt32LE(12);
  const chunk0Type = buffer.readUInt32LE(16);
  if (chunk0Type !== 0x4e4f534a) throw new Error("First chunk is not JSON");

  const jsonData = buffer.slice(20, 20 + chunk0Length).toString("utf8");
  const gltf = JSON.parse(jsonData);

  let binChunk = Buffer.alloc(0);
  const chunk1Offset = 20 + chunk0Length;
  if (chunk1Offset + 8 <= buffer.length) {
    const chunk1Length = buffer.readUInt32LE(chunk1Offset);
    const chunk1Type = buffer.readUInt32LE(chunk1Offset + 4);
    if (chunk1Type === 0x004e4942) {
      binChunk = buffer.slice(chunk1Offset + 8, chunk1Offset + 8 + chunk1Length);
    }
  }

  return { gltf, binChunk };
}

/**
 * Read positions from the binary buffer using accessor info
 */
function readPositions(gltf: any, binChunk: Buffer): Float32Array {
  const mesh = gltf.meshes[0];
  const primitive = mesh.primitives[0];
  const posAccessorIdx = primitive.attributes.POSITION;
  const accessor = gltf.accessors[posAccessorIdx];
  const bufferView = gltf.bufferViews[accessor.bufferView];

  const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count * 3; i++) {
    positions[i] = binChunk.readFloatLE(offset + i * 4);
  }

  return positions;
}

/**
 * Read indices from the binary buffer
 */
function readIndices(gltf: any, binChunk: Buffer): Uint32Array | null {
  const mesh = gltf.meshes[0];
  const primitive = mesh.primitives[0];

  if (primitive.indices === undefined) return null;

  const accessor = gltf.accessors[primitive.indices];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;

  const indices = new Uint32Array(count);

  switch (accessor.componentType) {
    case 5121:
      for (let i = 0; i < count; i++) indices[i] = binChunk.readUInt8(offset + i);
      break;
    case 5123:
      for (let i = 0; i < count; i++) indices[i] = binChunk.readUInt16LE(offset + i * 2);
      break;
    case 5125:
      for (let i = 0; i < count; i++) indices[i] = binChunk.readUInt32LE(offset + i * 4);
      break;
  }

  return indices;
}

/**
 * Compute vertex normals from positions and indices
 */
function computeNormals(positions: Float32Array, indices: Uint32Array | null): Float32Array {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);

  const getTriangleCount = () => {
    if (indices) return indices.length / 3;
    return vertexCount / 3;
  };

  const getIndex = (triIdx: number, vertIdx: number) => {
    if (indices) return indices[triIdx * 3 + vertIdx];
    return triIdx * 3 + vertIdx;
  };

  const triCount = getTriangleCount();

  for (let t = 0; t < triCount; t++) {
    const i0 = getIndex(t, 0);
    const i1 = getIndex(t, 1);
    const i2 = getIndex(t, 2);

    const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[i0 * 3] += nx; normals[i0 * 3 + 1] += ny; normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 1e-8) {
      normals[i * 3] /= len;
      normals[i * 3 + 1] /= len;
      normals[i * 3 + 2] /= len;
    }
  }

  return normals;
}

/**
 * Compute the bounding box of positions
 */
function computeBounds(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
} {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX || 1, maxY - minY || 1, maxZ - minZ || 1],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
  };
}

/**
 * Generate atlas UV coordinates for a 2x2 texture atlas.
 *
 * The atlas layout is:
 *   ┌───────┬───────┐
 *   │ Front │ Right │  (top row: v 0.0 to 0.5)
 *   ├───────┼───────┤
 *   │ Back  │ Left  │  (bottom row: v 0.5 to 1.0)
 *   └───────┴───────┘
 *   u: 0.0-0.5  0.5-1.0
 *
 * Each vertex is assigned to a quadrant based on its normal direction:
 * - Front (nz > 0): top-left quadrant
 * - Back (nz < 0): bottom-left quadrant
 * - Right (nx > 0): top-right quadrant
 * - Left (nx < 0): bottom-right quadrant
 * - Top/Bottom: blended between front and back
 *
 * Within each quadrant, the UV is a planar projection from the appropriate axis.
 */
function generateAtlasUVs(positions: Float32Array, normals: Float32Array): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  const bounds = computeBounds(positions);

  // Small margin to prevent sampling from adjacent quadrants
  const MARGIN = 0.02;
  const QUAD_MIN = MARGIN;
  const QUAD_MAX = 0.5 - MARGIN;
  const QUAD_RANGE = QUAD_MAX - QUAD_MIN;

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];

    const absNx = Math.abs(nx);
    const absNy = Math.abs(ny);
    const absNz = Math.abs(nz);

    // Normalized position within bounding box [0, 1]
    const normX = (px - bounds.min[0]) / bounds.size[0];
    const normY = (py - bounds.min[1]) / bounds.size[1];
    const normZ = (pz - bounds.min[2]) / bounds.size[2];

    let u: number, v: number;

    // Determine which quadrant based on dominant normal direction
    if (absNz >= absNx && absNz >= absNy) {
      // Front or Back facing
      // Project onto XY plane
      const localU = QUAD_MIN + normX * QUAD_RANGE;
      const localV = QUAD_MIN + (1 - normY) * QUAD_RANGE; // Flip Y for image coords

      if (nz >= 0) {
        // Front: top-left quadrant (u: 0-0.5, v: 0-0.5)
        u = localU;
        v = localV;
      } else {
        // Back: bottom-left quadrant (u: 0-0.5, v: 0.5-1.0)
        // Mirror X for back view (looking from behind)
        u = QUAD_MIN + (1 - normX) * QUAD_RANGE;
        v = 0.5 + localV;
      }
    } else if (absNx >= absNy && absNx >= absNz) {
      // Right or Left facing
      // Project onto ZY plane
      const localV = QUAD_MIN + (1 - normY) * QUAD_RANGE;

      if (nx > 0) {
        // Right: top-right quadrant (u: 0.5-1.0, v: 0-0.5)
        const localU = QUAD_MIN + (1 - normZ) * QUAD_RANGE;
        u = 0.5 + localU;
        v = localV;
      } else {
        // Left: bottom-right quadrant (u: 0.5-1.0, v: 0.5-1.0)
        const localU = QUAD_MIN + normZ * QUAD_RANGE;
        u = 0.5 + localU;
        v = 0.5 + localV;
      }
    } else {
      // Top or Bottom facing — use front/back projection
      const localU = QUAD_MIN + normX * QUAD_RANGE;
      const localV = QUAD_MIN + (1 - normY) * QUAD_RANGE;

      if (ny >= 0) {
        // Top: map to front quadrant (top-left)
        u = localU;
        v = localV;
      } else {
        // Bottom: map to front quadrant (top-left)
        u = localU;
        v = localV;
      }
    }

    uvs[i * 2] = Math.max(0, Math.min(1, u));
    uvs[i * 2 + 1] = Math.max(0, Math.min(1, v));
  }

  return uvs;
}

/**
 * Generate triplanar UV coordinates (legacy).
 */
function generateTriplanarUVs(positions: Float32Array, normals: Float32Array): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  const bounds = computeBounds(positions);

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const nx = Math.abs(normals[i * 3]);
    const ny = Math.abs(normals[i * 3 + 1]);
    const nz = Math.abs(normals[i * 3 + 2]);

    let u: number, v: number;

    if (nz >= nx && nz >= ny) {
      u = (px - bounds.min[0]) / bounds.size[0];
      v = (py - bounds.min[1]) / bounds.size[1];
    } else if (ny >= nx && ny >= nz) {
      u = (px - bounds.min[0]) / bounds.size[0];
      v = (pz - bounds.min[2]) / bounds.size[2];
    } else {
      u = (pz - bounds.min[2]) / bounds.size[2];
      v = (py - bounds.min[1]) / bounds.size[1];
    }

    uvs[i * 2] = Math.max(0, Math.min(1, u));
    uvs[i * 2 + 1] = Math.max(0, Math.min(1, 1.0 - v));
  }

  return uvs;
}

/**
 * Generate spherical UV coordinates.
 */
function generateSphericalUVs(positions: Float32Array): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  const bounds = computeBounds(positions);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3] - bounds.center[0];
    const y = positions[i * 3 + 1] - bounds.center[1];
    const z = positions[i * 3 + 2] - bounds.center[2];

    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-8) {
      uvs[i * 2] = 0.5;
      uvs[i * 2 + 1] = 0.5;
      continue;
    }

    const theta = Math.atan2(x, z);
    const phi = Math.acos(Math.max(-1, Math.min(1, y / r)));

    uvs[i * 2] = (theta + Math.PI) / (2 * Math.PI);
    uvs[i * 2 + 1] = phi / Math.PI;
  }

  return uvs;
}

/**
 * Generate front-facing planar UV coordinates.
 */
function generateFrontProjectionUVs(positions: Float32Array): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  const bounds = computeBounds(positions);

  const range = Math.max(bounds.size[0], bounds.size[1]);
  const offsetX = (range - bounds.size[0]) / 2;
  const offsetY = (range - bounds.size[1]) / 2;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];

    uvs[i * 2] = (x - bounds.min[0] + offsetX) / range;
    uvs[i * 2 + 1] = 1.0 - (y - bounds.min[1] + offsetY) / range;
  }

  return uvs;
}

/**
 * Build a new GLB with texture applied
 */
export async function applyTextureToGlb(
  glbBuffer: Buffer,
  imageBuffer: Buffer,
  imageMimeType: string = "image/png",
  projectionMode: ProjectionMode = "atlas"
): Promise<Buffer> {
  const { gltf, binChunk } = parseGlb(glbBuffer);

  if (!gltf.meshes || gltf.meshes.length === 0) {
    throw new Error("GLB has no meshes");
  }

  // Read positions
  const positions = readPositions(gltf, binChunk);
  const indices = readIndices(gltf, binChunk);
  const vertexCount = positions.length / 3;

  // Compute normals
  const normals = computeNormals(positions, indices);

  // Generate UVs based on projection mode
  let uvs: Float32Array;
  switch (projectionMode) {
    case "atlas":
      uvs = generateAtlasUVs(positions, normals);
      break;
    case "triplanar":
      uvs = generateTriplanarUVs(positions, normals);
      break;
    case "front":
      uvs = generateFrontProjectionUVs(positions);
      break;
    case "spherical":
      uvs = generateSphericalUVs(positions);
      break;
    default:
      uvs = generateAtlasUVs(positions, normals);
  }

  // Build new binary data: original bin + UVs + normals + image
  const uvBuffer = Buffer.from(uvs.buffer);
  const normalBuffer = Buffer.from(normals.buffer);

  // Align buffers to 4-byte boundaries
  const pad = (size: number) => (4 - (size % 4)) % 4;
  const uvPadding = pad(uvBuffer.length);
  const normalPadding = pad(normalBuffer.length);
  const imagePadding = pad(imageBuffer.length);

  const newBinLength =
    binChunk.length +
    uvBuffer.length + uvPadding +
    normalBuffer.length + normalPadding +
    imageBuffer.length + imagePadding;

  const newBin = Buffer.alloc(newBinLength);
  let offset = 0;

  // Copy original binary data
  binChunk.copy(newBin, offset);
  offset += binChunk.length;

  // UV data
  const uvOffset = offset;
  uvBuffer.copy(newBin, offset);
  offset += uvBuffer.length + uvPadding;

  // Normal data
  const normalOffset = offset;
  normalBuffer.copy(newBin, offset);
  offset += normalBuffer.length + normalPadding;

  // Image data
  const imageOffset = offset;
  imageBuffer.copy(newBin, offset);
  offset += imageBuffer.length + imagePadding;

  // Update glTF JSON
  if (!gltf.bufferViews) gltf.bufferViews = [];
  if (!gltf.accessors) gltf.accessors = [];

  // UV buffer view
  const uvBVIdx = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: uvOffset,
    byteLength: uvBuffer.length,
    target: 34962,
  });

  // Normal buffer view
  const normalBVIdx = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: normalOffset,
    byteLength: normalBuffer.length,
    target: 34962,
  });

  // Image buffer view
  const imageBVIdx = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: imageOffset,
    byteLength: imageBuffer.length,
  });

  // UV accessor
  const uvAccIdx = gltf.accessors.length;
  gltf.accessors.push({
    bufferView: uvBVIdx,
    byteOffset: 0,
    componentType: 5126,
    count: vertexCount,
    type: "VEC2",
    min: [0, 0],
    max: [1, 1],
  });

  // Normal accessor
  const normalAccIdx = gltf.accessors.length;
  gltf.accessors.push({
    bufferView: normalBVIdx,
    byteOffset: 0,
    componentType: 5126,
    count: vertexCount,
    type: "VEC3",
    min: [-1, -1, -1],
    max: [1, 1, 1],
  });

  // Add image
  if (!gltf.images) gltf.images = [];
  const imageIdx = gltf.images.length;
  gltf.images.push({
    bufferView: imageBVIdx,
    mimeType: imageMimeType,
  });

  // Add sampler
  if (!gltf.samplers) gltf.samplers = [];
  const samplerIdx = gltf.samplers.length;
  gltf.samplers.push({
    magFilter: 9729, // LINEAR
    minFilter: 9987, // LINEAR_MIPMAP_LINEAR
    wrapS: 33071,    // CLAMP_TO_EDGE
    wrapT: 33071,    // CLAMP_TO_EDGE
  });

  // Add texture
  if (!gltf.textures) gltf.textures = [];
  const textureIdx = gltf.textures.length;
  gltf.textures.push({
    sampler: samplerIdx,
    source: imageIdx,
  });

  // Add material with unlit extension for photo-accurate appearance
  if (!gltf.materials) gltf.materials = [];
  const materialIdx = gltf.materials.length;

  if (!gltf.extensionsUsed) gltf.extensionsUsed = [];
  if (!gltf.extensionsUsed.includes("KHR_materials_unlit")) {
    gltf.extensionsUsed.push("KHR_materials_unlit");
  }

  gltf.materials.push({
    name: "PhotoTexture",
    pbrMetallicRoughness: {
      baseColorTexture: {
        index: textureIdx,
        texCoord: 0,
      },
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0.0,
      roughnessFactor: 1.0,
    },
    extensions: {
      KHR_materials_unlit: {},
    },
    doubleSided: true,
  });

  // Update mesh primitive
  const primitive = gltf.meshes[0].primitives[0];
  primitive.attributes.TEXCOORD_0 = uvAccIdx;
  primitive.attributes.NORMAL = normalAccIdx;
  primitive.material = materialIdx;

  // Update buffer length
  gltf.buffers[0].byteLength = newBinLength;

  if (!gltf.asset) gltf.asset = {};
  gltf.asset.generator = "3D-Reconstructor-TextureApply";
  gltf.asset.version = "2.0";

  // Serialize new GLB
  const jsonStr = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonStr, "utf8");
  const jsonPadLength = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonBuffer = Buffer.concat([
    jsonBuffer,
    Buffer.alloc(jsonPadLength, 0x20),
  ]);

  const totalLength = 12 + 8 + paddedJsonBuffer.length + 8 + newBinLength;
  const glb = Buffer.alloc(totalLength);

  let pos = 0;

  // Header
  glb.writeUInt32LE(0x46546c67, pos); pos += 4;
  glb.writeUInt32LE(2, pos); pos += 4;
  glb.writeUInt32LE(totalLength, pos); pos += 4;

  // JSON chunk
  glb.writeUInt32LE(paddedJsonBuffer.length, pos); pos += 4;
  glb.writeUInt32LE(0x4e4f534a, pos); pos += 4;
  paddedJsonBuffer.copy(glb, pos); pos += paddedJsonBuffer.length;

  // BIN chunk
  glb.writeUInt32LE(newBinLength, pos); pos += 4;
  glb.writeUInt32LE(0x004e4942, pos); pos += 4;
  newBin.copy(glb, pos);

  return glb;
}

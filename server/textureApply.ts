/**
 * Texture Application Service
 *
 * Takes a geometry-only GLB and a source image, then:
 * 1. Generates UV coordinates using spherical projection
 * 2. Computes vertex normals for proper lighting
 * 3. Embeds the source image as a texture
 * 4. Outputs a fully textured GLB file
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Parse a GLB file into its JSON (glTF) and binary chunks
 */
function parseGlb(buffer: Buffer): { gltf: any; binChunk: Buffer } {
  // Header: magic(4) + version(4) + length(4) = 12 bytes
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a valid GLB file");

  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);

  // Chunk 0: JSON
  const chunk0Length = buffer.readUInt32LE(12);
  const chunk0Type = buffer.readUInt32LE(16);
  if (chunk0Type !== 0x4e4f534a) throw new Error("First chunk is not JSON");

  const jsonData = buffer.slice(20, 20 + chunk0Length).toString("utf8");
  const gltf = JSON.parse(jsonData);

  // Chunk 1: BIN
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

  // Component type: 5121=UNSIGNED_BYTE, 5123=UNSIGNED_SHORT, 5125=UNSIGNED_INT
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
 * Generate spherical UV coordinates from vertex positions.
 * Projects the texture around the model like wrapping a photo around a sphere.
 */
function generateSphericalUVs(positions: Float32Array): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);

  // Find center of the mesh
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3] - cx;
    const y = positions[i * 3 + 1] - cy;
    const z = positions[i * 3 + 2] - cz;

    // Spherical projection
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-8) {
      uvs[i * 2] = 0.5;
      uvs[i * 2 + 1] = 0.5;
      continue;
    }

    // theta: angle around Y axis (longitude) -> U
    const theta = Math.atan2(x, z);
    // phi: angle from Y axis (latitude) -> V
    const phi = Math.acos(Math.max(-1, Math.min(1, y / r)));

    uvs[i * 2] = (theta + Math.PI) / (2 * Math.PI); // U: 0 to 1
    uvs[i * 2 + 1] = phi / Math.PI; // V: 0 to 1
  }

  return uvs;
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
    const cx2 = positions[i2 * 3], cy2 = positions[i2 * 3 + 1], cz2 = positions[i2 * 3 + 2];

    // Edge vectors
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;

    // Cross product (face normal)
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Accumulate to vertices
    normals[i0 * 3] += nx; normals[i0 * 3 + 1] += ny; normals[i0 * 3 + 2] += nz;
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
  }

  // Normalize
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
 * Build a new GLB with texture applied
 */
export async function applyTextureToGlb(
  glbBuffer: Buffer,
  imageBuffer: Buffer,
  imageMimeType: string = "image/png"
): Promise<Buffer> {
  const { gltf, binChunk } = parseGlb(glbBuffer);

  if (!gltf.meshes || gltf.meshes.length === 0) {
    throw new Error("GLB has no meshes");
  }

  // Read positions
  const positions = readPositions(gltf, binChunk);
  const indices = readIndices(gltf, binChunk);
  const vertexCount = positions.length / 3;

  // Generate UVs and normals
  const uvs = generateSphericalUVs(positions);
  const normals = computeNormals(positions, indices);

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

  // Add buffer views for UVs, normals, and image
  const existingBVCount = gltf.bufferViews?.length || 0;
  const existingAccCount = gltf.accessors?.length || 0;

  if (!gltf.bufferViews) gltf.bufferViews = [];
  if (!gltf.accessors) gltf.accessors = [];

  // UV buffer view
  const uvBVIdx = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: uvOffset,
    byteLength: uvBuffer.length,
    target: 34962, // ARRAY_BUFFER
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
    componentType: 5126, // FLOAT
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
    wrapS: 10497, // REPEAT
    wrapT: 10497,
  });

  // Add texture
  if (!gltf.textures) gltf.textures = [];
  const textureIdx = gltf.textures.length;
  gltf.textures.push({
    sampler: samplerIdx,
    source: imageIdx,
  });

  // Add material with the texture
  if (!gltf.materials) gltf.materials = [];
  const materialIdx = gltf.materials.length;
  gltf.materials.push({
    name: "PhotoTexture",
    pbrMetallicRoughness: {
      baseColorTexture: {
        index: textureIdx,
        texCoord: 0,
      },
      metallicFactor: 0.0,
      roughnessFactor: 0.8,
    },
    doubleSided: true,
  });

  // Update mesh primitive to use UVs, normals, and material
  const primitive = gltf.meshes[0].primitives[0];
  primitive.attributes.TEXCOORD_0 = uvAccIdx;
  primitive.attributes.NORMAL = normalAccIdx;
  primitive.material = materialIdx;

  // Update buffer length
  gltf.buffers[0].byteLength = newBinLength;

  // Remove asset generator if present, add our own
  if (!gltf.asset) gltf.asset = {};
  gltf.asset.generator = "3D-Reconstructor-TextureApply";
  gltf.asset.version = "2.0";

  // Serialize new GLB
  const jsonStr = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonStr, "utf8");
  const jsonPadLength = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonBuffer = Buffer.concat([
    jsonBuffer,
    Buffer.alloc(jsonPadLength, 0x20), // pad with spaces
  ]);

  // GLB structure: header(12) + JSON chunk(8 + data) + BIN chunk(8 + data)
  const totalLength = 12 + 8 + paddedJsonBuffer.length + 8 + newBinLength;
  const glb = Buffer.alloc(totalLength);

  let pos = 0;

  // Header
  glb.writeUInt32LE(0x46546c67, pos); pos += 4; // magic "glTF"
  glb.writeUInt32LE(2, pos); pos += 4; // version
  glb.writeUInt32LE(totalLength, pos); pos += 4; // total length

  // JSON chunk
  glb.writeUInt32LE(paddedJsonBuffer.length, pos); pos += 4; // chunk length
  glb.writeUInt32LE(0x4e4f534a, pos); pos += 4; // chunk type "JSON"
  paddedJsonBuffer.copy(glb, pos); pos += paddedJsonBuffer.length;

  // BIN chunk
  glb.writeUInt32LE(newBinLength, pos); pos += 4; // chunk length
  glb.writeUInt32LE(0x004e4942, pos); pos += 4; // chunk type "BIN\0"
  newBin.copy(glb, pos);

  return glb;
}

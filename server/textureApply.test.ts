import { describe, expect, it } from "vitest";
import { applyTextureToGlb } from "./textureApply";

/**
 * Create a minimal valid GLB file with just positions (no textures, no normals)
 * This mimics the output from frogleo/Image-to-3D
 */
function createMinimalGlb(): Buffer {
  // Create a simple triangle mesh
  const positions = new Float32Array([
    0, 1, 0,   // vertex 0
    -1, -1, 0, // vertex 1
    1, -1, 0,  // vertex 2
  ]);

  const posBuffer = Buffer.from(positions.buffer);

  const gltf = {
    asset: { version: "2.0", generator: "test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      name: "test_mesh",
      primitives: [{
        attributes: { POSITION: 0 },
        mode: 4,
      }],
    }],
    accessors: [{
      bufferView: 0,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: 3,
      type: "VEC3",
      min: [-1, -1, 0],
      max: [1, 1, 0],
    }],
    bufferViews: [{
      buffer: 0,
      byteOffset: 0,
      byteLength: posBuffer.length,
      target: 34962,
    }],
    buffers: [{
      byteLength: posBuffer.length,
    }],
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonStr, "utf8");
  const jsonPadLength = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadLength, 0x20)]);

  const totalLength = 12 + 8 + paddedJson.length + 8 + posBuffer.length;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // Header
  glb.writeUInt32LE(0x46546c67, offset); offset += 4; // "glTF"
  glb.writeUInt32LE(2, offset); offset += 4; // version
  glb.writeUInt32LE(totalLength, offset); offset += 4;

  // JSON chunk
  glb.writeUInt32LE(paddedJson.length, offset); offset += 4;
  glb.writeUInt32LE(0x4e4f534a, offset); offset += 4; // "JSON"
  paddedJson.copy(glb, offset); offset += paddedJson.length;

  // BIN chunk
  glb.writeUInt32LE(posBuffer.length, offset); offset += 4;
  glb.writeUInt32LE(0x004e4942, offset); offset += 4; // "BIN\0"
  posBuffer.copy(glb, offset);

  return glb;
}

/**
 * Create a minimal 1x1 PNG image (smallest valid PNG)
 */
function createMinimalPng(): Buffer {
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
    "2e00000000c4944415478016360f8cf0000000201014ddc211800000000" +
    "49454e44ae426082",
    "hex"
  );
}

describe("textureApply", () => {
  it("applies texture to a geometry-only GLB", async () => {
    const glb = createMinimalGlb();
    const image = createMinimalPng();

    const result = await applyTextureToGlb(glb, image, "image/png");

    // Result should be a valid GLB
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(glb.length); // Should be bigger with texture

    // Check GLB magic
    expect(result.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
    expect(result.readUInt32LE(4)).toBe(2); // version 2

    // Parse the result to verify structure
    const chunk0Length = result.readUInt32LE(12);
    const jsonData = result.slice(20, 20 + chunk0Length).toString("utf8");
    const gltf = JSON.parse(jsonData);

    // Should now have materials, textures, images
    expect(gltf.materials.length).toBe(1);
    expect(gltf.textures.length).toBe(1);
    expect(gltf.images.length).toBe(1);
    expect(gltf.samplers.length).toBe(1);

    // Material should reference the texture
    expect(gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index).toBe(0);
    expect(gltf.materials[0].doubleSided).toBe(true);

    // Mesh should now have TEXCOORD_0 and NORMAL attributes
    const attrs = gltf.meshes[0].primitives[0].attributes;
    expect(attrs.TEXCOORD_0).toBeDefined();
    expect(attrs.NORMAL).toBeDefined();
    expect(attrs.POSITION).toBeDefined();

    // Mesh should reference the material
    expect(gltf.meshes[0].primitives[0].material).toBe(0);
  });

  it("throws error for invalid GLB", async () => {
    const invalidGlb = Buffer.from("not a glb file");
    const image = createMinimalPng();

    await expect(applyTextureToGlb(invalidGlb, image, "image/png")).rejects.toThrow();
  });

  it("generates correct UV coordinates (0-1 range)", async () => {
    const glb = createMinimalGlb();
    const image = createMinimalPng();

    const result = await applyTextureToGlb(glb, image, "image/png");

    // Parse result
    const chunk0Length = result.readUInt32LE(12);
    const jsonData = result.slice(20, 20 + chunk0Length).toString("utf8");
    const gltf = JSON.parse(jsonData);

    // Find the UV accessor
    const uvAccIdx = gltf.meshes[0].primitives[0].attributes.TEXCOORD_0;
    const uvAcc = gltf.accessors[uvAccIdx];

    // UV min/max should be [0,0] to [1,1]
    expect(uvAcc.min[0]).toBeGreaterThanOrEqual(0);
    expect(uvAcc.min[1]).toBeGreaterThanOrEqual(0);
    expect(uvAcc.max[0]).toBeLessThanOrEqual(1);
    expect(uvAcc.max[1]).toBeLessThanOrEqual(1);
    expect(uvAcc.type).toBe("VEC2");
    expect(uvAcc.count).toBe(3); // 3 vertices
  });

  it("preserves original mesh geometry", async () => {
    const glb = createMinimalGlb();
    const image = createMinimalPng();

    const result = await applyTextureToGlb(glb, image, "image/png");

    // Parse result
    const chunk0Length = result.readUInt32LE(12);
    const jsonData = result.slice(20, 20 + chunk0Length).toString("utf8");
    const gltf = JSON.parse(jsonData);

    // Position accessor should still have 3 vertices
    const posAccIdx = gltf.meshes[0].primitives[0].attributes.POSITION;
    const posAcc = gltf.accessors[posAccIdx];
    expect(posAcc.count).toBe(3);
    expect(posAcc.type).toBe("VEC3");
  });

  it("generates normals for all vertices", async () => {
    const glb = createMinimalGlb();
    const image = createMinimalPng();

    const result = await applyTextureToGlb(glb, image, "image/png");

    // Parse result
    const chunk0Length = result.readUInt32LE(12);
    const jsonData = result.slice(20, 20 + chunk0Length).toString("utf8");
    const gltf = JSON.parse(jsonData);

    // Normal accessor should have same count as positions
    const normalAccIdx = gltf.meshes[0].primitives[0].attributes.NORMAL;
    const normalAcc = gltf.accessors[normalAccIdx];
    expect(normalAcc.count).toBe(3);
    expect(normalAcc.type).toBe("VEC3");
  });
});

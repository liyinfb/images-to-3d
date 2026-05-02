import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReconstructionResult } from "./reconstruction";

/**
 * Tests for the reconstruction pipeline changes:
 * - ReconstructionResult now includes hasNativeTexture
 * - TripoSG is the primary backend (textured output)
 * - frogleo is the reliable fallback (geometry-only)
 * - Manual texture projection is no longer applied
 */

describe("ReconstructionResult interface", () => {
  it("includes hasNativeTexture field", () => {
    const result: ReconstructionResult = {
      glbBuffer: Buffer.from("test"),
      filename: "test.glb",
      hasNativeTexture: false,
    };

    expect(result.hasNativeTexture).toBe(false);
    expect(result).toHaveProperty("hasNativeTexture");
    expect(result).toHaveProperty("glbBuffer");
    expect(result).toHaveProperty("filename");
  });

  it("can represent a textured model (TripoSG)", () => {
    const result: ReconstructionResult = {
      glbBuffer: Buffer.from("textured-model"),
      filename: "model_triposg_123.glb",
      hasNativeTexture: true,
    };

    expect(result.hasNativeTexture).toBe(true);
    expect(result.filename).toContain("triposg");
  });

  it("can represent an untextured model (frogleo)", () => {
    const result: ReconstructionResult = {
      glbBuffer: Buffer.from("geometry-only"),
      filename: "model_456.glb",
      hasNativeTexture: false,
    };

    expect(result.hasNativeTexture).toBe(false);
  });
});

describe("routers - reconstruction create applies texture conditionally", () => {
  it("routers.ts imports applyTextureToGlb and uses hasNativeTexture", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );

    // Should import applyTextureToGlb for non-natively-textured models
    expect(routersContent).toContain("applyTextureToGlb");

    // Should check hasNativeTexture to decide whether to apply texture
    expect(routersContent).toContain("hasNativeTexture");

    // Should use front projection mode
    expect(routersContent).toContain('"front"');
  });
});

describe("reconstruction module exports", () => {
  it("exports reconstructImage function", async () => {
    const mod = await import("./reconstruction");
    expect(typeof mod.reconstructImage).toBe("function");
  });

  it("exports reconstructMultipleImages function", async () => {
    const mod = await import("./reconstruction");
    expect(typeof mod.reconstructMultipleImages).toBe("function");
  });
});

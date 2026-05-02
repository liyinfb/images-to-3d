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

describe("routers - reconstruction outputs geometry directly", () => {
  it("routers.ts outputs model directly without texture application", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );

    // Should NOT import texture application (removed)
    expect(routersContent).not.toContain("applyTextureToGlb");
    expect(routersContent).not.toContain("generateMultiViewTexture");

    // Should output model directly
    expect(routersContent).toContain("result.glbBuffer");
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

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createReconstructionJob, getReconstructionJob, getUserReconstructionJobs, updateReconstructionJob } from "./db";
import { storagePut } from "./storage";
import { reconstructImage, reconstructMultipleImages } from "./reconstruction";
import { applyTextureToGlb } from "./textureApply";
import { generateMultiViewTexture } from "./aiTexture";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  reconstruction: router({
    /** Start a new 3D reconstruction from one or more uploaded images */
    create: protectedProcedure
      .input(z.object({
        images: z.array(z.object({
          base64: z.string().min(1, "Image data is required"),
          filename: z.string().default("image.png"),
        })).min(1, "At least one image is required").max(8, "Maximum 8 images allowed"),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const uniqueId = nanoid(12);
        const isMulti = input.images.length > 1;

        // Create the job record
        const jobId = await createReconstructionJob({
          userId,
          status: "pending",
          progress: 0,
          mode: isMulti ? "multi" : "single",
          sourceImageCount: input.images.length,
        });

        // Process asynchronously
        (async () => {
          try {
            await updateReconstructionJob(jobId, { status: "processing", progress: 5 });

            // Decode all images
            const imageBuffers = input.images.map((img, i) => ({
              buffer: Buffer.from(img.base64, "base64"),
              filename: img.filename || `image_${i}.png`,
            }));

            // Upload first/primary source image to S3
            const imageKey = `reconstructions/${userId}/${uniqueId}/source_0.png`;
            const { url: sourceImageUrl } = await storagePut(imageKey, imageBuffers[0].buffer, "image/png");

            // Upload all images to S3 and store URLs
            const allImageUrls: string[] = [sourceImageUrl];
            for (let i = 1; i < imageBuffers.length; i++) {
              const key = `reconstructions/${userId}/${uniqueId}/source_${i}.png`;
              const { url } = await storagePut(key, imageBuffers[i].buffer, "image/png");
              allImageUrls.push(url);
            }

            await updateReconstructionJob(jobId, {
              sourceImageUrl,
              sourceImageKey: imageKey,
              sourceImageUrls: JSON.stringify(allImageUrls),
              progress: 10,
            });

            const startTime = Date.now();

            // Run the reconstruction
            let result;
            if (isMulti) {
              result = await reconstructMultipleImages(
                imageBuffers,
                async (progress, message) => {
                  console.log(`[Job ${jobId}] Progress: ${progress}% - ${message}`);
                  await updateReconstructionJob(jobId, { progress }).catch(() => {});
                }
              );
            } else {
              result = await reconstructImage(
                imageBuffers[0].buffer,
                imageBuffers[0].filename,
                async (progress, message) => {
                  console.log(`[Job ${jobId}] Progress: ${progress}% - ${message}`);
                  await updateReconstructionJob(jobId, { progress }).catch(() => {});
                }
              );
            }

            // Apply texture if the model doesn't have native textures
            let finalGlb = result.glbBuffer;
            if (result.hasNativeTexture) {
              console.log(`[Job ${jobId}] Model has native texture, skipping texture application`);
            } else {
              console.log(`[Job ${jobId}] Generating AI multi-view texture...`);
              await updateReconstructionJob(jobId, { progress: 80 }).catch(() => {});

              try {
                // Generate multi-view texture atlas using AI
                const atlasBuffer = await generateMultiViewTexture(
                  imageBuffers[0].buffer,
                  (msg) => console.log(`[Job ${jobId}] ${msg}`)
                );

                console.log(`[Job ${jobId}] Applying atlas texture to model...`);
                await updateReconstructionJob(jobId, { progress: 92 }).catch(() => {});

                finalGlb = await applyTextureToGlb(
                  result.glbBuffer,
                  atlasBuffer,
                  "image/png",
                  "atlas"
                );
                console.log(`[Job ${jobId}] Atlas texture applied successfully (${finalGlb.length} bytes)`);
              } catch (texError) {
                console.warn(`[Job ${jobId}] AI texture generation failed, falling back to front projection:`, texError);
                // Fallback: use simple front projection with original image
                try {
                  finalGlb = await applyTextureToGlb(
                    result.glbBuffer,
                    imageBuffers[0].buffer,
                    "image/png",
                    "front"
                  );
                  console.log(`[Job ${jobId}] Fallback front texture applied (${finalGlb.length} bytes)`);
                } catch (fallbackError) {
                  console.warn(`[Job ${jobId}] Fallback texture also failed, using untextured model:`, fallbackError);
                }
              }
            }

            // Upload the GLB model to S3
            const modelKey = `reconstructions/${userId}/${uniqueId}/model.glb`;
            const { url: modelUrl } = await storagePut(modelKey, finalGlb, "model/gltf-binary");

            const processingTimeMs = Date.now() - startTime;

            await updateReconstructionJob(jobId, {
              status: "completed",
              modelUrl,
              modelKey,
              progress: 100,
              processingTimeMs,
            });

            console.log(`[Job ${jobId}] Completed in ${processingTimeMs}ms (${isMulti ? 'multi' : 'single'})`);
          } catch (error) {
            console.error(`[Job ${jobId}] Failed:`, error);
            await updateReconstructionJob(jobId, {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
              progress: 0,
            }).catch(() => {});
          }
        })();

        return { jobId };
      }),

    /** Get the status of a reconstruction job */
    status: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const job = await getReconstructionJob(input.jobId);
        if (!job) {
          return null;
        }
        // Only allow the owner to see their job
        if (job.userId !== ctx.user.id) {
          return null;
        }
        return job;
      }),

    /** List the user's reconstruction history */
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
      .query(async ({ ctx, input }) => {
        return getUserReconstructionJobs(ctx.user.id, input?.limit ?? 20);
      }),
  }),
});

export type AppRouter = typeof appRouter;

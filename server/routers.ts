import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createReconstructionJob, getReconstructionJob, getUserReconstructionJobs, updateReconstructionJob } from "./db";
import { storagePut } from "./storage";
import { reconstructImage } from "./reconstruction";
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
    /** Start a new 3D reconstruction from an uploaded image */
    create: protectedProcedure
      .input(z.object({
        imageBase64: z.string().min(1, "Image data is required"),
        filename: z.string().default("image.png"),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const uniqueId = nanoid(12);

        // Create the job record
        const jobId = await createReconstructionJob({
          userId,
          status: "pending",
          progress: 0,
        });

        // Process asynchronously — don't await the full reconstruction
        // Instead, start it and let the client poll for status
        (async () => {
          try {
            await updateReconstructionJob(jobId, { status: "processing", progress: 5 });

            // Decode the base64 image
            const imageBuffer = Buffer.from(input.imageBase64, "base64");

            // Upload source image to S3
            const imageKey = `reconstructions/${userId}/${uniqueId}/source.png`;
            const { url: sourceImageUrl } = await storagePut(imageKey, imageBuffer, "image/png");
            await updateReconstructionJob(jobId, {
              sourceImageUrl,
              sourceImageKey: imageKey,
              progress: 10,
            });

            const startTime = Date.now();

            // Run the reconstruction
            const result = await reconstructImage(
              imageBuffer,
              input.filename,
              async (progress, message) => {
                console.log(`[Job ${jobId}] Progress: ${progress}% - ${message}`);
                await updateReconstructionJob(jobId, { progress }).catch(() => {});
              }
            );

            // Upload the GLB model to S3
            const modelKey = `reconstructions/${userId}/${uniqueId}/model.glb`;
            const { url: modelUrl } = await storagePut(modelKey, result.glbBuffer, "model/gltf-binary");

            const processingTimeMs = Date.now() - startTime;

            await updateReconstructionJob(jobId, {
              status: "completed",
              modelUrl,
              modelKey,
              progress: 100,
              processingTimeMs,
            });

            console.log(`[Job ${jobId}] Completed in ${processingTimeMs}ms`);
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

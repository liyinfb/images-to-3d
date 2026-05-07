import { bigint, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Bcrypt-hashed password for local auth (null for OAuth users) */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Reconstruction jobs table — tracks each image-to-3D conversion request.
 */
export const reconstructionJobs = mysqlTable("reconstruction_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Status of the reconstruction job */
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  /** Mode of reconstruction: single or multi-image */
  mode: mysqlEnum("mode", ["single", "multi"]).default("single").notNull(),
  /** Number of source images uploaded */
  sourceImageCount: int("sourceImageCount").default(1).notNull(),
  /** URL of the uploaded source image in S3 (primary/first image) */
  sourceImageUrl: text("sourceImageUrl"),
  /** S3 key for the source image */
  sourceImageKey: varchar("sourceImageKey", { length: 512 }),
  /** JSON array of all source image URLs (for multi-image mode) */
  sourceImageUrls: text("sourceImageUrls"),
  /** URL of the resulting GLB model in S3 */
  modelUrl: text("modelUrl"),
  /** S3 key for the GLB model */
  modelKey: varchar("modelKey", { length: 512 }),
  /** URL of the model thumbnail/preview */
  thumbnailUrl: text("thumbnailUrl"),
  /** Progress percentage (0-100) */
  progress: int("progress").default(0).notNull(),
  /** Error message if the job failed */
  errorMessage: text("errorMessage"),
  /** Processing time in milliseconds */
  processingTimeMs: bigint("processingTimeMs", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReconstructionJob = typeof reconstructionJobs.$inferSelect;
export type InsertReconstructionJob = typeof reconstructionJobs.$inferInsert;

import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

const SALT_ROUNDS = 12;

/**
 * Register local email/password auth routes.
 * These are only active when LOCAL_AUTH mode is enabled (no Manus OAuth).
 */
export function registerLocalAuthRoutes(app: Express) {
  // Signup: create a new user with email + password
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      if (typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "Invalid email address" });
        return;
      }

      if (typeof password !== "string" || password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      // Check if email already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }

      // Hash password with bcrypt
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Generate a unique openId for local users
      const openId = `local_${randomUUID()}`;

      // Insert user
      await db.insert(users).values({
        openId,
        email,
        name: name || email.split("@")[0],
        passwordHash,
        loginMethod: "local",
        lastSignedIn: new Date(),
      });

      // Create session token using existing JWT mechanism
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.status(201).json({ success: true, message: "Account created successfully" });
    } catch (error) {
      console.error("[LocalAuth] Signup failed:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // Login: authenticate with email + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      // Find user by email
      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (result.length === 0) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const user = result[0];

      if (!user.passwordHash) {
        res.status(401).json({ error: "This account uses OAuth login, not password" });
        return;
      }

      // Verify password with bcrypt
      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      // Update last signed in
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      // Create session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, message: "Logged in successfully" });
    } catch (error) {
      console.error("[LocalAuth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Auth mode endpoint - tells the frontend which auth mode is active
  app.get("/api/auth/mode", (_req: Request, res: Response) => {
    res.json({ mode: "local" });
  });
}

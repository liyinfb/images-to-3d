import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock bcrypt
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$hashedpassword"),
    compare: vi.fn().mockImplementation((plain: string, hash: string) => {
      // Simulate: if hash matches our mock hash, password is valid
      return Promise.resolve(hash === "$2b$12$hashedpassword");
    }),
  },
}));

// Mock the SDK to avoid needing JWT_SECRET
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-session-token"),
  },
}));

// Mock cookies helper
vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: vi.fn().mockReturnValue({
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  }),
}));

// Mock database
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};

const mockInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};

const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// We need to mock drizzle-orm eq
vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue("eq-condition"),
}));

// Mock schema
vi.mock("../drizzle/schema", () => ({
  users: {
    email: "email",
    id: "id",
  },
}));

import { registerLocalAuthRoutes } from "./localAuth";
import { getDb } from "./db";

function createApp() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  return app;
}

describe("Local Auth Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/signup", () => {
    it("returns 400 when email is missing", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ password: "testpassword123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Email and password are required");
    });

    it("returns 400 when password is missing", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "test@example.com" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Email and password are required");
    });

    it("returns 400 for invalid email format", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "notanemail", password: "testpassword123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid email address");
    });

    it("returns 400 when password is too short", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "test@example.com", password: "short" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Password must be at least 8 characters");
    });

    it("returns 500 when database is not available", async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "test@example.com", password: "testpassword123" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Database not available");
    });

    it("returns 409 when email already exists", async () => {
      const mockSelectResult = [{ id: 1, email: "test@example.com" }];
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockSelectResult),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "test@example.com", password: "testpassword123" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("An account with this email already exists");
    });

    it("returns 201 on successful signup", async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const insertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn(),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: "new@example.com", password: "testpassword123", name: "Test User" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Account created successfully");
      // Should set a cookie
      expect(res.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when email is missing", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ password: "testpassword123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Email and password are required");
    });

    it("returns 400 when password is missing", async () => {
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Email and password are required");
    });

    it("returns 500 when database is not available", async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null);
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "testpassword123" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Database not available");
    });

    it("returns 401 when user not found", async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "testpassword123" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password");
    });

    it("returns 401 when user has no password hash (OAuth user)", async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1, email: "test@example.com", passwordHash: null, openId: "oauth-user" }]),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "testpassword123" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("This account uses OAuth login, not password");
    });

    it("returns 401 when password is incorrect", async () => {
      const bcrypt = await import("bcrypt");
      vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(false as never);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          email: "test@example.com",
          passwordHash: "$2b$12$wronghash",
          openId: "local_user",
          name: "Test",
        }]),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "wrongpassword" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid email or password");
    });

    it("returns 200 on successful login", async () => {
      const bcrypt = await import("bcrypt");
      vi.mocked(bcrypt.default.compare).mockResolvedValueOnce(true as never);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          id: 1,
          email: "test@example.com",
          passwordHash: "$2b$12$hashedpassword",
          openId: "local_user",
          name: "Test User",
        }]),
      };
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getDb).mockResolvedValueOnce({
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn().mockReturnValue(updateChain),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "correctpassword" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Logged in successfully");
      expect(res.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("GET /api/auth/mode", () => {
    it("returns local mode", async () => {
      const app = createApp();
      const res = await request(app).get("/api/auth/mode");

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe("local");
    });
  });
});

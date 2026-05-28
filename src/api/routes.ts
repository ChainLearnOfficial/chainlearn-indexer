import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  fetchRewards,
  fetchCredentials,
  fetchProgress,
  fetchStats,
} from "./queries.js";
import pino from "pino";
import { config } from "../config.js";

const logger = pino({ level: config.logLevel });

// --- Validation Schemas ---

const stellarAddressRegex = /^G[A-Z2-7]{55}$/;

const addressQuerySchema = z.object({
  address: z.string().regex(stellarAddressRegex, "Invalid Stellar address"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const progressQuerySchema = z.object({
  address: z.string().regex(stellarAddressRegex, "Invalid Stellar address"),
  course_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Route Handler Helpers ---

function parseOrBadRequest<T extends z.ZodType>(
  schema: T,
  data: unknown,
  reply: FastifyReply
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.status(400).send({
      error: "Validation failed",
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}

// --- Route Registration ---

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // GET /api/rewards?address=...
  app.get("/api/rewards", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = parseOrBadRequest(addressQuerySchema, req.query, reply);
    if (!parsed) return;

    try {
      const rewards = await fetchRewards(parsed.address, {
        limit: parsed.limit,
        offset: parsed.offset,
      });
      return { rewards, count: rewards.length };
    } catch (err) {
      logger.error({ err, address: parsed.address }, "Failed to fetch rewards");
      reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /api/credentials?address=...
  app.get("/api/credentials", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = parseOrBadRequest(addressQuerySchema, req.query, reply);
    if (!parsed) return;

    try {
      const credentials = await fetchCredentials(parsed.address, {
        limit: parsed.limit,
        offset: parsed.offset,
      });
      return { credentials, count: credentials.length };
    } catch (err) {
      logger.error({ err, address: parsed.address }, "Failed to fetch credentials");
      reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /api/progress?address=...&course_id=...
  app.get("/api/progress", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = parseOrBadRequest(progressQuerySchema, req.query, reply);
    if (!parsed) return;

    try {
      const progress = await fetchProgress(
        parsed.address,
        parsed.course_id,
        { limit: parsed.limit, offset: parsed.offset }
      );
      return { progress, count: progress.length };
    } catch (err) {
      logger.error({ err, address: parsed.address }, "Failed to fetch progress");
      reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /api/stats
  app.get("/api/stats", async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await fetchStats();
      return stats;
    } catch (err) {
      logger.error({ err }, "Failed to fetch stats");
      reply.status(500).send({ error: "Internal server error" });
    }
  });
}

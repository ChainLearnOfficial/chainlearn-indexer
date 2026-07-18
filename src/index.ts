import Fastify from "fastify";
import cors from "@fastify/cors";
import pino from "pino";
import { config } from "./config.js";
import { testConnection, closePool } from "./database/connection.js";
import { registerRoutes } from "./api/routes.js";
import { startIndexer, stopIndexer } from "./indexer/event-listener.js";

const logger = pino({ level: config.logLevel });

async function main(): Promise<void> {
  logger.info("ChainLearn Indexer starting...");

  // Verify database connectivity
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.fatal("Cannot connect to database. Exiting.");
    process.exit(1);
  }

  // Start the API server
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.allowedOrigins,
    methods: ["GET"],
    credentials: true,
  });

  await registerRoutes(app);

  try {
    await app.listen({ port: config.apiPort, host: "0.0.0.0" });
    logger.info({ port: config.apiPort }, "API server listening");
  } catch (err) {
    logger.fatal({ err }, "Failed to start API server");
    process.exit(1);
  }

  // Start the blockchain event indexer
  startIndexer().catch((err) => {
    logger.fatal({ err }, "Indexer crashed");
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    stopIndexer();

    try {
      await app.close();
      logger.info("API server closed");
    } catch (err) {
      logger.error({ err }, "Error closing API server");
    }

    try {
      await closePool();
      logger.info("Database pool closed");
    } catch (err) {
      logger.error({ err }, "Error closing database pool");
    }

    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });
}

main();

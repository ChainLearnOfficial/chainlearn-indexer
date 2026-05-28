import pg from "pg";
import { config } from "../config.js";
import pino from "pino";

const logger = pino({ level: config.logLevel });

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.fatal({ err }, "Unexpected database pool error");
  process.exit(1);
});

pool.on("connect", () => {
  logger.debug("New database connection established");
});

export async function getPool(): Promise<pg.Pool> {
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("Database connection verified");
    return true;
  } catch (err) {
    logger.error({ err }, "Database connection failed");
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info("Database pool closed");
}

export { pool };

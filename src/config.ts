import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z.object({
  databaseUrl: z
    .string()
    .url()
    .default("postgresql://chainlearn:chainlearn_dev@localhost:5432/chainlearn_indexer"),

  sorobanRpcUrl: z
    .string()
    .url()
    .default("https://soroban-testnet.stellar.org"),

  networkPassphrase: z
    .string()
    .default("Test SDF Network ; September 2015"),

  contracts: z.object({
    learnToken: z
      .string()
      .min(1, "LEARN_TOKEN_CONTRACT is required")
      .describe("Soroban contract address for the Learn Token"),
    credentialNft: z
      .string()
      .min(1, "CREDENTIAL_NFT_CONTRACT is required")
      .describe("Soroban contract address for the Credential NFT"),
    progressTracker: z
      .string()
      .min(1, "PROGRESS_TRACKER_CONTRACT is required")
      .describe("Soroban contract address for the Progress Tracker"),
  }),

  apiPort: z.coerce.number().int().min(1).max(65535).default(3100),

  logLevel: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  cursorCommitInterval: z.coerce
    .number()
    .int()
    .positive()
    .default(10)
    .describe("Commit cursor every N ledgers"),

  pollIntervalMs: z.coerce
    .number()
    .int()
    .positive()
    .default(5000)
    .describe("Polling interval in milliseconds when no new ledgers"),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    databaseUrl: process.env.DATABASE_URL,
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL,
    networkPassphrase: process.env.NETWORK_PASSPHRASE,
    contracts: {
      learnToken: process.env.LEARN_TOKEN_CONTRACT,
      credentialNft: process.env.CREDENTIAL_NFT_CONTRACT,
      progressTracker: process.env.PROGRESS_TRACKER_CONTRACT,
    },
    apiPort: process.env.API_PORT,
    logLevel: process.env.LOG_LEVEL,
    cursorCommitInterval: process.env.CURSOR_COMMIT_INTERVAL,
    pollIntervalMs: process.env.POLL_INTERVAL_MS,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    console.error("Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

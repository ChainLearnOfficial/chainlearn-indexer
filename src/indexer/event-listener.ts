import {
  SorobanRpc,
  xdr,
  hash,
  StrKey,
  scValToNative,
} from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { createCursorManager } from "./cursor.js";
import { processRewardClaimed } from "./processors/reward-claimed.js";
import { processCredentialMinted } from "./processors/credential-minted.js";
import { processProgressUpdated } from "./processors/progress-updated.js";
import { processTokenTransferred } from "./processors/token-transferred.js";
import pino from "pino";

const logger = pino({ level: config.logLevel });

interface ContractSpec {
  address: string;
  cursorName: string;
  topics: string[];
}

const CONTRACTS: ContractSpec[] = [
  {
    address: config.contracts.learnToken,
    cursorName: "learn_token",
    topics: ["RewardClaimed", "Transfer"],
  },
  {
    address: config.contracts.credentialNft,
    cursorName: "credential_nft",
    topics: ["CredentialMinted"],
  },
  {
    address: config.contracts.progressTracker,
    cursorName: "progress_tracker",
    topics: ["ProgressUpdated"],
  },
];

export interface SorobanEvent {
  topic: string;
  data: Record<string, unknown>;
  contractId: string;
  txHash: string;
  ledgerSeq: number;
  timestamp: number;
}

let running = false;

export async function startIndexer(): Promise<void> {
  const server = new SorobanRpc.Server(config.sorobanRpcUrl, {
    allowHttp: config.sorobanRpcUrl.startsWith("http://"),
  });

  running = true;
  logger.info({ rpcUrl: config.sorobanRpcUrl }, "Starting Soroban event indexer");

  const cursorManagers = new Map(
    CONTRACTS.map((c) => [c.cursorName, createCursorManager(c.cursorName)])
  );

  // Load last cursors
  for (const [name, mgr] of cursorManagers) {
    await mgr.getLastLedger();
  }

  // Main polling loop
  while (running) {
    try {
      for (const contract of CONTRACTS) {
        const cursor = cursorManagers.get(contract.cursorName)!;
        const lastLedger = await cursor.getLastLedger();

        const latestLedger = await getLatestLedger(server);
        if (latestLedger <= lastLedger) {
          logger.debug(
            { contract: contract.address, lastLedger, latestLedger },
            "No new ledgers"
          );
          continue;
        }

        const startLedger = lastLedger + 1;
        const endLedger = Math.min(
          latestLedger,
          startLedger + 100 // cap batch size
        );

        logger.info(
          {
            contract: contract.address,
            from: startLedger,
            to: endLedger,
          },
          "Fetching events"
        );

        const events = await fetchContractEvents(
          server,
          contract.address,
          startLedger,
          endLedger
        );

        for (const event of events) {
          await dispatchEvent(event);
          await cursor.commit(event.ledgerSeq);
        }

        await cursor.flush();
      }
    } catch (err) {
      logger.error({ err }, "Error during indexing cycle");
    }

    await sleep(config.pollIntervalMs);
  }
}

export function stopIndexer(): void {
  running = false;
  logger.info("Indexer stop requested");
}

async function getLatestLedger(server: SorobanRpc.Server): Promise<number> {
  const health = await server.getHealth();
  return health.currentLedger;
}

async function fetchContractEvents(
  server: SorobanRpc.Server,
  contractId: string,
  startLedger: number,
  endLedger: number
): Promise<SorobanEvent[]> {
  const events: SorobanEvent[] = [];

  try {
    const response = await server.getEvents({
      startLedger,
      endLedger,
      filters: [
        {
          type: "contract",
          contractIds: [contractId],
        },
      ],
      limit: 100,
    });

    for (const rawEvent of response.events) {
      const parsed = parseEvent(rawEvent, contractId);
      if (parsed) {
        events.push(parsed);
      }
    }
  } catch (err) {
    logger.error({ err, contractId, startLedger }, "Failed to fetch events");
  }

  return events;
}

function parseEvent(
  rawEvent: SorobanRpc.Api.EventResponse,
  contractId: string
): SorobanEvent | null {
  try {
    const topicValues = rawEvent.topic.map((t: xdr.ScVal) => scValToNative(t));
    const topic = topicValues[0] as string;

    const data = scValToNative(rawEvent.value) as Record<string, unknown>;

    return {
      topic,
      data,
      contractId,
      txHash: rawEvent.id,
      ledgerSeq: rawEvent.ledger,
      timestamp: rawEvent.ledgerClosedAt
        ? Math.floor(new Date(rawEvent.ledgerClosedAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    };
  } catch (err) {
    logger.warn({ err, event: rawEvent }, "Failed to parse event");
    return null;
  }
}

async function dispatchEvent(event: SorobanEvent): Promise<void> {
  logger.debug({ topic: event.topic, tx: event.txHash }, "Dispatching event");

  switch (event.topic) {
    case "RewardClaimed":
      await processRewardClaimed(event);
      break;

    case "CredentialMinted":
      await processCredentialMinted(event);
      break;

    case "ProgressUpdated":
      await processProgressUpdated(event);
      break;

    case "Transfer":
      await processTokenTransferred(event);
      break;

    default:
      logger.warn({ topic: event.topic }, "Unknown event topic, skipping");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

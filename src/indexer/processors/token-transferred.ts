import type { SorobanEvent } from "../event-listener.js";
import { upsertTransfer } from "../../database/queries.js";
import pino from "pino";
import { config } from "../../config.js";

const logger = pino({ level: config.logLevel });

/**
 * Process a Transfer event from the Learn Token contract.
 *
 * Soroban token contracts emit Transfer events with the standard
 * Soroban token interface topic: ["Transfer", from, to, amount]
 *
 * Expected event data shape (from scValToNative):
 * {
 *   from: string   - Sender Stellar address
 *   to: string     - Recipient Stellar address
 *   amount: bigint - Transfer amount
 * }
 */
export async function processTokenTransferred(event: SorobanEvent): Promise<void> {
  const { from, to, amount } = event.data;

  if (!from || !to || amount === undefined) {
    logger.error(
      { data: event.data, tx: event.txHash },
      "Malformed Transfer event: missing required fields"
    );
    return;
  }

  if (typeof from !== "string" || !from.startsWith("G") || from.length !== 56) {
    logger.error({ from, tx: event.txHash }, "Invalid 'from' address in Transfer");
    return;
  }

  if (typeof to !== "string" || !to.startsWith("G") || to.length !== 56) {
    logger.error({ to, tx: event.txHash }, "Invalid 'to' address in Transfer");
    return;
  }

  const transferAmount = BigInt(amount as string | number);

  await upsertTransfer({
    from,
    to,
    amount: transferAmount,
    txHash: event.txHash,
    ledgerSeq: event.ledgerSeq,
  });

  logger.info(
    {
      from,
      to,
      amount: transferAmount.toString(),
      ledger: event.ledgerSeq,
    },
    "Processed Transfer event"
  );
}

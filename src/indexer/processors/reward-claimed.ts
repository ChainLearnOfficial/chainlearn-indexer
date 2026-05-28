import type { SorobanEvent } from "../event-listener.js";
import { upsertReward } from "../../database/queries.js";
import pino from "pino";
import { config } from "../../config.js";

const logger = pino({ level: config.logLevel });

/**
 * Process a RewardClaimed event from the Learn Token contract.
 *
 * Expected event data shape:
 * {
 *   learner: string   - Stellar address of the learner
 *   amount: bigint     - Token amount rewarded
 *   quiz_id: string    - Identifier of the completed quiz
 * }
 */
export async function processRewardClaimed(event: SorobanEvent): Promise<void> {
  const { learner, amount, quiz_id } = event.data;

  if (!learner || amount === undefined || !quiz_id) {
    logger.error(
      { data: event.data, tx: event.txHash },
      "Malformed RewardClaimed event: missing required fields"
    );
    return;
  }

  // Validate Stellar address format
  if (typeof learner !== "string" || !learner.startsWith("G") || learner.length !== 56) {
    logger.error({ learner, tx: event.txHash }, "Invalid learner address in RewardClaimed");
    return;
  }

  const rewardAmount = BigInt(amount as string | number);

  await upsertReward({
    learner: learner as string,
    amount: rewardAmount,
    quizId: String(quiz_id),
    txHash: event.txHash,
    ledgerSeq: event.ledgerSeq,
  });

  logger.info(
    {
      learner,
      amount: rewardAmount.toString(),
      quizId: quiz_id,
      ledger: event.ledgerSeq,
    },
    "Processed RewardClaimed event"
  );
}

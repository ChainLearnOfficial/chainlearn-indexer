import type { SorobanEvent } from "../event-listener.js";
import { upsertProgress } from "../../database/queries.js";
import pino from "pino";
import { config } from "../../config.js";

const logger = pino({ level: config.logLevel });

/**
 * Process a ProgressUpdated event from the Progress Tracker contract.
 *
 * Expected event data shape:
 * {
 *   learner: string     - Stellar address of the learner
 *   course_id: string   - Identifier of the course
 *   progress_pct: number - Progress percentage (0-100)
 * }
 */
export async function processProgressUpdated(event: SorobanEvent): Promise<void> {
  const { learner, course_id, progress_pct } = event.data;

  if (!learner || !course_id || progress_pct === undefined) {
    logger.error(
      { data: event.data, tx: event.txHash },
      "Malformed ProgressUpdated event: missing required fields"
    );
    return;
  }

  if (typeof learner !== "string" || !learner.startsWith("G") || learner.length !== 56) {
    logger.error(
      { learner, tx: event.txHash },
      "Invalid learner address in ProgressUpdated"
    );
    return;
  }

  const pct = Number(progress_pct);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    logger.error(
      { progress_pct, tx: event.txHash },
      "Invalid progress percentage in ProgressUpdated"
    );
    return;
  }

  await upsertProgress({
    learner,
    courseId: String(course_id),
    progressPct: pct,
    ledgerSeq: event.ledgerSeq,
  });

  logger.info(
    {
      learner,
      courseId: course_id,
      progressPct: pct,
      ledger: event.ledgerSeq,
    },
    "Processed ProgressUpdated event"
  );
}

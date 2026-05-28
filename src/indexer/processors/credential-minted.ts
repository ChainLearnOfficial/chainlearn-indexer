import type { SorobanEvent } from "../event-listener.js";
import { upsertCredential } from "../../database/queries.js";
import pino from "pino";
import { config } from "../../config.js";

const logger = pino({ level: config.logLevel });

/**
 * Process a CredentialMinted event from the Credential NFT contract.
 *
 * Expected event data shape:
 * {
 *   learner: string       - Stellar address of the learner
 *   credential_id: string - Unique NFT token ID
 *   course_id: string     - Identifier of the completed course
 * }
 */
export async function processCredentialMinted(event: SorobanEvent): Promise<void> {
  const { learner, credential_id, course_id } = event.data;

  if (!learner || !credential_id || !course_id) {
    logger.error(
      { data: event.data, tx: event.txHash },
      "Malformed CredentialMinted event: missing required fields"
    );
    return;
  }

  if (typeof learner !== "string" || !learner.startsWith("G") || learner.length !== 56) {
    logger.error(
      { learner, tx: event.txHash },
      "Invalid learner address in CredentialMinted"
    );
    return;
  }

  await upsertCredential({
    learner,
    credentialId: String(credential_id),
    courseId: String(course_id),
    txHash: event.txHash,
    ledgerSeq: event.ledgerSeq,
  });

  logger.info(
    {
      learner,
      credentialId: credential_id,
      courseId: course_id,
      ledger: event.ledgerSeq,
    },
    "Processed CredentialMinted event"
  );
}

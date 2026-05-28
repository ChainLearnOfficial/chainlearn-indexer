import { pool } from "./connection.js";
import pino from "pino";
import { config } from "../config.js";

const logger = pino({ level: config.logLevel });

// --- Cursor Management ---

export async function getCursor(cursorName: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT ledger_seq FROM index_cursor WHERE cursor_name = $1",
    [cursorName]
  );
  if (rows.length === 0) {
    return 0;
  }
  return Number(rows[0].ledger_seq);
}

export async function updateCursor(cursorName: string, ledgerSeq: number): Promise<void> {
  await pool.query(
    `INSERT INTO index_cursor (cursor_name, ledger_seq, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (cursor_name)
     DO UPDATE SET ledger_seq = $2, updated_at = NOW()`,
    [cursorName, ledgerSeq]
  );
  logger.debug({ cursorName, ledgerSeq }, "Cursor updated");
}

// --- Reward Insert ---

export interface RewardRecord {
  learner: string;
  amount: bigint;
  quizId: string;
  txHash: string;
  ledgerSeq: number;
}

export async function upsertReward(record: RewardRecord): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_rewards (learner, amount, quiz_id, tx_hash, ledger_seq)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tx_hash, learner)
     DO UPDATE SET amount = EXCLUDED.amount, quiz_id = EXCLUDED.quiz_id`,
    [record.learner, record.amount.toString(), record.quizId, record.txHash, record.ledgerSeq]
  );
  logger.info({ learner: record.learner, quizId: record.quizId }, "Reward indexed");
}

// --- Credential Insert ---

export interface CredentialRecord {
  learner: string;
  credentialId: string;
  courseId: string;
  txHash: string;
  ledgerSeq: number;
}

export async function upsertCredential(record: CredentialRecord): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_credentials (learner, credential_id, course_id, tx_hash, ledger_seq)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (credential_id)
     DO UPDATE SET learner = EXCLUDED.learner, course_id = EXCLUDED.course_id`,
    [record.learner, record.credentialId, record.courseId, record.txHash, record.ledgerSeq]
  );
  logger.info(
    { learner: record.learner, credentialId: record.credentialId },
    "Credential indexed"
  );
}

// --- Progress Insert ---

export interface ProgressRecord {
  learner: string;
  courseId: string;
  progressPct: number;
  ledgerSeq: number;
}

export async function upsertProgress(record: ProgressRecord): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_progress (learner, course_id, progress_pct, ledger_seq)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (learner, course_id, ledger_seq)
     DO UPDATE SET progress_pct = EXCLUDED.progress_pct`,
    [record.learner, record.courseId, record.progressPct, record.ledgerSeq]
  );
  logger.info(
    { learner: record.learner, courseId: record.courseId, pct: record.progressPct },
    "Progress indexed"
  );
}

// --- Transfer Insert ---

export interface TransferRecord {
  from: string;
  to: string;
  amount: bigint;
  txHash: string;
  ledgerSeq: number;
}

export async function upsertTransfer(record: TransferRecord): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_transfers (from_addr, to_addr, amount, tx_hash, ledger_seq)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tx_hash, from_addr, to_addr)
     DO UPDATE SET amount = EXCLUDED.amount`,
    [record.from, record.to, record.amount.toString(), record.txHash, record.ledgerSeq]
  );
  logger.info({ from: record.from, to: record.to }, "Transfer indexed");
}

// --- Read Queries ---

export async function getRewardsByLearner(learner: string, limit = 50, offset = 0) {
  const { rows } = await pool.query(
    `SELECT learner, amount, quiz_id, tx_hash, ledger_seq, created_at
     FROM indexed_rewards
     WHERE learner = $1
     ORDER BY ledger_seq DESC
     LIMIT $2 OFFSET $3`,
    [learner, limit, offset]
  );
  return rows;
}

export async function getCredentialsByLearner(learner: string, limit = 50, offset = 0) {
  const { rows } = await pool.query(
    `SELECT learner, credential_id, course_id, tx_hash, ledger_seq, created_at
     FROM indexed_credentials
     WHERE learner = $1
     ORDER BY ledger_seq DESC
     LIMIT $2 OFFSET $3`,
    [learner, limit, offset]
  );
  return rows;
}

export async function getProgressByLearner(
  learner: string,
  courseId?: string,
  limit = 50,
  offset = 0
) {
  if (courseId) {
    const { rows } = await pool.query(
      `SELECT learner, course_id, progress_pct, ledger_seq, created_at
       FROM indexed_progress
       WHERE learner = $1 AND course_id = $2
       ORDER BY ledger_seq DESC
       LIMIT $3 OFFSET $4`,
      [learner, courseId, limit, offset]
    );
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (course_id)
       learner, course_id, progress_pct, ledger_seq, created_at
     FROM indexed_progress
     WHERE learner = $1
     ORDER BY course_id, ledger_seq DESC`,
    [learner]
  );
  return rows;
}

export async function getAggregateStats() {
  const [rewardsRes, credentialsRes, learnersRes, transfersRes] = await Promise.all([
    pool.query("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM indexed_rewards"),
    pool.query("SELECT COUNT(*) AS count FROM indexed_credentials"),
    pool.query(
      `SELECT COUNT(DISTINCT learner) AS count FROM (
         SELECT learner FROM indexed_rewards
         UNION
         SELECT learner FROM indexed_credentials
         UNION
         SELECT learner FROM indexed_progress
       ) AS all_learners`
    ),
    pool.query("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM indexed_transfers"),
  ]);

  return {
    totalRewards: Number(rewardsRes.rows[0].count),
    totalRewardAmount: rewardsRes.rows[0].total.toString(),
    totalCredentials: Number(credentialsRes.rows[0].count),
    totalLearners: Number(learnersRes.rows[0].count),
    totalTransfers: Number(transfersRes.rows[0].count),
    totalTransferVolume: transfersRes.rows[0].total.toString(),
  };
}

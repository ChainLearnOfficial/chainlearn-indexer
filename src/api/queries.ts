import {
  getRewardsByLearner,
  getCredentialsByLearner,
  getProgressByLearner,
  getAggregateStats,
} from "../database/queries.js";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export async function fetchRewards(address: string, pagination: PaginationParams) {
  const rows = await getRewardsByLearner(address, pagination.limit, pagination.offset);
  return rows.map((row) => ({
    learner: row.learner,
    amount: row.amount.toString(),
    quizId: row.quiz_id,
    txHash: row.tx_hash,
    ledger: Number(row.ledger_seq),
    timestamp: row.created_at,
  }));
}

export async function fetchCredentials(address: string, pagination: PaginationParams) {
  const rows = await getCredentialsByLearner(address, pagination.limit, pagination.offset);
  return rows.map((row) => ({
    learner: row.learner,
    credentialId: row.credential_id,
    courseId: row.course_id,
    txHash: row.tx_hash,
    ledger: Number(row.ledger_seq),
    timestamp: row.created_at,
  }));
}

export async function fetchProgress(
  address: string,
  courseId: string | undefined,
  pagination: PaginationParams
) {
  const rows = await getProgressByLearner(
    address,
    courseId,
    pagination.limit,
    pagination.offset
  );
  return rows.map((row) => ({
    learner: row.learner,
    courseId: row.course_id,
    progressPct: Number(row.progress_pct),
    ledger: Number(row.ledger_seq),
    timestamp: row.created_at,
  }));
}

export async function fetchStats() {
  return getAggregateStats();
}

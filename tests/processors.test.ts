import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SorobanEvent } from "../src/indexer/event-listener.js";

// Mock the database queries module
vi.mock("../src/database/queries.js", () => ({
  upsertReward: vi.fn().mockResolvedValue(undefined),
  upsertCredential: vi.fn().mockResolvedValue(undefined),
  upsertProgress: vi.fn().mockResolvedValue(undefined),
  upsertTransfer: vi.fn().mockResolvedValue(undefined),
}));

import { processRewardClaimed } from "../src/indexer/processors/reward-claimed.js";
import { processCredentialMinted } from "../src/indexer/processors/credential-minted.js";
import { processProgressUpdated } from "../src/indexer/processors/progress-updated.js";
import { processTokenTransferred } from "../src/indexer/processors/token-transferred.js";
import {
  upsertReward,
  upsertCredential,
  upsertProgress,
  upsertTransfer,
} from "../src/database/queries.js";

const MOCK_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function makeEvent(overrides: Partial<SorobanEvent> = {}): SorobanEvent {
  return {
    topic: "test",
    data: {},
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB",
    txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    ledgerSeq: 500000,
    timestamp: 1700000000,
    ...overrides,
  };
}

describe("processRewardClaimed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and upsert a valid RewardClaimed event", async () => {
    const event = makeEvent({
      topic: "RewardClaimed",
      data: {
        learner: MOCK_ADDRESS,
        amount: 1000000000n,
        quiz_id: "quiz-stellar-101",
      },
    });

    await processRewardClaimed(event);

    expect(upsertReward).toHaveBeenCalledWith({
      learner: MOCK_ADDRESS,
      amount: 1000000000n,
      quizId: "quiz-stellar-101",
      txHash: event.txHash,
      ledgerSeq: 500000,
    });
  });

  it("should reject event with missing learner", async () => {
    const event = makeEvent({
      data: { amount: 100n, quiz_id: "quiz-1" },
    });

    await processRewardClaimed(event);

    expect(upsertReward).not.toHaveBeenCalled();
  });

  it("should reject event with invalid address format", async () => {
    const event = makeEvent({
      data: {
        learner: "not-a-valid-address",
        amount: 100n,
        quiz_id: "quiz-1",
      },
    });

    await processRewardClaimed(event);

    expect(upsertReward).not.toHaveBeenCalled();
  });

  it("should reject event with missing amount", async () => {
    const event = makeEvent({
      data: { learner: MOCK_ADDRESS, quiz_id: "quiz-1" },
    });

    await processRewardClaimed(event);

    expect(upsertReward).not.toHaveBeenCalled();
  });

  it("should handle numeric amount as well as bigint", async () => {
    const event = makeEvent({
      data: {
        learner: MOCK_ADDRESS,
        amount: 500,
        quiz_id: "quiz-2",
      },
    });

    await processRewardClaimed(event);

    expect(upsertReward).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500n })
    );
  });
});

describe("processCredentialMinted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and upsert a valid CredentialMinted event", async () => {
    const event = makeEvent({
      topic: "CredentialMinted",
      data: {
        learner: MOCK_ADDRESS,
        credential_id: "cred-001",
        course_id: "course-stellar-basics",
      },
    });

    await processCredentialMinted(event);

    expect(upsertCredential).toHaveBeenCalledWith({
      learner: MOCK_ADDRESS,
      credentialId: "cred-001",
      courseId: "course-stellar-basics",
      txHash: event.txHash,
      ledgerSeq: 500000,
    });
  });

  it("should reject event with missing credential_id", async () => {
    const event = makeEvent({
      data: { learner: MOCK_ADDRESS, course_id: "course-1" },
    });

    await processCredentialMinted(event);

    expect(upsertCredential).not.toHaveBeenCalled();
  });

  it("should reject event with missing course_id", async () => {
    const event = makeEvent({
      data: { learner: MOCK_ADDRESS, credential_id: "cred-1" },
    });

    await processCredentialMinted(event);

    expect(upsertCredential).not.toHaveBeenCalled();
  });
});

describe("processProgressUpdated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and upsert a valid ProgressUpdated event", async () => {
    const event = makeEvent({
      topic: "ProgressUpdated",
      data: {
        learner: MOCK_ADDRESS,
        course_id: "course-defi-201",
        progress_pct: 75,
      },
    });

    await processProgressUpdated(event);

    expect(upsertProgress).toHaveBeenCalledWith({
      learner: MOCK_ADDRESS,
      courseId: "course-defi-201",
      progressPct: 75,
      ledgerSeq: 500000,
    });
  });

  it("should reject progress outside 0-100 range", async () => {
    const event = makeEvent({
      data: {
        learner: MOCK_ADDRESS,
        course_id: "course-1",
        progress_pct: 150,
      },
    });

    await processProgressUpdated(event);

    expect(upsertProgress).not.toHaveBeenCalled();
  });

  it("should reject negative progress", async () => {
    const event = makeEvent({
      data: {
        learner: MOCK_ADDRESS,
        course_id: "course-1",
        progress_pct: -10,
      },
    });

    await processProgressUpdated(event);

    expect(upsertProgress).not.toHaveBeenCalled();
  });

  it("should accept zero progress", async () => {
    const event = makeEvent({
      data: {
        learner: MOCK_ADDRESS,
        course_id: "course-1",
        progress_pct: 0,
      },
    });

    await processProgressUpdated(event);

    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progressPct: 0 })
    );
  });

  it("should accept 100 progress", async () => {
    const event = makeEvent({
      data: {
        learner: MOCK_ADDRESS,
        course_id: "course-1",
        progress_pct: 100,
      },
    });

    await processProgressUpdated(event);

    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progressPct: 100 })
    );
  });
});

describe("processTokenTransferred", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and upsert a valid Transfer event", async () => {
    const recipient = "GBCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZA";
    const event = makeEvent({
      topic: "Transfer",
      data: {
        from: MOCK_ADDRESS,
        to: recipient,
        amount: 2500000000n,
      },
    });

    await processTokenTransferred(event);

    expect(upsertTransfer).toHaveBeenCalledWith({
      from: MOCK_ADDRESS,
      to: recipient,
      amount: 2500000000n,
      txHash: event.txHash,
      ledgerSeq: 500000,
    });
  });

  it("should reject transfer with invalid 'from' address", async () => {
    const event = makeEvent({
      data: {
        from: "invalid",
        to: MOCK_ADDRESS,
        amount: 100n,
      },
    });

    await processTokenTransferred(event);

    expect(upsertTransfer).not.toHaveBeenCalled();
  });

  it("should reject transfer with invalid 'to' address", async () => {
    const event = makeEvent({
      data: {
        from: MOCK_ADDRESS,
        to: "invalid",
        amount: 100n,
      },
    });

    await processTokenTransferred(event);

    expect(upsertTransfer).not.toHaveBeenCalled();
  });

  it("should reject transfer with missing amount", async () => {
    const event = makeEvent({
      data: {
        from: MOCK_ADDRESS,
        to: MOCK_ADDRESS,
      },
    });

    await processTokenTransferred(event);

    expect(upsertTransfer).not.toHaveBeenCalled();
  });
});

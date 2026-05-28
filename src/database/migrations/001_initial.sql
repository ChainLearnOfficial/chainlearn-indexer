-- ChainLearn Indexer: Initial Schema
-- Creates tables for indexed Soroban blockchain events

BEGIN;

-- Track indexer cursor (last processed ledger)
CREATE TABLE IF NOT EXISTS index_cursor (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    cursor_name VARCHAR(64) NOT NULL UNIQUE,
    ledger_seq  BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT single_cursor_per_name UNIQUE (cursor_name)
);

-- Insert default cursors for each contract
INSERT INTO index_cursor (cursor_name, ledger_seq) VALUES
    ('learn_token', 0),
    ('credential_nft', 0),
    ('progress_tracker', 0)
ON CONFLICT (cursor_name) DO NOTHING;

-- RewardClaimed events from Learn Token contract
CREATE TABLE IF NOT EXISTS indexed_rewards (
    id          BIGSERIAL PRIMARY KEY,
    learner     VARCHAR(56) NOT NULL,
    amount      BIGINT NOT NULL,
    quiz_id     VARCHAR(128) NOT NULL,
    tx_hash     VARCHAR(64) NOT NULL,
    ledger_seq  BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_reward_tx UNIQUE (tx_hash, learner)
);

CREATE INDEX IF NOT EXISTS idx_rewards_learner ON indexed_rewards (learner);
CREATE INDEX IF NOT EXISTS idx_rewards_quiz ON indexed_rewards (quiz_id);
CREATE INDEX IF NOT EXISTS idx_rewards_ledger ON indexed_rewards (ledger_seq);

-- CredentialMinted events from Credential NFT contract
CREATE TABLE IF NOT EXISTS indexed_credentials (
    id              BIGSERIAL PRIMARY KEY,
    learner         VARCHAR(56) NOT NULL,
    credential_id   VARCHAR(128) NOT NULL UNIQUE,
    course_id       VARCHAR(128) NOT NULL,
    tx_hash         VARCHAR(64) NOT NULL,
    ledger_seq      BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_credential_tx UNIQUE (tx_hash, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_credentials_learner ON indexed_credentials (learner);
CREATE INDEX IF NOT EXISTS idx_credentials_course ON indexed_credentials (course_id);
CREATE INDEX IF NOT EXISTS idx_credentials_ledger ON indexed_credentials (ledger_seq);

-- ProgressUpdated events from Progress Tracker contract
CREATE TABLE IF NOT EXISTS indexed_progress (
    id          BIGSERIAL PRIMARY KEY,
    learner     VARCHAR(56) NOT NULL,
    course_id   VARCHAR(128) NOT NULL,
    progress_pct SMALLINT NOT NULL CHECK (progress_pct >= 0 AND progress_pct <= 100),
    ledger_seq  BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_progress_tx UNIQUE (learner, course_id, ledger_seq)
);

CREATE INDEX IF NOT EXISTS idx_progress_learner ON indexed_progress (learner);
CREATE INDEX IF NOT EXISTS idx_progress_course ON indexed_progress (course_id);
CREATE INDEX IF NOT EXISTS idx_progress_learner_course ON indexed_progress (learner, course_id);

-- Token transfer events
CREATE TABLE IF NOT EXISTS indexed_transfers (
    id          BIGSERIAL PRIMARY KEY,
    from_addr   VARCHAR(56) NOT NULL,
    to_addr     VARCHAR(56) NOT NULL,
    amount      BIGINT NOT NULL,
    tx_hash     VARCHAR(64) NOT NULL,
    ledger_seq  BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_transfer_tx UNIQUE (tx_hash, from_addr, to_addr)
);

CREATE INDEX IF NOT EXISTS idx_transfers_from ON indexed_transfers (from_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON indexed_transfers (to_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_ledger ON indexed_transfers (ledger_seq);

COMMIT;

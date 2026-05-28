# ChainLearn Indexer

A blockchain event indexer for the ChainLearn Stellar/Soroban learning platform. It listens to on-chain events emitted by Soroban smart contracts and indexes them into PostgreSQL for fast querying via a REST API.

## Architecture

```
Soroban RPC ──poll──> Event Listener ──dispatch──> Processors ──upsert──> PostgreSQL
                                                                             │
                                                           Fastify API ──────┘
                                                          (GET /api/*)
```

### Components

| Component | Purpose |
|-----------|---------|
| **Event Listener** | Polls Soroban RPC for contract events across learn-token, credential-nft, and progress-tracker contracts |
| **Processors** | Parse raw Soroban events and transform them into indexed records |
| **Cursor Manager** | Tracks the last processed ledger sequence per contract, enabling crash-safe resume |
| **API Server** | Fastify HTTP server exposing indexed data via REST endpoints |

### Indexed Events

| Event | Contract | Indexed Table |
|-------|----------|---------------|
| `RewardClaimed` | Learn Token | `indexed_rewards` |
| `CredentialMinted` | Credential NFT | `indexed_credentials` |
| `ProgressUpdated` | Progress Tracker | `indexed_progress` |
| `Transfer` | Learn Token | `indexed_transfers` |

## Prerequisites

- Node.js >= 20
- PostgreSQL 16+
- A deployed ChainLearn Soroban contract (or testnet addresses)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example and fill in your contract addresses:

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://chainlearn:chainlearn_dev@localhost:5432/chainlearn_indexer
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
LEARN_TOKEN_CONTRACT=C...your_learn_token_address
CREDENTIAL_NFT_CONTRACT=C...your_credential_nft_address
PROGRESS_TRACKER_CONTRACT=C...your_progress_tracker_address
API_PORT=3100
LOG_LEVEL=info
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

The migration script in `src/database/migrations/001_initial.sql` runs automatically on first start.

### 4. Run the indexer

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

### 5. Run with Docker Compose

```bash
# Build and start everything
docker compose up -d
```

## API Reference

### Health Check

```
GET /health
```

```json
{ "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
```

### Rewards

```
GET /api/rewards?address=G...&limit=50&offset=0
```

```json
{
  "rewards": [
    {
      "learner": "G...",
      "amount": "1000000000",
      "quizId": "quiz-stellar-101",
      "txHash": "abc123...",
      "ledger": 500000,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Credentials

```
GET /api/credentials?address=G...&limit=50&offset=0
```

```json
{
  "credentials": [
    {
      "learner": "G...",
      "credentialId": "cred-001",
      "courseId": "course-stellar-basics",
      "txHash": "abc123...",
      "ledger": 500100,
      "timestamp": "2024-01-15T11:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Progress

```
GET /api/progress?address=G...&course_id=course-defi-201&limit=50&offset=0
```

The `course_id` parameter is optional. When provided, returns progress entries for that specific course. When omitted, returns the latest progress per course for the learner.

```json
{
  "progress": [
    {
      "learner": "G...",
      "courseId": "course-defi-201",
      "progressPct": 75,
      "ledger": 500200,
      "timestamp": "2024-01-15T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Aggregate Stats

```
GET /api/stats
```

```json
{
  "totalRewards": 1520,
  "totalRewardAmount": "5000000000000",
  "totalCredentials": 340,
  "totalLearners": 280,
  "totalTransfers": 890,
  "totalTransferVolume": "12000000000000"
}
```

## Development

### Run tests

```bash
npm test
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Configuration

All configuration is via environment variables, validated with Zod at startup:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql://chainlearn:chainlearn_dev@localhost:5432/chainlearn_indexer` | PostgreSQL connection string |
| `SOROBAN_RPC_URL` | No | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `NETWORK_PASSPHRASE` | No | `Test SDF Network ; September 2015` | Stellar network passphrase |
| `LEARN_TOKEN_CONTRACT` | **Yes** | — | Learn Token contract address |
| `CREDENTIAL_NFT_CONTRACT` | **Yes** | — | Credential NFT contract address |
| `PROGRESS_TRACKER_CONTRACT` | **Yes** | — | Progress Tracker contract address |
| `API_PORT` | No | `3100` | HTTP API port |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `CURSOR_COMMIT_INTERVAL` | No | `10` | Commit cursor every N ledgers |
| `POLL_INTERVAL_MS` | No | `5000` | Polling interval when idle (ms) |

## Database Schema

```
index_cursor          ── tracks last processed ledger per contract
indexed_rewards       ── RewardClaimed events
indexed_credentials   ── CredentialMinted events
indexed_progress      ── ProgressUpdated events
indexed_transfers     ── Transfer events
```

All tables use `ON CONFLICT ... DO UPDATE` for idempotent upserts, making the indexer safe to re-run or restart without data duplication.

## License

MIT

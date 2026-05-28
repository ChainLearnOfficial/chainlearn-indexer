import { getCursor, updateCursor } from "../database/queries.js";
import { config } from "../config.js";
import pino from "pino";

const logger = pino({ level: config.logLevel });

export interface CursorManager {
  getLastLedger(): Promise<number>;
  commit(ledgerSeq: number): Promise<void>;
  flush(): Promise<void>;
}

export function createCursorManager(cursorName: string): CursorManager {
  let lastCommittedSeq = 0;
  let pendingSeq = 0;
  let ledgersSinceCommit = 0;

  return {
    async getLastLedger(): Promise<number> {
      const seq = await getCursor(cursorName);
      lastCommittedSeq = seq;
      pendingSeq = seq;
      logger.info({ cursorName, lastLedger: seq }, "Cursor loaded");
      return seq;
    },

    async commit(ledgerSeq: number): Promise<void> {
      pendingSeq = Math.max(pendingSeq, ledgerSeq);
      ledgersSinceCommit++;

      if (ledgersSinceCommit >= config.cursorCommitInterval) {
        await this.flush();
      }
    },

    async flush(): Promise<void> {
      if (pendingSeq <= lastCommittedSeq) {
        return;
      }

      await updateCursor(cursorName, pendingSeq);
      logger.info(
        {
          cursorName,
          from: lastCommittedSeq,
          to: pendingSeq,
          skipped: ledgersSinceCommit,
        },
        "Cursor committed"
      );
      lastCommittedSeq = pendingSeq;
      ledgersSinceCommit = 0;
    },
  };
}

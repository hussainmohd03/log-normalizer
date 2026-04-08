import { MessageEvent, NotFoundException } from '@nestjs/common';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import {
  Observable,
  concat,
  concatMap,
  defer,
  filter,
  from,
  map,
  of,
  takeWhile,
  throwError,
} from 'rxjs';
import { JobResponse, toJobResponse } from './dto/job-response.dto';

/**
 * Cross-process job state hop, in pure-RxJS form.
 *
 *   ┌──────────────┐    QueueEvents     ┌──────────────┐
 *   │ worker proc  │ ─── Redis pub ───▶ │ http proc    │
 *   │ markActive   │                    │ events$ Subj │
 *   │ markComplete │                    │   filter(id) │
 *   │ markFailed   │                    │   re-read DB │
 *   └──────────────┘                    │   to client  │
 *                                        └──────────────┘
 *
 * Design notes
 * ────────────
 * - First emission is the current DB row. This handles the "client
 *   connects after job already finished" case: takeWhile(..., true)
 *   emits the terminal state once and completes the stream immediately.
 *
 * - Every event re-reads the DB. We never trust the QueueEvents payload —
 *   the row is the source of truth. This also closes the race window for
 *   `completed`/`failed` events, which fire AFTER the worker's process()
 *   function returns, i.e. after markCompleted/markFailed has committed.
 *
 * - The `active` event from BullMQ fires BEFORE the worker enters
 *   process(), so a re-read on `active` may transiently still show
 *   QUEUED. That's fine — the next event will correct it, and the SSE
 *   client gets eventually-consistent state within microseconds.
 *
 * - The function takes a `getRow` closure rather than a JobsService
 *   reference so it stays I/O-agnostic and trivially unit-testable.
 */

export interface JobEvent {
  jobId: string;
  kind: 'active' | 'completed' | 'failed';
}

export type GetRow = (jobId: string) => Promise<NormalizeJob | null>;

export function createJobStream(
  jobId: string,
  events$: Observable<JobEvent>,
  getRow: GetRow,
): Observable<MessageEvent> {
  return defer(() => from(getRow(jobId))).pipe(
    concatMap((initialRow) => {
      if (!initialRow) {
        return throwError(
          () => new NotFoundException(`Job ${jobId} not found`),
        );
      }

      const initial$ = of(toJobResponse(initialRow));

      const updates$ = events$.pipe(
        filter((e) => e.jobId === jobId),
        concatMap(() => from(getRow(jobId))),
        // Row could in theory have been deleted between event and read.
        // Drop the silent null rather than crashing the stream.
        filter((row): row is NormalizeJob => row !== null),
        map((row) => toJobResponse(row)),
      );

      return concat(initial$, updates$);
    }),
    // Inclusive: emit the terminal state, then complete.
    takeWhile((resp) => !isTerminal(resp.status), true),
    map((resp) => ({ data: resp }) as MessageEvent),
  );
}

function isTerminal(status: JobStatus): boolean {
  return status === JobStatus.COMPLETED || status === JobStatus.FAILED;
}

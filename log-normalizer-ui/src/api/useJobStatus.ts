import { useEffect, useRef, useState } from 'react'
import type { JobResponse, JobStatus } from '../types'
import { endpoints } from './client'

interface UseJobStatusResult {
  job: JobResponse | null
  loading: boolean
  error: string | null
  /** 'sse' while streaming, 'polling' if SSE failed and we degraded, 'idle' before any jobId is set, 'closed' once terminal. */
  transport: 'idle' | 'sse' | 'polling' | 'closed'
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(['COMPLETED', 'FAILED'])
const POLL_INTERVAL_MS = 2000

/**
 * Subscribes to a normalize job's state.
 *
 * Lifecycle:
 *  - jobId === null            → idle, no network
 *  - jobId set                 → open EventSource on /jobs/:id/events
 *  - SSE message               → setJob(parsed)
 *  - SSE error or no EventSource → close ES, fall back to setInterval
 *                                  polling every 2s
 *  - terminal status reached    → tear everything down, transport='closed'
 *  - jobId changes / unmount    → tear everything down
 *
 * The hook is intentionally single-purpose. It does NOT submit jobs —
 * the caller submits, gets a jobId from the 202, then passes it in.
 */
export const useJobStatus = (jobId: string | null): UseJobStatusResult => {
  const [job, setJob] = useState<JobResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transport, setTransport] = useState<UseJobStatusResult['transport']>('idle')

  // Refs hold mutable resources we need to tear down on cleanup. Using
  // refs (not state) avoids re-running the effect when they change.
  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setLoading(false)
      setError(null)
      setTransport('idle')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setJob(null)

    const teardown = () => {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    const handleJob = (next: JobResponse) => {
      if (cancelled) return
      setJob(next)
      setLoading(false)
      if (TERMINAL.has(next.status)) {
        teardown()
        setTransport('closed')
      }
    }

    const startPolling = () => {
      if (cancelled) return
      setTransport('polling')
      const tick = async () => {
        try {
          const next = await endpoints.getJob(jobId)
          handleJob(next)
        } catch (err) {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Polling failed')
        }
      }
      // Fire one immediately so the UI doesn't wait 2s for first paint.
      void tick()
      pollRef.current = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    }

    if (typeof EventSource === 'undefined') {
      startPolling()
      return () => {
        cancelled = true
        teardown()
      }
    }

    const es = new EventSource(endpoints.jobEventsUrl(jobId))
    esRef.current = es
    setTransport('sse')

    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as JobResponse
        handleJob(parsed)
      } catch {
        // Bad payload — ignore one bad frame, don't tear down.
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors. We only want to
      // fall back to polling if the connection is genuinely closed AND
      // we have not yet reached a terminal state. readyState===CLOSED
      // is the unrecoverable signal.
      if (es.readyState === EventSource.CLOSED) {
        teardown()
        if (!cancelled && (!job || !TERMINAL.has(job.status))) {
          startPolling()
        }
      }
    }

    return () => {
      cancelled = true
      teardown()
    }
    // job is intentionally NOT in deps — including it would re-open the
    // SSE connection on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return { job, loading, error, transport }
}

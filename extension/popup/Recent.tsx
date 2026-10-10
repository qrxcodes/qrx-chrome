import { useCallback, useEffect, useState } from 'react';
import { links } from '../config';
import { MessageError, send } from '../lib/messages';
import type { Code, Job } from '../lib/types';

export function Recent({
  pending,
  onOpenCode,
  onOpenJob,
  onSignedOut,
}: {
  pending: Job[];
  onOpenCode: (code: Code) => void;
  onOpenJob: (jobId: string) => void;
  onSignedOut: () => void;
}) {
  const [codes, setCodes] = useState<Code[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(
    (next?: string) =>
      send('codes/list', { cursor: next }).then(
        (page) => {
          setCodes((current) => [...(next ? (current ?? []) : []), ...page.data]);
          setCursor(page.nextCursor);
          setError(undefined);
          setLoading(false);
        },
        (err: unknown) => {
          setLoading(false);
          if (err instanceof MessageError && err.problem.type === 'unauthorized') onSignedOut();
          else setError("Couldn't load your codes. Try again in a moment.");
        }
      ),
    [onSignedOut]
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const load = (next: string) => {
    setLoading(true);
    void fetchPage(next);
  };

  const pendingIds = new Set(pending.map((job) => job.codeId).filter(Boolean));
  const shown = (codes ?? []).filter((code) => code.type === 'url' && !pendingIds.has(code.id));

  return (
    <div className="body">
      {error && <div className="notice error">{error}</div>}
      <div className="recent-grid">
        {pending.map((job) => (
          <button key={job.id} className="recent-item" onClick={() => onOpenJob(job.id)} title={job.request.prompt}>
            <div className="painting" />
            <span className="badge">Painting…</span>
          </button>
        ))}
        {shown.map((code) => (
          <button key={code.id} className="recent-item" onClick={() => onOpenCode(code)} title={code.prompt}>
            {code.imageUrl ? (
              <img src={code.imageUrl} alt={code.prompt} loading="lazy" />
            ) : (
              <div className="painting" />
            )}
            {code.status !== 'succeeded' && (
              <span className="badge">{code.status === 'failed' ? 'Failed' : 'Painting…'}</span>
            )}
          </button>
        ))}
      </div>
      {codes && !shown.length && !pending.length && (
        <div className="empty">No codes yet. Make your first one from the Create tab.</div>
      )}
      {loading && !codes && <div className="empty">Loading…</div>}
      {cursor && (
        <button className="button" onClick={() => load(cursor)} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Show more'}
        </button>
      )}
      <a className="hint" href={`${links.home}/my-codes`} target="_blank" rel="noreferrer">
        See all your codes on qrx.codes
      </a>
    </div>
  );
}

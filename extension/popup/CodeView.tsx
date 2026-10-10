import { describeProblem } from '../lib/problem';
import type { Code, Job } from '../lib/types';
import { copyImage, copyText, downloadImage } from '../ui/clipboard';
import { Mark } from '../ui/Mark';

type Props = {
  /** A job this browser started (may still be in progress), or a code from Recent. */
  job?: Job;
  code?: Code;
  onToast: (message: string) => void;
  onAnother: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
};

const displayLink = (url: string) => url.replace(/^https?:\/\//, '');

export function CodeView({ job, code: givenCode, onToast, onAnother, onRetry, onEdit }: Props) {
  const code = job?.code ?? givenCode;
  const state = job
    ? job.state
    : code?.status === 'succeeded'
      ? 'succeeded'
      : code?.status === 'failed'
        ? 'failed'
        : 'processing';
  const prompt = job?.request.prompt ?? code?.prompt ?? '';
  const destination = job?.request.destination ?? code?.destination ?? '';

  const run = (action: () => Promise<void>, done: string) => () =>
    action().then(
      () => onToast(done),
      (err: unknown) => onToast(err instanceof Error ? err.message : 'That didn’t work')
    );

  if (state === 'submitting' || state === 'processing') {
    const waiting = job?.problem && job.problem.type !== 'unauthorized' ? describeProblem(job.problem) : undefined;
    return (
      <div className="body">
        <div className="result-image" aria-busy="true">
          <div className="painting">
            <Mark title="" />
          </div>
        </div>
        <div>
          <div className="status-title">Painting your code…</div>
          <p className="hint">
            This usually takes under a minute. You can close this; we&apos;ll notify you when it&apos;s ready.
          </p>
        </div>
        {waiting && <div className="notice">{waiting.detail}</div>}
        {job?.problem?.type === 'unauthorized' && (
          <div className="notice error">Sign in again and this code will carry on.</div>
        )}
        <p className="prompt-line">{prompt}</p>
        <p className="meta-line">{displayLink(destination)}</p>
        <button className="button" onClick={onAnother}>
          Make another
        </button>
      </div>
    );
  }

  if (state === 'failed') {
    const problem = describeProblem(
      job?.problem ?? {
        type: 'generation-failed',
        title: "This one didn't work out",
        detail: code?.error?.message ?? 'Try another prompt.',
      }
    );
    return (
      <div className="body">
        <div className="notice error" role="alert">
          <strong>{problem.title}</strong>
          {problem.detail}
        </div>
        <p className="prompt-line">{prompt}</p>
        <p className="meta-line">{displayLink(destination)}</p>
        <div className="button-row">
          {onRetry && (
            <button className="button primary" onClick={onRetry}>
              Try again
            </button>
          )}
          {onEdit && (
            <button className="button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
        <button className="link-button" onClick={onAnother}>
          Make a different code
        </button>
      </div>
    );
  }

  const imageUrl = code?.imageUrl ?? undefined;
  const shortUrl = code?.shortUrl ?? undefined;
  const filename = `qrx-${code?.id ?? 'code'}.png`;

  return (
    <div className="body">
      <div className="result-image">{imageUrl && <img src={imageUrl} alt={`QR code: ${prompt}`} />}</div>
      {shortUrl && (
        <div className="short-link">
          <a href={shortUrl} target="_blank" rel="noreferrer" title={`Scans go to ${destination}`}>
            {displayLink(shortUrl)}
          </a>
          <button className="button" onClick={run(() => copyText(shortUrl), 'Link copied')}>
            Copy link
          </button>
        </div>
      )}
      <p className="meta-line">Scans go to {displayLink(destination)}</p>
      {imageUrl && (
        <div className="button-row">
          <button className="button" onClick={run(() => copyImage(imageUrl), 'Image copied')}>
            Copy image
          </button>
          <button className="button" onClick={run(() => downloadImage(imageUrl, filename), 'Downloading')}>
            Download PNG
          </button>
        </div>
      )}
      <div className="button-row">
        {code?.pageUrl && (
          <a className="button" href={code.pageUrl} target="_blank" rel="noreferrer">
            Open on qrx.codes
          </a>
        )}
        <button className="button primary" onClick={onAnother}>
          Make another
        </button>
      </div>
    </div>
  );
}

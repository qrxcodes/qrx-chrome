import { useEffect, useMemo, useState } from 'react';
import { MessageError, send } from '../lib/messages';
import { describeProblem } from '../lib/problem';
import type { CreateCodeRequest, ProblemInfo, Style } from '../lib/types';
import { useStored } from '../ui/hooks';

const NO_STYLE = 'Noop';

/**
 * The site's own small preview for a style (`/img/styles/<name>-192.webp`), from the API's `previewUrl`
 * (`/images/styles/<name>.png`). Used when the API's URL doesn't load.
 */
export function sitePreviewUrl(previewUrl: string): string | undefined {
  const match = /^(https:\/\/[^/]+)\/images\/styles\/([a-z0-9-]+)\.png$/i.exec(previewUrl);
  return match ? `${match[1]}/img/styles/${match[2].toLowerCase()}-192.webp` : undefined;
}

function StyleThumb({ previewUrl }: { previewUrl: string | null }) {
  const [src, setSrc] = useState(previewUrl ?? undefined);
  const onError = () => {
    const fallback = src && sitePreviewUrl(src);
    setSrc(fallback && fallback !== src ? fallback : undefined);
  };
  return src ? <img src={src} alt="" loading="lazy" onError={onError} /> : <img alt="" />;
}

export function isLinkable(url: string | undefined): url is string {
  return !!url && /^https?:\/\/[^\s\\]+$/i.test(url.trim());
}

/** The current tab's URL, through activeTab: readable only because the user clicked the toolbar button. */
function useActiveTabUrl(): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) => setUrl(isLinkable(tab?.url) ? tab.url : ''))
      .catch(() => setUrl(''));
  }, []);
  return url;
}

export function CreateForm({
  initial,
  onCreated,
  onSignedOut,
}: {
  initial?: CreateCodeRequest;
  onCreated: (jobId: string) => void;
  onSignedOut: () => void;
}) {
  const tabUrl = useActiveTabUrl();
  const lastStyle = useStored('lastStyle');
  // what the user typed or picked; until then, the tab's URL and the style used last time
  const [editedDestination, setDestination] = useState<string>();
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [pickedStyle, setStyle] = useState<string>();
  const [styles, setStyles] = useState<Style[]>();
  const [stylesError, setStylesError] = useState<string>();
  const [problem, setProblem] = useState<ProblemInfo>();
  const [submitting, setSubmitting] = useState(false);

  const destination = editedDestination ?? initial?.destination ?? tabUrl ?? '';
  const style = pickedStyle ?? initial?.style ?? (lastStyle.loaded ? (lastStyle.value ?? NO_STYLE) : undefined);

  useEffect(() => {
    send('styles/list')
      .then(setStyles)
      .catch((err: unknown) => {
        if (err instanceof MessageError && err.problem.type === 'unauthorized') onSignedOut();
        else setStylesError("Couldn't load styles. You can still make a code without one.");
      });
  }, [onSignedOut]);

  const orderedStyles = useMemo(() => {
    if (!styles) return [];
    // "No style" first, then the rest as the API lists them
    return [...styles.filter((s) => s.id === NO_STYLE), ...styles.filter((s) => s.id !== NO_STYLE)];
  }, [styles]);

  const linkOk = isLinkable(destination);
  const canSubmit = linkOk && prompt.trim().length > 0 && !submitting;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setProblem(undefined);
    try {
      const request: CreateCodeRequest = { prompt: prompt.trim(), destination: destination.trim() };
      if (style && style !== NO_STYLE) request.style = style;
      const job = await send('jobs/create', { request });
      onCreated(job.id);
    } catch (err) {
      if (err instanceof MessageError) setProblem(err.problem);
      else setProblem({ type: 'unknown', title: 'Something went wrong', detail: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const described = problem && describeProblem(problem);

  return (
    <form className="body" onSubmit={submit}>
      <div className="field">
        <label className="label" htmlFor="destination">
          Link <small>where scans go</small>
        </label>
        <input
          id="destination"
          className="input"
          type="url"
          value={destination}
          placeholder="https://"
          onChange={(e) => setDestination(e.target.value)}
          spellCheck={false}
        />
        {tabUrl === '' && !destination && (
          <span className="hint">This tab has no web address to link to. Paste a link instead.</span>
        )}
        {destination && !linkOk && <span className="error-text">Use a full http:// or https:// link.</span>}
      </div>

      <div className="field">
        <label className="label" htmlFor="prompt">
          Picture <small>{prompt.length}/1000</small>
        </label>
        <textarea
          id="prompt"
          className="textarea"
          value={prompt}
          maxLength={1000}
          placeholder="A watercolour lighthouse on a rocky coast at dawn"
          onChange={(e) => setPrompt(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field">
        <span className="label">Style</span>
        {stylesError && <span className="hint">{stylesError}</span>}
        <div className="styles" role="group" aria-label="Style">
          {orderedStyles.map((s) => (
            <button
              type="button"
              key={s.id}
              className="style"
              aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)}
              title={s.name}
            >
              <StyleThumb previewUrl={s.previewUrl} />
              <span>{s.id === NO_STYLE ? 'No style' : s.name}</span>
            </button>
          ))}
          {!styles && !stylesError && Array.from({ length: 8 }, (_, i) => <div key={i} className="style" />)}
        </div>
      </div>

      {described && (
        <div className="notice error" role="alert">
          <strong>{described.title}</strong>
          {described.detail}
        </div>
      )}

      <button className="button primary large" type="submit" disabled={!canSubmit}>
        {submitting ? <span className="spinner" /> : 'Create QR code'}
      </button>
    </form>
  );
}

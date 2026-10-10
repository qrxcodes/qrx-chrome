import { useCallback, useEffect, useMemo, useState } from 'react';
import { config } from '../config';
import { send } from '../lib/messages';
import { isPending } from '../lib/jobs';
import type { AuthStatus, Code, CreateCodeRequest, Job } from '../lib/types';
import { useStored, useToast } from '../ui/hooks';
import { GearIcon, Mark } from '../ui/Mark';
import { CodeView } from './CodeView';
import { CreateForm } from './CreateForm';
import { Recent } from './Recent';
import { SignIn } from './SignIn';

type View =
  | { name: 'create'; initial?: CreateCodeRequest }
  | { name: 'job'; jobId: string }
  | { name: 'code'; code: Code }
  | { name: 'recent' };

/** Opened from a notification as a tab (where the popup can't open), with ?job=<id>. */
const jobFromQuery = new URLSearchParams(location.search).get('job') ?? undefined;
const inTab = !!jobFromQuery || new URLSearchParams(location.search).has('tab');

export function App() {
  const [status, setStatus] = useState<AuthStatus>();
  const auth = useStored('auth');
  const authError = useStored('authError');
  const signingIn = useStored('signingIn');
  const jobs = useStored('jobs');
  const [view, setView] = useState<View>();
  const [toast, showToast] = useToast();

  // the stored auth changes when the worker finishes a sign-in, a refresh fails, or the options page changes it
  useEffect(() => {
    send('auth/status').then(setStatus, () =>
      setStatus({ signedIn: false, error: 'The extension is starting. Try again.' })
    );
  }, [auth.value, authError.value, signingIn.value]);

  // open on the job the user was last waiting for, or that a notification pointed at
  useEffect(() => {
    if (view || !jobs.loaded || !status?.signedIn) return;
    void chrome.storage.local.get('focusJobId').then(({ focusJobId }) => {
      const id = jobFromQuery ?? (focusJobId as string | undefined);
      const job = id ? jobs.value?.[id] : undefined;
      if (job && (isPending(job) || !job.seen)) setView({ name: 'job', jobId: job.id });
      else setView({ name: 'create' });
    });
  }, [jobs, status?.signedIn, view]);

  const currentJob = view?.name === 'job' ? jobs.value?.[view.jobId] : undefined;

  useEffect(() => {
    if (currentJob && currentJob.state === 'succeeded' && !currentJob.seen) {
      void send('jobs/seen', { id: currentJob.id });
    }
  }, [currentJob]);

  const pending = useMemo(
    () =>
      Object.values(jobs.value ?? {})
        .filter(isPending)
        .sort((a, b) => b.createdAt - a.createdAt),
    [jobs.value]
  );

  const onSignedOut = useCallback(() => {
    void send('auth/status').then(setStatus);
  }, []);

  const openJob = (jobId: string) => {
    void chrome.storage.local.set({ focusJobId: jobId });
    setView({ name: 'job', jobId });
  };

  const another = (initial?: CreateCodeRequest) => {
    void chrome.storage.local.remove('focusJobId');
    setView({ name: 'create', initial });
  };

  const retry = async (job: Job) => {
    const next = await send('jobs/retry', { id: job.id });
    if (next) openJob(next.id);
  };

  if (!status) return <div className={`popup ${inTab ? 'in-tab' : ''}`} />;

  const tab = view?.name === 'recent' || view?.name === 'code' ? 'recent' : 'create';

  return (
    <div className={`popup ${inTab ? 'in-tab' : ''}`}>
      <header className="header">
        <span className="brand">
          <Mark />
          QRX{config.env === 'dev' && <small className="hint">dev</small>}
        </span>
        {status.signedIn && (
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'create'} onClick={() => another()}>
              Create
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={tab === 'recent'}
              onClick={() => setView({ name: 'recent' })}
            >
              Recent
            </button>
          </div>
        )}
        <button
          className="icon-button"
          style={status.signedIn ? undefined : { marginLeft: 'auto' }}
          title="Settings"
          aria-label="Settings"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <GearIcon />
        </button>
      </header>

      {!status.signedIn && <SignIn status={status} />}

      {status.signedIn && view?.name === 'create' && (
        <CreateForm
          key={JSON.stringify(view.initial ?? {})}
          initial={view.initial}
          onCreated={openJob}
          onSignedOut={onSignedOut}
        />
      )}

      {status.signedIn && view?.name === 'job' && currentJob && (
        <CodeView
          job={currentJob}
          onToast={showToast}
          onAnother={() => another()}
          onRetry={() => void retry(currentJob)}
          onEdit={() => another(currentJob.request)}
        />
      )}

      {status.signedIn && view?.name === 'job' && jobs.loaded && !currentJob && (
        <div className="body">
          <div className="empty">That code is no longer here. Find it under Recent.</div>
        </div>
      )}

      {status.signedIn && view?.name === 'code' && (
        <CodeView code={view.code} onToast={showToast} onAnother={() => another()} />
      )}

      {status.signedIn && view?.name === 'recent' && (
        <Recent
          pending={pending}
          onOpenCode={(code) => setView({ name: 'code', code })}
          onOpenJob={openJob}
          onSignedOut={onSignedOut}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

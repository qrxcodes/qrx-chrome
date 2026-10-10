import { useEffect, useState } from 'react';
import { config, links } from '../config';
import { MessageError, send } from '../lib/messages';
import type { AuthStatus } from '../lib/types';
import { useStored } from '../ui/hooks';
import { Mark } from '../ui/Mark';

export function Options() {
  const auth = useStored('auth');
  const authError = useStored('authError');
  const [status, setStatus] = useState<AuthStatus>();
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string>();

  useEffect(() => {
    void send('auth/status').then(setStatus);
  }, [auth.value, authError.value]);

  useEffect(() => {
    void send('auth/redirectUri').then(setRedirectUri);
  }, []);

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setKeyError(undefined);
    try {
      setStatus(await send('auth/apiKey', { apiKey }));
      setApiKey('');
    } catch (err) {
      setKeyError(err instanceof MessageError ? err.problem.detail || err.problem.title : String(err));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => setStatus(await send('auth/signOut'));

  return (
    <main className="options">
      <h1>
        <Mark /> QRX settings
      </h1>

      <section className="card">
        <h2>Your QRX account</h2>
        {status?.signedIn ? (
          <>
            <p>
              {status.method === 'apiKey'
                ? `Using an API key${status.keyPrefix ? ` (${status.keyPrefix}…)` : ''}.`
                : 'Signed in to QRX.'}
            </p>
            <div className="inline">
              <button className="button" onClick={signOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Not signed in. Use the QRX button in the toolbar to sign in.</p>
            {status?.error && <div className="notice error">{status.error}</div>}
            <div className="inline">
              <button className="button primary" onClick={() => void send('auth/signIn').then(setStatus)}>
                Sign in to QRX
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Use an API key instead</h2>
        <p>
          If you can&apos;t use the sign-in window, paste an API key from{' '}
          <a href={links.apiKeys} target="_blank" rel="noreferrer">
            your QRX developer settings
          </a>
          . The key stays in this browser&apos;s extension storage and is sent only to {new URL(config.apiBase).host}.
        </p>
        <form className="inline" onSubmit={saveKey}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 260 }}
            type="password"
            autoComplete="off"
            placeholder="qrx_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            aria-label="API key"
          />
          <button className="button primary" type="submit" disabled={!apiKey.trim() || saving}>
            {saving ? <span className="spinner" /> : 'Save key'}
          </button>
        </form>
        {keyError && <span className="error-text">{keyError}</span>}
      </section>

      <section className="card">
        <h2>About</h2>
        <p>
          QRX {config.version}
          {config.env === 'dev' ? ' (development build, dev.qrx.codes)' : ''}.{' '}
          <a href={links.privacy} target="_blank" rel="noreferrer">
            Privacy policy
          </a>{' '}
          ·{' '}
          <a href={links.support} target="_blank" rel="noreferrer">
            Support
          </a>
        </p>
        {redirectUri && (
          <p className="hint">
            Sign-in redirect URI for this browser: <code>{redirectUri}</code>
          </p>
        )}
      </section>
    </main>
  );
}

import heroUrl from '../../public/qrx-code-512.png';
import { links } from '../config';
import { send } from '../lib/messages';
import type { AuthStatus } from '../lib/types';

export function SignIn({ status }: { status: AuthStatus }) {
  const signIn = () => {
    // the popup closes when the sign-in window takes focus; the service worker finishes the sign-in on its own
    void send('auth/signIn').catch(() => undefined);
  };

  return (
    <div className="welcome">
      <img className="hero" src={heroUrl} alt="A QRX code: a watercolour waterfall scene that scans" />
      <h1>Make an art QR code for this page</h1>
      <p>Describe a picture, pick a style, and QRX paints a code that still scans, with a qrx.to short link.</p>
      {status.error && <div className="notice error">{status.error}</div>}
      <button className="button primary large" onClick={signIn} disabled={status.signingIn}>
        {status.signingIn ? (
          <>
            <span className="spinner" /> Finish signing in in the QRX window
          </>
        ) : (
          'Sign in to QRX'
        )}
      </button>
      <p className="hint">
        No account? Make a free one in the sign-in window. ·{' '}
        <a href={links.privacy} target="_blank" rel="noreferrer">
          Privacy
        </a>
      </p>
    </div>
  );
}

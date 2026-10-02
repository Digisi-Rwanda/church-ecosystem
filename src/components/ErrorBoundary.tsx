import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Catches a crash in one page so the rest of the app (menu, sign-out, other
 * modules) keeps working, and shows a calm message instead of a blank screen.
 * Also covers a page chunk that failed to download (flaky mobile data).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? 'app', error, info.componentStack);
    try {
      window.dispatchEvent(
        new CustomEvent('app:error', { detail: { label: this.props.label ?? 'app', message: error.message } }),
      );
    } catch {
      /* reporting must never throw */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div role="alert" style={{ padding: '2rem', maxWidth: 560, margin: '3rem auto' }}>
        <h2 style={{ marginTop: 0 }}>This page could not be shown</h2>
        <p>
          {chunk
            ? 'The page could not be downloaded. Check your connection and try again.'
            : 'Something went wrong on this page. Your other pages are not affected, and nothing you saved was lost.'}
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>{' '}
        <button type="button" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    );
  }
}

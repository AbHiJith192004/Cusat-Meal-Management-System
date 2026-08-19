import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Remounts the boundary when this changes, so navigating away clears an error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken screen from taking the whole app down with it.
 * Without this, a throw anywhere in a view renders a blank white page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  // This project has no @types/react installed, so React.Component carries no
  // type information and inherited members have to be declared by hand.
  declare props: Props;
  declare setState: (next: Partial<State>) => void;

  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="page-container">
        <div
          className="rounded-2xl p-6 max-w-[560px]"
          style={{ background: 'var(--card)', border: '1px solid #F6C8C3' }}
          role="alert"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined" style={{ color: 'var(--red)', fontSize: 22 }}>
              error
            </span>
            <h2 className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
              This screen could not load
            </h2>
          </div>

          <p className="text-[13px] font-semibold mt-2" style={{ color: 'var(--text-body)' }}>
            Try another tab, or reload the page. The rest of the app is still working.
          </p>

          <pre
            className="mt-4 p-3 rounded-lg text-[11px] overflow-x-auto"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}
          >
            {error.message}
          </pre>

          <button onClick={() => this.setState({ error: null })} className="btn-secondary mt-4">
            Try again
          </button>
        </div>
      </div>
    );
  }
}

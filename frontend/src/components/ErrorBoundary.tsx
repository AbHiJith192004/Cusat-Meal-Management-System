import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidUpdate(prevProps: Props) {
    const self = this as unknown as Component<Props, State>;
    if (prevProps.resetKey !== self.props.resetKey && self.state.error) {
      self.setState({ error: null });
    }
  }

  public render(): ReactNode {
    const self = this as unknown as Component<Props, State>;
    const { error } = self.state;
    if (!error) return self.props.children;

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

          <button onClick={() => self.setState({ error: null })} className="btn-secondary mt-4">
            Try again
          </button>
        </div>
      </div>
    );
  }
}

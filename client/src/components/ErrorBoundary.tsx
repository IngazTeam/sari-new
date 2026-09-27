import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { WorkspaceStandalone, WorkspaceState } from './merchant/WorkspaceState';

interface Props {
  children: ReactNode;
  fallback?: (retry: () => void, error: Error | null) => ReactNode;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Auto-reload once on stale chunk / dynamic import errors (post-deployment)
    const isChunkError = error.message?.includes('dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch');
    const key = 'eb_reload_' + window.location.pathname;
    try {
      if (isChunkError && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    } catch { /* Recovery remains available when storage is blocked. */ }
  }

  componentDidUpdate(previous: Props) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) this.retry();
  }

  retry = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.retry, this.state.error);
      if (/^\/merchant(?:\/|$)/.test(window.location.pathname)) {
        return <WorkspaceStandalone><WorkspaceState kind="error" onRetry={() => window.location.reload()} focus /></WorkspaceStandalone>;
      }
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">حدث خطأ غير متوقع | Something went wrong</h2>

            {import.meta.env.DEV && (
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>
            )}
            {!import.meta.env.DEV && (
            <p className="text-muted-foreground mb-6">يرجى إعادة تحميل الصفحة أو التواصل مع الدعم | Please reload the page or contact support</p>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

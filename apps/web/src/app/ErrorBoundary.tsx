import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    override state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("[cinderfall] UI error", error, info.componentStack);
    }

    override render(): ReactNode {
        if (this.state.error) {
            return (
                <div className="boot">
                    <div className="crash">
                        <p>Something went wrong.</p>
                        <button
                            className="btn"
                            onClick={() => window.location.reload()}
                        >
                            Reload
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

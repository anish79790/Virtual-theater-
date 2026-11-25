import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = error.message || 'An unexpected cinema playback error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed.error) {
        friendly = `Database access issue (${parsed.operationType || 'sync'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: friendly };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('CineHall ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070506] text-[#F5EFEA] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[#140C0F] border border-[#E5C17B]/15 p-7 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-[#9E1B32]/20 text-[#E5C17B] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold font-display">Cinema Interrupted</h2>
              <p className="text-sm text-[#B7A9A4] leading-relaxed break-words">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-12 rounded-xl cinema-cta-gradient text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload CineHall
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

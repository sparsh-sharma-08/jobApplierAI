'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
    children?: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    }

    public render() {
        if (this.state.hasError) {
            return (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 my-4 shadow-sm"
                >
                    <div className="p-3 bg-white rounded-full shadow-sm text-rose-500">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Something went wrong!</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                            {this.props.fallbackMessage || "We encountered an unexpected error while loading this component."}
                        </p>
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="btn-secondary px-4 py-2 text-sm flex items-center gap-2 mt-2 bg-white hover:bg-slate-50 border border-slate-200"
                    >
                        <RefreshCcw className="w-4 h-4" /> Reload Page
                    </button>
                </motion.div>
            );
        }

        return this.props.children;
    }
}

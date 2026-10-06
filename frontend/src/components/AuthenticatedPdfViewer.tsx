'use client';

import React, { useState, useEffect } from 'react';
import { Download, ExternalLink, RefreshCw, AlertCircle, FileText } from 'lucide-react';

interface AuthenticatedPdfViewerProps {
    url: string;
    title?: string;
    height?: string;
}

export default function AuthenticatedPdfViewer({
    url,
    title = 'Resume PDF',
    height = '650px'
}: AuthenticatedPdfViewerProps) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const loadPdf = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`Failed to load PDF (${response.status}: ${response.statusText})`);
            }

            const blob = await response.blob();
            // Verify we got a PDF
            const objectUrl = URL.createObjectURL(blob);
            setBlobUrl(objectUrl);
        } catch (err: any) {
            console.error('Error loading PDF blob:', err);
            setError(err.message || 'Unable to preview PDF document.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPdf();

        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [url]);

    const handleDownload = () => {
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = title.endsWith('.pdf') ? title : `${title}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleOpenNewTab = () => {
        if (!blobUrl) return;
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
            {/* Header controls bar */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                    <FileText className="w-4 h-4 text-primary-500" />
                    <span>{title}</span>
                </div>

                <div className="flex items-center gap-2">
                    {loading && (
                        <span className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Loading PDF...
                        </span>
                    )}

                    {blobUrl && (
                        <>
                            <button
                                onClick={handleOpenNewTab}
                                className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                                title="Open in new window"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Open in Tab</span>
                            </button>
                            <button
                                onClick={handleDownload}
                                className="px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-xs"
                                title="Download PDF document"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Viewer body */}
            <div className="relative w-full bg-slate-100 dark:bg-slate-950/40" style={{ height }}>
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs z-10">
                        <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Preparing ATS PDF preview...
                        </p>
                    </div>
                )}

                {error ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center mb-3">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                            Failed to preview PDF
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                            {error}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadPdf}
                                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Try Again
                            </button>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 flex items-center gap-1.5"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> Direct Link
                            </a>
                        </div>
                    </div>
                ) : blobUrl ? (
                    <object
                        data={blobUrl}
                        type="application/pdf"
                        className="w-full h-full border-0"
                    >
                        {/* Fallback for browsers that don't support object PDF */}
                        <iframe
                            src={blobUrl}
                            className="w-full h-full border-0"
                            title={title}
                        />
                    </object>
                ) : null}
            </div>
        </div>
    );
}

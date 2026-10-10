'use client';

import { useState } from 'react';
import { X, Globe, FileText, Edit3, Loader2, Sparkles, Building2, MapPin, DollarSign, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface AddJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJobAdded: () => void;
    initialUrl?: string;
    initialNotice?: string;
}

export default function AddJobModal({
    isOpen,
    onClose,
    onJobAdded,
    initialUrl = '',
    initialNotice = '',
}: AddJobModalProps) {
    const [tab, setTab] = useState<'url' | 'text' | 'manual'>(initialNotice ? 'text' : 'url');
    const [url, setUrl] = useState(initialUrl);
    const [rawText, setRawText] = useState('');
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState(initialNotice);

    // Manual form state
    const [role, setRole] = useState('');
    const [company, setCompany] = useState('');
    const [location, setLocation] = useState('Remote');
    const [salary, setSalary] = useState('');
    const [applyLink, setApplyLink] = useState(initialUrl);
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const getToken = () => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('token');
    };

    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
            toast.error('Please enter a job URL');
            return;
        }

        try {
            new URL(trimmedUrl);
        } catch {
            toast.error('Please enter a valid URL (including https://)');
            return;
        }

        const token = getToken();
        if (!token) return;

        setLoading(true);
        try {
            const res = await fetch(`${API}/jobs/parse-url`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: trimmedUrl }),
            });
            const data = await res.json();

            if (res.ok) {
                toast.success('Job parsed, scored, and added to pipeline!');
                onJobAdded();
                onClose();
            } else if (res.status === 422 || res.status === 400) {
                setNotice(data.detail || 'This site requires bot verification. Please paste the job description below.');
                setApplyLink(trimmedUrl);
                setTab('text');
            } else {
                toast.error(data.detail || 'Failed to parse job URL.');
            }
        } catch (err) {
            toast.error('Network error while parsing URL.');
        } finally {
            setLoading(false);
        }
    };

    const handleTextSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedText = rawText.trim();
        if (!trimmedText || trimmedText.length < 20) {
            toast.error('Please paste the job posting text (at least 20 characters)');
            return;
        }

        const token = getToken();
        if (!token) return;

        setLoading(true);
        try {
            const res = await fetch(`${API}/jobs/parse-text`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: trimmedText,
                    url: url.trim() || applyLink.trim() || '',
                }),
            });
            const data = await res.json();

            if (res.ok) {
                toast.success('Job extracted with AI, scored, and added!');
                onJobAdded();
                onClose();
            } else {
                toast.error(data.detail || 'Failed to parse job text.');
            }
        } catch (err) {
            toast.error('Network error while processing text.');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!role.trim() || !company.trim()) {
            toast.error('Role and Company are required');
            return;
        }

        const token = getToken();
        if (!token) return;

        setLoading(true);
        try {
            const res = await fetch(`${API}/jobs/manual`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role: role.trim(),
                    company: company.trim(),
                    location: location.trim() || 'Remote',
                    salary: salary.trim(),
                    apply_link: applyLink.trim(),
                    description: description.trim(),
                }),
            });
            const data = await res.json();

            if (res.ok) {
                toast.success('Job created, scored, and added to pipeline!');
                onJobAdded();
                onClose();
            } else {
                toast.error(data.detail || 'Failed to create job.');
            }
        } catch (err) {
            toast.error('Network error while creating job.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg">Add Custom Job</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Extract from any website, paste posting text, or enter manually
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-1.5 gap-1.5">
                    <button
                        type="button"
                        onClick={() => setTab('url')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                            tab === 'url'
                                ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        <span>From URL</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('text')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                            tab === 'text'
                                ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Paste Text (AI)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('manual')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                            tab === 'manual'
                                ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Manual</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {notice && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                            <span className="font-semibold block mb-0.5">Anti-bot notice:</span>
                            {notice}
                        </div>
                    )}

                    {/* Tab: URL */}
                    {tab === 'url' && (
                        <form onSubmit={handleUrlSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Job URL
                                </label>
                                <div className="relative">
                                    <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://company.com/jobs/senior-engineer"
                                        required
                                        className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                                    Works automatically with Greenhouse, Lever, Ashby, and company career portals.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !url.trim()}
                                className="w-full btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>{loading ? 'Fetching & Extracting...' : 'Fetch & Extract with AI'}</span>
                            </button>
                        </form>
                    )}

                    {/* Tab: Paste Text */}
                    {tab === 'text' && (
                        <form onSubmit={handleTextSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Job Posting Text
                                </label>
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="Paste the job description text copied from Indeed, LinkedIn, or any career page..."
                                    rows={7}
                                    required
                                    className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono"
                                />
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                                    Our AI automatically extracts the title, company, location, salary, and requirements.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Original Link (Optional)
                                </label>
                                <div className="relative">
                                    <ExternalLink className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://in.indeed.com/viewjob?..."
                                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !rawText.trim()}
                                className="w-full btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>{loading ? 'Analyzing with AI...' : 'Extract & Add with AI'}</span>
                            </button>
                        </form>
                    )}

                    {/* Tab: Manual */}
                    {tab === 'manual' && (
                        <form onSubmit={handleManualSubmit} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        Role / Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        placeholder="e.g. Senior Backend Engineer"
                                        required
                                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        Company *
                                    </label>
                                    <div className="relative">
                                        <Building2 className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={company}
                                            onChange={(e) => setCompany(e.target.value)}
                                            placeholder="e.g. Acme Corp"
                                            required
                                            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        Location
                                    </label>
                                    <div className="relative">
                                        <MapPin className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            placeholder="Remote or City"
                                            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        Salary (Optional)
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={salary}
                                            onChange={(e) => setSalary(e.target.value)}
                                            placeholder="e.g. $120k - $150k"
                                            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Apply / Source Link
                                </label>
                                <input
                                    type="url"
                                    value={applyLink}
                                    onChange={(e) => setApplyLink(e.target.value)}
                                    placeholder="https://company.com/apply"
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Job Description / Requirements
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Paste requirements, responsibilities, or notes..."
                                    rows={4}
                                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !role.trim() || !company.trim()}
                                className="w-full btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>{loading ? 'Adding Job...' : 'Add to Pipeline & Score'}</span>
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

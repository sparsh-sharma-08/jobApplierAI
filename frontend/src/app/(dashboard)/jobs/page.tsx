'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Briefcase, MapPin, Building2, ExternalLink, Loader2, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, FileText, Download, Eye, FileSignature, Copy, CheckCheck, Edit3, Save, X } from 'lucide-react';
import LLMProgressBar from '@/components/LLMProgressBar';
import { useSettings, CURRENCY_SYMBOLS } from '@/hooks/useSettings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface Job {
    id: number;
    external_id: string;
    source: string;
    company: string;
    role: string;
    location: string;
    salary: string;
    description: string;
    apply_link: string;
    posted_date: string;
    status: string;
    score: { score: number; explanation: { matched_skills: string[]; missing_keywords: string[]; experience_match: string; recommendations: string[] } } | null;
}

const sourceColors: Record<string, string> = {
    remoteok: 'bg-green-100 text-green-700',
    arbeitnow: 'bg-teal-100 text-teal-700',
    jobicy: 'bg-purple-100 text-purple-700',
    himalayas: 'bg-sky-100 text-sky-700',
    adzuna: 'bg-orange-100 text-orange-700',
    linkedin: 'bg-blue-100 text-blue-700',
};

function getScoreColor(score: number) {
    if (score >= 80) return 'from-emerald-400 to-emerald-600';
    if (score >= 60) return 'from-blue-400 to-blue-600';
    if (score >= 40) return 'from-amber-400 to-amber-600';
    return 'from-slate-400 to-slate-600';
}

function cleanHtmlText(text: string) {
    if (!text) return '';
    return text
        .replace(/â€™/g, "'")
        .replace(/â€œ/g, '"')
        .replace(/â€\x9D/g, '"')
        .replace(/â€"/g, '-')
        .replace(/â€”/g, '—')
        .replace(/â€¢/g, '•')
        .replace(/â€¦/g, '…')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/â€/g, "'"); // catchall for other broken quotes
}

export default function JobsPage() {
    const { settings } = useSettings();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedJob, setExpandedJob] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'score' | 'date'>(settings.defaultSort);
    const [isFetching, setIsFetching] = useState(false);
    const [generatingResumeFor, setGeneratingResumeFor] = useState<number | null>(null);
    const [jobResumes, setJobResumes] = useState<Record<number, string>>({});
    const [jobCoverLetters, setJobCoverLetters] = useState<Record<number, string>>({});
    const [viewingPdf, setViewingPdf] = useState<number | null>(null);
    const [viewingCoverLetter, setViewingCoverLetter] = useState<number | null>(null);
    const [copiedCL, setCopiedCL] = useState<number | null>(null);
    const [resumeError, setResumeError] = useState<string>('');
    // Editing states
    const [editingCoverLetter, setEditingCoverLetter] = useState<number | null>(null);
    const [editCLText, setEditCLText] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const currencySymbol = CURRENCY_SYMBOLS[settings.currency] || '₹';

    const getToken = () => localStorage.getItem('token');

    const fetchJobs = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API}/jobs?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setJobs(data); }
        } catch { } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    const handleFetch = async () => {
        const token = getToken();
        if (!token) return;
        setIsFetching(true);
        try {
            await fetch(`${API}/jobs/fetch`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(settings.enabledSources),
            });
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts++;
                if (attempts > 40) { clearInterval(poll); setIsFetching(false); fetchJobs(); return; }
                try {
                    const res = await fetch(`${API}/jobs?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.length > jobs.length) { clearInterval(poll); setJobs(data); setIsFetching(false); }
                    }
                } catch { }
            }, 3000);
        } catch { setIsFetching(false); }
    };

    const handleGenerateResume = async (jobId: number) => {
        const token = getToken();
        if (!token) return;
        setGeneratingResumeFor(jobId);
        setResumeError('');
        try {
            const res = await fetch(`${API}/resumes/generate/${jobId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.file_path_pdf) {
                    setJobResumes(prev => ({ ...prev, [jobId]: data.file_path_pdf }));
                }
                if (data.cover_letter) {
                    setJobCoverLetters(prev => ({ ...prev, [jobId]: data.cover_letter }));
                }
            } else {
                const err = await res.json().catch(() => ({}));
                setResumeError(err.detail || err.message || 'Failed to generate resume');
            }
        } catch {
            setResumeError('Network error generating resume');
        } finally {
            setGeneratingResumeFor(null);
        }
    };

    const handleCopyCoverLetter = (jobId: number) => {
        const cl = jobCoverLetters[jobId];
        if (cl) {
            navigator.clipboard.writeText(cl);
            setCopiedCL(jobId);
            setTimeout(() => setCopiedCL(null), 2000);
        }
    };

    const handleEditCoverLetter = (jobId: number) => {
        setEditCLText(jobCoverLetters[jobId] || '');
        setEditingCoverLetter(jobId);
        setViewingCoverLetter(jobId);
    };

    const handleSaveCoverLetter = async (jobId: number) => {
        const token = getToken();
        if (!token) return;
        setSavingEdit(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/resume`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cover_letter: editCLText }),
            });
            if (res.ok) {
                const data = await res.json();
                setJobCoverLetters(prev => ({ ...prev, [jobId]: data.cover_letter }));
                setEditingCoverLetter(null);
            }
        } catch { }
        setSavingEdit(false);
    };

    // Get unique sources from actual jobs
    const jobSources = useMemo(() => {
        const sources = new Set(jobs.map(j => j.source));
        return Array.from(sources).sort();
    }, [jobs]);

    const filteredAndSorted = useMemo(() => {
        let filtered = jobs;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(j => j.role.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q));
        }
        if (sourceFilter !== 'all') {
            filtered = filtered.filter(j => j.source === sourceFilter);
        }
        return [...filtered].sort((a, b) => {
            if (sortBy === 'score') return (b.score?.score || 0) - (a.score?.score || 0);
            return new Date(b.posted_date).getTime() - new Date(a.posted_date).getTime();
        });
    }, [jobs, searchQuery, sourceFilter, sortBy]);

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="w-80"><LLMProgressBar text="Loading jobs..." /></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Jobs Pipeline</h1>
                    <p className="mt-1 text-slate-500 text-sm font-medium">
                        {filteredAndSorted.length} jobs found · AI-scored and ranked by match quality
                    </p>
                </div>
                <button onClick={handleFetch} disabled={isFetching}
                    className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-70 hover:scale-[1.02]">
                    {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isFetching ? 'Scanning...' : 'Fetch New Jobs'}
                </button>
            </div>

            {isFetching && <LLMProgressBar text="Scanning job portals for new opportunities..." />}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                        placeholder="Search roles, companies..." />
                </div>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                    className="px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="all">All Sources</option>
                    {jobSources.map(s =>
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    )}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as 'score' | 'date')}
                    className="px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="score">Highest Score</option>
                    <option value="date">Most Recent</option>
                </select>
            </div>

            {/* Job Cards */}
            {filteredAndSorted.length === 0 ? (
                <div className="text-center py-16 glass-card">
                    <Briefcase className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-600">No jobs found</h3>
                    <p className="text-sm text-slate-400 mt-1">Try fetching new jobs or adjusting your filters.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredAndSorted.map(job => {
                        const isExpanded = expandedJob === job.id;
                        const score = job.score?.score || 0;
                        const matchedSkills = job.score?.explanation?.matched_skills || [];
                        const missingSkills = job.score?.explanation?.missing_keywords || [];
                        const resumePath = jobResumes[job.id];
                        const coverLetter = jobCoverLetters[job.id];
                        const isGenerating = generatingResumeFor === job.id;
                        const isEditingCL = editingCoverLetter === job.id;

                        return (
                            <div key={job.id} className="glass-card overflow-hidden hover:shadow-xl transition-all duration-300">
                                <div className="p-5 flex gap-4">
                                    {/* Score Badge */}
                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getScoreColor(score)} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                                        <span className="text-white font-bold text-lg">{score}</span>
                                    </div>

                                    {/* Job Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h3 className="font-bold text-slate-900 text-lg leading-tight">{job.role}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{job.company}</span>
                                                    {job.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>}
                                                    {job.salary && <span className="flex items-center gap-1"><span className="text-xs font-semibold">{currencySymbol}</span>{job.salary}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${sourceColors[job.source] || 'bg-slate-100 text-slate-600'}`}>
                                                    {job.source}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Matched Skills */}
                                        {matchedSkills.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                {matchedSkills.slice(0, 6).map((skill, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                                                        <CheckCircle2 className="w-3 h-3" />{skill}
                                                    </span>
                                                ))}
                                                {matchedSkills.length > 6 && (
                                                    <span className="text-xs text-slate-400 px-2 py-0.5">+{matchedSkills.length - 6} more</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Date + Actions */}
                                        <div className="flex items-center gap-3 mt-3">
                                            <span className="text-xs text-slate-400">
                                                {new Date(job.posted_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                            <div className="flex-1" />
                                            <button onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                                                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                                {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" />Less</> : <><ChevronDown className="w-3.5 h-3.5" />Details</>}
                                            </button>
                                            <a href={job.apply_link} target="_blank" rel="noopener noreferrer"
                                                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                                <ExternalLink className="w-3.5 h-3.5" />Apply
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded View */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        {/* Missing Skills */}
                                        {missingSkills.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Missing Skills</h4>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {missingSkills.map((skill, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-red-50 text-red-600 rounded-md border border-red-100">
                                                            <XCircle className="w-3 h-3" />{skill}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Description */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                                            <div
                                                className="text-sm text-slate-600 leading-relaxed max-h-48 overflow-y-auto prose prose-sm prose-slate max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:ml-4 [&>ul]:mb-2 [&>li]:mb-1 [&>strong]:font-semibold"
                                                dangerouslySetInnerHTML={{
                                                    __html: job.description
                                                        ? cleanHtmlText(job.description).slice(0, 1500) + (job.description.length > 1500 ? '...' : '')
                                                        : 'No description available.'
                                                }}
                                            />
                                        </div>

                                        {/* Resume & Cover Letter Section */}
                                        <div className="pt-3 border-t border-slate-100 space-y-3">
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Resume & Cover Letter</h4>

                                            {resumeError && generatingResumeFor === null && (
                                                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                                                    ⚠️ {resumeError}
                                                </div>
                                            )}

                                            {isGenerating ? (
                                                <LLMProgressBar text="Generating tailored resume & cover letter..." />
                                            ) : resumePath ? (
                                                <div className="space-y-3">
                                                    {/* Resume actions */}
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                                                            <CheckCircle2 className="w-4 h-4" /> Resume ready
                                                        </span>
                                                        <button onClick={() => setViewingPdf(viewingPdf === job.id ? null : job.id)}
                                                            className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                                                            <Eye className="w-3.5 h-3.5" />{viewingPdf === job.id ? 'Hide' : 'Preview PDF'}
                                                        </button>
                                                        <a href={resumePath.startsWith('/resumes/') ? `${API}${resumePath}` : `${API}/download/${encodeURIComponent(resumePath)}`} target="_blank" rel="noopener noreferrer"
                                                            className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                                                            <Download className="w-3.5 h-3.5" />Download
                                                        </a>
                                                        <button onClick={() => handleGenerateResume(job.id)}
                                                            className="text-xs font-medium text-slate-400 hover:text-primary-600 flex items-center gap-1">
                                                            <RefreshCw className="w-3 h-3" />Regenerate
                                                        </button>
                                                    </div>

                                                    {/* PDF Preview */}
                                                    {viewingPdf === job.id && (
                                                        <iframe src={resumePath.startsWith('/resumes/') ? `${API}${resumePath}` : `${API}/download/${encodeURIComponent(resumePath)}`}
                                                            className="w-full h-[500px] rounded-xl border border-slate-200" />
                                                    )}

                                                    {/* Cover Letter */}
                                                    {coverLetter && (
                                                        <div className="mt-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <button onClick={() => {
                                                                    if (viewingCoverLetter === job.id) {
                                                                        setViewingCoverLetter(null);
                                                                        setEditingCoverLetter(null);
                                                                    } else {
                                                                        setViewingCoverLetter(job.id);
                                                                    }
                                                                }}
                                                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                                                                    <FileSignature className="w-3.5 h-3.5" />
                                                                    {viewingCoverLetter === job.id ? 'Hide Cover Letter' : 'View Cover Letter'}
                                                                </button>
                                                                <div className="flex items-center gap-2">
                                                                    {!isEditingCL && viewingCoverLetter === job.id && (
                                                                        <button onClick={() => handleEditCoverLetter(job.id)}
                                                                            className="text-xs text-slate-400 hover:text-primary-600 flex items-center gap-1">
                                                                            <Edit3 className="w-3 h-3" />Edit
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => handleCopyCoverLetter(job.id)}
                                                                        className="text-xs text-slate-400 hover:text-primary-600 flex items-center gap-1">
                                                                        {copiedCL === job.id
                                                                            ? <><CheckCheck className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Copied!</span></>
                                                                            : <><Copy className="w-3 h-3" />Copy</>}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {viewingCoverLetter === job.id && (
                                                                isEditingCL ? (
                                                                    <div className="space-y-2">
                                                                        <textarea
                                                                            value={editCLText}
                                                                            onChange={e => setEditCLText(e.target.value)}
                                                                            className="w-full h-72 p-4 bg-white border border-primary-200 rounded-xl text-sm text-slate-700 leading-relaxed resize-y focus:ring-2 focus:ring-primary-400 focus:border-transparent outline-none font-mono"
                                                                        />
                                                                        <div className="flex gap-2">
                                                                            <button onClick={() => handleSaveCoverLetter(job.id)}
                                                                                disabled={savingEdit}
                                                                                className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1 disabled:opacity-70">
                                                                                {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                                                Save Changes
                                                                            </button>
                                                                            <button onClick={() => setEditingCoverLetter(null)}
                                                                                className="btn-secondary px-4 py-1.5 text-xs flex items-center gap-1">
                                                                                <X className="w-3 h-3" />Cancel
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-white/80 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto">
                                                                        {coverLetter}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <button onClick={() => handleGenerateResume(job.id)}
                                                    className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
                                                    <FileText className="w-4 h-4" /> Generate Tailored Resume & Cover Letter
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

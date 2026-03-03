'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Briefcase, MapPin, Building2, ExternalLink, Loader2, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, FileText, Download, Eye, FileSignature, Copy, CheckCheck, Edit3, Save, X, MessageSquare, Mail } from 'lucide-react';
import LLMProgressBar from '@/components/LLMProgressBar';
import SkeletonCard from '@/components/SkeletonCard';
import EmptyState from '@/components/EmptyState';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
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
    remotive: 'bg-green-100 text-green-700',
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
    const [currentPage, setCurrentPage] = useState(1);
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

    // AI Features States
    const [generatingInterviewFor, setGeneratingInterviewFor] = useState<number | null>(null);
    const [jobInterviews, setJobInterviews] = useState<Record<number, any[]>>({});
    const [interviewError, setInterviewError] = useState('');
    const [viewingInterview, setViewingInterview] = useState<number | null>(null);

    const [generatingColdEmailFor, setGeneratingColdEmailFor] = useState<number | null>(null);
    const [jobColdEmails, setJobColdEmails] = useState<Record<number, string>>({});
    const [coldEmailError, setColdEmailError] = useState('');
    const [viewingColdEmail, setViewingColdEmail] = useState<number | null>(null);
    const [copiedColdEmail, setCopiedColdEmail] = useState<number | null>(null);
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

    useEffect(() => {
        if (!expandedJob) return;
        const fetchJobData = async () => {
            const token = getToken();
            if (!token) return;
            try {
                // Fetch Resume
                if (!jobResumes[expandedJob]) {
                    const res = await fetch(`${API}/jobs/${expandedJob}/resume`, { headers: { Authorization: `Bearer ${token}` } });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.file_path_pdf) setJobResumes(prev => ({ ...prev, [expandedJob]: data.file_path_pdf }));
                        if (data && data.cover_letter) setJobCoverLetters(prev => ({ ...prev, [expandedJob]: data.cover_letter }));
                    }
                }
                // Fetch Mock Interviews
                if (!jobInterviews[expandedJob]) {
                    const intRes = await fetch(`${API}/jobs/${expandedJob}/interview`, { headers: { Authorization: `Bearer ${token}` } });
                    if (intRes.ok) {
                        const intData = await intRes.json();
                        if (intData && intData.length > 0) setJobInterviews(prev => ({ ...prev, [expandedJob]: intData[0].questions }));
                    }
                }
                // Fetch Cold Emails
                if (!jobColdEmails[expandedJob]) {
                    const coldRes = await fetch(`${API}/jobs/${expandedJob}/cold-email`, { headers: { Authorization: `Bearer ${token}` } });
                    if (coldRes.ok) {
                        const coldData = await coldRes.json();
                        if (coldData && coldData.length > 0) setJobColdEmails(prev => ({ ...prev, [expandedJob]: coldData[0].email_body }));
                    }
                }
            } catch (e) {
                console.error("Error fetching job items on expand", e);
            }
        };
        fetchJobData();
    }, [expandedJob]);

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
                        if (data.length > jobs.length) {
                            clearInterval(poll);
                            setJobs(data);
                            setIsFetching(false);
                            toast.success(`Fetched ${data.length - jobs.length} new jobs! 🎉`);
                        }
                    }
                } catch { }
            }, 3000);
        } catch {
            setIsFetching(false);
            toast.error('Failed to trigger job fetch.');
        }
    };

    const handleMarkApplied = async (jobId: number) => {
        const token = getToken();
        if (!token) return;

        try {
            // First, ensure an application exists by creating it
            const createRes = await fetch(`${API}/applications`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: jobId })
            });

            let appId;
            if (createRes.ok) {
                const appData = await createRes.json();
                appId = appData.id;
            } else {
                // If creation fails (maybe already exists), we need to fetch all applications to find the ID
                // For simplicity, we assume creation usually works for a new pipeline flow.
                // In a robust app we might GET /applications?job_id=jobId
                const appsRes = await fetch(`${API}/applications`, { headers: { Authorization: `Bearer ${token}` } });
                const apps = await appsRes.json();
                const existingApp = apps.find((a: any) => a.job_id === jobId);
                if (existingApp) appId = existingApp.id;
            }

            if (appId) {
                // Update status to 'applied'
                await fetch(`${API}/applications/${appId}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'applied' })
                });

                // Update local UI
                setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'applied' } : j));
                toast.success('Successfully marked as applied! 🚀');
            }
        } catch (e) {
            console.error('Failed to mark as applied', e);
            toast.error('Failed to mark job as applied.');
        }
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
            toast.success('Cover letter copied to clipboard!');
            setTimeout(() => setCopiedCL(null), 2000);
        }
    };

    const handleEditCoverLetter = (jobId: number) => {
        setEditCLText(jobCoverLetters[jobId] || '');
        setEditingCoverLetter(jobId);
        setViewingCoverLetter(jobId);
    };

    const handleGenerateInterview = async (jobId: number) => {
        const token = getToken();
        if (!token) return;
        setGeneratingInterviewFor(jobId);
        setInterviewError('');
        try {
            const res = await fetch(`${API}/jobs/${jobId}/interview`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setJobInterviews(prev => ({ ...prev, [jobId]: data.questions }));
                setViewingInterview(jobId);
            } else {
                setInterviewError('Failed to generate interview prep.');
            }
        } catch {
            setInterviewError('Network error generating interview.');
        } finally {
            setGeneratingInterviewFor(null);
        }
    };

    const handleGenerateColdEmail = async (jobId: number) => {
        const token = getToken();
        if (!token) return;
        setGeneratingColdEmailFor(jobId);
        setColdEmailError('');
        try {
            const res = await fetch(`${API}/jobs/${jobId}/cold-email`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setJobColdEmails(prev => ({ ...prev, [jobId]: data.email_body }));
                setViewingColdEmail(jobId);
            } else {
                setColdEmailError('Failed to generate cold email.');
            }
        } catch {
            setColdEmailError('Network error generating cold email.');
        } finally {
            setGeneratingColdEmailFor(null);
        }
    };

    const handleCopyColdEmail = (jobId: number) => {
        const email = jobColdEmails[jobId];
        if (email) {
            navigator.clipboard.writeText(email);
            setCopiedColdEmail(jobId);
            toast.success('Cold email copied to clipboard!');
            setTimeout(() => setCopiedColdEmail(null), 2000);
        }
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
                toast.success('Cover letter saved successfully!');
            } else {
                toast.error('Failed to save cover letter.');
            }
        } catch { toast.error('Network error saving cover letter.'); }
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

    useEffect(() => { setCurrentPage(1); }, [searchQuery, sourceFilter, sortBy]);

    const jobsPerPage = settings.jobsPerPage || 10;
    const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / jobsPerPage));
    const paginatedJobs = useMemo(() => {
        const start = (currentPage - 1) * jobsPerPage;
        return filteredAndSorted.slice(start, start + jobsPerPage);
    }, [filteredAndSorted, currentPage, jobsPerPage]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-2"></div>
                        <div className="h-4 w-64 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                </div>
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
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
                <EmptyState
                    icon={Briefcase}
                    title="No jobs found"
                    description="We couldn't find any jobs matching your criteria. Try adjusting your search filters or fetch new jobs from the web."
                    actionLabel="Fetch New Jobs"
                    onAction={handleFetch}
                />
            ) : (
                <div className="space-y-4">
                    {paginatedJobs.map(job => {
                        const isExpanded = expandedJob === job.id;
                        const score = job.score?.score || 0;
                        const matchedSkills = job.score?.explanation?.matched_skills || [];
                        const missingSkills = job.score?.explanation?.missing_keywords || [];
                        const resumePath = jobResumes[job.id];
                        const coverLetter = jobCoverLetters[job.id];
                        const isGenerating = generatingResumeFor === job.id;
                        const isEditingCL = editingCoverLetter === job.id;

                        return (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={job.id}
                                onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                                className="glass-card overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
                            >
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
                                            {job.status === 'applied' ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                                                </span>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); handleMarkApplied(job.id); }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-semibold transition-colors border border-primary-100">
                                                    Mark as Applied
                                                </button>
                                            )}

                                            <a href={`/jobs/${job.id}`} onClick={(e) => e.stopPropagation()}
                                                className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 border border-slate-200 px-3 py-1.5 rounded-lg bg-white transition-colors">
                                                <Eye className="w-3.5 h-3.5" /> Full Details
                                            </a>
                                            <a href={job.apply_link} target="_blank" rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 flex items-center gap-1 px-3 py-1.5 rounded-lg shadow-sm transition-colors">
                                                <ExternalLink className="w-3.5 h-3.5" />Apply
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded View */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
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

                                        {/* AI Features Section */}
                                        <div className="pt-3 border-t border-slate-100 space-y-3 mt-3">
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI Career Tools</h4>
                                            <div className="flex flex-wrap gap-3">
                                                {/* Interview Prep Button */}
                                                <button
                                                    onClick={() => {
                                                        if (jobInterviews[job.id]) {
                                                            setViewingInterview(viewingInterview === job.id ? null : job.id);
                                                        } else {
                                                            handleGenerateInterview(job.id);
                                                        }
                                                    }}
                                                    disabled={generatingInterviewFor === job.id || !resumePath}
                                                    className="btn-secondary px-3 py-2 text-xs flex items-center gap-2 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                                >
                                                    {generatingInterviewFor === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                                                    {jobInterviews[job.id] ? (viewingInterview === job.id ? 'Hide Interview Prep' : 'View Interview Prep') : 'Generate Interview Prep'}
                                                </button>

                                                {/* Cold Email Button */}
                                                <button
                                                    onClick={() => {
                                                        if (jobColdEmails[job.id]) {
                                                            setViewingColdEmail(viewingColdEmail === job.id ? null : job.id);
                                                        } else {
                                                            handleGenerateColdEmail(job.id);
                                                        }
                                                    }}
                                                    disabled={generatingColdEmailFor === job.id || !resumePath}
                                                    className="btn-secondary px-3 py-2 text-xs flex items-center gap-2 border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                                                >
                                                    {generatingColdEmailFor === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                                    {jobColdEmails[job.id] ? (viewingColdEmail === job.id ? 'Hide Cold Email' : 'View Cold Email') : 'Generate Cold Email'}
                                                </button>
                                            </div>

                                            {(!resumePath) && (
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Generate a Resume & Cover Letter first to unlock these tools.
                                                </p>
                                            )}

                                            {interviewError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100">{interviewError}</div>}
                                            {coldEmailError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100">{coldEmailError}</div>}

                                            {/* Interview UI */}
                                            {viewingInterview === job.id && jobInterviews[job.id] && (
                                                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 mt-3 animate-in fade-in slide-in-from-top-2">
                                                    <h5 className="font-semibold text-indigo-900 text-sm mb-3 flex items-center gap-2">
                                                        <MessageSquare className="w-4 h-4 text-indigo-500" /> Mock Interview Questions
                                                    </h5>
                                                    <div className="space-y-4">
                                                        {jobInterviews[job.id].map((q: any, i: number) => (
                                                            <div key={i} className="bg-white p-3 rounded-lg border border-indigo-100/50 shadow-sm">
                                                                <p className="font-semibold text-slate-800 text-sm mb-1.5"><span className="text-indigo-400 mr-1">Q{i + 1}.</span>{q.question}</p>
                                                                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                                                    <span className="font-semibold text-slate-500 mr-1">Strategy:</span>{q.strategy}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Cold Email UI */}
                                            {viewingColdEmail === job.id && jobColdEmails[job.id] && (
                                                <div className="bg-teal-50/50 p-4 rounded-xl border border-teal-100 mt-3 animate-in fade-in slide-in-from-top-2">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h5 className="font-semibold text-teal-900 text-sm flex items-center gap-2">
                                                            <Mail className="w-4 h-4 text-teal-500" /> Outreach Email
                                                        </h5>
                                                        <button onClick={() => handleCopyColdEmail(job.id)}
                                                            className="text-xs font-semibold px-2.5 py-1 rounded bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 flex items-center gap-1 transition-colors">
                                                            {copiedColdEmail === job.id
                                                                ? <><CheckCheck className="w-3 h-3 text-teal-600" /> Copied!</>
                                                                : <><Copy className="w-3 h-3" /> Copy</>
                                                            }
                                                        </button>
                                                    </div>
                                                    <div className="bg-white p-3.5 rounded-lg border border-teal-100/50 shadow-sm">
                                                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{jobColdEmails[job.id]}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-6 border-t border-slate-200 mt-6 pb-8">
                    <p className="text-sm text-slate-500 font-medium">
                        Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * jobsPerPage + 1}</span> to{' '}
                        <span className="text-slate-900 font-bold">{Math.min(currentPage * jobsPerPage, filteredAndSorted.length)}</span> of{' '}
                        <span className="text-slate-900 font-bold">{filteredAndSorted.length}</span> results
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => {
                                setCurrentPage(p => Math.max(1, p - 1));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-4 py-2 border border-slate-200 bg-white rounded-xl text-sm font-semibold text-slate-700 disabled:opacity-50 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => {
                                setCurrentPage(p => Math.min(totalPages, p + 1));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-4 py-2 border border-slate-200 bg-white rounded-xl text-sm font-semibold text-slate-700 disabled:opacity-50 hover:bg-slate-50 transition-colors disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

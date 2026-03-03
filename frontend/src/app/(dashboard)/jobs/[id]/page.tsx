'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, MapPin, ArrowLeft, ExternalLink, Calendar, DollarSign, CheckCircle2, XCircle, Briefcase, FileText, Loader2, Download, Eye, FileDigit, Copy, Pencil, Save, X, MessageSquare, Mail, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LLMProgressBar from '@/components/LLMProgressBar';
import { useSettings, CURRENCY_SYMBOLS } from '@/hooks/useSettings';
import SkeletonCard from '@/components/SkeletonCard';
import { toast } from 'sonner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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
        .replace(/â€/g, "'");
}

export default function JobDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { settings } = useSettings();
    const jobId = params.id as string;

    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // AI Tools State
    const [resumeUrl, setResumeUrl] = useState<string | null>(null);
    const [coverLetter, setCoverLetter] = useState<string | null>(null);
    const [interview, setInterview] = useState<any[] | null>(null);
    const [coldEmail, setColdEmail] = useState<string | null>(null);
    const [interviewId, setInterviewId] = useState<number | null>(null);
    const [emailId, setEmailId] = useState<number | null>(null);

    const [generatingResume, setGeneratingResume] = useState(false);
    const [generatingInterview, setGeneratingInterview] = useState(false);
    const [generatingColdEmail, setGeneratingColdEmail] = useState(false);

    // Edit states
    const [editingCL, setEditingCL] = useState(false);
    const [editCLText, setEditCLText] = useState('');
    const [savingCL, setSavingCL] = useState(false);

    const [editingEmail, setEditingEmail] = useState(false);
    const [editEmailText, setEditEmailText] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);

    const [editingInterview, setEditingInterview] = useState(false);
    const [editInterviewData, setEditInterviewData] = useState<any[]>([]);
    const [savingInterview, setSavingInterview] = useState(false);

    const currencySymbol = CURRENCY_SYMBOLS[settings.currency] || '₹';

    useEffect(() => {
        const fetchJobDetails = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const res = await fetch(`${API}/jobs/${jobId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setJob(data);

                    // Fetch associated AI tools
                    const [resResume, resInt, resCold] = await Promise.all([
                        fetch(`${API}/jobs/${jobId}/resume`, { headers: { Authorization: `Bearer ${token}` } }),
                        fetch(`${API}/jobs/${jobId}/interview`, { headers: { Authorization: `Bearer ${token}` } }),
                        fetch(`${API}/jobs/${jobId}/cold-email`, { headers: { Authorization: `Bearer ${token}` } })
                    ]);

                    if (resResume.ok) {
                        const rData = await resResume.json();
                        if (rData?.file_path_pdf) setResumeUrl(rData.file_path_pdf);
                        if (rData?.cover_letter) setCoverLetter(rData.cover_letter);
                    }
                    if (resInt.ok) {
                        const iData = await resInt.json();
                        if (iData && iData.length > 0) {
                            setInterview(iData[0].questions);
                            setInterviewId(iData[0].id);
                        }
                    }
                    if (resCold.ok) {
                        const cData = await resCold.json();
                        if (cData && cData.length > 0) {
                            setColdEmail(cData[0].email_body);
                            setEmailId(cData[0].id);
                        }
                    }

                } else {
                    setError('Failed to fetch job details. The job might have been deleted.');
                    toast.error('Job not found.');
                }
            } catch (err) {
                setError('Network error loading job details.');
                toast.error('Network error loading job details.');
            } finally {
                setLoading(false);
            }
        };

        if (jobId) fetchJobDetails();
    }, [jobId]);

    if (loading) {
        return (
            <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <div className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse" />
                </div>
                <div className="h-48 bg-slate-200 rounded-3xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-4">
                        <div className="h-96 bg-slate-200 rounded-2xl animate-pulse" />
                    </div>
                    <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
                </div>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <Briefcase className="w-16 h-16 text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-800">Job Not Found</h2>
                <p className="text-slate-500 mt-2 max-w-md">{error}</p>
                <button onClick={() => router.push('/jobs')} className="mt-6 btn-primary px-6 py-2">
                    Back to Jobs
                </button>
            </div>
        );
    }

    // Handlers
    const handleGenerateResume = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setGeneratingResume(true);
        try {
            const res = await fetch(`${API}/resumes/generate/${jobId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.file_path_pdf) setResumeUrl(data.file_path_pdf);
                if (data.cover_letter) setCoverLetter(data.cover_letter);
                toast.success('Resume & Cover Letter generated!');
            } else {
                toast.error('Failed to generate resume');
            }
        } catch { toast.error('Network error'); }
        setGeneratingResume(false);
    };

    const handleSaveCoverLetter = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setSavingCL(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/resume`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cover_letter: editCLText }),
            });
            if (res.ok) {
                const data = await res.json();
                setCoverLetter(data.cover_letter);
                setEditingCL(false);
                toast.success('Cover letter saved!');
            } else { toast.error('Failed to save.'); }
        } catch { toast.error('Network error'); }
        setSavingCL(false);
    };

    const handleGenerateInterview = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setGeneratingInterview(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/interview`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInterview(data.questions);
                setInterviewId(data.id);
                toast.success('Mock interview ready!');
            } else { toast.error('Failed to generate interview.'); }
        } catch { toast.error('Network error'); }
        setGeneratingInterview(false);
    };

    const handleSaveInterview = async () => {
        const token = localStorage.getItem('token');
        if (!token || !interviewId) return;
        setSavingInterview(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/interview/${interviewId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: editInterviewData }),
            });
            if (res.ok) {
                const data = await res.json();
                setInterview(data.questions);
                setEditingInterview(false);
                toast.success('Interview questions saved!');
            } else { toast.error('Failed to save.'); }
        } catch { toast.error('Network error'); }
        setSavingInterview(false);
    };

    const handleGenerateColdEmail = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setGeneratingColdEmail(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/cold-email`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setColdEmail(data.email_body);
                setEmailId(data.id);
                toast.success('Cold email ready!');
            } else { toast.error('Failed to generate cold email.'); }
        } catch { toast.error('Network error'); }
        setGeneratingColdEmail(false);
    };

    const handleSaveColdEmail = async () => {
        const token = localStorage.getItem('token');
        if (!token || !emailId) return;
        setSavingEmail(true);
        try {
            const res = await fetch(`${API}/jobs/${jobId}/cold-email/${emailId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_body: editEmailText }),
            });
            if (res.ok) {
                const data = await res.json();
                setColdEmail(data.email_body);
                setEditingEmail(false);
                toast.success('Cold email saved!');
            } else { toast.error('Failed to save.'); }
        } catch { toast.error('Network error'); }
        setSavingEmail(false);
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied to clipboard!`);
    };

    const score = job.score?.score || 0;
    const matchedSkills = job.score?.explanation?.matched_skills || [];
    const missingSkills = job.score?.explanation?.missing_keywords || [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto space-y-8 pb-12"
        >
            <button
                onClick={() => router.push('/jobs')}
                className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Pipeline
            </button>

            {/* Hero Section */}
            <div className="glass-card overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 md:p-10 text-white relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Briefcase className="w-48 h-48" />
                    </div>

                    <div className="relative z-10 flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border border-white/20">
                                {job.source}
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-300 text-sm font-medium">
                                <Calendar className="w-4 h-4" />
                                Posted {new Date(job.posted_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-2">
                            {job.role}
                        </h1>
                        <p className="text-xl text-slate-300 font-medium flex items-center gap-2">
                            <Building2 className="w-5 h-5" /> {job.company}
                        </p>
                    </div>

                    <div className="relative z-10 hidden md:flex flex-col items-center">
                        <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${getScoreColor(score)} flex items-center justify-center shadow-2xl border-4 border-white/10 ring-4 ring-black/20`}>
                            <span className="text-white font-black text-4xl">{score}</span>
                        </div>
                        <span className="text-slate-300 text-xs font-bold uppercase mt-3 tracking-widest">Match Score</span>
                    </div>
                </div>

                <div className="bg-white px-8 py-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                        {job.location && (
                            <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <div className="p-2 bg-slate-50 rounded-lg"><MapPin className="w-5 h-5 text-indigo-500" /></div>
                                {job.location}
                            </div>
                        )}
                        {job.salary && (
                            <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <div className="p-2 bg-slate-50 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
                                {currencySymbol}{job.salary}
                            </div>
                        )}
                        {job.status === 'applied' && (
                            <div className="flex items-center gap-2 text-emerald-700 font-medium">
                                <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
                                Application Submitted
                            </div>
                        )}
                    </div>
                    <a
                        href={job.apply_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-bold"
                    >
                        Apply Now <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Job Description */}
                <div className="md:col-span-2 space-y-8">
                    <div className="glass-card p-8">
                        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary-500" /> Full Description
                        </h3>
                        <div
                            className="prose prose-slate max-w-none text-slate-600 leading-relaxed [&>h1]:text-2xl [&>h1]:font-bold [&>h2]:text-xl [&>h2]:font-bold [&>h3]:text-lg [&>ul]:list-disc [&>ul]:ml-5 [&>li]:mb-2 [&>p]:mb-4"
                            dangerouslySetInnerHTML={{ __html: cleanHtmlText(job.description || '<p>No description provided.</p>') }}
                        />
                    </div>
                </div>

                {/* Right Column: Skills & Insights */}
                <div className="space-y-6">
                    <div className="glass-card p-6">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Matched Skills</h3>
                        {matchedSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {matchedSkills.map((skill: string, i: number) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                                        <CheckCircle2 className="w-4 h-4" />{skill}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">No matching skills found.</p>
                        )}
                    </div>

                    <div className="glass-card p-6">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                            Missing Keywords
                        </h3>
                        {missingSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {missingSkills.map((skill: string, i: number) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-100">
                                        <XCircle className="w-4 h-4" />{skill}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">You hit all the keywords!</p>
                        )}
                    </div>

                    <div className="md:col-span-3 space-y-8 mt-4">
                        <h2 className="text-2xl font-bold text-slate-900 border-b pb-4">AI Career Tools</h2>

                        {/* Resume & Cover Letter */}
                        <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <FileDigit className="w-5 h-5 text-indigo-500" /> Resume & Cover Letter
                                </h3>
                                {!resumeUrl && !generatingResume && (
                                    <button onClick={handleGenerateResume} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                                        <FileDigit className="w-4 h-4" /> Generate Assets
                                    </button>
                                )}
                            </div>

                            {generatingResume && <LLMProgressBar text="Crafting tailored resume and cover letter..." />}

                            {resumeUrl && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl border border-emerald-100">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="font-semibold">Tailored Resume Ready</span>
                                        <div className="ml-auto flex gap-2">
                                            <a href={resumeUrl.startsWith('/') ? `${API}${resumeUrl}` : `${API}/download/${encodeURIComponent(resumeUrl)}`} target="_blank" rel="noopener noreferrer"
                                                className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-2">
                                                <Eye className="w-3.5 h-3.5" /> Preview PDF
                                            </a>
                                            <a href={resumeUrl.startsWith('/') ? `${API}${resumeUrl}` : `${API}/download/${encodeURIComponent(resumeUrl)}`} download
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-2 transition-colors">
                                                <Download className="w-3.5 h-3.5" /> Download
                                            </a>
                                        </div>
                                    </div>

                                    {coverLetter && (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                                <span className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                                                    <FileText className="w-4 h-4 text-slate-400" /> Cover Letter
                                                </span>
                                                <div className="flex gap-2">
                                                    {!editingCL ? (
                                                        <>
                                                            <button onClick={() => { setEditCLText(coverLetter); setEditingCL(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleCopy(coverLetter, 'Cover letter')} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                                                                <Copy className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => setEditingCL(false)} className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
                                                                Cancel
                                                            </button>
                                                            <button onClick={handleSaveCoverLetter} disabled={savingCL} className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors flex items-center gap-1">
                                                                {savingCL ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-white">
                                                {editingCL ? (
                                                    <textarea
                                                        value={editCLText}
                                                        onChange={(e) => setEditCLText(e.target.value)}
                                                        className="w-full h-64 p-3 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                                                    />
                                                ) : (
                                                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed h-64 overflow-y-auto pr-2 custom-scrollbar">
                                                        {coverLetter}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Cold Email */}
                        <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-indigo-500" /> Cold Email
                                </h3>
                                {!coldEmail && !generatingColdEmail && (
                                    <button onClick={handleGenerateColdEmail} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                                        <Mail className="w-4 h-4" /> Generate Email
                                    </button>
                                )}
                            </div>

                            {generatingColdEmail && <LLMProgressBar text="Drafting personalized cold email..." />}

                            {coldEmail && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                        <span className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-slate-400" /> Email Draft
                                        </span>
                                        <div className="flex gap-2">
                                            {!editingEmail ? (
                                                <>
                                                    <button onClick={() => { setEditEmailText(coldEmail); setEditingEmail(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleCopy(coldEmail, 'Cold email')} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setEditingEmail(false)} className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
                                                        Cancel
                                                    </button>
                                                    <button onClick={handleSaveColdEmail} disabled={savingEmail} className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors flex items-center gap-1">
                                                        {savingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white">
                                        {editingEmail ? (
                                            <textarea
                                                value={editEmailText}
                                                onChange={(e) => setEditEmailText(e.target.value)}
                                                className="w-full h-48 p-3 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                                            />
                                        ) : (
                                            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                {coldEmail}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Mock Interview */}
                        <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-indigo-500" /> Mock Interview
                                </h3>
                                {!interview && !generatingInterview && (
                                    <button onClick={handleGenerateInterview} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" /> Generate Prep
                                    </button>
                                )}
                            </div>

                            {generatingInterview && <LLMProgressBar text="Analyzing JD and generating questions..." />}

                            {interview && (
                                <div className="space-y-4">
                                    <div className="flex justify-end mb-2">
                                        {!editingInterview ? (
                                            <button onClick={() => { setEditInterviewData(JSON.parse(JSON.stringify(interview))); setEditingInterview(true); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5">
                                                <Pencil className="w-3.5 h-3.5" /> Edit Questions
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button onClick={() => setEditingInterview(false)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                                    Cancel
                                                </button>
                                                <button onClick={handleSaveInterview} disabled={savingInterview} className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5">
                                                    {savingInterview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {editingInterview ? (
                                        <div className="space-y-4">
                                            {editInterviewData.map((q: any, i: number) => (
                                                <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-500 uppercase">Question {i + 1}</label>
                                                        <input
                                                            type="text"
                                                            value={q.question}
                                                            onChange={(e) => {
                                                                const newData = [...editInterviewData];
                                                                newData[i].question = e.target.value;
                                                                setEditInterviewData(newData);
                                                            }}
                                                            className="w-full mt-1 p-2 border border-slate-200 rounded-md text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-500 uppercase">Strategy</label>
                                                        <textarea
                                                            value={q.strategy}
                                                            onChange={(e) => {
                                                                const newData = [...editInterviewData];
                                                                newData[i].strategy = e.target.value;
                                                                setEditInterviewData(newData);
                                                            }}
                                                            className="w-full mt-1 p-2 border border-slate-200 rounded-md text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 resize-y min-h-[80px]"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {interview.map((q: any, i: number) => (
                                                <div key={i} className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:border-indigo-100 transition-colors">
                                                    <h4 className="font-bold text-slate-800 flex gap-2">
                                                        <span className="text-indigo-500">Q:</span> {q.question}
                                                    </h4>
                                                    <p className="mt-2 text-sm text-slate-600 flex gap-2">
                                                        <span className="text-emerald-500 font-bold">💡</span> {q.strategy}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

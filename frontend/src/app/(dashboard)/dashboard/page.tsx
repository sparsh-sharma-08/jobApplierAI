'use client';

import { useEffect, useState, useMemo } from 'react';
import { Award, Target, TrendingUp, FileCheck, Briefcase, RefreshCw, Loader2, ArrowRight, FileText, Upload, Sparkles, Building2, MapPin, ChevronRight, BarChart3, Zap, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LLMProgressBar from '@/components/LLMProgressBar';
import { useSettings } from '@/hooks/useSettings';
import Link from 'next/link';

interface Job {
    id: number;
    role: string;
    company: string;
    location: string;
    source: string;
    status: string;
    posted_date: string;
    score: { score: number; explanation?: { matched_skills?: string[] } } | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getScoreGradient(score: number) {
    if (score >= 80) return 'from-emerald-400 to-emerald-600';
    if (score >= 60) return 'from-blue-400 to-blue-600';
    if (score >= 40) return 'from-amber-400 to-amber-600';
    return 'from-slate-400 to-slate-500';
}

export default function DashboardPage() {
    const router = useRouter();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFetchingJobs, setIsFetchingJobs] = useState(false);
    const [hasProfile, setHasProfile] = useState(true);
    const [hasMasterResume, setHasMasterResume] = useState(false);
    const [userName, setUserName] = useState('');
    const { settings } = useSettings();

    const getToken = () => localStorage.getItem('token');

    const fetchData = async () => {
        const token = getToken();
        if (!token) return;
        try {
            setLoading(true);
            const [jobsRes, profileRes] = await Promise.all([
                fetch(`${API}/jobs?limit=500`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (jobsRes.ok) {
                const data = await jobsRes.json();
                setJobs(data);
            }
            if (profileRes.ok) {
                const profileData = await profileRes.json();
                setHasProfile(!!profileData);
                setUserName(profileData?.name || '');
                setHasMasterResume(profileData?.master_resume && Object.keys(profileData.master_resume).length > 0);
            } else {
                setHasProfile(false);
            }
            setError('');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const stats = useMemo(() => {
        const total = jobs.length;
        const breakdown: Record<string, number> = {};
        let totalScore = 0;
        let scoredCount = 0;
        let highMatches = 0;
        const sources: Record<string, number> = {};
        for (const job of jobs) {
            const st = job.status || 'saved';
            breakdown[st] = (breakdown[st] || 0) + 1;
            if (job.score?.score) {
                totalScore += job.score.score;
                scoredCount++;
                if (job.score.score >= 70) highMatches++;
            }
            sources[job.source] = (sources[job.source] || 0) + 1;
        }
        return {
            total_jobs: total,
            status_breakdown: breakdown,
            avg_score: scoredCount > 0 ? totalScore / scoredCount : 0,
            high_matches: highMatches,
            sources,
            profile_complete: hasProfile,
        };
    }, [jobs, hasProfile]);

    const topJobs = useMemo(() => {
        return [...jobs]
            .filter(j => j.score?.score)
            .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0))
            .slice(0, 5);
    }, [jobs]);

    const recentJobs = useMemo(() => {
        return [...jobs]
            .sort((a, b) => new Date(b.posted_date).getTime() - new Date(a.posted_date).getTime())
            .slice(0, 5);
    }, [jobs]);

    const handleFetchNewJobs = async () => {
        const token = getToken();
        if (!token) return;
        setIsFetchingJobs(true);
        try {
            await fetch(`${API}/jobs/fetch`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(settings.enabledSources),
            });
            let attempts = 0;
            const prevCount = jobs.length;
            const poll = setInterval(async () => {
                attempts++;
                if (attempts > 30) { clearInterval(poll); setIsFetchingJobs(false); fetchData(); return; }
                try {
                    const res = await fetch(`${API}/jobs?limit=500`, { headers: { Authorization: `Bearer ${token}` } });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.length > prevCount) { clearInterval(poll); setJobs(data); setIsFetchingJobs(false); }
                    }
                } catch { }
            }, 3000);
        } catch {
            setIsFetchingJobs(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="w-80"><LLMProgressBar text="Loading dashboard..." /></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-lg">Failed to load dashboard</h3>
                    <p className="text-sm mt-1">{error}</p>
                </div>
                <button onClick={fetchData} className="px-4 py-2 bg-white text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors shadow-sm">
                    Retry
                </button>
            </div>
        );
    }

    const breakdown = stats.status_breakdown;
    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            {/* Hero Header */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700 p-6 md:p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-30"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                            {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
                        </h1>
                        <p className="mt-2 text-white/80 text-sm md:text-base font-medium">
                            {stats.total_jobs > 0
                                ? `${stats.total_jobs} jobs tracked · ${stats.high_matches} high matches · ${Math.round(stats.avg_score)}% avg score`
                                : 'Start by fetching jobs to build your pipeline'
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleFetchNewJobs}
                        disabled={isFetchingJobs}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white border border-white/20 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-70"
                    >
                        {isFetchingJobs ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {isFetchingJobs ? 'Scanning...' : 'Fetch New Jobs'}
                    </button>
                </div>
            </div>

            {isFetchingJobs && <LLMProgressBar text="Scanning job portals for new opportunities..." />}

            {/* Setup Checklist (if incomplete) */}
            {(!hasProfile || !hasMasterResume) && (
                <div className="glass-card p-5 border-l-4 border-amber-400">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-500" /> Get Started — Complete Setup
                    </h3>
                    <div className="space-y-2">
                        <Link href="/profile" className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${hasProfile ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasProfile ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {hasProfile ? '✓' : '1'}
                            </div>
                            <span className="text-sm font-medium">Set up your profile</span>
                            {!hasProfile && <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
                        </Link>
                        <Link href="/profile" className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${hasMasterResume ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasMasterResume ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {hasMasterResume ? '✓' : '2'}
                            </div>
                            <span className="text-sm font-medium">Upload your master resume (PDF)</span>
                            {!hasMasterResume && <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
                        </Link>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Jobs', value: stats.total_jobs, icon: Briefcase, gradient: 'from-primary-500 to-primary-600', bg: 'bg-primary-50' },
                    { label: 'High Matches', value: stats.high_matches, icon: Target, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Avg Score', value: `${Math.round(stats.avg_score)}%`, icon: BarChart3, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
                    { label: 'Applied', value: breakdown?.applied || 0, icon: FileCheck, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50' },
                ].map(metric => (
                    <div key={metric.label} className="glass-card p-4 flex items-center gap-4 hover:shadow-lg transition-all">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                            <metric.icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="text-2xl font-bold text-slate-900">{metric.value}</span>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{metric.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Matches */}
                <div className="glass-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-500" /> Top Matches
                        </h2>
                        <Link href="/jobs" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                    {topJobs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No scored jobs yet. Fetch jobs to get started!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {topJobs.map(job => (
                                <Link key={job.id} href="/jobs" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getScoreGradient(job.score?.score || 0)} flex items-center justify-center flex-shrink-0 shadow`}>
                                        <span className="text-white font-bold text-sm">{job.score?.score}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-900 text-sm truncate">{job.role}</p>
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" />{job.company}
                                            {job.location && <><span className="text-slate-300 mx-1">·</span><MapPin className="w-3 h-3" />{job.location}</>}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Jobs */}
                <div className="glass-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-slate-900 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" /> Recently Added
                        </h2>
                        <Link href="/jobs" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                    {recentJobs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No jobs yet. Click &quot;Fetch New Jobs&quot; to start!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentJobs.map(job => (
                                <Link key={job.id} href="/jobs" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                                        <Building2 className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-900 text-sm truncate">{job.role}</p>
                                        <p className="text-xs text-slate-500">{job.company} · {new Date(job.posted_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${job.source === 'remoteok' ? 'bg-green-50 text-green-600' :
                                            job.source === 'jobicy' ? 'bg-purple-50 text-purple-600' :
                                                job.source === 'himalayas' ? 'bg-sky-50 text-sky-600' :
                                                    job.source === 'arbeitnow' ? 'bg-teal-50 text-teal-600' :
                                                        'bg-slate-50 text-slate-500'
                                        }`}>{job.source}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/jobs" className="glass-card p-5 hover:shadow-xl transition-all group border-l-4 border-primary-400">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">Jobs Pipeline</h3>
                            <p className="text-xs text-slate-500">Browse, filter & generate resumes</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
                <Link href="/profile" className="glass-card p-5 hover:shadow-xl transition-all group border-l-4 border-emerald-400">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">Master Resume</h3>
                            <p className="text-xs text-slate-500">{hasMasterResume ? '✅ Uploaded & approved' : 'Upload your PDF resume'}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
                <Link href="/settings" className="glass-card p-5 hover:shadow-xl transition-all group border-l-4 border-blue-400">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">Settings</h3>
                            <p className="text-xs text-slate-500">Sources, preferences & more</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
            </div>

            {/* Source Distribution */}
            {Object.keys(stats.sources).length > 0 && (
                <div className="glass-card p-5">
                    <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary-500" /> Jobs by Source
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {Object.entries(stats.sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                            <div key={source} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                                <span className="text-sm font-semibold text-slate-700 capitalize">{source}</span>
                                <span className="text-xs font-bold text-white bg-gradient-to-r from-primary-500 to-primary-600 px-2 py-0.5 rounded-md">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

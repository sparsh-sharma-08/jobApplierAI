'use client';

import { useEffect, useState, useMemo } from 'react';
import { Award, Target, TrendingUp, FileCheck, Briefcase, RefreshCw, Loader2, ArrowRight, FileText, Upload, Sparkles, Building2, MapPin, ChevronRight, BarChart3, Zap, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LLMProgressBar from '@/components/LLMProgressBar';
import SkeletonCard from '@/components/SkeletonCard';
import { toast } from 'sonner';
import { useSettings } from '@/hooks/useSettings';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useResumeProfiles } from '@/hooks/useResumeProfiles';

interface Job {
    id: number;
    role: string;
    company: string;
    location: string;
    source: string;
    status: string;
    posted_date: string;
    score: { score: number; explanation?: { matched_skills?: string[]; missing_keywords?: string[] } } | null;
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
    const { profiles, activeProfileId, setActiveProfileId, loading: profilesLoading } = useResumeProfiles();
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
        try {
            setLoading(true);
            const query = activeProfileId ? `?profile_id=${activeProfileId}` : '';
            const [jobsRes, profileRes, appsRes] = await Promise.all([
                apiFetch(`${API}/jobs${query ? (query.includes('?') ? '&' : '?') + 'limit=500' : '?limit=500'}`),
                apiFetch(`${API}/profile${query}`),
                apiFetch(`${API}/applications${query}`)
            ]);

            let AppsDict: Record<number, string> = {};
            if (appsRes.ok) {
                const appsData = await appsRes.json();
                appsData.forEach((app: any) => {
                    AppsDict[app.job_id] = app.status;
                });
            }

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

    useEffect(() => { fetchData(); }, [activeProfileId]);

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
        const missingTally: Record<string, number> = {};
        const topScoredJobs = [...jobs].filter(j => j.score?.score).sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0)).slice(0, 20);

        for (const job of topScoredJobs) {
            const missing = job.score?.explanation?.missing_keywords || [];
            for (const skill of missing) {
                missingTally[skill] = (missingTally[skill] || 0) + 1;
            }
        }

        const topMissing = Object.entries(missingTally)
            .filter(([skill]) => skill.length > 2 || ['ai', 'ui', 'ux', 'go', 'ml', 'qa', 'pr', '3d'].includes(skill.toLowerCase()))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([skill, count]) => ({ skill: skill.toUpperCase() === skill ? skill : skill.charAt(0).toUpperCase() + skill.slice(1), count, percentage: Math.round((count / topScoredJobs.length) * 100) }));

        return {
            total_jobs: total,
            status_breakdown: breakdown,
            avg_score: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
            high_matches: highMatches,
            sources,
            profile_complete: hasProfile,
            skill_gaps: topMissing,
            analyzed_jobs_count: topScoredJobs.length
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
            // Assuming missingLocations is derived from settings.enabledSources or defined elsewhere
            // For this specific instruction, we'll use a placeholder if not defined.
            // In a real scenario, `missingLocations` would need to be defined.
            const missingLocations = settings.enabledSources; // Placeholder, adjust as needed
            await apiFetch(`${API}/jobs/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(missingLocations.length > 0 ? missingLocations : ['remotive']),
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
                        if (data.length > prevCount) {
                            clearInterval(poll);
                            setJobs(data);
                            setIsFetchingJobs(false);
                            toast.success(`Fetched ${data.length - prevCount} new jobs! 🎉`);
                        }
                    }
                } catch { }
            }, 3000);
        } catch {
            setIsFetchingJobs(false);
            toast.error('Failed to trigger job validation.');
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse"></div>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1"><SkeletonCard /></div>
                    <div className="lg:col-span-2"><SkeletonCard /></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30 flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-lg">Failed to load dashboard</h3>
                    <p className="text-sm mt-1">{error}</p>
                </div>
                <button onClick={fetchData} className="px-4 py-2 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-medium rounded-xl border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shadow-sm">
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
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 md:p-10">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] -z-10"></div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 dark:text-white">
                                {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
                            </h1>
                            <p className="mt-2 text-slate-500 dark:text-slate-400 text-base font-medium">
                                {stats.total_jobs > 0
                                    ? `${stats.total_jobs} jobs tracked · ${stats.high_matches} high matches · ${Math.round(stats.avg_score)}% avg score`
                                    : 'Start by fetching jobs to build your pipeline'
                                }
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full transition-all shadow-sm">
                                <Briefcase className="w-4 h-4 text-slate-400" />
                                <select value={activeProfileId || ''} onChange={e => setActiveProfileId(parseInt(e.target.value))}
                                    className="bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
                                    {profiles.map(p => (
                                        <option key={p.id} value={p.id} className="text-slate-900">{p.name}{p.is_default ? ' (Default)' : ''}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleFetchNewJobs}
                                disabled={isFetchingJobs}
                                className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm disabled:opacity-70"
                            >
                                {isFetchingJobs ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                {isFetchingJobs ? 'Scanning...' : 'Fetch New Jobs'}
                            </button>
                        </div>
                    </div>
            </div>

            {isFetchingJobs && <LLMProgressBar text="Scanning job portals for new opportunities..." />}

            {/* Setup Checklist (if incomplete) */}
            {(!hasProfile || !hasMasterResume) && (
                <div className="glass-card p-5 border-l-4 border-amber-400">
                    <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-500" /> Get Started — Complete Setup
                    </h3>
                    <div className="space-y-2">
                        <Link href="/profile" className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${hasProfile ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasProfile ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                {hasProfile ? '✓' : '1'}
                            </div>
                            <span className="text-sm font-medium">Set up your profile</span>
                            {!hasProfile && <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
                        </Link>
                        <Link href="/profile" className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${hasMasterResume ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasMasterResume ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
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
                    { label: 'Total Jobs', value: stats.total_jobs, icon: Briefcase },
                    { label: 'High Matches', value: stats.high_matches, icon: Target },
                    { label: 'Avg Score', value: `${stats.avg_score}%`, icon: BarChart3 },
                    { label: 'Applied', value: stats.status_breakdown?.applied || 0, icon: FileCheck },
                ].map(metric => (
                    <div key={metric.label} className="glass-card p-5 hover:shadow-md transition-all">
                        <div className="flex items-center gap-2 mb-3">
                            <metric.icon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{metric.label}</span>
                        </div>
                        <span className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white">{metric.value}</span>
                    </div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column (Skill Gaps & Funnel) */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Skill Gap Analysis Widget */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-rose-500" /> Skill Gaps
                            </h2>
                        </div>
                        {stats.skill_gaps.length === 0 ? (
                            <div className="text-center py-6 text-slate-400">
                                <Target className="w-8 h-8 mx-auto mb-2 opacity-50 text-emerald-500" />
                                <p className="text-sm">No major skill gaps detected!</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Missing skills across your top {stats.analyzed_jobs_count} job matches. Learning these could boost your hiring chances.
                                </p>
                                <div className="space-y-3">
                                    {stats.skill_gaps.map(gap => (
                                        <div key={gap.skill}>
                                            <div className="flex justify-between text-xs mb-1.5">
                                                <span className="font-semibold text-slate-700 dark:text-slate-200">{gap.skill}</span>
                                                <span className="text-rose-600 dark:text-rose-400 font-medium">{gap.percentage}%</span>
                                            </div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                                                <div className="bg-rose-400 h-1.5 rounded-full" style={{ width: `${gap.percentage}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Application Funnel Widget */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" /> Application Pipeline
                            </h2>
                        </div>
                        <div className="space-y-4">
                            {[
                                { label: 'Saved', count: stats.status_breakdown?.saved || 0, color: 'bg-slate-400', bg: 'bg-slate-100' },
                                { label: 'Applied', count: stats.status_breakdown?.applied || 0, color: 'bg-amber-400', bg: 'bg-amber-100' },
                                { label: 'Interviewing', count: stats.status_breakdown?.interviewing || 0, color: 'bg-blue-400', bg: 'bg-blue-100' },
                                { label: 'Offered', count: stats.status_breakdown?.offered || 0, color: 'bg-emerald-400', bg: 'bg-emerald-100' },
                            ].map((stage) => (
                                <div key={stage.label}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{stage.label}</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{stage.count}</span>
                                    </div>
                                    <div className={`w-full h-2 rounded-full ${stage.bg} dark:bg-slate-700`}>
                                        <div className={`h-2 rounded-full transition-all duration-500 ${stage.color}`} style={{ width: `${Math.min(100, Math.max(2, (stage.count / Math.max(1, stats.total_jobs)) * 100))}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column (Top Matches & Recent) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Top Matches */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-slate-400" /> Top Matches
                            </h2>
                            <Link href="/jobs" className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors">
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
                                    <Link key={job.id} href="/jobs" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors group">
                                        <div className={`w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0`}>
                                            <span className="text-slate-900 dark:text-white font-black text-sm">{job.score?.score}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{job.role}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" />{job.company}
                                                    {job.location && <><span className="text-slate-300 dark:text-slate-600 mx-1">·</span><MapPin className="w-3 h-3" />{job.location}</>}
                                                </p>
                                                {job.status !== 'saved' && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Tracked
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Jobs */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-400" /> Recently Added
                            </h2>
                            <Link href="/jobs" className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors">
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
                                    <Link key={job.id} href="/jobs" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                            <Building2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{job.role}</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{job.company} · {new Date(job.posted_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                                {job.status !== 'saved' && (
                                                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> Tracked
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${job.source === 'remotive' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' :
                                            job.source === 'jobicy' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' :
                                                job.source === 'himalayas' ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400' :
                                                    job.source === 'arbeitnow' ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400' :
                                                        'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                            }`}>{job.source}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/jobs" className="glass-card p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-900 dark:text-white">Jobs Pipeline</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Browse, filter & generate resumes</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
                <Link href="/profile" className="glass-card p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-900 dark:text-white">Master Resume</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{hasMasterResume ? '✅ Uploaded & approved' : 'Upload your PDF resume'}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
                <Link href="/settings" className="glass-card p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-900 dark:text-white">Settings</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Sources, preferences & more</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                </Link>
            </div>

            {/* Source Distribution */}
            {Object.keys(stats.sources).length > 0 && (
                <div className="glass-card p-5">
                    <h2 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-slate-400" /> Jobs by Source
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {Object.entries(stats.sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                            <div key={source} className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full">
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">{source}</span>
                                <span className="text-xs font-black text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

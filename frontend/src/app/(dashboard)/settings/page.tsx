'use client';

import { useState, useEffect } from 'react';
import { Settings, Globe, SlidersHorizontal, Briefcase, Shield, RotateCcw, Check, Save, Loader2, Trash2, AlertTriangle, Eye, EyeOff, BarChart3, Download, Bell } from 'lucide-react';
import { useSettings, ALL_SOURCES, SOURCE_LABELS, CURRENCY_SYMBOLS } from '@/hooks/useSettings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function SettingsPage() {
    const { settings, setSettings, resetSettings, loaded } = useSettings();
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<'display' | 'sources' | 'job' | 'account'>('display');

    // Account section state
    const [changingPassword, setChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [clearingData, setClearingData] = useState(false);
    const [clearConfirm, setClearConfirm] = useState('');

    // Job preferences (synced from profile)
    const [remotePreference, setRemotePreference] = useState('any');
    const [minSalary, setMinSalary] = useState('');
    const [experienceLevel, setExperienceLevel] = useState('fresher');
    const [preferredRoles, setPreferredRoles] = useState('');
    const [preferredLocations, setPreferredLocations] = useState('');
    const [targetCompanies, setTargetCompanies] = useState('');
    const [jobPrefSaving, setJobPrefSaving] = useState(false);
    const [jobPrefMsg, setJobPrefMsg] = useState({ text: '', type: '' });

    const getToken = () => localStorage.getItem('token');

    // Load job prefs from profile
    useEffect(() => {
        const token = getToken();
        if (!token) return;
        fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) {
                    setRemotePreference(data.remote_preference || 'any');
                    setMinSalary(data.min_salary ? String(data.min_salary) : '');
                    setTargetCompanies((data.target_companies || []).join(', '));
                    setExperienceLevel(data.experience_level || 'fresher');
                    setPreferredRoles((data.preferred_roles || []).join(', '));
                    setPreferredLocations((data.preferred_locations || []).join(', '));
                }
            })
            .catch(() => { });
    }, []);

    const showSavedToast = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleSaveJobPrefs = async () => {
        const token = getToken();
        if (!token) return;
        setJobPrefSaving(true);
        setJobPrefMsg({ text: '', type: '' });
        try {
            // First get existing profile data
            const profileRes = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } });
            const existing = profileRes.ok ? await profileRes.json() : null;
            if (!existing) {
                setJobPrefMsg({ text: 'Please set up your profile first.', type: 'error' });
                return;
            }

            const res = await fetch(`${API}/profile`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...existing,
                    remote_preference: remotePreference,
                    min_salary: minSalary ? parseInt(minSalary) : null,
                    target_companies: targetCompanies.split(',').map(s => s.trim()).filter(Boolean),
                    experience_level: experienceLevel,
                    preferred_roles: preferredRoles.split(',').map(s => s.trim()).filter(Boolean),
                    preferred_locations: preferredLocations.split(',').map(s => s.trim()).filter(Boolean),
                }),
            });
            if (res.ok) {
                setJobPrefMsg({ text: 'Job preferences saved!', type: 'success' });
            } else {
                throw new Error();
            }
        } catch {
            setJobPrefMsg({ text: 'Failed to save preferences.', type: 'error' });
        } finally {
            setJobPrefSaving(false);
        }
    };

    const handleClearJobs = async () => {
        if (clearConfirm !== 'DELETE') return;
        const token = getToken();
        if (!token) return;
        setClearingData(true);
        // No backend endpoint for bulk delete, so just clear localStorage
        try {
            localStorage.removeItem('careercopilot_settings');
            resetSettings();
            setClearConfirm('');
            setClearingData(false);
            showSavedToast();
        } catch { setClearingData(false); }
    };

    if (!loaded) return null;

    const tabs = [
        { id: 'display' as const, label: 'Display', icon: SlidersHorizontal },
        { id: 'sources' as const, label: 'Job Sources', icon: Globe },
        { id: 'job' as const, label: 'Job Preferences', icon: Briefcase },
        { id: 'account' as const, label: 'Account', icon: Shield },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
                    <p className="mt-1 text-slate-500 text-sm">Customize your CareerCopilot experience.</p>
                </div>
                {saved && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 text-sm font-medium animate-in fade-in slide-in-from-right-4 duration-300">
                        <Check className="w-4 h-4" /> Saved
                    </div>
                )}
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                            ${activeTab === tab.id
                                ? 'bg-white shadow-md text-primary-700'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                            }`}>
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="glass-card p-6 space-y-6">

                {/* ─── Display Settings ─── */}
                {activeTab === 'display' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                                <SlidersHorizontal className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Display Preferences</h2>
                                <p className="text-sm text-slate-500">Control how information is displayed across the app.</p>
                            </div>
                        </div>

                        {/* Currency */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Currency</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['INR', 'USD', 'EUR', 'GBP'] as const).map(c => (
                                    <button key={c} onClick={() => { setSettings({ currency: c }); showSavedToast(); }}
                                        className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-all duration-200
                                            ${settings.currency === c
                                                ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-200'
                                                : 'bg-white/70 border-slate-200 text-slate-600 hover:border-primary-200 hover:bg-primary-50/50'
                                            }`}>
                                        <span className="text-lg">{CURRENCY_SYMBOLS[c]}</span> {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Default Sort */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Default Job Sort</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { value: 'score' as const, label: 'Highest Match Score', icon: BarChart3 },
                                    { value: 'date' as const, label: 'Most Recent', icon: Globe },
                                ]).map(opt => (
                                    <button key={opt.value} onClick={() => { setSettings({ defaultSort: opt.value }); showSavedToast(); }}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200
                                            ${settings.defaultSort === opt.value
                                                ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-200'
                                                : 'bg-white/70 border-slate-200 text-slate-600 hover:border-primary-200'
                                            }`}>
                                        <opt.icon className="w-4 h-4" />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Jobs Per Page */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Jobs Per Page</label>
                            <div className="flex gap-2">
                                {[25, 50, 100, 200].map(n => (
                                    <button key={n} onClick={() => { setSettings({ jobsPerPage: n }); showSavedToast(); }}
                                        className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200
                                            ${settings.jobsPerPage === n
                                                ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-200'
                                                : 'bg-white/70 border-slate-200 text-slate-600 hover:border-primary-200'
                                            }`}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-3 pt-2">
                            {[
                                { key: 'compactView' as const, label: 'Compact View', desc: 'Show more jobs with smaller cards', icon: Eye },
                                { key: 'showScoreBadges' as const, label: 'Score Badges', desc: 'Show colored match score badges on job cards', icon: BarChart3 },
                                { key: 'highlightNewJobs' as const, label: 'Highlight New Jobs', desc: 'Add a visual indicator for recently fetched jobs', icon: Bell },
                                { key: 'autoDownloadResume' as const, label: 'Auto-Download Resume', desc: 'Automatically download PDF when resume is generated', icon: Download },
                            ].map(toggle => (
                                <div key={toggle.key} className="flex items-center justify-between p-4 bg-slate-50/80 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <toggle.icon className="w-4 h-4 text-slate-400" />
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{toggle.label}</p>
                                            <p className="text-xs text-slate-400">{toggle.desc}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => {
                                        setSettings({ [toggle.key]: !settings[toggle.key] } as any);
                                        showSavedToast();
                                    }}
                                        className={`relative w-12 h-7 rounded-full transition-all duration-200 ${settings[toggle.key] ? 'bg-primary-500' : 'bg-slate-300'}`}>
                                        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-200 ${settings[toggle.key] ? 'left-5.5 translate-x-0' : 'left-0.5'}`}
                                            style={{ left: settings[toggle.key] ? '22px' : '2px' }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Job Sources ─── */}
                {activeTab === 'sources' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-secondary-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Job Sources</h2>
                                <p className="text-sm text-slate-500">Choose which platforms to search when fetching jobs.</p>
                            </div>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <button onClick={() => { setSettings({ enabledSources: [...ALL_SOURCES] }); showSavedToast(); }}
                                className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-3 py-1.5 bg-primary-50 rounded-lg">
                                Select All
                            </button>
                            <button onClick={() => { setSettings({ enabledSources: [] }); showSavedToast(); }}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 bg-slate-100 rounded-lg">
                                Deselect All
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {ALL_SOURCES.map(source => {
                                const isEnabled = settings.enabledSources.includes(source);
                                const colors: Record<string, string> = {
                                    remoteok: 'border-green-200 bg-green-50',
                                    arbeitnow: 'border-teal-200 bg-teal-50',
                                    jobicy: 'border-purple-200 bg-purple-50',
                                    himalayas: 'border-sky-200 bg-sky-50',
                                    adzuna: 'border-orange-200 bg-orange-50',
                                    linkedin: 'border-blue-200 bg-blue-50',
                                };
                                const descriptions: Record<string, string> = {
                                    remoteok: 'Remote-first jobs worldwide (free API)',
                                    arbeitnow: 'European & remote jobs (free API)',
                                    jobicy: 'Remote jobs with industry & level info (free API)',
                                    himalayas: 'Remote jobs with salary data (free API)',
                                    adzuna: 'Aggregated listings (needs API key)',
                                    linkedin: 'Professional network (Playwright, may be slow)',
                                };

                                return (
                                    <button key={source} onClick={() => {
                                        const next = isEnabled
                                            ? settings.enabledSources.filter(s => s !== source)
                                            : [...settings.enabledSources, source];
                                        setSettings({ enabledSources: next });
                                        showSavedToast();
                                    }}
                                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left
                                            ${isEnabled
                                                ? `${colors[source] || 'border-primary-200 bg-primary-50'} ring-1 ring-primary-100`
                                                : 'border-slate-200 bg-white/50 opacity-60 hover:opacity-80'
                                            }`}>
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
                                            ${isEnabled ? 'bg-primary-500 border-primary-500' : 'border-slate-300 bg-white'}`}>
                                            {isEnabled && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm text-slate-800">{SOURCE_LABELS[source]}</p>
                                            <p className="text-xs text-slate-500 truncate">{descriptions[source]}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-xs text-slate-400 mt-2">
                            {settings.enabledSources.length} of {ALL_SOURCES.length} sources enabled.
                            More sources may take longer to fetch results.
                        </p>
                    </div>
                )}

                {/* ─── Job Preferences ─── */}
                {activeTab === 'job' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                <Briefcase className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Job Preferences</h2>
                                <p className="text-sm text-slate-500">These are synced with your profile and affect AI scoring.</p>
                            </div>
                        </div>

                        {jobPrefMsg.text && (
                            <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${jobPrefMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                {jobPrefMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                {jobPrefMsg.text}
                            </div>
                        )}

                        {/* Remote Preference */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Remote Preference</label>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'remote', label: '🏠 Remote Only' },
                                    { value: 'hybrid', label: '🏢 Hybrid OK' },
                                    { value: 'any', label: '🌍 Any' },
                                ]).map(opt => (
                                    <button key={opt.value} onClick={() => setRemotePreference(opt.value)}
                                        className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200
                                            ${remotePreference === opt.value
                                                ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-200'
                                                : 'bg-white/70 border-slate-200 text-slate-600 hover:border-primary-200'
                                            }`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Experience Level */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Experience Level</label>
                            <select value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}
                                className="w-full max-w-xs px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                                <option value="fresher">Fresher (0-1 years)</option>
                                <option value="junior">Junior (1-3 years)</option>
                                <option value="mid">Mid-Level (3-5 years)</option>
                                <option value="senior">Senior (5+ years)</option>
                                <option value="lead">Lead / Staff</option>
                            </select>
                        </div>

                        {/* Preferred Roles & Locations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Preferred Roles (comma separated)</label>
                                <input type="text" value={preferredRoles} onChange={e => setPreferredRoles(e.target.value)}
                                    placeholder="Frontend Engineer, PM..."
                                    className="w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Preferred Locations (comma separated)</label>
                                <input type="text" value={preferredLocations} onChange={e => setPreferredLocations(e.target.value)}
                                    placeholder="New York, Remote, London..."
                                    className="w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                            </div>
                        </div>

                        {/* Min Salary & Target Companies */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">
                                    Minimum Salary ({CURRENCY_SYMBOLS[settings.currency]})
                                </label>
                                <input type="number" value={minSalary} onChange={e => setMinSalary(e.target.value)}
                                    placeholder="e.g. 500000"
                                    className="w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                                <p className="text-xs text-slate-400">Leave blank to not filter by salary.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Target Companies</label>
                                <input type="text" value={targetCompanies} onChange={e => setTargetCompanies(e.target.value)}
                                    placeholder="Google, Microsoft..."
                                    className="w-full px-4 py-2.5 bg-white/70 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                                <p className="text-xs text-slate-400">Comma separated company names.</p>
                            </div>
                        </div>

                        <button onClick={handleSaveJobPrefs} disabled={jobPrefSaving}
                            className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-70">
                            {jobPrefSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {jobPrefSaving ? 'Saving...' : 'Save Job Preferences'}
                        </button>
                    </div>
                )}

                {/* ─── Account ─── */}
                {activeTab === 'account' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Account</h2>
                                <p className="text-sm text-slate-500">Manage your account and data.</p>
                            </div>
                        </div>

                        {/* Reset Settings */}
                        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                            <div className="flex items-center gap-2">
                                <RotateCcw className="w-4 h-4 text-slate-500" />
                                <h3 className="font-semibold text-slate-800 text-sm">Reset All Settings</h3>
                            </div>
                            <p className="text-xs text-slate-500">Restore all display preferences, source selections, and toggles to their defaults.</p>
                            <button onClick={() => { resetSettings(); showSavedToast(); }}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-300 transition-colors">
                                Reset to Defaults
                            </button>
                        </div>

                        {/* Sign Out info */}
                        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-slate-500" />
                                <h3 className="font-semibold text-slate-800 text-sm">Session</h3>
                            </div>
                            <p className="text-xs text-slate-500">Your session is stored locally. Sign out from the sidebar when you&apos;re done.</p>
                            <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200 transition-colors">
                                Sign Out
                            </button>
                        </div>

                        {/* Danger Zone */}
                        <div className="p-5 rounded-xl border-2 border-red-200 bg-red-50/50 space-y-3">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                <h3 className="font-semibold text-red-700 text-sm">Danger Zone</h3>
                            </div>
                            <p className="text-xs text-red-600/70">Clear all local settings and cached data. Your backend profile and jobs are not affected.</p>
                            <div className="flex items-center gap-3">
                                <input type="text" value={clearConfirm} onChange={e => setClearConfirm(e.target.value)}
                                    placeholder='Type "DELETE" to confirm'
                                    className="px-3 py-2 border border-red-200 rounded-xl text-sm bg-white/80 focus:ring-2 focus:ring-red-300 outline-none w-56" />
                                <button onClick={handleClearJobs} disabled={clearConfirm !== 'DELETE' || clearingData}
                                    className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                                    {clearingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    Clear Data
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}

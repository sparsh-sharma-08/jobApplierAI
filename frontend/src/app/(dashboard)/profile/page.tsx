'use client';

import { useEffect, useState, useCallback } from 'react';
import { Upload, Loader2, User, Mail, MapPin, Briefcase, Code2, Linkedin, Github, CheckCircle2, AlertCircle, FileText, Edit3, Save, ChevronDown, ChevronUp, Trash2, Plus, X, Eye } from 'lucide-react';
import LLMProgressBar from '@/components/LLMProgressBar';

import { useResumeProfiles, ResumeProfile } from '@/hooks/useResumeProfiles';
import ConfirmationModal from '@/components/ConfirmationModal';
import InputModal from '@/components/InputModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── Types ───
interface MasterResume {
    name?: string;
    contact?: { email?: string; phone?: string; location?: string; linkedin?: string; github?: string };
    summary?: string;
    skills?: string[];
    experience?: { title: string; company: string; start_date?: string; end_date?: string; highlights?: string[]; technologies?: string[] }[];
    projects?: { name: string; description: string; technologies?: string[]; highlights?: string[]; link?: string }[];
    education?: { degree: string; institution: string; year?: string; gpa?: string }[];
    certifications?: string[];
    languages?: string[];
}

// Normalize skills array: LLM sometimes returns objects instead of strings
function normalizeResume(r: any): MasterResume {
    if (!r || typeof r !== 'object') return {};
    const normalized = { ...r };
    if (Array.isArray(normalized.skills)) {
        normalized.skills = normalized.skills.map((s: any) =>
            typeof s === 'string' ? s : (s?.title || s?.name || JSON.stringify(s))
        );
    }
    return normalized;
}

export default function ProfilePage() {
    const { 
        profiles, 
        loading: profilesLoading, 
        activeProfile, 
        activeProfileId, 
        setActiveProfileId,
        createProfile,
        updateProfile,
        deleteProfile 
    } = useResumeProfiles();

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    // Profile form fields (Global Identity)
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState('');
    const [linkedin, setLinkedin] = useState('');
    const [github, setGithub] = useState('');
    const [locations, setLocations] = useState('');
    const [remotePreference, setRemotePreference] = useState('any');
    const [minSalary, setMinSalary] = useState('');

    // Active Profile fields (Specialized Data)
    const [profileName, setProfileName] = useState('');
    const [roleTitle, setRoleTitle] = useState('');
    const [profileSummary, setProfileSummary] = useState('');
    const [profileSkills, setProfileSkills] = useState('');
    const [experienceLevel, setExperienceLevel] = useState('mid');
    const [preferredRoles, setPreferredRoles] = useState('');
    const [masterResume, setMasterResume] = useState<MasterResume | null>(null);

    const [editingResume, setEditingResume] = useState(false);
    const [savingResume, setSavingResume] = useState(false);
    const [resumeMsg, setResumeMsg] = useState({ text: '', type: '' });
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        contact: true, summary: true, skills: true, experience: true, projects: true, education: true, certifications: false
    });
    const [activeTab, setActiveTab] = useState<'profile' | 'resume'>('profile');
    
    // ─── Modal States ───
    const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; profileId: number | null; profileName: string }>({
        isOpen: false,
        profileId: null,
        profileName: ''
    });

    const getToken = () => localStorage.getItem('token');

    useEffect(() => {
        const token = getToken();
        if (!token) return;

        // Fetch global profile
        fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => { if (res.ok) return res.json(); return null; })
            .then(data => {
                if (data) {
                    setProfile(data);
                    setName(data.name || '');
                    setEmail(data.email || '');
                    setPhone(data.phone || '');
                    setLocation(data.location || '');
                    setLinkedin(data.linkedin || '');
                    setGithub(data.github || '');
                    setLocations((data.preferred_locations || []).join(', '));
                    setRemotePreference(data.remote_preference || 'any');
                    setMinSalary(data.min_salary?.toString() || '');
                }
            })
            .finally(() => setLoading(false));
    }, []);

    // Sync state when active profile changes
    useEffect(() => {
        if (activeProfile) {
            setProfileName(activeProfile.name || '');
            setRoleTitle(activeProfile.role_title || '');
            setProfileSummary(activeProfile.summary || '');
            setProfileSkills((activeProfile.skills || []).join(', '));
            setExperienceLevel(activeProfile.experience_level || 'mid');
            setPreferredRoles((activeProfile.preferred_roles || []).join(', '));
            if (activeProfile.master_resume && Object.keys(activeProfile.master_resume).length > 0) {
                setMasterResume(normalizeResume(activeProfile.master_resume));
            } else {
                setMasterResume(null);
            }
        }
    }, [activeProfile]);

    // ─── Global Profile Save ───
    const handleSaveGlobal = async () => {
        const token = getToken();
        if (!token) return;
        setSaving(true);
        setMsg({ text: '', type: '' });
        try {
            const res = await fetch(`${API}/profile`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, email, phone, location, linkedin, github,
                    preferred_locations: locations.split(',').map(s => s.trim()).filter(Boolean),
                    remote_preference: remotePreference,
                    min_salary: parseInt(minSalary) || 0,
                }),
            });
            if (res.ok) setMsg({ text: 'Global profile saved successfully!', type: 'success' });
            else throw new Error('Save failed');
        } catch { setMsg({ text: 'Failed to save global profile.', type: 'error' }); }
        finally { setSaving(false); }
    };

    // ─── Active Profile Save (Specialized) ───
    const handleSaveActiveProfile = async () => {
        if (!activeProfileId) return;
        setSaving(true);
        setMsg({ text: '', type: '' });
        const success = await updateProfile(activeProfileId, {
            name: profileName,
            role_title: roleTitle,
            summary: profileSummary,
            skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
            experience_level: experienceLevel,
            preferred_roles: preferredRoles.split(',').map(s => s.trim()).filter(Boolean),
        });
        if (success) setMsg({ text: 'Specialized profile saved!', type: 'success' });
        setSaving(false);
    };

    // ─── Resume Upload ───
    const handleUploadResume = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const token = getToken();
        if (!token) return;
        setIsUploading(true);
        setResumeMsg({ text: '', type: '' });

        const formData = new FormData();
        formData.append('file', file);
        // Pass active profile ID if available
        const url = activeProfileId ? `${API}/profile/upload-resume?profile_id=${activeProfileId}` : `${API}/profile/upload-resume`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (res.ok) {
                const data = await res.json();
                if (data.parsed_data) {
                    setMasterResume(normalizeResume(data.parsed_data));
                    setEditingResume(true);
                    setActiveTab('resume');
                    // Also auto-fill profile fields if this is a new profile or empty
                    const p = data.parsed_data;
                    if (p.name && !name) setName(p.name);
                    if (p.contact?.email && !email) setEmail(p.contact.email);
                    if (p.contact?.phone && !phone) setPhone(p.contact.phone);
                    if (p.contact?.linkedin && !linkedin) setLinkedin(p.contact.linkedin);
                    if (p.contact?.github && !github) setGithub(p.contact.github);
                    
                    if (p.skills?.length) setProfileSkills(p.skills.join(', '));
                    if (p.summary) setProfileSummary(p.summary);
                }
                setResumeMsg({ text: '✅ Resume parsed! Please review the extracted data and click "Approve & Save".', type: 'success' });
            } else {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Upload failed');
            }
        } catch (err: any) { setResumeMsg({ text: err.message || 'Upload failed.', type: 'error' }); }
        finally { setIsUploading(false); }
    };

    // ─── Save Master Resume ───
    const handleSaveMasterResume = async () => {
        const token = getToken();
        if (!token || !masterResume || !activeProfileId) return;
        setSavingResume(true);
        setResumeMsg({ text: '', type: '' });
        try {
            const res = await fetch(`${API}/profile/master-resume?profile_id=${activeProfileId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ master_resume: masterResume }),
            });
            if (res.ok) {
                setEditingResume(false);
                setResumeMsg({ text: 'Master resume approved and saved!', type: 'success' });
                // We don't need to manually update profile state here as useResumeProfiles should handle it or we can re-fetch
            } else throw new Error();
        } catch { setResumeMsg({ text: 'Failed to save master resume.', type: 'error' }); }
        finally { setSavingResume(false); }
    };

    // ─── Resume Edit helpers ───
    const updateResume = useCallback((updater: (prev: MasterResume) => MasterResume) => {
        setMasterResume(prev => prev ? updater(prev) : prev);
    }, []);

    const toggleSection = (key: string) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading || profilesLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="w-80"><LLMProgressBar text="Loading profiles..." /></div>
            </div>
        );
    }

    const hasResume = masterResume && Object.keys(masterResume).length > 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-900 dark:text-white">Profile & Resumes</h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm">Manage multiple career paths and professional identities.</p>
                </div>
                <button onClick={() => setIsNewProfileModalOpen(true)} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Profile
                </button>
            </div>

            {/* Profile Switcher */}
            <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                {profiles.map(p => (
                    <button key={p.id} onClick={() => setActiveProfileId(p.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2
                            ${activeProfileId === p.id 
                                ? 'bg-white dark:bg-slate-900 shadow-md text-primary-700 dark:text-primary-400' 
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                        {p.is_default && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {p.name}
                        {profiles.length > 1 && !p.is_default && activeProfileId === p.id && (
                            <Trash2 onClick={(e) => { 
                                e.stopPropagation(); 
                                setDeleteModal({ isOpen: true, profileId: p.id, profileName: p.name });
                            }} 
                                className="w-3.5 h-3.5 ml-1 text-slate-400 hover:text-red-500 transition-colors" />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button onClick={() => setActiveTab('profile')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                        ${activeTab === 'profile' ? 'bg-white dark:bg-slate-900 shadow-md text-primary-700 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5'}`}>
                    <User className="w-4 h-4" /> Identity & Match Preferences
                </button>
                <button onClick={() => setActiveTab('resume')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                        ${activeTab === 'resume' ? 'bg-white dark:bg-slate-900 shadow-md text-primary-700 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5'}`}>
                    <FileText className="w-4 h-4" /> Master Resume Designer
                    {hasResume && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                    {!hasResume && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                </button>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* PROFILE TAB */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === 'profile' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {msg.text && (
                        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${msg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30'}`}>
                            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {msg.text}
                        </div>
                    )}

                    <div className="glass-card p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <User className="w-5 h-5 text-primary-500" /> Global Identity
                            </h2>
                            <button onClick={handleSaveGlobal} disabled={saving} className="text-primary-600 font-medium text-sm hover:underline">
                                {saving ? 'Saving...' : 'Save Global Info'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { label: 'Full Name', value: name, setter: setName, icon: User, placeholder: 'Jane Doe' },
                                { label: 'Email', value: email, setter: setEmail, icon: Mail, placeholder: 'you@example.com' },
                                { label: 'Phone', value: phone, setter: setPhone, icon: User, placeholder: '+91 ...' },
                                { label: 'Location', value: location, setter: setLocation, icon: MapPin, placeholder: 'Mumbai, India' },
                                { label: 'LinkedIn', value: linkedin, setter: setLinkedin, icon: Linkedin, placeholder: 'linkedin.com/in/...' },
                                { label: 'GitHub', value: github, setter: setGithub, icon: Github, placeholder: 'github.com/...' },
                            ].map(field => (
                                <div key={field.label}>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{field.label}</label>
                                    <input type="text" value={field.value} onChange={e => field.setter(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        placeholder={field.placeholder} />
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Preferred Locations</label>
                                <input type="text" value={locations} onChange={e => setLocations(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="Remote, Mumbai, Bangalore..." />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Min Salary Expectation ($)</label>
                                <input type="number" value={minSalary} onChange={e => setMinSalary(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="80000" />
                            </div>
                        </div>
                    </div>

                    <div className="glass-card p-6 space-y-5 border-2 border-primary-500/20 shadow-lg">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-primary-500" /> Specialized Search Profile: <span className="text-primary-600">{profileName}</span>
                            </h2>
                            <div className="flex gap-4">
                                {!activeProfile?.is_default && (
                                    <button onClick={() => updateProfile(activeProfileId!, { is_default: true })} className="text-slate-500 text-sm hover:underline">
                                        Make Default
                                    </button>
                                )}
                                <button onClick={handleSaveActiveProfile} disabled={saving} className="text-primary-600 font-bold text-sm hover:underline uppercase tracking-tight">
                                    {saving ? 'Saving...' : 'Save Profile Settings'}
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Profile Display Name</label>
                                <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Target Role Title</label>
                                <input type="text" value={roleTitle} onChange={e => setRoleTitle(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="e.g. Senior Frontend Engineer" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Target Skills (Match Scoring)</label>
                            <textarea value={profileSkills} onChange={e => setProfileSkills(e.target.value)} rows={2}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                placeholder="Python, React, AWS..." />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Preferred Roles</label>
                                <input type="text" value={preferredRoles} onChange={e => setPreferredRoles(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="Frontend, React, Javascript..." />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Experience Level</label>
                                <select value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none">
                                    <option value="fresher">Fresher (0-1 years)</option>
                                    <option value="junior">Junior (1-3 years)</option>
                                    <option value="mid">Mid (3-5 years)</option>
                                    <option value="senior">Senior (5+ years)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* MASTER RESUME TAB */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === 'resume' && (
                <div className="space-y-6 animate-in fade-in duration-300">

                    {resumeMsg.text && (
                        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${resumeMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30'}`}>
                            {resumeMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {resumeMsg.text}
                        </div>
                    )}

                    {/* Upload Section */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upload Master Resume</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Upload your PDF resume. AI will extract it to structured JSON for you to review.</p>
                            </div>
                            {hasResume && (
                                <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold border border-emerald-100 dark:border-emerald-900/30">
                                    ✓ Resume Saved
                                </span>
                            )}
                        </div>
                        {isUploading ? (
                            <LLMProgressBar text="Parsing resume with AI..." />
                        ) : (
                            <div className="flex items-center gap-4">
                                <label className="inline-flex items-center gap-2 btn-primary px-5 py-2.5 text-sm cursor-pointer">
                                    <Upload className="w-4 h-4" /> {hasResume ? 'Re-upload PDF' : 'Upload PDF'}
                                    <input type="file" accept=".pdf" onChange={handleUploadResume} className="hidden" />
                                </label>
                                {hasResume && !editingResume && (
                                    <button onClick={() => setEditingResume(true)}
                                        className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2">
                                        <Edit3 className="w-4 h-4" /> Edit Resume Data
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Resume JSON Editor — shows after upload or when editing */}
                    {hasResume && (editingResume || masterResume) && (
                        <div className="space-y-4">

                            {/* Action bar */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-primary-500" />
                                    {editingResume ? 'Review & Edit Resume Data' : 'Saved Master Resume'}
                                </h2>
                                <div className="flex gap-2">
                                    {editingResume && (
                                        <>
                                            <button onClick={() => setEditingResume(false)}
                                                className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
                                                <X className="w-4 h-4" /> Cancel
                                            </button>
                                            <button onClick={handleSaveMasterResume} disabled={savingResume}
                                                className="btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-70">
                                                {savingResume ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                {savingResume ? 'Saving...' : 'Approve & Save'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ─── Contact ─── */}
                            <SectionCard title="Contact Info" expanded={expandedSections.contact} onToggle={() => toggleSection('contact')}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <EditField label="Name" value={masterResume!.name || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, name: v }))} />
                                    <EditField label="Email" value={masterResume!.contact?.email || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, contact: { ...r.contact, email: v } }))} />
                                    <EditField label="Phone" value={masterResume!.contact?.phone || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, contact: { ...r.contact, phone: v } }))} />
                                    <EditField label="Location" value={masterResume!.contact?.location || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, contact: { ...r.contact, location: v } }))} />
                                    <EditField label="LinkedIn" value={masterResume!.contact?.linkedin || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, contact: { ...r.contact, linkedin: v } }))} />
                                    <EditField label="GitHub" value={masterResume!.contact?.github || ''} disabled={!editingResume}
                                        onChange={v => updateResume(r => ({ ...r, contact: { ...r.contact, github: v } }))} />
                                </div>
                            </SectionCard>

                            {/* ─── Summary ─── */}
                            <SectionCard title="Professional Summary" expanded={expandedSections.summary} onToggle={() => toggleSection('summary')}>
                                <textarea value={masterResume!.summary || ''} disabled={!editingResume} rows={3}
                                    onChange={e => updateResume(r => ({ ...r, summary: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-600 dark:disabled:text-slate-400"
                                    placeholder="Brief professional summary..." />
                            </SectionCard>

                            {/* ─── Skills ─── */}
                            <SectionCard title={`Skills (${masterResume!.skills?.length || 0})`} expanded={expandedSections.skills} onToggle={() => toggleSection('skills')}>
                                <div className="flex flex-wrap gap-2">
                                    {(masterResume!.skills || []).map((skill, i) => {
                                        const label = typeof skill === 'string' ? skill : ((skill as any)?.title || (skill as any)?.name || String(skill));
                                        return (
                                            <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg text-sm font-medium border border-primary-100 dark:border-primary-900/30">
                                                {label}
                                                {editingResume && (
                                                    <button onClick={() => updateResume(r => ({ ...r, skills: r.skills?.filter((_, j) => j !== i) }))}
                                                        className="ml-1 text-primary-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                                {editingResume && (
                                    <input type="text" placeholder="Type a skill and press Enter"
                                        className="mt-3 w-full max-w-xs px-4 py-2 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                                const val = (e.target as HTMLInputElement).value.trim();
                                                updateResume(r => ({ ...r, skills: [...(r.skills || []), val] }));
                                                (e.target as HTMLInputElement).value = '';
                                            }
                                        }} />
                                )}
                            </SectionCard>

                            {/* ─── Experience ─── */}
                            <SectionCard title={`Experience (${masterResume!.experience?.length || 0})`} expanded={expandedSections.experience} onToggle={() => toggleSection('experience')}>
                                {(masterResume!.experience || []).map((exp, i) => (
                                    <div key={i} className="p-4 bg-slate-50/80 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3 mb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                                                <EditField label="Title" value={exp.title} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ex = [...(r.experience || [])]; ex[i] = { ...ex[i], title: v }; return { ...r, experience: ex };
                                                    })} />
                                                <EditField label="Company" value={exp.company} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ex = [...(r.experience || [])]; ex[i] = { ...ex[i], company: v }; return { ...r, experience: ex };
                                                    })} />
                                                <EditField label="Start Date" value={exp.start_date || ''} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ex = [...(r.experience || [])]; ex[i] = { ...ex[i], start_date: v }; return { ...r, experience: ex };
                                                    })} />
                                                <EditField label="End Date" value={exp.end_date || ''} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ex = [...(r.experience || [])]; ex[i] = { ...ex[i], end_date: v }; return { ...r, experience: ex };
                                                    })} />
                                            </div>
                                            {editingResume && (
                                                <button onClick={() => updateResume(r => ({ ...r, experience: r.experience?.filter((_, j) => j !== i) }))}
                                                    className="ml-3 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                        <BulletList items={exp.highlights || []} disabled={!editingResume} label="Highlights"
                                            onChange={items => updateResume(r => {
                                                const ex = [...(r.experience || [])]; ex[i] = { ...ex[i], highlights: items }; return { ...r, experience: ex };
                                            })} />
                                    </div>
                                ))}
                                {editingResume && (
                                    <button onClick={() => updateResume(r => ({ ...r, experience: [...(r.experience || []), { title: '', company: '', highlights: [] }] }))}
                                        className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                        <Plus className="w-4 h-4" /> Add Experience
                                    </button>
                                )}
                            </SectionCard>

                            {/* ─── Projects ─── */}
                            <SectionCard title={`Projects (${masterResume!.projects?.length || 0})`} expanded={expandedSections.projects} onToggle={() => toggleSection('projects')}>
                                {(masterResume!.projects || []).map((proj, i) => (
                                    <div key={i} className="p-4 bg-slate-50/80 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3 mb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                                                <EditField label="Project Name" value={proj.name} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const p = [...(r.projects || [])]; p[i] = { ...p[i], name: v }; return { ...r, projects: p };
                                                    })} />
                                                <EditField label="Technologies" value={(proj.technologies || []).join(', ')} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const p = [...(r.projects || [])]; p[i] = { ...p[i], technologies: v.split(',').map(s => s.trim()).filter(Boolean) }; return { ...r, projects: p };
                                                    })} />
                                            </div>
                                            {editingResume && (
                                                <button onClick={() => updateResume(r => ({ ...r, projects: r.projects?.filter((_, j) => j !== i) }))}
                                                    className="ml-3 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Description</label>
                                            <textarea value={proj.description} disabled={!editingResume} rows={2}
                                                onChange={e => updateResume(r => {
                                                    const p = [...(r.projects || [])]; p[i] = { ...p[i], description: e.target.value }; return { ...r, projects: p };
                                                })}
                                                className="w-full px-3 py-2 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-600 dark:disabled:text-slate-400" />
                                        </div>
                                        <BulletList items={proj.highlights || []} disabled={!editingResume} label="Key Points"
                                            onChange={items => updateResume(r => {
                                                const p = [...(r.projects || [])]; p[i] = { ...p[i], highlights: items }; return { ...r, projects: p };
                                            })} />
                                    </div>
                                ))}
                                {editingResume && (
                                    <button onClick={() => updateResume(r => ({ ...r, projects: [...(r.projects || []), { name: '', description: '', technologies: [], highlights: [] }] }))}
                                        className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                        <Plus className="w-4 h-4" /> Add Project
                                    </button>
                                )}
                            </SectionCard>

                            {/* ─── Education ─── */}
                            <SectionCard title={`Education (${masterResume!.education?.length || 0})`} expanded={expandedSections.education} onToggle={() => toggleSection('education')}>
                                {(masterResume!.education || []).map((edu, i) => (
                                    <div key={i} className="p-4 bg-slate-50/80 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-slate-800 mb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                                                <EditField label="Degree" value={edu.degree} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ed = [...(r.education || [])]; ed[i] = { ...ed[i], degree: v }; return { ...r, education: ed };
                                                    })} />
                                                <EditField label="Institution" value={edu.institution} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ed = [...(r.education || [])]; ed[i] = { ...ed[i], institution: v }; return { ...r, education: ed };
                                                    })} />
                                                <EditField label="Year" value={edu.year || ''} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ed = [...(r.education || [])]; ed[i] = { ...ed[i], year: v }; return { ...r, education: ed };
                                                    })} />
                                                <EditField label="GPA" value={edu.gpa || ''} disabled={!editingResume}
                                                    onChange={v => updateResume(r => {
                                                        const ed = [...(r.education || [])]; ed[i] = { ...ed[i], gpa: v }; return { ...r, education: ed };
                                                    })} />
                                            </div>
                                            {editingResume && (
                                                <button onClick={() => updateResume(r => ({ ...r, education: r.education?.filter((_, j) => j !== i) }))}
                                                    className="ml-3 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {editingResume && (
                                    <button onClick={() => updateResume(r => ({ ...r, education: [...(r.education || []), { degree: '', institution: '', year: '', gpa: '' }] }))}
                                        className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                        <Plus className="w-4 h-4" /> Add Education
                                    </button>
                                )}
                            </SectionCard>

                            {/* Bottom save bar (sticky) */}
                            {editingResume && (
                                <div className="sticky bottom-4 glass-card p-4 flex items-center justify-between shadow-lg border-2 border-primary-200 dark:border-primary-900/50">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        ⚠️ Review carefully — this data will be used for <strong>all future tailored resumes</strong>.
                                    </p>
                                    <button onClick={handleSaveMasterResume} disabled={savingResume}
                                        className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-70">
                                        {savingResume ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        {savingResume ? 'Saving...' : 'Approve & Save Master Resume'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No resume yet */}
                    {!hasResume && !isUploading && (
                        <div className="glass-card p-8 text-center">
                            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">No Master Resume Yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Upload your resume PDF above. AI will extract the data into structured JSON that you can review and approve.</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">Your approved master resume will be used to generate tailored resumes for each job application.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Modals ─── */}
            <InputModal
                isOpen={isNewProfileModalOpen}
                onClose={() => setIsNewProfileModalOpen(false)}
                onConfirm={(name) => createProfile(name)}
                title="Create New Profile"
                message="Enter a name for your new professional identity (e.g., 'Data Scientist', 'Backend Developer')."
                placeholder="Profile Name"
                confirmLabel="Create Profile"
            />

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
                onConfirm={() => {
                    if (deleteModal.profileId) deleteProfile(deleteModal.profileId);
                }}
                title="Delete Profile?"
                message={`Are you sure you want to delete the profile "${deleteModal.profileName}"? This will remove all associated resumes and job scores.`}
                confirmLabel="Delete Permanently"
                type="danger"
            />
        </div>
    );
}


// ─── Reusable Components ───

function SectionCard({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <div className="glass-card overflow-hidden">
            <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {expanded && <div className="px-4 pb-4">{children}</div>}
        </div>
    );
}

function EditField({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string }) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
            <input type="text" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-600 dark:disabled:text-slate-400"
                placeholder={placeholder || label} />
        </div>
    );
}

function BulletList({ items, onChange, disabled, label }: { items: string[]; onChange: (items: string[]) => void; disabled: boolean; label: string }) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
            <div className="space-y-1.5">
                {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                        <span className="text-slate-400 dark:text-slate-600 mt-2 text-xs">•</span>
                        {disabled ? (
                            <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">{item}</p>
                        ) : (
                            <input type="text" value={item} onChange={e => {
                                const next = [...items]; next[i] = e.target.value; onChange(next);
                            }} className="flex-1 px-3 py-1.5 bg-white/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none" />
                        )}
                        {!disabled && (
                            <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                                className="p-1 text-red-400 hover:text-red-600 mt-0.5"><X className="w-3.5 h-3.5" /></button>
                        )}
                    </div>
                ))}
                {!disabled && (
                    <button onClick={() => onChange([...items, ''])}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mt-1">
                        <Plus className="w-3 h-3" /> Add {label.slice(0, -1) || 'item'}
                    </button>
                )}
            </div>
        </div>
    );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle2, ChevronRight, Briefcase, Zap, Loader2, DollarSign, Sparkles, Mail, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import LandingStory from '@/components/LandingStory';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

type Step = 'welcome' | 'auth' | 'upload' | 'preferences' | 'reveal';

export default function LandingPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('welcome');
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auth State
    const [isLogin, setIsLogin] = useState(false); // Default to signup for onboarding flow
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authToken, setAuthToken] = useState(''); // Store token temporarily during onboarding

    // Profile Data State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        location: '',
        skills: [] as string[],
        experience_level: 'mid',
        remote_preference: 'remote',
        min_salary: 80000,
        master_resume: null as any
    });

    const handleNext = (nextStep: Step) => setStep(nextStep);

    // --- STEP 2: AUTH ---
    const doLogin = async (loginEmail: string, loginPassword: string) => {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        });
        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setAuthToken(data.access_token);
        return data.access_token;
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessing(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                await doLogin(email, password);
                // If they logged in, they might already have a profile. 
                // Let's just send them to dashboard immediately to avoid rewriting their data.
                router.push('/dashboard');
                return;
            } else {
                // Registration Flow
                const res = await fetch(`${API}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || 'Registration failed');
                }
                await doLogin(email, password);

                // Advance to upload step for new users
                setFormData(prev => ({ ...prev, email: email }));
                setStep('upload');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- STEP 3: UPLOAD RESUME (SECURE) ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setErrorMsg('Please upload a PDF file.');
            return;
        }

        setIsProcessing(true);
        setErrorMsg('');

        const token = authToken || localStorage.getItem('token');
        const formDataPayload = new FormData();
        formDataPayload.append('file', file);

        try {
            const res = await fetch(`${API}/profile/upload-resume`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formDataPayload
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Upload failed');
            }

            const data = await res.json();
            const parsed = data.parsed_data || {};

            // Pre-fill preferences state with extracted data
            setFormData(prev => ({
                ...prev,
                name: parsed.name || prev.name,
                phone: (parsed.contact && parsed.contact.phone) || prev.phone,
                location: (parsed.contact && parsed.contact.location) || prev.location,
                skills: parsed.skills || [],
                master_resume: parsed
            }));

            // Move to next step smoothly
            setTimeout(() => {
                setIsProcessing(false);
                setStep('preferences');
            }, 1000);

        } catch (err: any) {
            setIsProcessing(false);
            setErrorMsg(err.message || 'Something went wrong parsing your resume.');
        }
    };

    // --- STEP 4: SAVE PROFILE ---
    const handleSaveProfile = async () => {
        setIsProcessing(true);
        setErrorMsg('');

        try {
            const token = authToken || localStorage.getItem('token');
            const profileRes = await fetch(`${API}/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (!profileRes.ok) throw new Error('Failed to save profile preferences.');

            // Success Reveal
            setIsProcessing(false);
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#4f46e5', '#10b981', '#f59e0b']
            });
            setStep('reveal');

            setTimeout(() => {
                router.push('/dashboard');
            }, 3000);

        } catch (err: any) {
            setIsProcessing(false);
            setErrorMsg(err.message);
        }
    };

    // --- RENDERERS ---
    // --- LANDING PAGE STORYTELLING ---
    const renderWelcome = () => (
        <LandingStory 
            onGetStarted={() => { setIsLogin(false); handleNext('auth'); }} 
            onLogin={() => { setIsLogin(true); handleNext('auth'); }} 
        />
    );

    const renderAuth = () => (
        <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-5xl mx-auto bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-100 min-h-[600px]"
        >
            {/* Left Side: Visual/Branding */}
            <div className="md:w-5/12 hidden md:flex flex-col justify-between p-12 bg-slate-900 text-white relative overflow-hidden">
                {/* Decorative glows */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/30 rounded-full blur-[80px]"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary-500/20 rounded-full blur-[80px]"></div>
                
                <div className="relative z-10 w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20 mb-8">
                    <Briefcase className="w-6 h-6 text-primary-400" />
                </div>
                
                <div className="relative z-10 mt-auto">
                    <h2 className="text-3xl font-bold mb-4 leading-tight">
                        {isLogin ? "Welcome back to your Copilot." : "Your career, accelerated."}
                    </h2>
                    <p className="text-slate-300 text-base leading-relaxed mb-8">
                        {isLogin 
                            ? "Resume targeted applications, track your progress, and land interviews faster than ever with AI-powered insights."
                            : "Join professionals bypassing ATS filters and landing interviews at top companies using our targeted AI resume builder."}
                    </p>
                    
                    {/* Minimal decorative element */}
                    <div className="flex gap-2 items-center">
                        <div className="w-8 h-1.5 rounded-full bg-primary-500"></div>
                        <div className="w-2 h-1.5 rounded-full bg-slate-700"></div>
                        <div className="w-2 h-1.5 rounded-full bg-slate-700"></div>
                    </div>
                </div>
            </div>

            {/* Right Side: Form */}
            <div className="md:w-7/12 p-8 sm:p-14 flex flex-col justify-center bg-white relative">
                <div className="max-w-md w-full mx-auto">
                    <div className="mb-10 lg:hidden">
                        <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-6">
                            <Briefcase className="w-6 h-6" />
                        </div>
                    </div>

                    <div className="mb-10">
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                            {isLogin ? 'Sign in' : 'Create an account'}
                        </h1>
                        <p className="text-slate-500 text-base">
                            {isLogin ? 'Enter your details to access your dashboard.' : 'Start targeting roles in seconds.'}
                        </p>
                    </div>

                    {errorMsg && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-8 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl flex items-start gap-3"
                        >
                            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-red-600 text-xs font-bold">!</span>
                            </div>
                            <span className="text-red-700 text-sm font-medium leading-relaxed">{errorMsg}</span>
                        </motion.div>
                    )}

                    <form onSubmit={handleAuthSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700">Email address</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                                </div>
                                <input 
                                    type="email" 
                                    value={email} 
                                    onChange={e => setEmail(e.target.value)} 
                                    required
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                                    placeholder="you@example.com" 
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-slate-700">Password</label>
                                {isLogin && <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-700">Forgot password?</a>}
                            </div>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                                </div>
                                <input 
                                    type="password" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    required
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                                    placeholder="••••••••" 
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isProcessing}
                            className="w-full btn-primary py-4 mt-8 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-70 text-base font-semibold shadow-lg shadow-primary-500/25 group transition-all hover:-translate-y-0.5"
                        >
                            {isProcessing ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Sign in to Dashboard' : 'Create Account'}
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-10 pt-8 border-t border-slate-100 flex items-center justify-center">
                        <p className="text-sm text-slate-500">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button 
                                onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
                                className="text-primary-600 font-semibold hover:text-primary-700 transition-colors"
                            >
                                {isLogin ? 'Sign up for free' : 'Sign in'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    const renderUpload = () => (
        <motion.div
            key="upload"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50, filter: "blur(10px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-white/80 backdrop-blur-xl p-8 sm:p-12 rounded-3xl shadow-xl border border-white/60 space-y-8 max-w-2xl w-full mx-auto"
        >
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Upload your resume</h2>
                <p className="text-slate-600">We'll use AI to magically extract your experience and skills in seconds.</p>
            </div>

            <div
                className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer group hover:bg-slate-50 ${isProcessing ? 'border-primary-400 bg-primary-50/50' : 'border-slate-300 hover:border-primary-400'}`}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                />

                {isProcessing ? (
                    <div className="space-y-4 flex flex-col items-center">
                        <div className="w-16 h-16 relative">
                            <div className="absolute inset-0 border-4 border-primary-200 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                            <FileText className="w-6 h-6 text-primary-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <p className="text-primary-700 font-medium animate-pulse">Extracting your superpowers...</p>
                    </div>
                ) : (
                    <div className="space-y-4 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-100 text-slate-400 group-hover:bg-primary-100 group-hover:text-primary-600 rounded-full flex items-center justify-center transition-colors">
                            <UploadCloud className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-700">Click to upload your PDF resume</p>
                            <p className="text-sm text-slate-500 mt-1">Or drag and drop it here</p>
                        </div>
                    </div>
                )}
            </div>

            {errorMsg && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 font-medium text-center">
                    {errorMsg}
                </div>
            )}

            <div className="text-center">
                <button
                    onClick={() => handleNext('preferences')}
                    disabled={isProcessing}
                    className="text-sm text-slate-500 hover:text-slate-700 font-medium underline underline-offset-4"
                >
                    Or skip and fill manually
                </button>
            </div>
        </motion.div>
    );

    const renderPreferences = () => (
        <motion.div
            key="preferences"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-white/90 backdrop-blur-xl p-8 sm:p-12 rounded-3xl shadow-xl border border-white/60 max-w-2xl w-full mx-auto"
        >
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Fine-tune your target</h2>
                    <p className="text-slate-600 mt-1">Tell us what you're looking for.</p>
                </div>
                {formData.name && (
                    <div className="hidden sm:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-medium border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4" /> Extract Success
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                        type="text"
                        className="input-field bg-slate-50"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <hr className="border-slate-100" />

                {/* Preferences */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Experience Level</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['fresher', 'junior', 'mid', 'senior'].map(lvl => (
                                <div
                                    key={lvl}
                                    onClick={() => setFormData({ ...formData, experience_level: lvl })}
                                    className={`cursor-pointer px-4 py-3 rounded-xl border text-center text-sm font-medium capitalize transition-all ${formData.experience_level === lvl ? 'bg-primary-50 border-primary-500 text-primary-700 ring-1 ring-primary-500 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                >
                                    {lvl}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Work Setup</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['remote', 'hybrid', 'onsite', 'any'].map(pref => (
                                <div
                                    key={pref}
                                    onClick={() => setFormData({ ...formData, remote_preference: pref })}
                                    className={`cursor-pointer px-4 py-3 rounded-xl border text-center text-sm font-medium capitalize transition-all ${formData.remote_preference === pref ? 'bg-primary-50 border-primary-500 text-primary-700 ring-1 ring-primary-500 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                >
                                    {pref}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum Base Salary expectations</label>
                    <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="number"
                            className="input-field pl-10"
                            value={formData.min_salary}
                            onChange={(e) => setFormData({ ...formData, min_salary: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 font-medium">
                        {errorMsg}
                    </div>
                )}

                <div className="pt-4 flex justify-end">
                    <button
                        onClick={handleSaveProfile}
                        disabled={isProcessing || !formData.name}
                        className="btn-primary w-full sm:w-auto px-8 py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Complete Setup'}
                        {!isProcessing && <Zap className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </motion.div>
    );

    const renderReveal = () => (
        <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
            className="text-center space-y-6 bg-white/60 backdrop-blur-xl p-12 sm:p-16 rounded-3xl shadow-2xl border border-white/80 max-w-md mx-auto"
        >
            <div className="mx-auto w-24 h-24 bg-gradient-to-tr from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30 mb-6">
                <CheckCircle2 className="w-12 h-12 text-white" />
            </div>

            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">You're all set!</h1>
            <p className="text-xl text-slate-600 font-medium">Preparing your personalized dashboard...</p>

            <div className="pt-8">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Ambient Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-100/50 blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary-100/50 blur-3xl pointer-events-none" />

            <div className="w-full relative z-10 flex justify-center">
                <AnimatePresence mode="wait">
                    {step === 'welcome' && renderWelcome()}
                    {step === 'auth' && renderAuth()}
                    {step === 'upload' && renderUpload()}
                    {step === 'preferences' && renderPreferences()}
                    {step === 'reveal' && renderReveal()}
                </AnimatePresence>
            </div>
        </div>
    );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle2, ChevronRight, Briefcase, Zap, Loader2, DollarSign, Sparkles, Mail, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';

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
        <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-5xl mx-auto pb-32"
        >
            {/* 1. HERO SECTION */}
            <div className="text-center py-20 sm:py-32 px-4 relative">
                {/* Decorative blobs */}
                <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-200/40 rounded-full blur-3xl -z-10 mix-blend-multiply"></div>
                <div className="absolute top-20 right-1/4 w-72 h-72 bg-secondary-200/40 rounded-full blur-3xl -z-10 mix-blend-multiply"></div>

                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, type: "spring" }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm mb-8"
                >
                    <Sparkles className="w-4 h-4 text-primary-600" />
                    <span className="text-sm font-semibold text-slate-700">The new way to get hired.</span>
                </motion.div>

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="text-5xl sm:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight"
                >
                    Stop throwing applications <br className="hidden sm:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-500 to-slate-800">into the void.</span>
                </motion.h1>

                <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="mt-8 text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed"
                >
                    Meet your AI Career Copilot. We automatically tailor your resume to bypass ATS robots and land you the interviews you actually deserve.
                </motion.p>

                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    <button
                        onClick={() => { setIsLogin(false); handleNext('auth'); }}
                        className="btn-primary text-lg px-8 py-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 group transform transition hover:scale-105 active:scale-95 shadow-xl shadow-primary-500/20"
                    >
                        Start Your Journey
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                        onClick={() => { setIsLogin(true); handleNext('auth'); }}
                        className="text-base font-medium text-slate-500 hover:text-slate-800 transition-colors px-6 py-4"
                    >
                        Log back in
                    </button>
                </motion.div>
            </div>

            {/* 2. THE PROBLEM (THE GRIND) */}
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="py-24 px-4 sm:px-8 border-t border-slate-200"
            >
                <div className="max-w-3xl mx-auto text-center space-y-6">
                    <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">The modern job search is broken.</h2>
                    <p className="text-lg text-slate-600">
                        You spend 45 minutes tweaking a single resume. You type your history into Workday forms. You click send. And then... <strong className="text-slate-900">nothing.</strong> You've been filtered out by an algorithm before a human ever saw your name.
                    </p>
                </div>

                <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
                    {[
                        { title: "The Black Hole", desc: "80% of resumes are rejected by ATS systems without human review.", icon: "🕳️" },
                        { title: "The Time Sink", desc: "Hours wasted manually changing keywords for every single application.", icon: "⏳" },
                        { title: "The Ghosting", desc: "Silence for weeks, followed by an automated generic rejection email.", icon: "👻" },
                    ].map((item, idx) => (
                        <div key={idx} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center transform transition hover:-translate-y-2">
                            <div className="text-4xl mb-4">{item.icon}</div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                            <p className="text-slate-600">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* 3. THE EPIPHANY / THE SOLUTION */}
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                className="py-24 px-4 sm:px-8 bg-slate-900 rounded-[3rem] text-white relative overflow-hidden"
            >
                {/* Dark mode background glows */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/30 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary-500/20 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
                    <div className="space-y-8">
                        <h2 className="text-4xl sm:text-5xl font-extrabold leading-tight">
                            What if <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-secondary-400">AI fought back?</span>
                        </h2>
                        <p className="text-xl text-slate-300">
                            Upload your master resume exactly once. When you find a job you love, our AI analyzes the description, rewrites your bullet points to match the exact ATS keywords, and generates a flawless, targeted PDF in 3 seconds.
                        </p>
                        <ul className="space-y-4 text-slate-300">
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400" /> Never manually edit a PDF again.</li>
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400" /> Score your match probability before applying.</li>
                            <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400" /> Track all targeted applications in one visual board.</li>
                        </ul>
                    </div>

                    {/* ANIMATED DEMO UI */}
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl relative">
                        <div className="flex items-center gap-2 mb-6 border-b border-slate-700 pb-4">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                            <div className="w-full bg-slate-900 rounded flex items-center px-4 py-1.5 ml-2 text-xs text-slate-500 font-mono">
                                career-copilot.ai/tailor
                            </div>
                        </div>

                        <div className="space-y-4 font-mono text-sm">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                                className="flex items-start gap-4"
                            >
                                <span className="text-primary-400">❯</span>
                                <span className="text-slate-300">Analyzing Job Desc: <span className="text-blue-300">"Senior React Engineer"</span></span>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: 1.2 }}
                                className="flex items-start gap-4"
                            >
                                <span className="text-primary-400">❯</span>
                                <span className="text-slate-300">Extracting missing keywords: <span className="text-emerald-300">[Next.js, CI/CD, GraphQL]</span></span>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                transition={{ delay: 2.2 }}
                                className="flex items-start gap-4"
                            >
                                <span className="text-primary-400 animate-pulse">❯</span>
                                <span className="text-slate-300">Rewriting bullet points to match 95% threshold...</span>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 3.5, type: "spring" }}
                                className="mt-6 bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <FileText className="w-8 h-8 text-emerald-400" />
                                    <div>
                                        <p className="font-sans font-bold text-white leading-none">Tailored_Resume_React.pdf</p>
                                        <p className="font-sans text-xs text-emerald-200 mt-1">Generated in 2.4s • Score: 96%</p>
                                    </div>
                                </div>
                                <div className="bg-emerald-500 text-white px-3 py-1 rounded shadow-sm font-sans text-xs font-bold">READY</div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* 4. REAL WORLD IMPACT (TESTIMONIAL) */}
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="py-24 px-4 sm:px-8 max-w-4xl mx-auto text-center"
            >
                <div className="w-20 h-20 mx-auto rounded-full bg-slate-200 overflow-hidden mb-8 border-4 border-white shadow-lg relative">
                    {/* Placeholder for an avatar picture */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold text-2xl">S</div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-serif italic text-slate-800 leading-relaxed mb-8">
                    "I applied to 120 jobs with my old master resume and didn't get a single callback. I felt completely hopeless. I put my profile into CareerCopilot, tailored 15 applications over a weekend, and got 4 interview requests by Tuesday."
                </h3>
                <p className="font-bold text-slate-900">— Sarah J., Frontend Developer</p>
            </motion.div>

            {/* 5. FINAL CTA */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="py-16 px-4 bg-gradient-to-br from-primary-50 to-secondary-50 border border-primary-100 rounded-3xl text-center max-w-3xl mx-auto shadow-xl flex flex-col items-center"
            >
                <h2 className="text-3xl font-bold text-slate-900 mb-4">Your next role is waiting.</h2>
                <p className="text-slate-600 mb-8 max-w-lg mx-auto">Join developers and engineers using AI to beat the system and land the jobs they actually want.</p>
                <button
                    onClick={() => { setIsLogin(false); handleNext('auth'); }}
                    className="btn-primary text-lg px-10 py-4 inline-flex items-center justify-center gap-2 group shadow-xl shadow-primary-500/30"
                >
                    Create Your Free Profile
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
            </motion.div>

        </motion.div>
    );

    const renderAuth = () => (
        <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="glass-card p-8 sm:p-12 max-w-md w-full mx-auto"
        >
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30 mb-4">
                    {isLogin ? <Lock className="w-7 h-7 text-white" /> : <Mail className="w-7 h-7 text-white" />}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">
                    {isLogin ? 'Welcome back' : 'Create an account'}
                </h1>
                <p className="text-slate-500 mt-1 text-sm">
                    {isLogin ? 'Log in to access your dashboard.' : 'First, save your progress securely.'}
                </p>
            </div>

            {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium text-center">
                    {errorMsg}
                </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                    <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white/70"
                            placeholder="you@example.com" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white/70"
                            placeholder="••••••••" />
                    </div>
                </div>

                <button type="submit" disabled={isProcessing}
                    className="w-full btn-primary py-3.5 mt-2 flex items-center justify-center gap-2 disabled:opacity-70 text-base">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                    {isLogin ? 'Sign in' : 'Create account'}
                </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
                    className="text-primary-600 font-medium hover:underline">
                    {isLogin ? 'Sign up for free' : 'Sign in'}
                </button>
            </p>
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

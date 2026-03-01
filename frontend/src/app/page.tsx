'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function AuthPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const doLogin = async (loginEmail: string, loginPassword: string) => {
        const formData = new URLSearchParams();
        formData.append('username', loginEmail);
        formData.append('password', loginPassword);
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        router.push('/dashboard');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                await doLogin(email, password);
            } else {
                const res = await fetch(`${API}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || 'Registration failed');
                }
                // Auto-login after register
                await doLogin(email, password);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="glass-card p-8 w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/30 mb-4">
                        <Briefcase className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        {isLogin ? 'Welcome back' : 'Create account'}
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        {isLogin ? 'Log in to manage your applications and discover new roles.' : 'Start your AI-powered job search today.'}
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                        <div className="relative">
                            <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white/70"
                                placeholder="you@example.com" />
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-slate-700">Password</label>
                            {isLogin && <button type="button" className="text-xs text-primary-600 hover:underline">Forgot password?</button>}
                        </div>
                        <div className="relative">
                            <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white/70"
                                placeholder="••••••••" />
                        </div>
                    </div>
                    <button type="submit" disabled={loading}
                        className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-70">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {isLogin ? 'Sign in' : 'Create account'}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-6">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-primary-600 font-medium hover:underline">
                        {isLogin ? 'Sign up for free' : 'Sign in'}
                    </button>
                </p>
            </div>
        </div>
    );
}

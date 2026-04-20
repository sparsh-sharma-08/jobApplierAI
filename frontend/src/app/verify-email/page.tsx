'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Briefcase } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');
    
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Verifying your email...');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Missing verification token.');
            return;
        }

        const verify = async () => {
            try {
                const res = await fetch(`${API}/auth/verify-email?token=${token}`);
                const data = await res.json();
                
                if (res.ok) {
                    setStatus('success');
                    setMessage(data.message || 'Email verified successfully!');
                } else {
                    setStatus('error');
                    setMessage(data.detail || 'Verification failed. The link might be expired.');
                }
            } catch (err) {
                setStatus('error');
                setMessage('Internal server error. Please try again later.');
            }
        };

        verify();
    }, [token]);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-12 text-center border border-slate-100"
        >
            <div className="flex justify-center mb-8">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
                    <Briefcase className="w-8 h-8" />
                </div>
            </div>

            {status === 'loading' && (
                <div className="space-y-6">
                    <div className="flex justify-center">
                        <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Verifying...</h1>
                    <p className="text-slate-500">Connecting to secure authentication service.</p>
                </div>
            )}

            {status === 'success' && (
                <div className="space-y-6">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 border border-emerald-100">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Email Verified!</h1>
                    <p className="text-slate-600 text-lg">{message}</p>
                    <button 
                        onClick={() => router.push('/')}
                        className="w-full btn-primary py-4 rounded-2xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary-500/20 group"
                    >
                        Sign In Now
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}

            {status === 'error' && (
                <div className="space-y-6">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 border border-red-100">
                            <XCircle className="w-10 h-10" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Verification Failed</h1>
                    <p className="text-slate-600 text-lg">{message}</p>
                    <button 
                        onClick={() => router.push('/')}
                        className="w-full px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all"
                    >
                        Back to Home
                    </button>
                </div>
            )}
        </motion.div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative overflow-hidden">
            {/* Ambient Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-100/50 blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary-100/50 blur-3xl pointer-events-none" />
            
            <Suspense fallback={
                <div className="flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-slate-300 animate-spin" />
                </div>
            }>
                <VerifyEmailContent />
            </Suspense>
        </div>
    );
}

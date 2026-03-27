'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Briefcase, UserCircle, Settings, LogOut, Sparkles, KanbanSquare, Moon, Sun, Monitor } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { apiFetch } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Jobs Pipeline', href: '/jobs', icon: Briefcase },
    { label: 'Tracker', href: '/tracker', icon: KanbanSquare },
    { label: 'Profile', href: '/profile', icon: UserCircle },
    { label: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const { settings, setSettings } = useSettings();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { router.push('/'); return; }

        apiFetch(`${API}/profile`)
            .then(res => {
                if (res.status === 401) throw new Error('unauthorized');
                return res.json();
            })
            .then(data => {
                if (data && data.name) {
                    setUser({ name: data.name || data.email || 'User', email: data.email || '' });
                } else {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        setUser({ name: payload.sub || 'User', email: payload.sub || '' });
                    } catch { setUser({ name: 'User', email: '' }); }
                }
            })
            .catch(() => { localStorage.removeItem('token'); router.push('/'); });
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        router.push('/');
    };

    if (!user) return null;

    const ThemeToggle = () => (
        <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-xl border border-slate-700/50 mb-4 mx-5">
            {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                    key={t}
                    onClick={() => setSettings({ theme: t })}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all text-xs font-semibold ${
                        settings.theme === t 
                        ? 'bg-white text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={`${t.charAt(0).toUpperCase() + t.slice(1)} Mode`}
                >
                    {t === 'light' && <Sun className="w-3.5 h-3.5" />}
                    {t === 'dark' && <Moon className="w-3.5 h-3.5" />}
                    {t === 'system' && <Monitor className="w-3.5 h-3.5" />}
                </button>
            ))}
        </div>
    );

    return (
        <div className="h-screen flex overflow-hidden bg-white dark:bg-slate-950 transition-colors duration-300">
            {/* Sidebar */}
            <aside className="hidden md:flex md:flex-col md:w-64 bg-slate-950 text-white flex-shrink-0 z-20">
                <div className="p-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-white/10">
                            <Briefcase className="w-5 h-5 text-slate-900" />
                        </div>
                        <div>
                            <h1 className="font-black text-lg tracking-tight">CareerCopilot</h1>
                            <p className="text-[11px] text-slate-500 font-medium">AI-powered job search</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map(item => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link key={item.href} href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-white text-slate-900 shadow-lg shadow-white/5'
                                        : 'text-slate-500 hover:text-white hover:bg-white/[0.06]'
                                    }`}>
                                <item.icon className={`w-5 h-5 ${isActive ? 'text-slate-900' : 'text-slate-500 group-hover:text-white'}`} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <ThemeToggle />

                {/* AI status card */}
                <div className="p-4 m-4 mt-0 rounded-2xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">AI Engine Active</span>
                    </div>
                    <p className="text-xs text-slate-500">Gemma 3 ready</p>
                </div>

                {/* User + Logout */}
                <div className="p-5 border-t border-white/[0.06]">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-sm">
                            {user.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4" /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 bg-white dark:bg-slate-950">
                <ErrorBoundary fallbackMessage="The dashboard component failed to load. Please try refreshing.">
                    {children}
                </ErrorBoundary>
            </main>
        </div>
    );
}

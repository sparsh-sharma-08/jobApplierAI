'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Briefcase, UserCircle, Settings, LogOut, Sparkles } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Jobs Pipeline', href: '/jobs', icon: Briefcase },
    { label: 'Profile', href: '/profile', icon: UserCircle },
    { label: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { router.push('/'); return; }

        // Try to get user profile; if none exists yet, create a minimal user object from token
        fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                if (res.status === 401) throw new Error('unauthorized');
                return res.json();
            })
            .then(data => {
                if (data) {
                    setUser({ name: data.name || data.email || 'User', email: data.email || '' });
                } else {
                    // No profile yet — decode email from JWT
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

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="hidden md:flex md:flex-col md:w-64 bg-gradient-to-b from-slate-900 via-primary-950 to-slate-900 text-white shadow-2xl">
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center shadow-lg animate-float">
                            <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">CareerCopilot</h1>
                            <p className="text-xs text-slate-400">AI-powered job search</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(item => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link key={item.href} href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-gradient-to-r from-primary-500/30 to-primary-600/20 text-white shadow-md shadow-primary-500/10 ring-1 ring-primary-400/30'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}>
                                <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-300' : 'text-slate-500 group-hover:text-primary-400'}`} />
                                {item.label}
                                {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-primary-400 animate-pulse" />}
                            </Link>
                        );
                    })}
                </nav>

                {/* AI status card */}
                <div className="p-4 m-4 rounded-xl bg-gradient-to-br from-primary-600/20 to-secondary-600/20 border border-primary-500/20">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary-300 animate-pulse" />
                        <span className="text-xs font-semibold text-primary-200 uppercase tracking-wider">AI Engine Active</span>
                    </div>
                    <p className="text-xs text-slate-400">Gemma 3 ready for resume & scoring</p>
                </div>

                {/* User + Logout */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center text-white font-bold text-sm">
                            {user.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{user.name}</p>
                            <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4" /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 p-6 md:p-8 overflow-auto">
                {children}
            </main>
        </div>
    );
}

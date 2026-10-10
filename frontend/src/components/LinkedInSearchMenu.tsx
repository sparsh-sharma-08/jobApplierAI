'use client';

import { useState, useRef, useEffect } from 'react';
import { ExternalLink, ChevronDown, Users, Briefcase } from 'lucide-react';
import { getLinkedInSearchLinks } from '@/lib/linkedin';

interface LinkedInSearchMenuProps {
    company?: string | null;
    className?: string;
}

export default function LinkedInSearchMenu({ company, className = '' }: LinkedInSearchMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const { disabled, engineeringManagerUrl, technicalRecruiterUrl } = getLinkedInSearchLinks(company);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        return () => document.removeEventListener('pointerdown', handleClickOutside);
    }, [isOpen]);

    if (disabled) {
        return (
            <button
                type="button"
                disabled
                onClick={(e) => e.stopPropagation()}
                title="Company name unavailable for LinkedIn search"
                className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg bg-slate-50/60 dark:bg-slate-900/40 cursor-not-allowed opacity-60 ${className}`}
            >
                <Users className="w-3.5 h-3.5" />
                <span>Search LinkedIn</span>
            </button>
        );
    }

    return (
        <div ref={menuRef} className={`relative inline-block text-left ${className}`} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 transition-colors shadow-sm"
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <Users className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                <span>Search LinkedIn</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 bottom-full mb-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Outreach at {company?.trim()}
                    </div>
                    <a
                        href={engineeringManagerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-primary-500" />
                            <span>Engineering Manager</span>
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                    <a
                        href={technicalRecruiterUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Technical Recruiter</span>
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                </div>
            )}
        </div>
    );
}

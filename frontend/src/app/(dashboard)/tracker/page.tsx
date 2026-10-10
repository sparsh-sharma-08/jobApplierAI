'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Briefcase,
    Building2,
    MapPin,
    Loader2,
    CheckCircle2,
    Plus,
    Search,
    X,
    Trash2,
    Calendar,
    Clock,
    Bell,
    ExternalLink,
    Info,
    Send,
    TrendingUp,
    Check,
    MessageSquare,
    AlertCircle,
    ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import LLMProgressBar from '@/components/LLMProgressBar';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useResumeProfiles } from '@/hooks/useResumeProfiles';
import LinkedInSearchMenu from '@/components/LinkedInSearchMenu';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// --- TYPES ---
type Application = {
    id: number;
    job_id: number;
    status: string;
    applied_date?: string | null;
    applied_date_estimated?: boolean;
    created_at?: string | null;
    notes?: string | null;
    job: {
        company: string;
        role: string;
        location: string;
        salary: string;
        posted_date?: string | null;
        recency_label?: string | null;
        apply_link?: string | null;
    };
};

type FunnelAnalytics = {
    total_tracked: number;
    applied_count: number;
    response_count: number;
    interview_count: number;
    offer_count: number;
    response_rate: number | null;
    interview_rate: number | null;
    offer_rate: number | null;
    sample_too_small: boolean;
};

type FollowUpDueItem = {
    kind: string;
    due_since: string;
    days_overdue: number;
    message: string;
};

type ApplicationFollowUpState = {
    application_id: number;
    applied_date: string | null;
    company: string;
    role: string;
    days_since_applied: number;
    due_now: FollowUpDueItem[];
    already_followed_up_kinds: string[];
    has_response: boolean;
    dismissed_kinds: string[];
    next_action_date: string | null;
};

type ApplicationEvent = {
    id: number;
    application_id: number;
    event_type: string;
    event_kind?: string | null;
    note?: string | null;
    occurred_at: string;
};

const COLUMNS = [
    { id: 'pending', title: 'Saved', color: 'slate' },
    { id: 'applied', title: 'Applied', color: 'amber' },
    { id: 'interview', title: 'Interviewing', color: 'blue' },
    { id: 'offer', title: 'Offered', color: 'emerald' },
    { id: 'rejected', title: 'Rejected / Ghosted', color: 'rose' },
];

const normalizeStatus = (status?: string): string => {
    if (!status) return 'pending';
    const s = status.toLowerCase();
    if (s === 'interviewing') return 'interview';
    if (s === 'offered') return 'offer';
    if (s === 'saved') return 'pending';
    if (s === 'ghosted') return 'rejected';
    return s;
};

// Grounded recency formatter (pure function, no invented 10/10 scores in UI)
function formatPostedRecency(postedDate?: string | null): string | null {
    if (!postedDate) return null;
    const days = Math.max(0, Math.floor((Date.now() - new Date(postedDate).getTime()) / (1000 * 60 * 60 * 24)));
    if (days === 0) return 'Posted today';
    if (days === 1) return 'Posted yesterday';
    return `Posted ${days} days ago`;
}

function formatDaysSinceApplied(appliedDate?: string | null): string | null {
    if (!appliedDate) return null;
    const days = Math.max(0, Math.floor((Date.now() - new Date(appliedDate).getTime()) / (1000 * 60 * 60 * 24)));
    if (days === 0) return 'Applied today';
    if (days === 1) return 'Applied yesterday';
    return `Applied ${days} days ago`;
}

const KIND_TITLES: Record<string, string> = {
    day_3: 'Day 3 Connection Note',
    day_7: 'Day 7 Follow-up Email',
    day_14: 'Day 14 Final Check-in',
    ghosted_suggestion: '21+ Days: Mark as Ghosted?',
};

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    applied: { label: 'Applied', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
    followed_up: { label: 'Followed Up', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    follow_up_dismissed: { label: 'Dismissed Nudge', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    response_received: { label: 'Response Received', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
    phone_screen: { label: 'Phone Screen', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
    technical: { label: 'Technical Interview', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
    final_round: { label: 'Final Round', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
    offer: { label: 'Offer Received 🎉', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
    ghosted: { label: 'Marked Ghosted', color: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
};


// ─── B1: FUNNEL STATS HEADER ──────────────────────────────────────────────────
function FunnelStatsHeader({
    analytics,
    isLoading
}: {
    analytics: FunnelAnalytics | null;
    isLoading: boolean;
}) {
    if (isLoading && !analytics) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                ))}
            </div>
        );
    }

    if (!analytics || (analytics.total_tracked === 0 && analytics.applied_count === 0)) {
        return (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Application Funnel</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Track applications and log responses to see your real, data-grounded conversion rates.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const {
        applied_count,
        response_count,
        interview_count,
        offer_count,
        response_rate,
        interview_rate,
        offer_rate,
        sample_too_small,
        total_tracked
    } = analytics;

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Applied */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Applied</span>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{applied_count}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">({total_tracked} tracked)</span>
                    </div>
                </div>

                {/* Responses */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Responses</span>
                    <div className="mt-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{response_count}</span>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {!sample_too_small && applied_count > 0 ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {response_count} of {applied_count} applied ({Math.round((response_rate || 0) * 100)}%)
                                </span>
                            ) : (
                                <span>{response_count} total</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Interviews */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Interviews</span>
                    <div className="mt-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{interview_count}</span>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {!sample_too_small && applied_count > 0 ? (
                                <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    {interview_count} of {applied_count} applied ({Math.round((interview_rate || 0) * 100)}%)
                                </span>
                            ) : (
                                <span>{interview_count} total</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Offers */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Offers</span>
                    <div className="mt-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{offer_count}</span>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {!sample_too_small && applied_count > 0 ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {offer_count} of {applied_count} applied ({Math.round((offer_rate || 0) * 100)}%)
                                </span>
                            ) : (
                                <span>{offer_count} total</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {sample_too_small && applied_count > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>Conversion percentages appear after 10 applications (currently {applied_count} of 10 applied).</span>
                </div>
            )}
        </div>
    );
}


// ─── B2: FOLLOW-UPS DUE PANEL ─────────────────────────────────────────────────
function FollowUpsDuePanel({
    followUps,
    onLogFollowUp,
    onDismissFollowUp,
    onMarkGhosted,
    actionLoadingId
}: {
    followUps: ApplicationFollowUpState[];
    onLogFollowUp: (appId: number, kind: string) => Promise<void>;
    onDismissFollowUp: (appId: number, kind: string) => Promise<void>;
    onMarkGhosted: (appId: number, company: string) => void;
    actionLoadingId: number | null;
}) {
    const dueList = followUps.flatMap((app) =>
        app.due_now.map((item) => ({ ...item, app }))
    );

    if (dueList.length === 0) {
        return (
            <div className="px-4 py-2.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>All caught up! No follow-up actions due right now.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                        <Bell className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            Follow-ups Due
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                                {dueList.length}
                            </span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Timely check-ins keep momentum without overwhelming recruiters.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dueList.map((item) => {
                    const isGhosted = item.kind === 'ghosted_suggestion';
                    const isBusy = actionLoadingId !== null;
                    const isLoading = actionLoadingId === item.app.application_id;

                    return (
                        <div
                            key={`${item.app.application_id}-${item.kind}`}
                            className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-3"
                        >
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                                            {item.app.role}
                                        </h4>
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                                            {item.app.company} • Applied {item.app.days_since_applied} days ago
                                        </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                                        isGhosted
                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    }`}>
                                        {KIND_TITLES[item.kind] || item.kind}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                                    {item.message}
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                {isGhosted ? (
                                    <>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => onDismissFollowUp(item.app.application_id, item.kind)}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Keep Waiting
                                        </button>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => onMarkGhosted(item.app.application_id, item.app.company)}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Mark as Ghosted?
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => onDismissFollowUp(item.app.application_id, item.kind)}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Dismiss
                                        </button>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => onLogFollowUp(item.app.application_id, item.kind)}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        >
                                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                                            Log Follow-up
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


// ─── B3: SORTABLE CARD COMPONENT ──────────────────────────────────────────────
function SortableCard({
    app,
    hasFollowUpDue,
    onDelete,
    onClick
}: {
    app: Application;
    hasFollowUpDue: boolean;
    onDelete: (id: number) => void;
    onClick: (app: Application) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const postedRecency = app.job?.recency_label || formatPostedRecency(app.job?.posted_date) || 'Posting date unknown';
    const appliedDays = formatDaysSinceApplied(app.applied_date || app.created_at);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onClick(app)}
            className={`bg-white dark:bg-slate-900 border p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer active:cursor-grabbing group relative ${
                isDragging
                    ? 'ring-2 ring-slate-400 border-slate-400 z-50 scale-105 shadow-xl rotate-2'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
        >
            <div className="flex items-start justify-between mb-2.5">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                        <span className="font-black text-slate-500 dark:text-slate-400 text-base uppercase">
                            {app.job?.company?.charAt(0) || '?'}
                        </span>
                    </div>
                    {hasFollowUpDue && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-1">
                            <Bell className="w-2.5 h-2.5" /> Due
                        </span>
                    )}
                </div>
                <button
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remove Job"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight mb-2 line-clamp-2">
                {app.job?.role}
            </h3>

            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                    <span className="truncate">{app.job?.company}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                    <span className="truncate">{app.job?.location || 'Remote'}</span>
                </div>

                {appliedDays && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                        <span className="truncate">{appliedDays}</span>
                    </div>
                )}

                {postedRecency && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{postedRecency}</span>
                    </div>
                )}

                {app.job?.salary && (
                    <div className="mt-2.5 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40">
                        {app.job.salary}
                    </div>
                )}
            </div>
        </div>
    );
}


// ─── KANBAN COLUMN COMPONENT ──────────────────────────────────────────────────
function KanbanColumn({
    id,
    title,
    color,
    applications,
    followUpsMap,
    onDelete,
    onCardClick,
}: {
    id: string;
    title: string;
    color: string;
    applications: Application[];
    followUpsMap: Map<number, ApplicationFollowUpState>;
    onDelete: (id: number) => void;
    onCardClick: (app: Application) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });

    const colorMap: Record<string, { bg: string; border: string; text: string; grad: string; over: string; dropBorder: string; dropText: string; header: string }> = {
        slate: { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-700 dark:text-slate-300', grad: 'bg-slate-400', over: 'border-slate-400 dark:border-slate-500 shadow-slate-200 dark:shadow-slate-900 bg-slate-100/80 dark:bg-slate-800/80 shadow-inner', dropBorder: 'border-slate-300 dark:border-slate-700', dropText: 'text-slate-500 dark:text-slate-500', header: 'bg-white/80 dark:bg-slate-900/80' },
        amber: { bg: 'bg-amber-50/50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-900/30', text: 'text-amber-800 dark:text-amber-400', grad: 'bg-amber-400', over: 'border-amber-400 dark:border-amber-500 shadow-amber-200 dark:shadow-amber-900 bg-amber-50 dark:bg-amber-900/20 shadow-inner', dropBorder: 'border-amber-300 dark:border-amber-700', dropText: 'text-amber-500 dark:text-amber-500', header: 'bg-amber-100/30 dark:bg-amber-900/20' },
        blue: { bg: 'bg-blue-50/50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-900/30', text: 'text-blue-800 dark:text-blue-400', grad: 'bg-blue-400', over: 'border-blue-400 dark:border-blue-500 shadow-blue-200 dark:shadow-blue-900 bg-blue-50 dark:bg-blue-900/20 shadow-inner', dropBorder: 'border-blue-300 dark:border-blue-700', dropText: 'text-blue-500 dark:text-blue-500', header: 'bg-blue-100/30 dark:bg-blue-900/20' },
        emerald: { bg: 'bg-emerald-50/50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-900/30', text: 'text-emerald-800 dark:text-emerald-400', grad: 'bg-emerald-400', over: 'border-emerald-400 dark:border-emerald-500 shadow-emerald-200 dark:shadow-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 shadow-inner', dropBorder: 'border-emerald-300 dark:border-emerald-700', dropText: 'text-emerald-500 dark:text-emerald-500', header: 'bg-emerald-100/30 dark:bg-emerald-900/20' },
        rose: { bg: 'bg-rose-50/50 dark:bg-rose-900/10', border: 'border-rose-200 dark:border-rose-900/30', text: 'text-rose-800 dark:text-rose-400', grad: 'bg-rose-400', over: 'border-rose-400 dark:border-rose-500 shadow-rose-200 dark:shadow-rose-900 bg-rose-50 dark:bg-rose-900/20 shadow-inner', dropBorder: 'border-rose-300 dark:border-rose-700', dropText: 'text-rose-500 dark:text-rose-500', header: 'bg-rose-100/30 dark:bg-rose-900/20' }
    };

    const c = colorMap[color] || colorMap.slate;

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col rounded-3xl w-[320px] min-w-[320px] flex-shrink-0 transition-all duration-300 border-2 ${
                isOver ? c.over + ' scale-[1.02]' : `${c.bg} ${c.border}`
            }`}
        >
            <div className={`p-4 border-b rounded-t-3xl flex items-center justify-between sticky top-0 z-10 ${c.border} ${c.header ?? 'bg-white/50 dark:bg-slate-900/50'} backdrop-blur-md`}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-3 h-3 rounded-full ${c.grad} ring-2 ring-white dark:ring-slate-900`} />
                    <h2 className={`font-black text-sm ${c.text}`}>{title}</h2>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 shadow-sm border ${c.border} ${c.text}`}>
                    {applications.length}
                </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] rounded-b-3xl">
                <SortableContext items={applications.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                    {applications.map((app) => (
                        <SortableCard
                            key={app.id}
                            app={app}
                            hasFollowUpDue={(followUpsMap.get(app.id)?.due_now?.length || 0) > 0}
                            onDelete={onDelete}
                            onClick={onCardClick}
                        />
                    ))}
                </SortableContext>
                {applications.length === 0 && (
                    <div className={`h-full flex items-center justify-center p-8 border-2 border-dashed rounded-xl text-sm font-medium text-center transition-colors ${
                        isOver
                            ? `${c.dropBorder} ${c.dropText} bg-white/50 dark:bg-white/5`
                            : 'border-slate-200/50 dark:border-slate-700/50 text-slate-400 dark:text-slate-500'
                    }`}>
                        Drop jobs here
                    </div>
                )}
            </div>
        </div>
    );
}


// ─── B5: APPLICATION DETAIL & TIMELINE MODAL ───────────────────────────────────
function ApplicationDetailModal({
    app,
    onClose,
    onStatusChange,
    onRefresh
}: {
    app: Application | null;
    onClose: () => void;
    onStatusChange: (appId: number, status: string) => Promise<void>;
    onRefresh: () => void;
}) {
    const [events, setEvents] = useState<ApplicationEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [newEventType, setNewEventType] = useState('followed_up');
    const [newEventKind, setNewEventKind] = useState('day_3');
    const [newEventNote, setNewEventNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchEvents = useCallback(async () => {
        if (!app) return;
        setLoadingEvents(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/applications/${app.id}/events`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setEvents(data);
            }
        } catch (e) {
            console.error('Failed to fetch events', e);
        } finally {
            setLoadingEvents(false);
        }
    }, [app]);

    useEffect(() => {
        if (app) {
            fetchEvents();
        }
    }, [app, fetchEvents]);

    if (!app) return null;

    const handleCreateEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) return;

        setIsSubmitting(true);
        try {
            const payload: { event_type: string; event_kind?: string; note?: string } = {
                event_type: newEventType,
                note: newEventNote.trim() || undefined,
            };
            if (newEventType === 'followed_up' || newEventType === 'follow_up_dismissed') {
                payload.event_kind = newEventKind;
            }

            const res = await fetch(`${API}/applications/${app.id}/events`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success('Event logged to timeline');
                setNewEventNote('');
                fetchEvents();
                onRefresh();
            } else {
                toast.error('Failed to log event');
            }
        } catch {
            toast.error('Network error logging event');
        } finally {
            setIsSubmitting(false);
        }
    };

    const appliedDays = formatDaysSinceApplied(app.applied_date || app.created_at);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800"
            >
                {/* Header */}
                <div className="p-5 border-b dark:border-slate-800 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                                {app.job?.role}
                            </h2>
                            {app.job?.apply_link && (
                                <a
                                    href={app.job.apply_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Open apply link"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {app.job?.company} • {app.job?.location || 'Remote'}
                            {app.job?.salary ? ` • ${app.job.salary}` : ''}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={app.status}
                            onChange={(e) => onStatusChange(app.id, e.target.value)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                        >
                            {COLUMNS.map((col) => (
                                <option key={col.id} value={col.id}>{col.title}</option>
                            ))}
                        </select>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {/* Status & Date bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex flex-wrap items-center gap-3">
                            {appliedDays && (
                                <span className="flex items-center gap-1.5 font-medium">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {appliedDays}
                                </span>
                            )}
                            {app.applied_date && (
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    Recorded date: {new Date(app.applied_date).toLocaleDateString()}
                                    {app.applied_date_estimated && (
                                        <span className="ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                            Applied date estimated
                                        </span>
                                    )}
                                </span>
                            )}
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                {app.job?.recency_label || 'Posting date unknown'}
                            </span>
                        </div>
                        <LinkedInSearchMenu company={app.job?.company} />
                    </div>

                    {/* Timeline section */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-500" />
                            Application Timeline
                        </h3>

                        {loadingEvents ? (
                            <div className="py-8 flex justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : events.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-4">
                                No timeline events recorded yet. Move statuses or log follow-ups to populate the audit timeline.
                            </p>
                        ) : (
                            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                                {events.map((ev) => {
                                    const meta = EVENT_TYPE_LABELS[ev.event_type] || {
                                        label: ev.event_type.replace('_', ' '),
                                        color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                    };

                                    return (
                                        <div key={ev.id} className="relative group">
                                            <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                                            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.color}`}>
                                                        {meta.label}
                                                        {ev.event_kind ? ` • ${KIND_TITLES[ev.event_kind] || ev.event_kind}` : ''}
                                                    </span>
                                                    <span className="text-slate-400 dark:text-slate-500 text-[11px]">
                                                        {new Date(ev.occurred_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                {ev.note && (
                                                    <p className="mt-2 text-slate-700 dark:text-slate-300 font-medium">
                                                        {ev.note}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Manual log form */}
                    <form onSubmit={handleCreateEvent} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Log Timeline Event
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                    Event Type
                                </label>
                                <select
                                    value={newEventType}
                                    onChange={(e) => setNewEventType(e.target.value)}
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none"
                                >
                                    <option value="followed_up">Followed Up</option>
                                    <option value="response_received">Response Received</option>
                                    <option value="phone_screen">Phone Screen</option>
                                    <option value="technical">Technical Round</option>
                                    <option value="final_round">Final Round</option>
                                    <option value="offer">Job Offer</option>
                                    <option value="rejected">Rejection</option>
                                    <option value="ghosted">Marked Ghosted</option>
                                </select>
                            </div>

                            {(newEventType === 'followed_up' || newEventType === 'follow_up_dismissed') && (
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                        Follow-up Kind
                                    </label>
                                    <select
                                        value={newEventKind}
                                        onChange={(e) => setNewEventKind(e.target.value)}
                                        className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none"
                                    >
                                        <option value="day_3">Day 3 (LinkedIn Note)</option>
                                        <option value="day_7">Day 7 (Follow-up Email)</option>
                                        <option value="day_14">Day 14 (Final Check-in)</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                Notes (Your own notes, never fabricated)
                            </label>
                            <input
                                type="text"
                                value={newEventNote}
                                onChange={(e) => setNewEventNote(e.target.value)}
                                placeholder="e.g. Connected with engineering director on LinkedIn"
                                className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                                Add to Timeline
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}


// ─── MAIN PAGE COMPONENT ──────────────────────────────────────────────────────
export default function TrackerPage() {
    const { profiles, activeProfileId, setActiveProfileId } = useResumeProfiles();
    const [applications, setApplications] = useState<Application[]>([]);
    const [analytics, setAnalytics] = useState<FunnelAnalytics | null>(null);
    const [followUps, setFollowUps] = useState<ApplicationFollowUpState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeId, setActiveId] = useState<number | null>(null);

    // Selected app for detail / timeline modal
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);

    // Follow-up action loading state
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    // Add job modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [availableJobs, setAvailableJobs] = useState<any[]>([]);
    const [jobSearch, setJobSearch] = useState('');
    const [isAddingJob, setIsAddingJob] = useState(false);

    // Confirmation modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type: 'danger' | 'warning' | 'info';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        type: 'warning'
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // ─── Data fetchers ────────────────────────────────────────────────────────
    const fetchAnalytics = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const res = await fetch(`${API}/applications/analytics`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAnalytics(data);
            }
        } catch (e) {
            console.error('Failed to load funnel analytics', e);
        }
    }, []);

    const fetchFollowUps = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const res = await fetch(`${API}/applications/follow-ups`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFollowUps(data);
            }
        } catch (e) {
            console.error('Failed to load follow-up states', e);
        }
    }, []);

    const fetchApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const url = activeProfileId
                ? `${API}/applications?profile_id=${activeProfileId}&limit=500`
                : `${API}/applications?limit=500`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setApplications(data.map((app: Application) => ({ ...app, status: normalizeStatus(app.status) })));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [activeProfileId]);

    const refreshAll = useCallback(() => {
        fetchApps();
        fetchAnalytics();
        fetchFollowUps();
    }, [fetchApps, fetchAnalytics, fetchFollowUps]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    // Available jobs for Quick Add
    useEffect(() => {
        if (!showAddModal) return;
        const fetchPendingJobs = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch(`${API}/jobs?limit=250`, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    const existingJobIds = new Set(applications.map((a) => a.job_id));
                    setAvailableJobs(data.filter((j: any) => !existingJobIds.has(j.id)));
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchPendingJobs();
    }, [showAddModal, applications]);

    // ─── Action handlers ──────────────────────────────────────────────────────
    const handleLogFollowUp = async (appId: number, kind: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        setActionLoadingId(appId);
        try {
            const res = await fetch(`${API}/applications/${appId}/events`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event_type: 'followed_up',
                    event_kind: kind,
                })
            });

            if (res.ok) {
                toast.success(`Follow-up logged (${KIND_TITLES[kind] || kind})`);
                refreshAll();
            } else {
                toast.error('Failed to log follow-up');
            }
        } catch {
            toast.error('Network error logging follow-up');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleDismissFollowUp = async (appId: number, kind: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        setActionLoadingId(appId);
        try {
            const res = await fetch(`${API}/applications/${appId}/events`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    event_type: 'follow_up_dismissed',
                    event_kind: kind,
                })
            });

            if (res.ok) {
                toast.success('Follow-up suggestion dismissed');
                refreshAll();
            } else {
                toast.error('Failed to dismiss follow-up');
            }
        } catch {
            toast.error('Network error dismissing follow-up');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleMarkGhosted = (appId: number, company: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Mark as Ghosted?',
            message: `Would you like to mark your application at ${company} as ghosted? This records the outcome in your funnel without inflating active follow-ups. You can change this later if they reply.`,
            type: 'warning',
            onConfirm: async () => {
                const token = localStorage.getItem('token');
                if (!token) return;

                setActionLoadingId(appId);
                try {
                    const res = await fetch(`${API}/applications/${appId}/events`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ event_type: 'ghosted' })
                    });

                    if (res.ok) {
                        toast.success('Application marked as ghosted');
                        refreshAll();
                    } else {
                        toast.error('Failed to update status');
                    }
                } catch {
                    toast.error('Network error updating status');
                } finally {
                    setActionLoadingId(null);
                }
            }
        });
    };

    const handleDeleteApplication = async (appId: number) => {
        setConfirmModal({
            isOpen: true,
            title: 'Remove Job',
            message: 'Are you sure you want to remove this job from your tracker? This will move it back to the pipeline list.',
            type: 'warning',
            onConfirm: async () => {
                const token = localStorage.getItem('token');
                if (!token) return;

                try {
                    const res = await fetch(`${API}/applications/${appId}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        toast.success('Job removed from tracker');
                        setApplications((prev) => prev.filter((a) => a.id !== appId));
                        fetchAnalytics();
                        fetchFollowUps();
                    } else {
                        toast.error('Failed to remove job');
                    }
                } catch {
                    toast.error('Network error. Failed to delete.');
                }
            }
        });
    };

    const handleAddJobToTracker = async (jobId: number) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setIsAddingJob(true);
        try {
            const res = await fetch(`${API}/applications`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: jobId,
                    profile_id: activeProfileId
                })
            });
            if (res.ok) {
                toast.success('Job added to tracker!');
                refreshAll();
                setShowAddModal(false);
            } else {
                const data = await res.json();
                toast.error(data.detail || 'Failed to add job to tracker.');
            }
        } catch {
            toast.error('Network error.');
        }
        setIsAddingJob(false);
    };

    const handleUpdateStatus = async (appId: number, newStatus: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const res = await fetch(`${API}/applications/${appId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (res.ok) {
                toast.success('Status updated');
                refreshAll();
                if (selectedApp && selectedApp.id === appId) {
                    setSelectedApp((prev) => prev ? { ...prev, status: newStatus } : null);
                }
            } else {
                toast.error('Failed to update status');
            }
        } catch {
            toast.error('Network error updating status');
        }
    };

    // ─── Drag & Drop ──────────────────────────────────────────────────────────
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as number);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeItem = applications.find((a) => a.id === activeId);
        const overItem = applications.find((a) => a.id === overId);

        if (!activeItem) return;

        const overColId = overItem ? overItem.status : (COLUMNS.find((c) => c.id === overId) ? overId : null);

        if (overColId && activeItem.status !== overColId) {
            setApplications((prev) => {
                const newApps = [...prev];
                const activeIndex = newApps.findIndex((a) => a.id === activeId);
                newApps[activeIndex].status = overColId as string;
                return newApps;
            });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id as number;
        const activeItem = applications.find((a) => a.id === activeId);

        if (!activeItem) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/applications/${activeId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: activeItem.status })
            });

            if (res.ok) {
                const colTitle = COLUMNS.find((c) => c.id === activeItem.status)?.title;
                toast.success(`Moved to ${colTitle}`);
                fetchAnalytics();
                fetchFollowUps();
            } else {
                toast.error('Failed to update status.');
            }
        } catch (e) {
            console.error('Failed to update status', e);
            toast.error('Network error moving application.');
        }
    };

    const activeApp = applications.find((a) => a.id === activeId);
    const followUpsMap = new Map(followUps.map((f) => [f.application_id, f]));

    if (isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="w-80"><LLMProgressBar text="Loading tracker..." /></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4 max-h-screen">
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
            />

            {/* Application Detail & Timeline Modal */}
            <AnimatePresence>
                {selectedApp && (
                    <ApplicationDetailModal
                        app={selectedApp}
                        onClose={() => setSelectedApp(null)}
                        onStatusChange={handleUpdateStatus}
                        onRefresh={refreshAll}
                    />
                )}
            </AnimatePresence>

            {/* Header & Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white flex items-center gap-3">
                            <Briefcase className="w-6 h-6 text-slate-400" />
                            Application Tracker
                        </h1>
                        <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm font-medium">
                            {applications.length} jobs tracked for {profiles.find((p) => p.id === activeProfileId)?.name || 'Default'} profile
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full">
                            <Briefcase className="w-4 h-4 text-slate-400" />
                            <select
                                value={activeProfileId || ''}
                                onChange={(e) => setActiveProfileId(parseInt(e.target.value))}
                                className="bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                            >
                                {profiles.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (Default)' : ''}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn-primary px-6 py-2.5 text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all rounded-full"
                        >
                            <Plus className="w-4 h-4" /> Add Application
                        </button>
                    </div>
                </div>

                {/* B1: Funnel Stats Header */}
                <FunnelStatsHeader analytics={analytics} isLoading={isLoading} />

                {/* B2: Follow-ups Due Panel */}
                <FollowUpsDuePanel
                    followUps={followUps}
                    onLogFollowUp={handleLogFollowUp}
                    onDismissFollowUp={handleDismissFollowUp}
                    onMarkGhosted={handleMarkGhosted}
                    actionLoadingId={actionLoadingId}
                />
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto pb-6">
                <div className="flex gap-4 h-full items-start">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        {COLUMNS.map((col) => (
                            <div key={col.id} className="h-full">
                                <KanbanColumn
                                    id={col.id}
                                    title={col.title}
                                    color={col.color}
                                    applications={applications.filter((a) => normalizeStatus(a.status) === col.id)}
                                    followUpsMap={followUpsMap}
                                    onDelete={handleDeleteApplication}
                                    onCardClick={(app) => setSelectedApp(app)}
                                />
                            </div>
                        ))}

                        <DragOverlay>
                            {activeApp ? (
                                <div className="opacity-80 rotate-3 scale-105 shadow-xl transition-transform">
                                    <SortableCard
                                        app={activeApp}
                                        hasFollowUpDue={(followUpsMap.get(activeApp.id)?.due_now?.length || 0) > 0}
                                        onDelete={() => { }}
                                        onClick={() => { }}
                                    />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>

            {/* Quick Add Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setShowAddModal(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
                        >
                            <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add to Tracker</h2>
                                <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-5 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-white/5">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                                    <input
                                        type="text"
                                        value={jobSearch}
                                        onChange={(e) => setJobSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm dark:text-slate-200 focus:ring-2 focus:ring-slate-400 outline-none"
                                        placeholder="Search fetched jobs by role or company..."
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {availableJobs
                                    .filter((j) => j.role.toLowerCase().includes(jobSearch.toLowerCase()) || j.company.toLowerCase().includes(jobSearch.toLowerCase()))
                                    .slice(0, 50).map((job) => (
                                        <div key={job.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-between group">
                                            <div className="min-w-0 pr-4">
                                                <h3 className="font-semibold text-slate-900 dark:text-white truncate">{job.role}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{job.company}</span>
                                                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location || 'Remote'}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAddJobToTracker(job.id)}
                                                disabled={isAddingJob}
                                                className="opacity-0 group-hover:opacity-100 btn-secondary px-3 py-1.5 text-xs flex-shrink-0 transition-opacity disabled:opacity-50"
                                            >
                                                Add Job
                                            </button>
                                        </div>
                                    ))}
                                {availableJobs.length === 0 && (
                                    <div className="text-center p-8 text-slate-500 dark:text-slate-400 text-sm">
                                        No un-tracked jobs available. Go to Pipeline to fetch more.
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

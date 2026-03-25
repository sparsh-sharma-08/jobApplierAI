'use client';

import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverEvent, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Briefcase, Building2, MapPin, Loader2, GripVertical, CheckCircle2, Plus, Search, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import LLMProgressBar from '@/components/LLMProgressBar';
import ConfirmationModal from '@/components/ConfirmationModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

type Application = {
    id: number;
    job_id: number;
    status: string;
    job: {
        company: string;
        role: string;
        location: string;
        salary: string;
    }
};

const COLUMNS = [
    { id: 'pending', title: 'Saved', color: 'slate' },
    { id: 'applied', title: 'Applied', color: 'amber' },
    { id: 'interview', title: 'Interviewing', color: 'blue' },
    { id: 'offer', title: 'Offered', color: 'emerald' },
    { id: 'rejected', title: 'Rejected', color: 'rose' }
];

// --- SORTABLE CARD COMPONENT ---
function SortableCard({ app, onDelete }: { app: Application, onDelete: (id: number) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`bg-white dark:bg-slate-900 border p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative ${isDragging ? 'ring-2 ring-primary-500 border-primary-500 z-50 scale-105 shadow-xl rotate-2' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <span className="font-bold text-slate-500 dark:text-slate-400 text-lg uppercase">{app.job.company.charAt(0)}</span>
                </div>
                <button
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); onDelete(app.id); }}
                    className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remove Job"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <h3 className="font-bold text-slate-800 dark:text-white text-sm leading-tight mb-2 line-clamp-2">{app.job.role}</h3>

            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                    <span className="truncate">{app.job.company}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                    <span className="truncate">{app.job.location || 'Remote'}</span>
                </div>

                {app.job.salary && (
                    <div className="mt-3 inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40">
                        {app.job.salary}
                    </div>
                )}
            </div>
        </div>
    );
}


// --- KANBAN COLUMN COMPONENT ---
function KanbanColumn({ id, title, color, applications, onDelete }: { id: string, title: string, color: string, applications: Application[], onDelete: (id: number) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id });

    const colorMap: Record<string, { bg: string, border: string, text: string, grad: string, over: string, dropBorder: string, dropText: string, header: string }> = {
        slate: { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-200 dark:border-slate-800', text: 'text-slate-700 dark:text-slate-300', grad: 'from-slate-400 to-slate-500', over: 'border-slate-400 dark:border-slate-500 shadow-slate-200 dark:shadow-slate-900 backdrop-blur-sm bg-slate-100/80 dark:bg-slate-800/80 shadow-inner', dropBorder: 'border-slate-300 dark:border-slate-700', dropText: 'text-slate-500 dark:text-slate-500', header: 'bg-white/50 dark:bg-slate-900/50' },
        amber: { bg: 'bg-amber-50/50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-900/30', text: 'text-amber-800 dark:text-amber-400', grad: 'from-amber-400 to-amber-500', over: 'border-amber-400 dark:border-amber-500 shadow-amber-200 dark:shadow-amber-900 backdrop-blur-sm bg-amber-50 dark:bg-amber-900/20 shadow-inner', dropBorder: 'border-amber-300 dark:border-amber-700', dropText: 'text-amber-500 dark:text-amber-500', header: 'bg-amber-100/30 dark:bg-amber-900/20' },
        blue: { bg: 'bg-blue-50/50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-900/30', text: 'text-blue-800 dark:text-blue-400', grad: 'from-blue-400 to-blue-500', over: 'border-blue-400 dark:border-blue-500 shadow-blue-200 dark:shadow-blue-900 backdrop-blur-sm bg-blue-50 dark:bg-blue-900/20 shadow-inner', dropBorder: 'border-blue-300 dark:border-blue-700', dropText: 'text-blue-500 dark:text-blue-500', header: 'bg-blue-100/30 dark:bg-blue-900/20' },
        emerald: { bg: 'bg-emerald-50/50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-900/30', text: 'text-emerald-800 dark:text-emerald-400', grad: 'from-emerald-400 to-emerald-500', over: 'border-emerald-400 dark:border-emerald-500 shadow-emerald-200 dark:shadow-emerald-900 backdrop-blur-sm bg-emerald-50 dark:bg-emerald-900/20 shadow-inner', dropBorder: 'border-emerald-300 dark:border-emerald-700', dropText: 'text-emerald-500 dark:text-emerald-500', header: 'bg-emerald-100/30 dark:bg-emerald-900/20' },
        rose: { bg: 'bg-rose-50/50 dark:bg-rose-900/10', border: 'border-rose-200 dark:border-rose-900/30', text: 'text-rose-800 dark:text-rose-400', grad: 'from-rose-400 to-rose-500', over: 'border-rose-400 dark:border-rose-500 shadow-rose-200 dark:shadow-rose-900 backdrop-blur-sm bg-rose-50 dark:bg-rose-900/20 shadow-inner', dropBorder: 'border-rose-300 dark:border-rose-700', dropText: 'text-rose-500 dark:text-rose-500', header: 'bg-rose-100/30 dark:bg-rose-900/20' }
    };

    const c = colorMap[color] || colorMap.slate;

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col rounded-3xl w-[320px] min-w-[320px] flex-shrink-0 transition-all duration-300 border-2 ${isOver ? c.over + ' scale-[1.02]' : `${c.bg} ${c.border}`}`}
        >
            <div className={`p-4 border-b rounded-t-3xl flex items-center justify-between sticky top-0 z-10 ${c.border} ${c.header ?? 'bg-white/50 dark:bg-slate-900/50'} backdrop-blur-md`}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${c.grad} shadow-sm ring-2 ring-white dark:ring-slate-900`}></div>
                    <h2 className={`font-bold text-sm ${c.text}`}>{title}</h2>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 shadow-sm border ${c.border} ${c.text}`}>{applications.length}</span>
            </div>

            <div className={`p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] rounded-b-3xl ${isOver ? 'bg-transparent' : 'bg-transparent'}`}>
                <SortableContext items={applications.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {applications.map(app => (
                        <SortableCard key={app.id} app={app} onDelete={onDelete} />
                    ))}
                </SortableContext>
                {applications.length === 0 && (
                    <div className={`h-full flex items-center justify-center p-8 border-2 border-dashed rounded-xl text-sm font-medium text-center transition-colors ${isOver ? `${c.dropBorder} ${c.dropText} bg-white/50 dark:bg-white/5` : 'border-slate-200/50 dark:border-slate-800/50 text-slate-400 dark:text-slate-600'}`}>
                        Drop jobs here
                    </div>
                )}
            </div>
        </div>
    );
}


// --- MAIN PAGE ---
export default function TrackerPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeId, setActiveId] = useState<number | null>(null);

    const [showAddModal, setShowAddModal] = useState(false);
    const [availableJobs, setAvailableJobs] = useState<any[]>([]);
    const [jobSearch, setJobSearch] = useState('');
    const [isAddingJob, setIsAddingJob] = useState(false);

    // Modal state
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

    useEffect(() => {
        if (!showAddModal) return;
        const fetchPendingJobs = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch(`${API}/jobs?limit=250`, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    const existingJobIds = new Set(applications.map(a => a.job_id));
                    setAvailableJobs(data.filter((j: any) => !existingJobIds.has(j.id)));
                }
            } catch (e) { console.error(e); }
        };
        fetchPendingJobs();
    }, [showAddModal, applications]);

    const handleDeleteApplication = async (appId: number) => {
        setConfirmModal({
            isOpen: true,
            title: 'Remove Job',
            message: 'Are you sure you want to remove this job from your tracker? This will move it back to the unsorted list.',
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
                        setApplications(prev => prev.filter(a => a.id !== appId));
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
                body: JSON.stringify({ job_id: jobId })
            });
            if (res.ok) {
                toast.success('Job added to tracker!');
                fetchApps();
                setShowAddModal(false);
            } else {
                const data = await res.json();
                toast.error(data.detail || 'Failed to add job to tracker.');
            }
        } catch { toast.error('Network error.'); }
        setIsAddingJob(false);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        fetchApps();
    }, []);

    const fetchApps = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                console.log(`[Tracker] Fetched ${data.length} applications:`, data);
                setApplications(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as number);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // If active is dragging over another item
        const activeItem = applications.find(a => a.id === activeId);
        const overItem = applications.find(a => a.id === overId);

        if (!activeItem) return;

        // Find the column the over item belongs to, or if hovering over empty column string id
        const overColId = overItem ? overItem.status : (COLUMNS.find(c => c.id === overId) ? overId : null);

        if (overColId && activeItem.status !== overColId) {
            setApplications(prev => {
                const newApps = [...prev];
                const activeIndex = newApps.findIndex(a => a.id === activeId);
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
        const activeItem = applications.find(a => a.id === activeId);

        if (!activeItem) return;

        // Persist the status to backend
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/applications/${activeId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: activeItem.status })
            });

            if (res.ok) {
                const colTitle = COLUMNS.find(c => c.id === activeItem.status)?.title;
                toast.success(`Moved to ${colTitle}`);
            } else {
                toast.error('Failed to update status.');
            }
        } catch (e) {
            console.error('Failed to update status', e);
            toast.error('Network error moving application.');
        }
    };

    const activeApp = applications.find(a => a.id === activeId);

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
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
            />
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                            <Briefcase className="w-6 h-6 text-primary-500" />
                            Application Tracker
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your job search pipeline via drag-and-drop.</p>
                    </div>
                </div>

                <div className="flex items-center justify-end">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn-primary px-8 py-3 text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all rounded-full"
                    >
                        <Plus className="w-5 h-5" /> Add Application to Tracker
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto pb-6">
                <div className="flex gap-4 h-full items-start">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        {COLUMNS.map(col => (
                            <div key={col.id} className="h-full">
                                {/* Invisible droppable overlay specifically for the empty column case */}
                                <KanbanColumn
                                    id={col.id}
                                    title={col.title}
                                    color={col.color}
                                    applications={applications.filter(a => a.status === col.id)}
                                    onDelete={handleDeleteApplication}
                                />
                            </div>
                        ))}

                        <DragOverlay>
                            {activeApp ? (
                                <div className="opacity-80 rotate-3 scale-105 shadow-xl transition-transform">
                                    <SortableCard app={activeApp} onDelete={() => { }} />
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
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />

                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                            <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add to Tracker</h2>
                                <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-5 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-white/5">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-600" />
                                    <input type="text" value={jobSearch} onChange={e => setJobSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        placeholder="Search fetched jobs by role or company..." />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {availableJobs
                                    .filter(j => j.role.toLowerCase().includes(jobSearch.toLowerCase()) || j.company.toLowerCase().includes(jobSearch.toLowerCase()))
                                    .slice(0, 50).map(job => (
                                        <div key={job.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-center justify-between group">
                                            <div className="min-w-0 pr-4">
                                                <h3 className="font-semibold text-slate-900 dark:text-white truncate">{job.role}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{job.company}</span>
                                                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location || 'Remote'}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => handleAddJobToTracker(job.id)} disabled={isAddingJob}
                                                className="opacity-0 group-hover:opacity-100 btn-secondary px-3 py-1.5 text-xs flex-shrink-0 transition-opacity disabled:opacity-50">
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

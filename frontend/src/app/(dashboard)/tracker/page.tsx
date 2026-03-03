'use client';

import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverEvent, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Briefcase, Building2, MapPin, Loader2, GripVertical, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import LLMProgressBar from '@/components/LLMProgressBar';

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
function SortableCard({ app }: { app: Application }) {
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
            className={`bg-white border p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative ${isDragging ? 'ring-2 ring-primary-500 border-primary-500 z-50 scale-105 shadow-xl rotate-2' : 'border-slate-200 hover:border-slate-300'}`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <span className="font-bold text-slate-500 text-lg uppercase">{app.job.company.charAt(0)}</span>
                </div>
                <div
                    {...attributes}
                    {...listeners}
                    className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
                >
                    <GripVertical className="w-4 h-4" />
                </div>
            </div>

            <h3 className="font-bold text-slate-800 text-sm leading-tight mb-2 line-clamp-2">{app.job.role}</h3>

            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{app.job.company}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{app.job.location || 'Remote'}</span>
                </div>

                {app.job.salary && (
                    <div className="mt-3 inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-green-50 text-green-700 border border-green-200">
                        {app.job.salary}
                    </div>
                )}
            </div>
        </div>
    );
}


// --- KANBAN COLUMN COMPONENT ---
function KanbanColumn({ id, title, color, applications }: { id: string, title: string, color: string, applications: Application[] }) {
    const { setNodeRef, isOver } = useDroppable({ id });

    const colorMap: Record<string, { bg: string, border: string, text: string, grad: string, over: string, dropBorder: string, dropText: string }> = {
        slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', grad: 'from-slate-400 to-slate-500', over: 'border-slate-400 shadow-slate-200 backdrop-blur-sm bg-slate-100/80 shadow-inner', dropBorder: 'border-slate-300', dropText: 'text-slate-500' },
        amber: { bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-800', grad: 'from-amber-400 to-amber-500', over: 'border-amber-400 shadow-amber-200 backdrop-blur-sm bg-amber-50 shadow-inner', dropBorder: 'border-amber-300', dropText: 'text-amber-500' },
        blue: { bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-800', grad: 'from-blue-400 to-blue-500', over: 'border-blue-400 shadow-blue-200 backdrop-blur-sm bg-blue-50 shadow-inner', dropBorder: 'border-blue-300', dropText: 'text-blue-500' },
        emerald: { bg: 'bg-emerald-50/50', border: 'border-emerald-200', text: 'text-emerald-800', grad: 'from-emerald-400 to-emerald-500', over: 'border-emerald-400 shadow-emerald-200 backdrop-blur-sm bg-emerald-50 shadow-inner', dropBorder: 'border-emerald-300', dropText: 'text-emerald-500' },
        rose: { bg: 'bg-rose-50/50', border: 'border-rose-200', text: 'text-rose-800', grad: 'from-rose-400 to-rose-500', over: 'border-rose-400 shadow-rose-200 backdrop-blur-sm bg-rose-50 shadow-inner', dropBorder: 'border-rose-300', dropText: 'text-rose-500' }
    };

    const c = colorMap[color] || colorMap.slate;

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col rounded-3xl w-[320px] min-w-[320px] flex-shrink-0 transition-all duration-300 border-2 ${isOver ? c.over + ' scale-[1.02]' : `${c.bg} ${c.border}`}`}
        >
            <div className={`p-4 border-b rounded-t-3xl flex items-center justify-between sticky top-0 z-10 ${c.border} bg-white/50 backdrop-blur-md`}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${c.grad} shadow-sm ring-2 ring-white`}></div>
                    <h2 className={`font-bold text-sm ${c.text}`}>{title}</h2>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg bg-white shadow-sm border ${c.border} ${c.text}`}>{applications.length}</span>
            </div>

            <div className={`p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px] rounded-b-3xl ${isOver ? 'bg-transparent' : 'bg-transparent'}`}>
                <SortableContext items={applications.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {applications.map(app => (
                        <SortableCard key={app.id} app={app} />
                    ))}
                </SortableContext>
                {applications.length === 0 && (
                    <div className={`h-full flex items-center justify-center p-8 border-2 border-dashed rounded-xl text-sm font-medium text-center transition-colors ${isOver ? `${c.dropBorder} ${c.dropText} bg-white/50` : 'border-slate-200/50 text-slate-400'}`}>
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
        <div className="h-full flex flex-col space-y-6 max-h-screen">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <Briefcase className="w-6 h-6 text-primary-500" />
                        Application Tracker
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Manage your job search pipeline via drag-and-drop.</p>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto pb-6">
                <div className="flex gap-6 h-full items-start">
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
                                />
                            </div>
                        ))}

                        <DragOverlay>
                            {activeApp ? (
                                <div className="opacity-80 rotate-3 scale-105 shadow-xl transition-transform">
                                    <SortableCard app={activeApp} />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}

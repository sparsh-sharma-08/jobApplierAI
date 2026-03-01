'use client';

import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverEvent, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Briefcase, Building2, MapPin, Loader2, GripVertical, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    { id: 'pending', title: 'Saved' },
    { id: 'applied', title: 'Applied' },
    { id: 'interview', title: 'Interviewing' },
    { id: 'offer', title: 'Offered' },
    { id: 'rejected', title: 'Rejected' }
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
            className={`bg-white border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group relative ${isDragging ? 'ring-2 ring-primary-500 border-primary-500 z-50' : 'border-slate-200'}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="absolute top-4 right-3 text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <GripVertical className="w-5 h-5" />
            </div>

            <h3 className="font-bold text-slate-800 text-sm leading-tight pr-6">{app.job.role}</h3>

            <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{app.job.company}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{app.job.location || 'Remote'}</span>
                </div>

                {app.job.salary && (
                    <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                        {app.job.salary}
                    </div>
                )}
            </div>
        </div>
    );
}


// --- KANBAN COLUMN COMPONENT ---
function KanbanColumn({ id, title, applications }: { id: string, title: string, applications: Application[] }) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col bg-slate-100/50 border rounded-2xl w-[320px] min-w-[320px] flex-shrink-0 transition-colors ${isOver ? 'bg-slate-200 border-primary-300' : 'border-slate-200'}`}
        >
            <div className="p-4 border-b border-slate-200/60 bg-white/50 rounded-t-2xl flex items-center justify-between sticky top-0 backdrop-blur-sm z-10">
                <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
                <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">{applications.length}</span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px]">
                <SortableContext items={applications.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {applications.map(app => (
                        <SortableCard key={app.id} app={app} />
                    ))}
                </SortableContext>
                {applications.length === 0 && (
                    <div className="h-full flex items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm font-medium text-center">
                        Drop items here
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
    const [statusMessage, setStatusMessage] = useState('');

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
                setStatusMessage(`Moved to ${colTitle}`);
                setTimeout(() => setStatusMessage(''), 3000);
            }
        } catch (e) {
            console.error('Failed to update status', e);
        }
    };

    const activeApp = applications.find(a => a.id === activeId);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
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

                <AnimatePresence>
                    {statusMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {statusMessage}
                        </motion.div>
                    )}
                </AnimatePresence>
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

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    iconColor?: string;
    iconBgColor?: string;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    iconColor = "text-indigo-500",
    iconBgColor = "bg-indigo-50"
}: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-center h-full min-h-[400px]"
        >
            <div className={`w-16 h-16 rounded-2xl ${iconBgColor} flex items-center justify-center mb-6`}>
                <Icon className={`w-8 h-8 ${iconColor}`} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
            <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
                {description}
            </p>
            {actionLabel && onAction && (
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onAction}
                    className="btn-primary px-6 py-2.5 shadow-sm"
                >
                    {actionLabel}
                </motion.button>
            )}
        </motion.div>
    );
}

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
            className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed text-center h-full min-h-[400px]"
        >
            <div className={`w-16 h-16 rounded-2xl ${iconBgColor} dark:bg-indigo-900/20 flex items-center justify-center mb-6`}>
                <Icon className={`w-8 h-8 ${iconColor} dark:text-indigo-400`} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
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

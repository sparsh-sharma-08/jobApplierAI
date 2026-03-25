import React from 'react';
import { motion } from 'framer-motion';

export default function SkeletonCard() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm"
        >
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                        <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-2 animate-pulse"></div>
                        <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded w-1/2 animate-pulse"></div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    <div className="h-6 w-20 bg-slate-100 dark:bg-slate-800/50 rounded-full animate-pulse"></div>
                    <div className="h-6 w-24 bg-slate-100 dark:bg-slate-800/50 rounded-full animate-pulse"></div>
                    <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800/50 rounded-full animate-pulse"></div>
                </div>

                <div className="space-y-2 mt-4">
                    <div className="h-3 bg-slate-50 dark:bg-slate-900/50 rounded w-full animate-pulse"></div>
                    <div className="h-3 bg-slate-50 dark:bg-slate-900/50 rounded w-11/12 animate-pulse"></div>
                    <div className="h-3 bg-slate-50 dark:bg-slate-900/50 rounded w-4/5 animate-pulse"></div>
                </div>
            </div>

            <div className="bg-slate-50 dark:bg-white/5 px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="h-8 w-1/3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                <div className="h-8 w-1/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
            </div>
        </motion.div>
    );
}

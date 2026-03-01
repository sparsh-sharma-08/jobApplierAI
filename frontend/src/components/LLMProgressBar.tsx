import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function LLMProgressBar({ text = "AI is thinking..." }: { text?: string }) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 95) return prev;
                return prev + (95 - prev) * 0.05;
            });
        }, 800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full space-y-2 py-2 animate-in fade-in duration-300">
            <div className="flex items-center justify-between text-xs font-bold text-primary-700 tracking-wide uppercase">
                <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    {text}
                </span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full bg-primary-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary-500 transition-all duration-75 ease-linear rounded-full animate-pulse"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

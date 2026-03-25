'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings, loaded } = useSettings();

    useEffect(() => {
        if (!loaded) return;

        const applyTheme = (theme: 'light' | 'dark' | 'system') => {
            const root = window.document.documentElement;
            const isDark = 
                theme === 'dark' || 
                (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        };

        applyTheme(settings.theme);

        // Listen for system theme changes if set to 'system'
        if (settings.theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [settings.theme, loaded]);

    return <>{children}</>;
}

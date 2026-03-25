'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS, STORAGE_KEY, SettingsContext } from '@/hooks/useSettings';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setSettingsState({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch { }
        setLoaded(true);
    }, []);

    const setSettings = useCallback((updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
        setSettingsState(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { }
            return next;
        });
    }, []);

    const resetSettings = useCallback(() => {
        setSettingsState(DEFAULT_SETTINGS);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS)); } catch { }
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, setSettings, resetSettings, loaded }}>
            {children}
        </SettingsContext.Provider>
    );
}

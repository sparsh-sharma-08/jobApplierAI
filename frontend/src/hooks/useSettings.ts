'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AppSettings {
    // Display
    currency: 'INR' | 'USD' | 'EUR' | 'GBP';
    defaultSort: 'score' | 'date';
    jobsPerPage: number;
    compactView: boolean;

    // Job Sources
    enabledSources: string[];

    // Resume
    autoDownloadResume: boolean;

    // Notifications
    showScoreBadges: boolean;
    highlightNewJobs: boolean;
}

const ALL_SOURCES = ['remotive', 'arbeitnow', 'jobicy', 'himalayas', 'adzuna', 'linkedin'];

const DEFAULT_SETTINGS: AppSettings = {
    currency: 'INR',
    defaultSort: 'score',
    jobsPerPage: 50,
    compactView: false,
    enabledSources: [...ALL_SOURCES],
    autoDownloadResume: false,
    showScoreBadges: true,
    highlightNewJobs: true,
};

const STORAGE_KEY = 'careercopilot_settings';

export const CURRENCY_SYMBOLS: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
};

export const SOURCE_LABELS: Record<string, string> = {
    remotive: 'Remotive',
    arbeitnow: 'Arbeitnow',
    jobicy: 'Jobicy',
    himalayas: 'Himalayas',
    adzuna: 'Adzuna',
    linkedin: 'LinkedIn',
};

export function useSettings() {
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

    return { settings, setSettings, resetSettings, loaded };
}

export { ALL_SOURCES };

'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

export interface AppSettings {
    // Display
    currency: 'INR' | 'USD' | 'EUR' | 'GBP';
    defaultSort: 'score' | 'date';
    jobsPerPage: number;

    // Job Sources
    enabledSources: string[];

    // Resume
    autoDownloadResume: boolean;

    // Notifications
    showScoreBadges: boolean;
    highlightNewJobs: boolean;

    // Theme
    theme: 'light' | 'dark' | 'system';
}

export const ALL_SOURCES = ['remotive', 'arbeitnow', 'jobicy', 'himalayas', 'adzuna', 'linkedin', 'instahyre'];

export const DEFAULT_SETTINGS: AppSettings = {
    currency: 'INR',
    defaultSort: 'score',
    jobsPerPage: 50,
    enabledSources: [...ALL_SOURCES],
    autoDownloadResume: false,
    showScoreBadges: true,
    highlightNewJobs: true,
    theme: 'system',
};

export const STORAGE_KEY = 'careercopilot_settings';

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
    instahyre: 'Instahyre',
};

export interface SettingsContextType {
    settings: AppSettings;
    setSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
    resetSettings: () => void;
    loaded: boolean;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        // Fallback for when context is not available (e.g. during initial SSR)
        return {
            settings: DEFAULT_SETTINGS,
            setSettings: () => {},
            resetSettings: () => {},
            loaded: false
        };
    }
    return context;
}

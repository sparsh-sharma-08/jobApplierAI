import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface ResumeProfile {
    id: number;
    user_id: number;
    name: string;
    role_title?: string;
    summary?: string;
    skills: string[];
    experience_level: string;
    preferred_roles: string[];
    master_resume?: any;
    is_default: boolean;
    created_at?: string;
    updated_at?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export function useResumeProfiles() {
    const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeProfileId, setActiveProfileId] = useState<number | null>(null);

    const getToken = () => localStorage.getItem('token');

    const fetchProfiles = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            setLoading(true);
            const res = await fetch(`${API}/resume-profiles`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProfiles(data);
                // Set active to default or first
                if (data.length > 0) {
                    const def = data.find((p: any) => p.is_default);
                    if (def) setActiveProfileId(def.id);
                    else setActiveProfileId(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch profiles', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const activeProfile = profiles.find(p => p.id === activeProfileId) || null;

    const createProfile = async (name: string) => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API}/resume-profiles`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const newProf = await res.json();
                setProfiles(prev => [...prev, newProf]);
                setActiveProfileId(newProf.id);
                toast.success('New profile created!');
                return newProf;
            }
        } catch (err) {
            toast.error('Failed to create profile');
        }
    };

    const updateProfile = async (id: number, data: Partial<ResumeProfile>) => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API}/resume-profiles/${id}`, {
                method: 'PATCH',
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const updated = await res.json();
                setProfiles(prev => prev.map(p => p.id === id ? updated : (data.is_default && p.id !== id ? { ...p, is_default: false } : p)));
                toast.success('Profile updated');
                return updated;
            }
        } catch (err) {
            toast.error('Failed to update profile');
        }
    };

    const deleteProfile = async (id: number) => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API}/resume-profiles/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProfiles(prev => prev.filter(p => p.id !== id));
                if (activeProfileId === id) {
                    const remaining = profiles.filter(p => p.id !== id);
                    if (remaining.length > 0) setActiveProfileId(remaining[0].id);
                    else setActiveProfileId(null);
                }
                toast.success('Profile deleted');
            } else {
                const err = await res.json();
                toast.error(err.detail || 'Delete failed');
            }
        } catch (err) {
            toast.error('Failed to delete profile');
        }
    };

    return {
        profiles,
        loading,
        activeProfileId,
        setActiveProfileId,
        activeProfile,
        fetchProfiles,
        createProfile,
        updateProfile,
        deleteProfile
    };
}

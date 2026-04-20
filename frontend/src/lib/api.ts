"use client";

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('token');

    // Set up headers
    const headers = new Headers(options.headers || {});

    // Only inject token if not navigating to auth routes
    if (token && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/refresh')) {
        if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }
    }

    let response = await fetch(url, { ...options, headers });

    // Handle 401 Unauthorized by trying to refresh the token
    if (response.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
            try {
                const refreshRes = await fetch(`${API}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken })
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    localStorage.setItem('token', data.access_token);
                    localStorage.setItem('refresh_token', data.refresh_token);

                    // Replay the original request with new token
                    headers.set('Authorization', `Bearer ${data.access_token}`);
                    response = await fetch(url, { ...options, headers });
                } else {
                    // Refresh failed, clear tokens and redirect to login
                    localStorage.removeItem('token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = '/';
                }
            } catch (err) {
                console.error("Token refresh error", err);
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/';
            }
        } else {
            // No refresh token, clear out and go to login
            localStorage.removeItem('token');
            window.location.href = '/';
        }
    }

    return response;
}

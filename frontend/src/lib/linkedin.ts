/**
 * LinkedIn People Search URL Builder
 * Builds URL encoded queries for outreach to Engineering Managers and Technical Recruiters.
 */

export function buildLinkedInSearchUrl(prefix: string, company?: string | null): string {
    const trimmed = (company || '').trim();
    if (!trimmed) {
        return '';
    }
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(prefix + trimmed)}`;
}

export function getLinkedInSearchLinks(company?: string | null) {
    const trimmed = (company || '').trim();
    const disabled = !trimmed;
    return {
        disabled,
        engineeringManagerUrl: disabled ? '' : buildLinkedInSearchUrl('Engineering Manager ', trimmed),
        technicalRecruiterUrl: disabled ? '' : buildLinkedInSearchUrl('Technical Recruiter ', trimmed),
    };
}

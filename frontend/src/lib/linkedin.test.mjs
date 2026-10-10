import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkedInSearchUrl, getLinkedInSearchLinks } from './linkedin.ts';

test('buildLinkedInSearchUrl handles empty or missing company', () => {
    assert.equal(buildLinkedInSearchUrl('Engineering Manager ', ''), '');
    assert.equal(buildLinkedInSearchUrl('Engineering Manager ', '   '), '');
    assert.equal(buildLinkedInSearchUrl('Engineering Manager ', null), '');
    assert.equal(buildLinkedInSearchUrl('Engineering Manager ', undefined), '');

    const links = getLinkedInSearchLinks('');
    assert.equal(links.disabled, true);
    assert.equal(links.engineeringManagerUrl, '');
    assert.equal(links.technicalRecruiterUrl, '');
});

test('buildLinkedInSearchUrl handles company names with spaces and ampersands (&)', () => {
    // AT&T
    const attEm = buildLinkedInSearchUrl('Engineering Manager ', 'AT&T');
    assert.equal(attEm, 'https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20AT%26T');

    const attRecruiter = buildLinkedInSearchUrl('Technical Recruiter ', 'AT&T');
    assert.equal(attRecruiter, 'https://www.linkedin.com/search/results/people/?keywords=Technical%20Recruiter%20AT%26T');

    // B&H
    const bhEm = buildLinkedInSearchUrl('Engineering Manager ', 'B&H Photo Video');
    assert.equal(bhEm, 'https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20B%26H%20Photo%20Video');
});

test('buildLinkedInSearchUrl handles company names with non-ASCII characters', () => {
    // Accented European characters: Société Générale
    const sgEm = buildLinkedInSearchUrl('Engineering Manager ', 'Société Générale');
    assert.equal(sgEm, 'https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20Soci%C3%A9t%C3%A9%20G%C3%A9n%C3%A9rale');

    // CJK characters: Rakuten 楽天
    const rakutenRecruiter = buildLinkedInSearchUrl('Technical Recruiter ', 'Rakuten 楽天');
    assert.equal(rakutenRecruiter, 'https://www.linkedin.com/search/results/people/?keywords=Technical%20Recruiter%20Rakuten%20%E6%A5%BD%E5%A4%A9');
});

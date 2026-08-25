import { describe, it, expect } from 'vitest';
import { makeSubjectNameResolver, subjectNamesLabel, shortSubjectLabel } from './subjectNames';
import { normalizeAuthoritySubjects } from './normalize';
import { subjectsResponse, MEMBERS_ID, EXECS_ID, EVERYONE_GROUP_ID } from './fixtures';

const { subjects } = normalizeAuthoritySubjects(subjectsResponse().membershipAuthorityContract.subjects);

// The legacy Hats list, as POContext supplies it: adopted role ids only. A v2-native role id and
// EVERY group id are absent by construction — that is the bug.
const legacyNames = { [MEMBERS_ID]: 'Members', [EXECS_ID]: 'Executives' };

describe('makeSubjectNameResolver', () => {
  it('prefers the legacy name (what the org itself named the role)', () => {
    const resolve = makeSubjectNameResolver({ legacyNames, subjects });
    expect(resolve(MEMBERS_ID)).toBe('Members');
  });

  it('resolves a GROUP id, which the legacy list cannot know', () => {
    const resolve = makeSubjectNameResolver({ legacyNames, subjects });
    expect(resolve(EVERYONE_GROUP_ID)).toBe('Everyone');
  });

  it('resolves a v2-native ROLE id absent from the legacy list', () => {
    const nativeId = ((BigInt('0x1111111111111111111111111111111111111111') << 64n) | 7n).toString();
    const resolve = makeSubjectNameResolver({
      legacyNames,
      subjects: [...subjects, { subjectId: nativeId, name: 'Stewards' }],
    });
    expect(resolve(nativeId)).toBe('Stewards');
  });

  it('falls back to a short id label — never to "Unknown Role", never to a name it does not have', () => {
    const resolve = makeSubjectNameResolver({ legacyNames, subjects });
    const unknown = '123456789012345678901234567890';
    expect(resolve(unknown)).toBe(shortSubjectLabel(unknown));
    expect(resolve(unknown)).toContain('…');
  });

  it('works with no sources at all', () => {
    const resolve = makeSubjectNameResolver();
    expect(resolve('42')).toBe('Role 42');
    expect(resolve('')).toBe('Unknown role');
    expect(resolve(null)).toBe('Unknown role');
  });

  it('ignores a subject with an empty name rather than rendering blank', () => {
    const resolve = makeSubjectNameResolver({ subjects: [{ subjectId: '42', name: '' }] });
    expect(resolve('42')).toBe('Role 42');
  });
});

describe('subjectNamesLabel', () => {
  const resolve = makeSubjectNameResolver({ legacyNames, subjects });

  it('joins a mixed role + group restriction', () => {
    expect(subjectNamesLabel([EXECS_ID, EVERYONE_GROUP_ID], resolve)).toBe('Executives, Everyone');
  });

  it('names a GROUP-ONLY restriction — the case that used to render "All members"', () => {
    // The exact inversion the review step showed: a poll restricted to one group, described to its
    // creator as open to everyone.
    expect(subjectNamesLabel([EVERYONE_GROUP_ID], resolve)).toBe('Everyone');
  });

  it('returns null (not "All members") for an empty or all-blank list', () => {
    expect(subjectNamesLabel([], resolve)).toBeNull();
    expect(subjectNamesLabel(null, resolve)).toBeNull();
    expect(subjectNamesLabel([null, undefined, ''], resolve)).toBeNull();
  });

  it('still labels unresolvable ids instead of silently dropping them', () => {
    const label = subjectNamesLabel([EXECS_ID, '999999999999999999'], resolve);
    expect(label.startsWith('Executives, ')).toBe(true);
    expect(label).not.toBe('Executives');
  });
});

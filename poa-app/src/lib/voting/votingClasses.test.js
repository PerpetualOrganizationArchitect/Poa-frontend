import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import {
  isDirectClass,
  directClassIndex,
  classLabel,
  classHolds,
  classesHolding,
  buildClassVoterCall,
  classVoterSummary,
  hybridVotingClassInterface,
} from './votingClasses';

const HV = '0xf642dde77848dc195c8089f4042a311ed650d7a6';
const MEMBER = '29035862971903655586674243772344327311664727652070589302159213246545920';
const TREASURER = '29035862971903655682455215076462380959061416848964913278330408383021056';

// Test6's live classes (getClasses() on 2026-09-03): DIRECT 80% and PARTICIPATION 20%, both
// counting Member + Executive.
const TEST6_CLASSES = [
  { strategy: 'DIRECT', slicePct: 80, hatIds: [MEMBER, '29035862971903655490893272468226273664268038455176265325988018110070784'] },
  { strategy: 'PARTICIPATION', slicePct: 20, hatIds: [MEMBER, '29035862971903655490893272468226273664268038455176265325988018110070784'] },
];

describe('class shape helpers', () => {
  it('recognises DIRECT as the subgraph string or the contract enum', () => {
    expect(isDirectClass({ strategy: 'DIRECT' })).toBe(true);
    expect(isDirectClass({ strategy: 0 })).toBe(true);
    expect(isDirectClass({ strategy: 'PARTICIPATION' })).toBe(false);
    expect(isDirectClass(null)).toBe(false);
  });

  it('finds the first one-member-one-vote class', () => {
    expect(directClassIndex(TEST6_CLASSES)).toBe(0);
    expect(directClassIndex([{ strategy: 'PARTICIPATION' }])).toBe(-1);
    expect(directClassIndex([])).toBe(-1);
  });

  it('labels classes in the vocabulary the rule diff already uses', () => {
    expect(classLabel(TEST6_CLASSES[0], 0)).toBe('Members (one vote each) · 80%');
    expect(classLabel(TEST6_CLASSES[1], 1)).toBe('Contributors (weighted by shares) · 20%');
    expect(classLabel(undefined, 2)).toBe('Class 3');
  });

  it('knows which classes count a role', () => {
    expect(classHolds(TEST6_CLASSES[0], MEMBER)).toBe(true);
    expect(classHolds(TEST6_CLASSES[0], TREASURER)).toBe(false);
    expect(classesHolding(TEST6_CLASSES, MEMBER)).toEqual([0, 1]);
    expect(classesHolding(TEST6_CLASSES, TREASURER)).toEqual([]);
  });
});

describe('buildClassVoterCall', () => {
  it('encodes addHatToClass with the contract selector', () => {
    const call = buildClassVoterCall({ hybridVoting: HV, classIdx: 0, subjectId: TREASURER, add: true });
    expect(call.target).toBe(utils.getAddress(HV));
    expect(call.value).toBe('0');
    expect(call.data.slice(0, 10)).toBe(utils.id('addHatToClass(uint8,uint256)').slice(0, 10));
    const decoded = hybridVotingClassInterface.decodeFunctionData('addHatToClass', call.data);
    expect(decoded.classIdx).toBe(0);
    expect(decoded.hatId.toString()).toBe(TREASURER);
  });

  it('encodes removeHatFromClass for a removal', () => {
    const call = buildClassVoterCall({ hybridVoting: HV, classIdx: 1, subjectId: MEMBER, add: false });
    expect(call.data.slice(0, 10)).toBe(utils.id('removeHatFromClass(uint8,uint256)').slice(0, 10));
    expect(hybridVotingClassInterface.decodeFunctionData('removeHatFromClass', call.data).classIdx).toBe(1);
  });

  it('refuses a missing contract, class or role with a member-facing reason', () => {
    expect(() => buildClassVoterCall({ hybridVoting: '', classIdx: 0, subjectId: MEMBER })).toThrow(/Blended voting contract/);
    expect(() => buildClassVoterCall({ hybridVoting: HV, classIdx: -1, subjectId: MEMBER })).toThrow(/which voting class/);
    expect(() => buildClassVoterCall({ hybridVoting: HV, classIdx: 0, subjectId: '0' })).toThrow(/whose voters/);
  });
});

describe('classVoterSummary', () => {
  it('names the role and the class', () => {
    expect(classVoterSummary({ roleName: 'Treasurer', classIdx: 0, votingClasses: TEST6_CLASSES, add: true }))
      .toBe('Let members of “Treasurer” vote in binding votes as Members (one vote each).');
    expect(classVoterSummary({ roleName: 'Treasurer', classIdx: 1, votingClasses: TEST6_CLASSES, add: false }))
      .toBe('Stop members of “Treasurer” voting in binding votes as Contributors (weighted by shares).');
  });
});

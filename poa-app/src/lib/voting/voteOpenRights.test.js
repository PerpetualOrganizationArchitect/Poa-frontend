/**
 * voteOpenRights — branch coverage driven by the REAL creator sets of every org
 * live on Gnosis, read off HybridVoting.creatorHats() / DirectDemocracyVoting
 * .creatorHats() with cast (see LIVE_ORGS below, captured 2026-08-13).
 *
 * The bug this module replaced was a hardcoded claim that "polls are open more
 * widely" than binding votes. That is false in every one of these orgs: in 7 the
 * two sets are identical, and in 2 (Test6, Decentral Park) the BINDING set is a
 * strict superset — the exact opposite. So the headline assertion here is a
 * structural one: no rendered string ever compares the two tracks.
 */

import { describe, it, expect } from 'vitest';
import {
  describeVoteOpenRights,
  roleListPhrase,
  OPEN_RIGHTS_TEMPLATE,
  POLL_CREATOR_PREFILL,
} from './voteOpenRights';

/** Every org on Gnosis, with POContext's user-facing role list (the
 *  eligibility-admin system hat is stripped there, so it is stripped here). */
const LIVE_ORGS = [
  {
    name: "Argus",
    roleHatIds: ['30222100625258283641858621132055137413908072809768050515156576961036288', '30222100625264560743594007812818973203331280476184152870601040995549184'],
    roleNames: {
      '30222100625258283641858621132055137413908072809768050515156576961036288': "Agent",
      '30222100625264560743594007812818973203331280476184152870601040995549184': "Apprentice",
    },
    bindingHatIds: ['30222100625258283641858621132055137413908072809768050515156576961036288'],
    pollHatIds: ['30222100625258283641858621132055137413908072809768050515156576961036288'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Test3",
    roleHatIds: ['28928023185235053027495575711996248788970179074380427012234798805549056', '28928023185235052931714604407878195141573489877486103036063603669073920'],
    roleNames: {
      '28928023185235053027495575711996248788970179074380427012234798805549056': "Member",
      '28928023185235052931714604407878195141573489877486103036063603669073920': "Executive",
    },
    bindingHatIds: ['28928023185235053027495575711996248788970179074380427012234798805549056', '28928023185235052931714604407878195141573489877486103036063603669073920'],
    pollHatIds: ['28928023185235053027495575711996248788970179074380427012234798805549056', '28928023185235052931714604407878195141573489877486103036063603669073920'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Test6",
    roleHatIds: ['29035862971903655586674243772344327311664727652070589302159213246545920', '29035862971903655490893272468226273664268038455176265325988018110070784', '29035862971903655682455215076462380959061416848964913278330408383021056', '29035862971903655586675705273981658214582931336903305585178869179088896', '29035862971903655586677166775618989117501135021736021868198525111631872'],
    roleNames: {
      '29035862971903655586674243772344327311664727652070589302159213246545920': "Member",
      '29035862971903655490893272468226273664268038455176265325988018110070784': "Executive",
      '29035862971903655682455215076462380959061416848964913278330408383021056': "Treasurer",
      '29035862971903655586675705273981658214582931336903305585178869179088896': "Newcomer",
      '29035862971903655586677166775618989117501135021736021868198525111631872': "TaskRunner",
    },
    bindingHatIds: ['29035862971903655586674243772344327311664727652070589302159213246545920', '29035862971903655490893272468226273664268038455176265325988018110070784', '29035862971903655682455215076462380959061416848964913278330408383021056', '29035862971903655586675705273981658214582931336903305585178869179088896'],
    pollHatIds: ['29035862971903655586674243772344327311664727652070589302159213246545920', '29035862971903655490893272468226273664268038455176265325988018110070784'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Decentral Park",
    roleHatIds: ['36180248838698575132261002770404529440178570924043841009651669962588160', '36180248838698575036480031466286475792781881727149517033480474826113024', '36180248838704852138215418147050311582205089393565619388924938860625920'],
    roleNames: {
      '36180248838698575132261002770404529440178570924043841009651669962588160': "Neighbor",
      '36180248838698575036480031466286475792781881727149517033480474826113024': "Delegate",
      '36180248838704852138215418147050311582205089393565619388924938860625920': "Agent",
    },
    bindingHatIds: ['36180248838698575132261002770404529440178570924043841009651669962588160', '36180248838698575036480031466286475792781881727149517033480474826113024', '36180248838704852138215418147050311582205089393565619388924938860625920'],
    pollHatIds: ['36180248838698575132261002770404529440178570924043841009651669962588160', '36180248838698575036480031466286475792781881727149517033480474826113024'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Test2",
    roleHatIds: ['28901063238567902387700908696909229158296541929957886439753695195299840', '28901063238567902291919937392791175510899852733063562463582500058824704'],
    roleNames: {
      '28901063238567902387700908696909229158296541929957886439753695195299840': "Member",
      '28901063238567902291919937392791175510899852733063562463582500058824704': "Executive",
    },
    bindingHatIds: ['28901063238567902387700908696909229158296541929957886439753695195299840', '28901063238567902291919937392791175510899852733063562463582500058824704'],
    pollHatIds: ['28901063238567902387700908696909229158296541929957886439753695195299840', '28901063238567902291919937392791175510899852733063562463582500058824704'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Test",
    roleHatIds: ['28874103291900751747906241681822209527622904785535345867272591585050624', '28874103291900751652125270377704155880226215588641021891101396448575488'],
    roleNames: {
      '28874103291900751747906241681822209527622904785535345867272591585050624': "Member",
      '28874103291900751652125270377704155880226215588641021891101396448575488': "Executive",
    },
    bindingHatIds: ['28874103291900751747906241681822209527622904785535345867272591585050624', '28874103291900751652125270377704155880226215588641021891101396448575488'],
    pollHatIds: ['28874103291900751747906241681822209527622904785535345867272591585050624', '28874103291900751652125270377704155880226215588641021891101396448575488'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "Test5",
    roleHatIds: ['28981943078569354307084909742170288050317453363225508157197006026047488', '28981943078569354211303938438052234402920764166331184181025810889572352'],
    roleNames: {
      '28981943078569354307084909742170288050317453363225508157197006026047488': "Member",
      '28981943078569354211303938438052234402920764166331184181025810889572352': "Executive",
    },
    bindingHatIds: ['28981943078569354307084909742170288050317453363225508157197006026047488', '28981943078569354211303938438052234402920764166331184181025810889572352'],
    pollHatIds: ['28981943078569354307084909742170288050317453363225508157197006026047488', '28981943078569354211303938438052234402920764166331184181025810889572352'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "KUBI",
    roleHatIds: ['29089782865237956866263577802518366573012001940915670447121420467044352', '29089782865237956770482606498400312925615312744021346470950225330569216'],
    roleNames: {
      '29089782865237956866263577802518366573012001940915670447121420467044352': "Member",
      '29089782865237956770482606498400312925615312744021346470950225330569216': "Executive",
    },
    bindingHatIds: ['29089782865237956866263577802518366573012001940915670447121420467044352', '29089782865237956770482606498400312925615312744021346470950225330569216'],
    pollHatIds: ['29089782865237956866263577802518366573012001940915670447121420467044352', '29089782865237956770482606498400312925615312744021346470950225330569216'],
    hasBinding: true,
    hasPolls: true,
  },
  {
    name: "tkrjehbcuebc",
    roleHatIds: ['28954983131902203667290242727083268419643816218802967584715902415798272', '28954983131902203571509271422965214772247127021908643608544707279323136'],
    roleNames: {
      '28954983131902203667290242727083268419643816218802967584715902415798272': "Member",
      '28954983131902203571509271422965214772247127021908643608544707279323136': "Executive",
    },
    bindingHatIds: ['28954983131902203667290242727083268419643816218802967584715902415798272', '28954983131902203571509271422965214772247127021908643608544707279323136'],
    pollHatIds: ['28954983131902203667290242727083268419643816218802967584715902415798272', '28954983131902203571509271422965214772247127021908643608544707279323136'],
    hasBinding: true,
    hasPolls: true,
  },
];

/** The two states a live org is always in by the time the panel renders. */
const READ = { settled: true, bindingFailed: false, pollFailed: false };

/** Flatten a result to every user-visible string it would render. */
function strings({ rows, note }) {
  const out = [];
  rows.forEach((r) => {
    out.push(r.title);
    if (r.detail) out.push(r.detail);
    if (r.youLine) out.push(r.youLine);
    r.badges.forEach((b) => out.push(b));
  });
  if (note) out.push(note);
  return out;
}

describe('describeVoteOpenRights — live orgs', () => {
  it.each(LIVE_ORGS)('$name never renders a raw hat id, an unnamed role, or "Hybrid"', (org) => {
    const all = strings(describeVoteOpenRights({ ...org, ...READ }));
    expect(all.length).toBeGreaterThan(0);
    all.forEach((s) => {
      expect(s).not.toMatch(/\d{20,}/);
      expect(s).not.toContain('Unknown Role');
      expect(s).toEqual(expect.not.stringContaining('Hybrid'));
      expect(s).toEqual(expect.not.stringContaining('creator hat'));
    });
  });

  it.each(LIVE_ORGS)('$name never claims one track is more open than the other', (org) => {
    const all = strings(describeVoteOpenRights({ ...org, ...READ })).join(' ');
    // The defect verbatim, plus its inverse and the comparatives that would
    // reintroduce it. Both sets are always rendered; neither is ever ranked.
    expect(all).not.toMatch(/more widel|more open|less open|wider|narrower|stricter/i);
  });

  it('KUBI — identical creator sets collapse to one row that says "any member"', () => {
    const kubi = LIVE_ORGS.find((o) => o.name === 'KUBI');
    const { rows } = describeVoteOpenRights({ ...kubi, ...READ });
    expect(rows).toHaveLength(1);
    expect(rows[0].track).toBe('both');
    // Member + Executive together are every role KUBI names.
    expect(rows[0].title).toBe('Any member can open a vote');
    expect(rows[0].badges).toContain('Every role');
    expect(rows[0].detail).toBe('Member and Executive can open a binding vote or start a poll.');
  });

  it('Test6 — diverging sets split into two rows, binding first', () => {
    const test6 = LIVE_ORGS.find((o) => o.name === 'Test6');
    const { rows } = describeVoteOpenRights({ ...test6, ...READ });
    expect(rows.map((r) => r.track)).toEqual(['binding', 'poll']);
    // 4 of the 5 roles Test6 names can open a binding vote; only 2 can poll.
    expect(rows[0].badges).toContain('4 of 5 roles');
    expect(rows[1].badges).toContain('2 of 5 roles');
    expect(rows[0].title).toBe('Only some roles can open a binding vote');
    expect(rows[1].title).toBe('Only some roles can start a poll');
  });

  it('Decentral Park — binding covers every role while polls do not', () => {
    const dp = LIVE_ORGS.find((o) => o.name === 'Decentral Park');
    const { rows } = describeVoteOpenRights({ ...dp, ...READ });
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Any member can open a binding vote');
    expect(rows[0].badges).toContain('Every role');
    expect(rows[1].title).toBe('Only some roles can start a poll');
    expect(rows[1].badges).toContain('2 of 3 roles');
  });

  it('Argus — a single creator role among several is stated by name', () => {
    const argus = LIVE_ORGS.find((o) => o.name === 'Argus');
    const { rows } = describeVoteOpenRights({ ...argus, ...READ });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Only some roles can open a vote');
    expect(rows[0].badges).toContain('1 of 2 roles');
    expect(rows[0].detail).toBe('Agent can open a binding vote or start a poll.');
  });
});

describe('read states', () => {
  const kubi = () => LIVE_ORGS.find((o) => o.name === 'KUBI');

  it('frame 0 (not settled, no ids yet) asserts nothing about permissions', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), bindingHatIds: [], pollHatIds: [], settled: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Checking who can open a vote…');
    expect(rows[0].detail).toBeNull();
    expect(rows[0].actions).toHaveLength(0);
  });

  it('a failed read is never rendered as "nobody can"', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), bindingHatIds: [], pollHatIds: [],
      settled: true, bindingFailed: true, pollFailed: true,
    });
    expect(rows[0].title).toBe('Couldn’t load who can open a vote');
    expect(rows[0].detail).toMatch(/weren’t reachable/);
    expect(rows[0].actions).toHaveLength(0);
  });

  it('one track failing does not merge it with the track that answered', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), pollHatIds: [], settled: true, pollFailed: true,
    });
    expect(rows.map((r) => r.track)).toEqual(['binding', 'poll']);
    expect(rows[0].title).toBe('Any member can open a binding vote');
    expect(rows[1].title).toBe('Couldn’t load who can start a poll');
  });

  it('a genuinely empty set fails CLOSED, matching the contract', () => {
    // HatManager.hasAnyHat returns false on a zero-length array, so only the
    // executor — a passed proposal — can create. Never "any member".
    const { rows } = describeVoteOpenRights({
      ...kubi(), bindingHatIds: [], pollHatIds: [], ...READ,
      canOpenBinding: true, canOpenPoll: true, isMember: true,
    });
    expect(rows[0].title).toBe('Only a passed vote can open one');
    expect(rows[0].detail).toMatch(/No role can open a binding vote or start a poll directly/);
    // useVoteCreateGate fails OPEN here; that hedge must not reach the copy.
    expect(rows[0].badges).toHaveLength(0);
    expect(rows[0].actions).toHaveLength(0);
  });

  it('omits a track the org never deployed rather than calling it locked', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), hasPolls: false, pollHatIds: [], ...READ,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].track).toBe('binding');
  });

  it('renders nothing at all when the org has neither voting contract', () => {
    const res = describeVoteOpenRights({
      ...kubi(), hasBinding: false, hasPolls: false, ...READ,
    });
    expect(res.rows).toHaveLength(0);
    expect(res.note).toBeNull();
  });
});

describe('viewer standing', () => {
  const kubi = () => LIVE_ORGS.find((o) => o.name === 'KUBI');

  it('chips a viewer who can open one', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), ...READ, canOpenBinding: true, canOpenPoll: true, isMember: true,
    });
    expect(rows[0].badges).toContain('You can ✓');
    expect(rows[0].youLine).toBeNull();
  });

  it('tells an excluded member so out loud, rather than staying silent', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), ...READ, canOpenBinding: false, canOpenPoll: false, isMember: true,
    });
    expect(rows[0].badges).not.toContain('You can ✓');
    expect(rows[0].youLine).toBe('Your role can’t open one yet.');
  });

  it('says nothing personal to a visitor who is not a member', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), ...READ, canOpenBinding: false, canOpenPoll: false, isMember: false,
    });
    expect(rows[0].youLine).toBeNull();
    expect(rows[0].badges).not.toContain('You can ✓');
  });

  it('only chips the merged row when the viewer can open BOTH tracks', () => {
    const { rows } = describeVoteOpenRights({
      ...kubi(), ...READ, canOpenBinding: true, canOpenPoll: false, isMember: true,
    });
    expect(rows[0].badges).not.toContain('You can ✓');
  });
});

describe('role naming', () => {
  const base = {
    roleHatIds: ['1', '2', '3'],
    roleNames: { 1: 'Member', 2: 'Executive', 3: 'Treasurer' },
    hasBinding: true, hasPolls: true, ...READ,
  };

  it('counts creator hats the org has not named instead of inventing one', () => {
    const { rows } = describeVoteOpenRights({
      ...base, bindingHatIds: ['1', '999'], pollHatIds: ['1', '999'],
    });
    expect(rows[0].detail).toBe('Member and 1 more role can open a binding vote or start a poll.');
    // A fraction that silently dropped the unnameable hat would under-report.
    expect(rows[0].badges).toHaveLength(0);
  });

  it('falls back to a roleless sentence when it can name none of them', () => {
    const { rows } = describeVoteOpenRights({
      ...base, bindingHatIds: ['998', '999'], pollHatIds: ['998', '999'],
    });
    expect(rows[0].detail).toMatch(/hasn’t named them yet/);
    expect(rows[0].detail).not.toMatch(/more role/);
  });

  it('matches 0x-prefixed creator hats against decimal role ids case-insensitively', () => {
    const { rows } = describeVoteOpenRights({
      ...base,
      roleHatIds: ['0xAB', '2', '3'],
      roleNames: { '0xab': 'Member', 2: 'Executive', 3: 'Treasurer' },
      bindingHatIds: ['0xAb'], pollHatIds: ['0xAB'],
    });
    expect(rows[0].detail).toBe('Member can open a binding vote or start a poll.');
  });

  it('spells out at most four roles, then counts the rest', () => {
    expect(roleListPhrase(['A'])).toBe('A');
    expect(roleListPhrase(['A', 'B'])).toBe('A and B');
    expect(roleListPhrase(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D and 2 more roles');
    expect(roleListPhrase(['A', 'B'], 1)).toBe('A, B and 1 more role');
    expect(roleListPhrase([])).toBeNull();
  });
});

describe('propose-a-change wiring', () => {
  it('prefills the hat type on the poll template, which has no default', () => {
    const kubi = LIVE_ORGS.find((o) => o.name === 'KUBI');
    const { rows } = describeVoteOpenRights({ ...kubi, ...READ });
    const poll = rows[0].actions.find((a) => a.templateId === OPEN_RIGHTS_TEMPLATE.poll);
    // allow-voter-dd writes EITHER the voting list or the creator list; without
    // this the button stages a blank picker and can propose the wrong right.
    expect(poll.templateValues).toEqual(POLL_CREATOR_PREFILL);
    expect(POLL_CREATOR_PREFILL).toEqual({ hatType: '1' });
  });

  it('offers both templates on a merged row and one per split row', () => {
    const kubi = LIVE_ORGS.find((o) => o.name === 'KUBI');
    const test6 = LIVE_ORGS.find((o) => o.name === 'Test6');
    expect(describeVoteOpenRights({ ...kubi, ...READ }).rows[0].actions).toHaveLength(2);
    describeVoteOpenRights({ ...test6, ...READ }).rows.forEach((r) => {
      expect(r.actions).toHaveLength(1);
    });
  });
});

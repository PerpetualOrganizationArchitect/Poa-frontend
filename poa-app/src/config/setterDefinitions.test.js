import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { utils } from 'ethers';
import { diffInvites, summarizeProposal } from '@/lib/zkemail/inviteDisplay';
import {
  SETTER_TEMPLATES,
  SETTER_CATEGORIES,
  CONTRACT_MAP,
  RAW_FUNCTIONS,
  getTemplateById,
  isContractAvailable,
  isBytes32,
  normalizeBytes32,
  SETTER_TITLE_FALLBACK,
  buildSetterCopy,
  SETTER_TITLE_MAX,
  permsFromSubject,
  normalizePermSelection,
  describePermChanges,
  permChangeSummaries,
  joinPhrases,
  classesFromValues,
} from './setterDefinitions';
import { isTemplateAvailable } from '@/lib/voting/setterAvailability';
import { estimateBatchGas } from '@/lib/accessV2/proposalBuilders';
import hybridVotingAbi from '../../abi/HybridVotingNew.json';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import {
  decodePermWord,
  PERM_KEYS,
  GLOBAL_CTX,
} from '@/lib/accessV2/permKeys';
import {
  subjectsResponse,
  AUTHORITY_ADDRESS,
  MEMBERS_ID,
  EXECS_ID,
  EVERYONE_GROUP_ID,
} from '@/lib/accessV2/fixtures';

// ── Title copy members read (from #465) ──────────────────────────────────
/** Every id the create-a-vote wizard can reach today. */
const TEMPLATE_IDS = [
  'email-invites',
  'change-threshold-hybrid',
  'change-threshold-dd',
  'change-quorum-hybrid',
  'change-voting-split',
  'change-class-voters',
  'change-quorum-dd',
  'allow-proposal-creator-hybrid',
  'allow-voter-dd',
  'edit-role-permissions',
  'pause-hybrid-voting',
  'unpause-hybrid-voting',
  'pause-dd-voting',
  'unpause-dd-voting',
  'set-project-permissions',
  'allow-task-creator',
  'allow-organizer-hat',
  'change-token-metadata',
];

describe('SETTER_TEMPLATES autoTitle', () => {
  it('covers every template', () => {
    expect(SETTER_TEMPLATES.map(t => t.id)).toEqual(TEMPLATE_IDS);
    for (const t of SETTER_TEMPLATES) {
      expect(typeof t.autoTitle, t.id).toBe('string');
      expect(t.autoTitle.trim().length, t.id).toBeGreaterThan(0);
    }
  });

  it('stays short enough to sit in the title input', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle.length, `${t.id}: ${t.autoTitle}`).toBeLessThanOrEqual(SETTER_TITLE_MAX);
    }
  });

  it('never says "Hybrid" to a member — the system is called Blended voting', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle, t.id).not.toMatch(/hybrid/i);
    }
  });

  it('reads as a proposal, not a UI label — no "Rule change:" prefix, no contract names', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(t.autoTitle, t.id).not.toMatch(/^Rule change/i);
      expect(t.autoTitle, t.id).not.toMatch(/setConfig|setClasses|hatId|bytes32|uint/i);
    }
  });

  it('gives each template a distinct title', () => {
    const titles = SETTER_TEMPLATES.map(t => t.autoTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the on-chain encoding fields untouched', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(typeof t.contract, t.id).toBe('string');
      expect(Array.isArray(t.inputs), t.id).toBe(true);
      expect(typeof t.preview, t.id).toBe('function');
    }
  });
});

describe('SETTER_TITLE_FALLBACK', () => {
  it('prefers the curated autoTitle', () => {
    expect(SETTER_TITLE_FALLBACK({ autoTitle: 'Pause Blended voting', name: 'Pause Blended Voting' }))
      .toBe('Pause Blended voting');
  });

  it('falls back to name for a template added later without one', () => {
    expect(SETTER_TITLE_FALLBACK({ name: 'Some New Action' })).toBe('Some New Action');
    expect(SETTER_TITLE_FALLBACK({ autoTitle: '', name: 'Some New Action' })).toBe('Some New Action');
  });

  it('never calls preview() — it is empty or wrong before params are filled', () => {
    let called = false;
    const template = { name: 'Some New Action', preview: () => { called = true; return ''; } };
    expect(SETTER_TITLE_FALLBACK(template)).toBe('Some New Action');
    expect(called).toBe(false);
  });

  it('resolves a real title for all 16 templates', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(SETTER_TITLE_FALLBACK(t), t.id).toBe(t.autoTitle);
    }
  });
});

// ── Wiring, encoding and vocabulary guards ───────────────────────────────
// A rule-change proposal that carries no calls still costs the org a full vote
// and then executes nothing — the failure is silent on-chain. These tests lock
// the wiring that makes an empty batch impossible: every template must resolve
// to a real contract key AND a real function signature.

describe('setter template wiring', () => {
  it('points every template at a known contract', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(CONTRACT_MAP[t.contract], `template "${t.id}" targets unknown contract "${t.contract}"`)
        .toBeTruthy();
    }
  });

  it('files every template under a real category', () => {
    for (const t of SETTER_TEMPLATES) {
      expect(SETTER_CATEGORIES[t.category], `template "${t.id}" has unknown category "${t.category}"`)
        .toBeTruthy();
    }
  });

  // The activate-email-allowlist regression: the template shipped with
  // contract 'zkEmailInvites' but RAW_FUNCTIONS had no such key, so
  // buildProposalData silently produced batches = [[], []].
  it('has a RAW_FUNCTIONS signature for every single-call template', () => {
    for (const t of SETTER_TEMPLATES) {
      // multi-call templates encode their own calls; `buildBatch` templates build a whole
      // governance batch from live state and never touch a hand-written signature.
      if (t.buildCalls || t.buildBatch) continue;
      const fns = RAW_FUNCTIONS[t.contract];
      expect(fns, `no RAW_FUNCTIONS entry for contract "${t.contract}" (template "${t.id}")`)
        .toBeTruthy();
      expect(
        fns.some(f => f.name === t.functionName),
        `RAW_FUNCTIONS.${t.contract} is missing "${t.functionName}" (template "${t.id}")`,
      ).toBe(true);
    }
  });

  // Signatures here are hand-written, but the contracts they call are generated.
  // If a contract's ABI changes arity or param types, the hand-written signature
  // silently encodes calldata the contract will reject (or worse, misread).
  it('matches every raw signature against the checked-in contract ABI', () => {
    const ABI_FOR = {
      zkEmailInvites: 'ZkEmailInvites.json',
      taskManager: 'TaskManagerNew.json',
      participationToken: 'ParticipationToken.json',
      hybridVoting: 'HybridVotingNew.json',
      directDemocracyVoting: 'DirectDemocracyVotingNew.json',
    };
    const abiDir = fileURLToPath(new URL('../../abi/', import.meta.url));

    // A per-contract `continue` would let a new RAW_FUNCTIONS key, or a renamed ABI
    // file, skip silently while the global counter stayed green. Demand coverage.
    // membershipAuthority is deliberately absent from RAW_FUNCTIONS: its write surface is not
    // safe to offer as free-text raw calls, and `edit-role-permissions` encodes through
    // `lib/accessV2/txBuilders` (which builds its Interface from the real artifact).
    for (const contractKey of Object.keys(RAW_FUNCTIONS)) {
      expect(ABI_FOR[contractKey], `RAW_FUNCTIONS.${contractKey} has no ABI mapping in this test`)
        .toBeTruthy();
      expect(
        existsSync(path.join(abiDir, ABI_FOR[contractKey] || '')),
        `ABI file ${ABI_FOR[contractKey]} for ${contractKey} is missing`,
      ).toBe(true);
    }

    let checked = 0;
    for (const [contractKey, fns] of Object.entries(RAW_FUNCTIONS)) {
      const file = ABI_FOR[contractKey];
      const raw = JSON.parse(readFileSync(path.join(abiDir, file), 'utf8'));
      const abi = Array.isArray(raw) ? raw : raw.abi;

      for (const fn of fns) {
        const onChain = abi.filter(e => e.type === 'function' && e.name === fn.name);
        expect(onChain.length, `${contractKey}.${fn.name} is not in ${file}`).toBeGreaterThan(0);

        // Normalize BOTH sides through ethers so tuple[] expands identically
        // ('tuple[]' in raw JSON vs '(uint8,...)[]' in a human-readable string).
        const sighash = (fragment) => fragment.format('sighash');
        const ours = sighash(new utils.Interface([fn.signature]).fragments[0]);
        const theirs = onChain.map(e => sighash(new utils.Interface([e]).fragments[0]));

        expect(
          theirs.includes(ours),
          `${contractKey}.${fn.name} signature "${ours}" matches no overload in ${file}: ${theirs.join(' | ')}`,
        ).toBe(true);
        checked++;
      }
    }
    expect(checked, 'no signatures were cross-checked — ABI_FOR paths are wrong').toBeGreaterThan(0);
  });

  it('exposes a parseable ABI signature for every raw function', () => {
    for (const [contractKey, fns] of Object.entries(RAW_FUNCTIONS)) {
      for (const fn of fns) {
        expect(
          () => new utils.Interface([fn.signature]),
          `${contractKey}.${fn.name} has an unparseable signature`,
        ).not.toThrow();
      }
    }
  });

  it('encodes every single-call template against its own signature', () => {
    // Placeholder values by input type — enough for the encoder to accept them.
    // Keyed on validateAs first, so a field that RENDERS as something friendly but
    // still carries a hash gets a hash.
    const sample = (input) => {
      switch (input.validateAs || input.type) {
        case 'bytes32': return `0x${'ab'.repeat(32)}`;
        case 'number': return String(input.min ?? 1);
        case 'address': return `0x${'11'.repeat(20)}`;
        case 'toggle':
        case 'bool': return true;
        case 'roleSelect': return '1';
        case 'projectSelect': return `0x${'cd'.repeat(32)}`; // project ids are bytes32
        case 'permissionMask': return 1;
        case 'votingClassWeights': return [
          { strategy: 'DIRECT', slicePct: 50, quadratic: false, minBalance: '0', hatIds: [] },
          { strategy: 'ERC20_BAL', slicePct: 50, quadratic: false, minBalance: '0', hatIds: ['1'] },
        ];
        default: return input.default ?? '1';
      }
    };

    for (const t of SETTER_TEMPLATES) {
      if (t.buildCalls || !t.encode) continue;
      const fn = RAW_FUNCTIONS[t.contract].find(f => f.name === t.functionName);
      const iface = new utils.Interface([fn.signature]);
      const values = Object.fromEntries((t.inputs || []).map(i => [i.name, sample(i)]));
      expect(
        () => iface.encodeFunctionData(t.functionName, t.encode(values)),
        `template "${t.id}" cannot encode against ${t.functionName}`,
      ).not.toThrow();
    }
  });
});

describe('the email-invites proposal', () => {
  const template = getTemplateById('email-invites');
  const ROOT = `0x${'11'.repeat(32)}`;
  const CID = `0x${'22'.repeat(32)}`;

  const encodeWith = (values) => {
    const fn = RAW_FUNCTIONS[template.contract].find(f => f.name === template.functionName);
    const iface = new utils.Interface([fn.signature]);
    return iface.encodeFunctionData(template.functionName, template.encode(values));
  };

  it('encodes to setActiveAllowlist(bytes32,bytes32) with the staged root and cid', () => {
    const data = encodeWith({ root: ROOT, cid: CID });
    const selector = utils.id('setActiveAllowlist(bytes32,bytes32)').slice(0, 10);

    expect(data.slice(0, 10)).toBe(selector);
    expect(data).not.toBe('0x');

    const decoded = utils.defaultAbiCoder.decode(['bytes32', 'bytes32'], `0x${data.slice(10)}`);
    expect(decoded[0]).toBe(ROOT);
    expect(decoded[1]).toBe(CID);
  });

  it('tolerates the whitespace and missing prefix a paste picks up', () => {
    const data = encodeWith({ root: `  ${ROOT}  `, cid: CID.slice(2) });
    expect(data).toBe(encodeWith({ root: ROOT, cid: CID }));
  });

  // ethers only accepts a lowercase 0x, so an uppercase-prefixed paste has to be
  // repaired before it reaches the encoder — and must encode to identical bytes.
  it('accepts an uppercase 0X prefix and encodes it identically', () => {
    const canonical = encodeWith({ root: ROOT, cid: CID });
    const variants = [
      { root: `0X${ROOT.slice(2)}`, cid: `0X${CID.slice(2)}` },
      { root: `0X${ROOT.slice(2).toUpperCase()}`, cid: `0X${CID.slice(2).toUpperCase()}` },
      { root: `  0X${ROOT.slice(2)}\n`, cid: `\t0X${CID.slice(2)} ` },
    ];
    for (const v of variants) {
      expect(encodeWith(v), `variant ${JSON.stringify(v.root)} drifted`).toBe(canonical);
    }
  });

  it('is hidden from orgs without the module deployed', () => {
    expect(isContractAvailable(template.contract, {
      votingContractAddress: `0x${'aa'.repeat(20)}`,
    })).toBeFalsy();

    expect(isContractAvailable(template.contract, {
      zkEmailInvitesAddress: `0x${'bb'.repeat(20)}`,
    })).toBeTruthy();
  });

  // A zero address is how "module not provisioned on this chain" shows up;
  // treating it as deployed would point the governance call at address(0).
  it('treats a zero-address module as not deployed', () => {
    for (const zero of ['0x' + '0'.repeat(40), '0X' + '0'.repeat(40), '']) {
      expect(isContractAvailable(template.contract, { zkEmailInvitesAddress: zero }),
        `zero-ish address ${JSON.stringify(zero)} must not count as available`).toBeFalsy();
    }
    expect(isContractAvailable(template.contract, {})).toBeFalsy();
    expect(isContractAvailable('nonExistentContract', { anything: '0x1' })).toBe(false);
  });

  // Nobody types a hash any more: the list field derives both values from the saved
  // document. A visible free-text hex box on this template is a regression.
  it('asks the voter for no hex at all', () => {
    const visible = (template.inputs || []).filter(i => i.type !== 'hidden');
    expect(visible).toHaveLength(1);
    expect(visible[0].type).toBe('emailInviteList');

    const rootInput = template.inputs.find(i => i.name === 'root');
    expect(rootInput.type).toBe('hidden');
    // …but it is still validated as a hash, so a bad one can't reach the encoder.
    expect(rootInput.validateAs).toBe('bytes32');
  });

  it('summarizes in words once the list has been read', () => {
    const line = template.preview({ root: ROOT, cid: CID, summary: 'Email invites: 2 added, 1 removed, 5 invites in total' });
    expect(line).toBe('Email invites: 2 added, 1 removed, 5 invites in total');
    expect(line).not.toMatch(/0x/);
  });

  it('refuses to be proposed while the list cannot be read', () => {
    // A member must never be asked to approve something they could not see.
    expect(template.validate({ root: ROOT, cid: CID })).toBeTruthy();
    expect(template.validate({ root: ROOT, cid: CID, listReadable: 'yes' })).toBeNull();
  });
});

// The owner's standing note: these surfaces face ordinary co-op members. Jargon that
// leaks back into a label or a description is a real regression, so it fails the build.
describe('member-facing vocabulary', () => {
  const BANNED = [
    'allowlist', 'merkle', 'bytes32', 'CID', 'hat id', 'hatid',
    'staging', 'staged', 'stage the', 'activation', 'on-chain', 'metadata', 'IPFS',
  ];

  const visibleStrings = () => {
    const out = [];
    for (const t of SETTER_TEMPLATES) {
      out.push([`${t.id}.name`, t.name], [`${t.id}.description`, t.description]);
      // The access-v2 copy is rendered too — on a migrated org it REPLACES the strings above,
      // so it is held to exactly the same bar.
      if (t.v2Description) out.push([`${t.id}.v2Description`, t.v2Description]);
      for (const i of (t.inputs || [])) {
        if (i.type === 'hidden') continue; // never rendered
        if (i.label) out.push([`${t.id}.${i.name}.label`, i.label]);
        if (i.helpText) out.push([`${t.id}.${i.name}.helpText`, i.helpText]);
        if (i.v2HelpText) out.push([`${t.id}.${i.name}.v2HelpText`, i.v2HelpText]);
        if (i.placeholder) out.push([`${t.id}.${i.name}.placeholder`, i.placeholder]);
      }
    }
    for (const [key, cat] of Object.entries(SETTER_CATEGORIES)) {
      out.push([`category.${key}.name`, cat.name], [`category.${key}.description`, cat.description]);
    }
    return out;
  };

  it('keeps implementation words out of every visible template string', () => {
    const offences = [];
    for (const [where, text] of visibleStrings()) {
      for (const word of BANNED) {
        if (String(text || '').toLowerCase().includes(word.toLowerCase())) {
          offences.push(`${where}: "${text}" contains "${word}"`);
        }
      }
    }
    expect(offences, `member-facing jargon:\n  ${offences.join('\n  ')}`).toEqual([]);
  });

  it('never names the email feature after its data structure', () => {
    const t = getTemplateById('email-invites');
    expect(t.name.toLowerCase()).not.toContain('allowlist');
    expect(t.name.toLowerCase()).not.toContain('activate');
  });
});

describe('bytes32 helpers', () => {
  const VALID = `0x${'ab'.repeat(32)}`;

  it('accepts a well-formed 32-byte hex string', () => {
    expect(isBytes32(VALID)).toBe(true);
    expect(isBytes32(VALID.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('rejects the near-misses that reach ethers as an opaque throw', () => {
    expect(isBytes32('')).toBe(false);
    expect(isBytes32(undefined)).toBe(false);
    expect(isBytes32(null)).toBe(false);
    expect(isBytes32('0x')).toBe(false);
    expect(isBytes32(`0x${'ab'.repeat(31)}`)).toBe(false); // too short
    expect(isBytes32(`0x${'ab'.repeat(33)}`)).toBe(false); // too long
    expect(isBytes32(`0x${'zz'.repeat(32)}`)).toBe(false); // not hex
    expect(isBytes32('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(false); // CIDv0
  });

  it('normalizes a pasted value into something isBytes32 accepts', () => {
    expect(normalizeBytes32(`  ${VALID}\n`)).toBe(VALID);
    expect(normalizeBytes32(VALID.slice(2))).toBe(VALID);
    expect(isBytes32(normalizeBytes32(`  ${VALID.slice(2)} `))).toBe(true);
  });

  it('folds an uppercase 0X prefix, which ethers rejects', () => {
    expect(normalizeBytes32(`0X${VALID.slice(2)}`)).toBe(VALID);
    expect(normalizeBytes32(`  0X${VALID.slice(2)}\t`)).toBe(VALID);
    expect(isBytes32(normalizeBytes32(`0X${VALID.slice(2)}`))).toBe(true);
  });

  it('preserves hex-digit case so a value can be eyeballed against its source', () => {
    const upper = `0x${'AB'.repeat(32)}`;
    expect(normalizeBytes32(upper)).toBe(upper);
    expect(isBytes32(upper)).toBe(true);
  });

  it('leaves genuinely bad input bad rather than papering over it', () => {
    expect(isBytes32(normalizeBytes32('nope'))).toBe(false);
    expect(isBytes32(normalizeBytes32(''))).toBe(false);
    expect(isBytes32(normalizeBytes32(`0x0x${VALID.slice(2)}`))).toBe(false);
    expect(isBytes32(normalizeBytes32(`0X${'ab'.repeat(31)}`))).toBe(false);
  });

  // isBytes32 alone stays strict; the pair is the contract. This documents that
  // splitting them (validating raw input) reintroduces the disagreement.
  it('is strict on its own — 0X only passes after normalization', () => {
    const raw0X = `0X${VALID.slice(2)}`;
    expect(isBytes32(raw0X)).toBe(false);
    expect(isBytes32(normalizeBytes32(raw0X))).toBe(true);
  });
});

describe('VotingPage supplies every contract address a template can need', () => {
  // The other half of the same regression: CONTRACT_MAP gained a zkEmailInvites
  // entry, but VotingPage's contractAddresses memo — the object buildProposalData
  // actually reads — was never updated, so the address resolved to undefined.
  it('lists every CONTRACT_MAP contextKey in the contractAddresses memo', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../components/voting/VotingPage.js', import.meta.url)),
      'utf8',
    );
    // Only the object literal — NOT the dependency array, which repeats every
    // name and would mask a key dropped from the object itself.
    const OPEN = 'const contractAddresses = useMemo(() => ({';
    const start = source.indexOf(OPEN);
    expect(start, 'could not find the contractAddresses memo in VotingPage.js').toBeGreaterThan(-1);
    const end = source.indexOf('}), [', start);
    expect(end).toBeGreaterThan(start);
    const memo = source.slice(start + OPEN.length, end);

    for (const [contractKey, { contextKey }] of Object.entries(CONTRACT_MAP)) {
      expect(
        memo.includes(contextKey),
        `VotingPage's contractAddresses memo is missing "${contextKey}" — `
        + `setter templates targeting ${contractKey} would build an empty batch`,
      ).toBe(true);
    }
  });
});

// Developer mode offers every RAW_FUNCTIONS entry as a free-text raw call. For
// setActiveAllowlist that would be a second path to the same vote which skips the
// invite-list field and template.validate, leaving voters a generic raw-call summary
// and an unverifiable hash — exactly what this feature exists to prevent.
describe('template-only raw functions', () => {
  it('marks setActiveAllowlist template-only', () => {
    const fn = RAW_FUNCTIONS.zkEmailInvites.find(f => f.name === 'setActiveAllowlist');
    expect(fn.templateOnly).toBe(true);
  });

  it('keeps the signature available so the template can still encode', () => {
    const t = getTemplateById('email-invites');
    const fn = RAW_FUNCTIONS[t.contract].find(f => f.name === t.functionName);
    expect(fn.signature).toContain('setActiveAllowlist');
    expect(() => new utils.Interface([fn.signature])).not.toThrow();
  });

  it('leaves every other raw function callable', () => {
    const raw = Object.values(RAW_FUNCTIONS).flat().filter(f => !f.templateOnly);
    expect(raw.length).toBeGreaterThan(0);
    // Only the email one is restricted today; a new restriction should be deliberate.
    const restricted = Object.values(RAW_FUNCTIONS).flat().filter(f => f.templateOnly);
    expect(restricted.map(f => f.name)).toEqual(['setActiveAllowlist']);
  });
});

// The wizard (#465) writes the title when the action is picked and refreshes the
// description on every param change, via buildSetterCopy -> applyAutoCopy. The
// invite field reports its summary/details INTO setterValues, so the copy members
// read has to come out of that same pipe — not a separate submit-time path.
describe('email-invites copy flows through the wizard pipeline', () => {
  const CID = `0x${'22'.repeat(32)}`;
  const base = { cid: CID, root: `0x${'11'.repeat(32)}` };

  it('shows the placeholder title before the list has loaded', () => {
    const { title, description } = buildSetterCopy(getTemplateById('email-invites'), base, {}, {});
    expect(title).toBe('Change who can join by email');
    // preview() stands in until the field reports
    expect(description).toContain('If this vote passes:');
  });

  it('uses the real prose once the field reports it', () => {
    const details = 'Newly invited (1): alice@beta.org (Member)\n\nApproving this replaces the whole list.';
    const { description } = buildSetterCopy(
      getTemplateById('email-invites'), { ...base, summary: 'Email invites: 1 added', details }, {}, {},
    );
    expect(description).toBe(details);          // prose wins over the one-liner
    expect(description).not.toContain('If this vote passes:');
  });

  it('falls back to the preview line when describe() has nothing yet', () => {
    const { description } = buildSetterCopy(
      getTemplateById('email-invites'), { ...base, summary: 'Email invites: 1 added' }, {}, {},
    );
    expect(description).toBe('If this vote passes: Email invites: 1 added');
  });

  it('leaves templates without describe() on the preview line', () => {
    const t = getTemplateById('change-threshold-hybrid');
    expect(t.describe).toBeUndefined();
    const { description } = buildSetterCopy(t, { threshold: '60' }, {}, {});
    expect(description).toContain('If this vote passes:');
  });
});

// The title is what a member meets on the board. Static is right for most
// templates, but where the params ARE the decision the title should say it.
describe('a template can sharpen its own title', () => {
  const CID = `0x${'22'.repeat(32)}`;
  const base = { cid: CID, root: `0x${'11'.repeat(32)}` };
  const titleFor = (values) => buildSetterCopy(getTemplateById('email-invites'), values, {}, {}).title;

  it('states the change once the list has been read', () => {
    expect(titleFor({ ...base, summary: 'Email invites: 2 added, 1 removed, 5 invited in total' }))
      .toBe('Email invites: 2 added, 1 removed, 5 invited in total');
  });

  it('keeps the curated title until then', () => {
    expect(titleFor(base)).toBe('Change who can join by email');
  });

  it('refuses a sharpened title that would not fit the input', () => {
    const tooLong = `Email invites: ${'x'.repeat(SETTER_TITLE_MAX)}`;
    expect(titleFor({ ...base, summary: tooLong })).toBe('Change who can join by email');
  });

  it('leaves every other template on its curated title', () => {
    for (const t of SETTER_TEMPLATES) {
      if (t.id === 'email-invites') continue;
      expect(t.retitle, `${t.id} should not define retitle`).toBeUndefined();
    }
  });

  // Whatever the real summariser can emit has to fit, or the board silently
  // falls back and the specificity is lost.
  it('every summary the list can produce fits the budget', () => {
    const mk = (n, p) => Array.from({ length: n }, (_, i) => ({
      type: 'domain', identifier: `${p}${i}.example.com`, hatIds: ['100'], roleIndexes: [],
    }));
    for (const [next, cur] of [
      [mk(999, 'n'), mk(999, 'c')], [mk(12, 'n'), mk(9, 'c')],
      [mk(40, 'n'), null], [mk(7, 'n'), mk(7, 'n')],
    ]) {
      const line = summarizeProposal(diffInvites(next, cur), next.length);
      expect(line.length, `too long: "${line}"`).toBeLessThanOrEqual(SETTER_TITLE_MAX);
    }
  });
});

// ── set-project-permissions: the composite project id ────────────────────
// The picker's value is the SUBGRAPH id, `{taskManagerAddress}-{n}`. `pid` is a bytes32, so
// handing that string to ethers threw INVALID_ARGUMENT at submit — the template could be
// configured, reviewed and then never actually proposed.
describe('set-project-permissions encodes a real project id', () => {
  const template = getTemplateById('set-project-permissions');
  const TM = `0x${'cc'.repeat(20)}`;
  const ROLE = '1';

  const encodeWith = (values) => {
    const fn = RAW_FUNCTIONS[template.contract].find(f => f.name === template.functionName);
    const iface = new utils.Interface([fn.signature]);
    return iface.encodeFunctionData(template.functionName, template.encode(values));
  };

  it('accepts the composite subgraph id the project picker supplies', () => {
    const data = encodeWith({ project: `${TM}-5`, role: ROLE, permissions: [1, 2] });
    const [pid, hatId, mask] = utils.defaultAbiCoder.decode(
      ['bytes32', 'uint256', 'uint8'], `0x${data.slice(10)}`,
    );
    expect(pid).toBe(`0x${'0'.repeat(62)}05`);
    expect(hatId.toString()).toBe(ROLE);
    expect(mask).toBe(3);
  });

  it('leaves an already-bytes32 id untouched', () => {
    const pid = `0x${'cd'.repeat(32)}`;
    const data = encodeWith({ project: pid, role: ROLE, permissions: [4] });
    expect(utils.defaultAbiCoder.decode(['bytes32', 'uint256', 'uint8'], `0x${data.slice(10)}`)[0])
      .toBe(pid);
  });

  it('no longer throws on the value the picker actually produces', () => {
    expect(() => encodeWith({ project: `${TM}-5`, role: ROLE, permissions: [1] })).not.toThrow();
  });
});

// ── access v2: edit-role-permissions ─────────────────────────────────────
// The one template that replaces the three that went silently dead at the cutover. It does not
// encode a setter — it diffs the role's live permission rows and returns a whole governance
// batch, so every assertion here decodes the calldata back through the REAL MembershipAuthority
// ABI rather than trusting the builder's own shape.
describe('edit-role-permissions', () => {
  const template = getTemplateById('edit-role-permissions');
  const { subjects } = normalizeAuthoritySubjects(
    subjectsResponse().membershipAuthorityContract.subjects,
  );
  const subjectOf = (id) => subjects.find((s) => s.subjectId === id);
  const ctx = { authority: AUTHORITY_ADDRESS, subjects, roleNames: {}, projectNames: {} };

  const decodeBatch = (batch) => batch.map((c) => {
    const parsed = authorityInterface.parseTransaction({ data: c.data });
    return { target: c.target, value: c.value, name: parsed.name, args: parsed.args };
  });

  it('targets the authority and is hidden until the org has one', () => {
    expect(template.contract).toBe('membershipAuthority');
    expect(template.v2Only).toBe(true);
    expect(CONTRACT_MAP.membershipAuthority.contextKey).toBe('membershipAuthorityAddress');
    expect(isContractAvailable('membershipAuthority', {})).toBeFalsy();
    expect(isContractAvailable('membershipAuthority', {
      membershipAuthorityAddress: AUTHORITY_ADDRESS,
    })).toBeTruthy();
  });

  it('seeds from the role’s OWN global rows, never the folded group ones', () => {
    // Members carries DD_VOTE itself and CLAIM only through the Everyone group. Seeding the
    // editor with the folded value would show a tick the member cannot untick here — and
    // unticking it would emit a clearPerm for a row this subject does not own.
    expect(permsFromSubject(subjectOf(MEMBERS_ID))).toEqual({ DD_VOTE: true });
    expect(subjectOf(MEMBERS_ID).permEffective(PERM_KEYS.TM_PERMS)).toBe('2');
    expect(permsFromSubject(subjectOf(EVERYONE_GROUP_ID))).toEqual({ TM_PERMS: 2 });
    expect(permsFromSubject(subjectOf(EXECS_ID))).toEqual({});
    expect(permsFromSubject(null)).toEqual({});
  });

  it('grants a permission as ONE setPerm on the authority', () => {
    const built = template.buildBatch(
      { subjectId: MEMBERS_ID, perms: { DD_VOTE: true, HV_CREATE: true } },
      ctx,
    );
    const calls = decodeBatch(built.batch);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('setPerm');
    expect(calls[0].target).toBe(AUTHORITY_ADDRESS);
    expect(calls[0].value).toBe('0');
    expect(calls[0].args[0].toString()).toBe(MEMBERS_ID);
    expect(calls[0].args[1]).toBe(PERM_KEYS.HV_CREATE);
    expect(calls[0].args[2]).toBe(GLOBAL_CTX);
    expect(decodePermWord(calls[0].args[3].toString()).enabled).toBe(true);
    // DD_VOTE was already there and is NOT rewritten.
    expect(calls.some((c) => c.args[1] === PERM_KEYS.DD_VOTE)).toBe(false);
  });

  it('revokes a permission as a clearPerm', () => {
    const built = template.buildBatch({ subjectId: MEMBERS_ID, perms: {} }, ctx);
    const calls = decodeBatch(built.batch);
    expect(calls.map((c) => c.name)).toEqual(['clearPerm']);
    expect(calls[0].args[1]).toBe(PERM_KEYS.DD_VOTE);
    expect(calls[0].args[2]).toBe(GLOBAL_CTX);
  });

  it('writes the task mask as one OR-mask row', () => {
    const built = template.buildBatch(
      { subjectId: EVERYONE_GROUP_ID, perms: { TM_PERMS: 6 } },
      ctx,
    );
    const calls = decodeBatch(built.batch);
    expect(calls.map((c) => c.name)).toEqual(['setPerm']);
    expect(calls[0].args[1]).toBe(PERM_KEYS.TM_PERMS);
    expect(decodePermWord(calls[0].args[3].toString()).value).toBe('6');
  });

  it('says out loud that a group hands its permissions to every role in it', () => {
    const built = template.buildBatch(
      { subjectId: EVERYONE_GROUP_ID, perms: { TM_PERMS: 6 } },
      ctx,
    );
    expect(built.warnings.join(' ')).toContain('Every role inside “Everyone”');
    // …and a plain role gets no such warning.
    expect(template.buildBatch({ subjectId: MEMBERS_ID, perms: {} }, ctx).warnings).toEqual([]);
  });

  it('names the role AND the permissions in its summaries', () => {
    const built = template.buildBatch(
      { subjectId: MEMBERS_ID, perms: { HV_CREATE: true, TM_PERMS: 3 } },
      ctx,
    );
    const text = built.summaries.join(' | ');
    expect(text).toContain('Members');
    expect(text).toContain('open a binding vote');
    expect(text).toContain('create tasks');
    expect(text).toContain('Stop “Members” being able to vote in community votes');
    // One sentence per KIND of change, not one per call.
    expect(built.summaries.length).toBeLessThanOrEqual(4);
  });

  it('carries the announceWinner gas floor', () => {
    const built = template.buildBatch(
      { subjectId: MEMBERS_ID, perms: { DD_VOTE: true, HV_CREATE: true, PAY_CREATE: true } },
      ctx,
    );
    expect(built.batch).toHaveLength(2);
    expect(built.gasLimit).toBe(400_000 + 250_000 * 2);
  });

  // An empty batch is the silent no-op this codebase keeps having to close: the vote runs, passes,
  // reports success and executes nothing.
  it('refuses to build a proposal that would change nothing', () => {
    expect(() => template.buildBatch({ subjectId: MEMBERS_ID, perms: { DD_VOTE: true } }, ctx))
      .toThrow(/Nothing would change/);
  });

  it('refuses a role that is no longer in the org, rather than diffing a stale picture', () => {
    expect(() => template.buildBatch({ subjectId: '999', perms: { DD_VOTE: true } }, ctx))
      .toThrow(/isn’t in this group’s list/);
    expect(() => template.buildBatch({ subjectId: '', perms: {} }, ctx)).toThrow(/Pick the role/);
    expect(() => template.buildBatch({ subjectId: MEMBERS_ID, perms: {} }, { subjects }))
      .toThrow(/aren’t loaded yet/);
  });

  it('ignores form values that are not permission keys', () => {
    expect(normalizePermSelection({ NOT_A_KEY: true, DD_VOTE: true, TM_PERMS: 0 }))
      .toEqual({ DD_VOTE: true });
    expect(normalizePermSelection(null)).toEqual({});
    const built = template.buildBatch(
      { subjectId: MEMBERS_ID, perms: { DD_VOTE: true, NOT_A_KEY: true, HV_CREATE: true } },
      ctx,
    );
    expect(built.batch).toHaveLength(1);
  });

  it('gates its own config screen on an actual change', () => {
    expect(template.validate({})).toMatch(/Pick the role/);
    expect(template.validate({ subjectId: MEMBERS_ID })).toMatch(/Choose what/);
    expect(template.validate({
      subjectId: MEMBERS_ID, permsCurrent: { DD_VOTE: true }, perms: { DD_VOTE: true },
    })).toMatch(/Nothing has changed/);
    expect(template.validate({
      subjectId: MEMBERS_ID, permsCurrent: { DD_VOTE: true }, perms: { DD_VOTE: true, HV_CREATE: true },
    })).toBeNull();
  });

  it('previews the change in the same voice as the other templates', () => {
    const line = template.preview({
      subjectId: MEMBERS_ID,
      subjectName: 'Members',
      permsCurrent: { DD_VOTE: true, TM_PERMS: 2 },
      perms: { HV_CREATE: true, TM_PERMS: 3 },
    }, {});
    expect(line).toBe(
      'Let “Members” open a binding vote; stop “Members” being able to vote in community votes; '
      + 'let “Members” create tasks',
    );
    expect(line).not.toMatch(/0x|permKey|bytes32/i);
  });

  it('falls back to the role-name map, then to a neutral phrase', () => {
    expect(template.preview({ subjectId: MEMBERS_ID, perms: {} }, { [MEMBERS_ID]: 'Members' }))
      .toContain('“Members”');
    expect(template.preview({ perms: {} }, {})).toBe(
      'Leave “this role” with the permissions it already has',
    );
  });

  it('flows through buildSetterCopy like every other template', () => {
    const { title, description } = buildSetterCopy(template, {
      subjectId: MEMBERS_ID, subjectName: 'Members',
      permsCurrent: {}, perms: { HV_CREATE: true },
    }, {}, {});
    expect(title).toBe('Change what a role can do');
    expect(description).toBe('If this vote passes: Let “Members” open a binding vote');
  });
});

// ── change-class-voters ──────────────────────────────────────────────────
// A Blended vote is tallied per CLASS, and each class carries its own list of roles. A role that
// is not in that list has NO binding-vote power however many permissions it holds — so "who can
// vote" is a different question from "what is this role allowed to do", and it needs its own
// action. Every assertion here decodes the calldata back through the REAL HybridVoting ABI: the
// helper's own Interface agreeing with itself would prove nothing about the deployed contract.
describe('change-class-voters', () => {
  const template = getTemplateById('change-class-voters');
  const hybridVotingIface = new utils.Interface(hybridVotingAbi);

  const HV = '0xf642dde77848dc195c8089f4042a311ed650d7a6';
  const MEMBER = '29035862971903655586674243772344327311664727652070589302159213246545920';
  const EXECUTIVE = '29035862971903655490893272468226273664268038455176265325988018110070784';
  const TREASURER = '29035862971903655682455215076462380959061416848964913278330408383021056';

  // Test6's live classes (getClasses(), 2026-09-03): DIRECT 80% + PARTICIPATION 20%, both
  // counting Member and Executive.
  const CLASSES = [
    { classIndex: 0, strategy: 'DIRECT', slicePct: 80, hatIds: [MEMBER, EXECUTIVE] },
    { classIndex: 1, strategy: 'PARTICIPATION', slicePct: 20, hatIds: [MEMBER, EXECUTIVE] },
  ];
  const ctx = {
    contractAddresses: { votingContractAddress: HV },
    roleNames: { [MEMBER]: 'Member', [EXECUTIVE]: 'Executive', [TREASURER]: 'Treasurer' },
  };
  // The exact form state the wizard holds: the picker writes a STRING index plus the class
  // snapshot it indexes into, alongside the role id and the Add/Remove toggle.
  const values = (over = {}) => ({
    classIdx: '0', role: TREASURER, action: 'Add', votingClasses: CLASSES, ...over,
  });

  it('is offered on a legacy org AND on a migrated one', () => {
    // `addHatToClass` writes the class's own electorate, which HybridVoting reads either way —
    // unlike setCreatorHatAllowed, nothing about it went dead at the cutover.
    expect(template.legacyOnly).toBeUndefined();
    expect(template.v2Only).toBeUndefined();
    expect(template.idsAreSubjects).toBe(true);
    for (const authorityEnabled of [false, true]) {
      expect(isTemplateAvailable(template, { authorityEnabled }), `authorityEnabled=${authorityEnabled}`)
        .toBe(true);
    }
    expect(template.contract).toBe('hybridVoting');
    expect(CONTRACT_MAP.hybridVoting.contextKey).toBe('votingContractAddress');
  });

  it('encodes addHatToClass against the real HybridVoting ABI', () => {
    const built = template.buildBatch(values(), ctx);
    expect(built.batch).toHaveLength(1);
    const [call] = built.batch;
    expect(call.target).toBe(utils.getAddress(HV));
    expect(call.value).toBe('0');

    const parsed = hybridVotingIface.parseTransaction({ data: call.data });
    expect(parsed.name).toBe('addHatToClass');
    expect(parsed.args.classIdx).toBe(0);
    expect(parsed.args.hatId.toString()).toBe(TREASURER);
  });

  it('encodes removeHatFromClass, on the class the member actually picked', () => {
    const built = template.buildBatch(
      values({ classIdx: '1', role: EXECUTIVE, action: 'Remove' }),
      ctx,
    );
    const parsed = hybridVotingIface.parseTransaction({ data: built.batch[0].data });
    expect(parsed.name).toBe('removeHatFromClass');
    expect(parsed.args.classIdx).toBe(1);
    expect(parsed.args.hatId.toString()).toBe(EXECUTIVE);
  });

  it('names the role and the class in the sentence voters read, and funds the batch', () => {
    const built = template.buildBatch(values(), ctx);
    expect(built.summaries).toEqual([
      'Let members of “Treasurer” vote in binding votes as Members (one vote each).',
    ]);
    expect(built.gasLimit).toBe(estimateBatchGas(built.batch));
    expect(built.gasLimit).toBeGreaterThan(0);
  });

  // Both of these SUCCEED on chain and change nothing — the vote-passed-nothing-happened shape.
  it('refuses an add for a role the class already counts', () => {
    const bad = values({ role: MEMBER });
    expect(template.validate(bad)).toMatch(/already votes in binding votes as Members/);
    expect(() => template.buildBatch(bad, ctx)).toThrow(/already votes/);
  });

  it('refuses a remove for a role the class doesn’t count', () => {
    const bad = values({ role: TREASURER, action: 'Remove' });
    expect(template.validate(bad)).toMatch(/nothing to remove/);
    expect(() => template.buildBatch(bad, ctx)).toThrow(/nothing to remove/);
  });

  it('refuses to guess an index into a class list it hasn’t got', () => {
    expect(template.validate(values({ votingClasses: [] }))).toMatch(/haven’t loaded their voters/);
    expect(template.validate(values({ votingClasses: undefined })))
      .toMatch(/haven’t loaded their voters/);
    // An index past the end of the snapshot is the same failure wearing a different hat.
    expect(template.validate(values({ classIdx: '5' }))).toMatch(/which voters/);
    expect(() => template.buildBatch(values({ votingClasses: [] }), ctx))
      .toThrow(/haven’t loaded their voters/);
  });

  it('asks for the two answers it needs before anything else', () => {
    expect(template.validate(values({ classIdx: '' }))).toMatch(/which voters/);
    expect(template.validate(values({ role: '' }))).toMatch(/whose voting rights/);
    expect(template.validate(values())).toBeNull();
    expect(template.validate(values({ role: MEMBER, action: 'Remove' }))).toBeNull();
  });

  it('warns when a removal empties a class or silences a role entirely', () => {
    // Executive votes in both classes and is one of two roles in each: no warning worth the noise.
    expect(template.buildBatch(values({ role: EXECUTIVE, action: 'Remove' }), ctx).warnings)
      .toEqual([]);

    const soleClasses = [{ classIndex: 0, strategy: 'DIRECT', slicePct: 100, hatIds: [MEMBER] }];
    const built = template.buildBatch(
      values({ role: MEMBER, action: 'Remove', votingClasses: soleClasses }),
      ctx,
    );
    expect(built.warnings).toEqual([
      'No role would be left voting as Members (one vote each) · 100%, so that share of every binding vote would have no voters.',
      'Members of “Member” would have no vote in binding votes at all.',
    ]);
  });

  it('will not encode against an org whose voting contract is missing', () => {
    expect(() => template.buildBatch(values(), { ...ctx, contractAddresses: {} }))
      .toThrow(/Blended voting contract/);
  });

  it('previews in the member voice, with no ids or contract words', () => {
    const line = template.preview(values(), ctx.roleNames);
    expect(line).toBe(
      'Let members of “Treasurer” vote in binding votes as Members (one vote each).',
    );
    expect(line).not.toMatch(/0x|hat|class \d|addHatToClass/i);

    expect(template.preview(values({ classIdx: '1', action: 'Remove' }), ctx.roleNames))
      .toBe('Stop members of “Treasurer” voting in binding votes as Contributors (weighted by shares).');
    // No role-name map (the deep-link path passes {}) still reads as a sentence.
    expect(template.preview(values(), {})).toContain('“this role”');
  });

  // The preview box renders on every keystroke, before anything is answered. Defaulting the index
  // to 0 would announce a class the member never picked.
  it('claims nothing until a class and a role are actually chosen', () => {
    const neutral = 'Change which roles are counted in binding votes';
    expect(template.preview({}, {})).toBe(neutral);
    expect(template.preview(values({ classIdx: '' }), ctx.roleNames)).toBe(neutral);
    expect(template.preview(values({ role: '' }), ctx.roleNames)).toBe(neutral);
    expect(template.preview(values({ votingClasses: [] }), ctx.roleNames)).toBe(neutral);
    expect(template.preview(values({ classIdx: '9' }), ctx.roleNames)).toBe(neutral);
  });

  // POContext's roleNames is the LEGACY hat list, frozen at the access-v2 cutover — a role created
  // since has no entry there, and the ballot would say "this role". The picker records the name
  // with the choice, and that wins.
  it('prefers the name the picker recorded over the frozen legacy map', () => {
    const v2Native = { ...values({ role: '777', roleName: 'Stewards' }) };
    expect(template.preview(v2Native, ctx.roleNames))
      .toContain('“Stewards”');
    expect(template.buildBatch(v2Native, ctx).summaries[0]).toContain('“Stewards”');
    // A stale recorded name never wins over nothing being chosen, and the map is still the
    // fallback for every draft written before this field existed.
    expect(template.preview(values(), ctx.roleNames)).toContain('“Treasurer”');
  });

  it('flows through buildSetterCopy like every other template', () => {
    const { title, description } = buildSetterCopy(template, values(), ctx.roleNames, {});
    expect(title).toBe('Change who votes in binding votes');
    expect(description).toBe(
      'If this vote passes: Let members of “Treasurer” vote in binding votes as Members (one vote each).',
    );
  });

  // The class list has to reach `validate`, which only ever sees setterValues. It gets there via a
  // hidden, optional input — hidden because nobody edits it, optional so the wizard's
  // required-field gate doesn't demand it before the picker has written it.
  it('carries the class snapshot as a hidden, seeded, optional value', () => {
    const snapshot = template.inputs.find((i) => i.name === 'votingClasses');
    expect(snapshot).toMatchObject({ type: 'hidden', optional: true, seedFrom: 'votingClasses' });
    // Same treatment for the recorded role name — derived, never typed, never required.
    expect(template.inputs.find((i) => i.name === 'roleName'))
      .toMatchObject({ type: 'hidden', optional: true });
    expect(template.inputs.find((i) => i.name === 'role').nameField).toBe('roleName');
    expect(classesFromValues({ votingClasses: CLASSES })).toBe(CLASSES);
    expect(classesFromValues({})).toEqual([]);
    expect(classesFromValues({ votingClasses: '' })).toEqual([]);

    const visible = template.inputs.filter((i) => i.type !== 'hidden').map((i) => [i.name, i.type]);
    expect(visible).toEqual([
      ['classIdx', 'votingClassSelect'],
      ['role', 'roleSelect'],
      ['action', 'toggle'],
    ]);
    expect(template.inputs.find((i) => i.name === 'action').default).toBe('Add');
  });

  it('exposes the same two calls in Developer mode, matching the shipped ABI', () => {
    for (const name of ['addHatToClass', 'removeHatFromClass']) {
      const fn = RAW_FUNCTIONS.hybridVoting.find((f) => f.name === name);
      expect(fn, `RAW_FUNCTIONS.hybridVoting is missing ${name}`).toBeTruthy();
      expect(fn.templateOnly).toBeUndefined();
      expect(fn.legacyOnly).toBeUndefined();
      // The legend a member of Developer mode needs: the index is POSITIONAL, and the role id
      // means different things before and after the cutover.
      expect(fn.params[0].label).toMatch(/index/i);
      expect(fn.params[1].label).toMatch(/subject id/i);
      expect(new utils.Interface([fn.signature]).getSighash(name))
        .toBe(hybridVotingIface.getSighash(name));
    }
  });
});

describe('permission change wording', () => {
  it('lists in the group\'s voice', () => {
    expect(joinPhrases([])).toBe('');
    expect(joinPhrases(['a'])).toBe('a');
    expect(joinPhrases(['a', 'b'])).toBe('a and b');
    expect(joinPhrases(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('reports added and removed task bits separately', () => {
    const changes = describePermChanges({ TM_PERMS: 3 }, { TM_PERMS: 5 });
    expect(changes.taskAdded).toEqual(['review finished tasks']);
    expect(changes.taskRemoved).toEqual(['claim tasks']);
    expect(changes.changed).toBe(true);
  });

  it('says nothing changed when nothing did', () => {
    expect(describePermChanges({ DD_VOTE: true }, { DD_VOTE: true }).changed).toBe(false);
    expect(describePermChanges(undefined, undefined).changed).toBe(false);
    expect(permChangeSummaries('X', describePermChanges({}, {}))).toEqual([]);
  });

  // Checkbox labels do not survive being dropped into a sentence — "Let “X” Granted on join".
  it('uses verb phrases, not checkbox labels', () => {
    const changes = describePermChanges({}, { QJ_AUTOJOIN: true, SUBJECT_RENAME: true });
    expect(changes.granted).toEqual([
      'be given to everyone who joins through the join link',
      'rename roles and groups',
    ]);
  });
});

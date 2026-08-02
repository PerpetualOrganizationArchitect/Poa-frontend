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
} from './setterDefinitions';

// ── Title copy members read (from #465) ──────────────────────────────────
/** Every id the create-a-vote wizard can reach today. */
const TEMPLATE_IDS = [
  'email-invites',
  'change-threshold-hybrid',
  'change-threshold-dd',
  'change-quorum-hybrid',
  'change-voting-split',
  'change-quorum-dd',
  'allow-proposal-creator-hybrid',
  'allow-voter-dd',
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
      if (t.buildCalls) continue; // multi-call templates encode their own calls
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
      for (const i of (t.inputs || [])) {
        if (i.type === 'hidden') continue; // never rendered
        if (i.label) out.push([`${t.id}.${i.name}.label`, i.label]);
        if (i.helpText) out.push([`${t.id}.${i.name}.helpText`, i.helpText]);
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

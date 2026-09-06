/**
 * ONE vote wizard and ONE encoder, reached from the vote gallery or org structure.
 *
 * The form and the encoder are pure and unit-tested elsewhere
 * (`lib/accessV2/roleFormBatch.test.js`). These checks keep both entry points connected to
 * the normal vote wizard rather than letting a separate creation/submission flow reappear.
 *
 * There is no React harness in this repo (vitest runs in `node`, no jsdom, no testing-library), so
 * the wiring is checked the only way it can be: against the files. Precedent:
 * `components/voting/ballotWiring.test.js`, `hooks/accessV2/gating.test.js`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const roleForm = read('components', 'accessV2', 'RoleForm.jsx');
const votePage = read('components', 'voting', 'VotingPage.js');
const voteModal = read('components', 'voting', 'CreateVoteModal.js');
const proposalForm = read('hooks', 'useProposalForm.js');
const intentGallery = read('components', 'voting', 'create', 'IntentGallery.js');
const rolesPanel = read('components', 'accessV2', 'RolesGroupsPanel.jsx');

describe('both entry points use the normal vote wizard', () => {
  it('reads the files at all (guards against a silently empty scan)', () => {
    expect(roleForm).toContain('export default function RoleForm');
    expect(votePage).toContain('<CreateVoteModal');
  });

  it('/team links into the org’s vote wizard with role creation selected', () => {
    expect(rolesPanel).toContain("query: { org: orgName, propose: 'create-role' }");
    expect(rolesPanel).not.toContain('CreateRoleWizard');
    expect(votePage).toContain("restoreProposal({ type: 'createRole', roleFormV2: defaultRoleForm() })");
    expect(votePage).toContain("templateId === 'create-role' && authority.loading");
  });

  it('the vote wizard renders RoleForm on a v2 org and RoleConfigurator on a legacy one', () => {
    expect(voteModal).toContain('import RoleForm from "@/components/accessV2/RoleForm"');
    expect(voteModal).toMatch(/proposal\.type === "createRole" && \(accessV2Enabled \? \(/);
    expect(voteModal).toMatch(/<RoleForm[\s\S]*?value=\{proposal\.roleFormV2\}/);
    // The legacy configurator is still there, still reached, still fed the same props.
    expect(voteModal).toContain('<RoleConfigurator');
    expect(voteModal).toContain('subjectRaceWarning={v2SubjectRaceWarning}');
  });

  it('the form itself is controlled and submits nothing', () => {
    expect(roleForm).toMatch(/function RoleForm\(\{ value, onChange, ctx/);
    // A submit inside the form would give the two doors two different submit paths.
    expect(roleForm).not.toContain('useAccessV2Proposal');
    expect(roleForm).not.toContain('createHybridProposal');
  });

  it('carries the testids the Playwright lane drives it by', () => {
    for (const id of [
      'role-form-kind-role',
      'role-form-kind-group',
      'role-form-name',
      'role-form-description',
      'role-form-seat-limit',
      'role-form-open-role',
      'role-form-class-vote',
      'role-form-class-select',
      'role-form-holder-address',
      'role-form-next',
      'role-form-back',
    ]) {
      expect(roleForm, `missing testid: ${id}`).toContain(`data-testid="${id}"`);
    }
  });
});

describe('one encoder', () => {
  it('the vote wizard builds through buildRoleFormBatch', () => {
    expect(proposalForm).toContain('buildRoleFormBatch');
    expect(proposalForm.split('buildRoleFormBatch(').length - 1).toBeGreaterThan(0);
  });

  it('the create-role encoder that used to live in v2VoteActions is gone, not duplicated', () => {
    const v2VoteActions = read('lib', 'voting', 'v2VoteActions.js');
    expect(v2VoteActions).not.toContain('buildV2CreateRoleBatch');
    expect(v2VoteActions).not.toContain('buildCreateRoleBatch');
    // The election arm is untouched.
    expect(v2VoteActions).toContain('export function buildV2ElectionBatches');
  });

  it('the wizard gate and the encoder read the SAME form', () => {
    // `resolveRoleForm` is what makes "validated" and "encoded" the same object.
    expect(proposalForm).toContain('form: resolveRoleForm(proposal)');
    expect(read('lib', 'voting', 'proposalChecks.js')).toContain('roleFormError(resolveRoleForm(p))');
  });

  it('the v2 create-role arm is still behind the accessV2 gate', () => {
    expect(proposalForm).toMatch(/proposal\.type === "createRole" && extras\?\.accessV2\?\.enabled/);
    // …and the legacy arm still encodes the Hats-era calls for an org that has not cut over.
    expect(proposalForm).toContain('createHatWithEligibility');
    expect(proposalForm).toContain('setProjectRolePerm');
  });
});

describe('the copy both doors show', () => {
  it('the intent card says "role or group" on a v2 org and leaves the legacy words alone', () => {
    expect(intentGallery).toContain("title: 'Create a new role'");
    expect(intentGallery).toContain("description: 'Add a role and set what it can do.'");
    expect(intentGallery).toContain("v2Title: 'Create a role or group'");
    expect(intentGallery).toContain("v2Description: 'Add a role or group and set what it can do.'");
    // The swap is gated on the org, not applied unconditionally.
    expect(intentGallery).toMatch(/accessV2 && option\.v2Title/);
    expect(voteModal).toContain('accessV2={accessV2Enabled}');
  });

  it('/team’s button says what it now does', () => {
    expect(rolesPanel).toContain('Create a role or group');
  });
});


describe('v2 creation keeps configuration and proposal preview connected', () => {
  it('passes the full live context to the encoder and blocks on preview errors', () => {
    expect(roleForm).toMatch(/buildRoleFormBatch\(\{\s*\.\.\.ctx,\s*preview: true/);
    expect(roleForm).toContain("blocked: current === 'review' ? reviewError : null");
    expect(roleForm).toContain('currentError || preview.error');
  });

  it('keeps joining and people role-only and binding voting under permissions', () => {
    expect(roleForm).toContain("s !== 'people' && s !== 'joining'");
    const permissions = roleForm.slice(roleForm.indexOf("{current === 'permissions'"), roleForm.indexOf("{current === 'joining'"));
    expect(permissions).toContain('role-form-class-vote');
    expect(permissions).toContain('role-form-edit-org-details');
    expect(roleForm).not.toContain("current === 'voting'");
    expect(roleForm).not.toContain('co-op');
  });

  it('wires email access and real advanced settings into the shared form value', () => {
    expect(roleForm).toContain('value={form.join.domains}');
    expect(roleForm).toContain('value={form.emailInvites}');
    expect(roleForm).toContain('value={form.sponsorship}');
    expect(roleForm).toContain('value={form.manager}');
    expect(roleForm).toContain('defaultIndex={[]}');
    const invites = read('components', 'accessV2', 'roleForm', 'InviteListInput.jsx');
    expect(invites).toContain('mergeInviteTokens(value, draft, kind)');
    expect(invites).toContain('isDisabled={openRole}');
  });
});

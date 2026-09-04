/**
 * ONE form, ONE encoder, TWO doors — enforced over the SOURCE.
 *
 * The form and the encoder are pure and unit-tested elsewhere
 * (`lib/accessV2/roleFormBatch.test.js`). What that cannot prove is that BOTH doors render the
 * same form and go through the same encoder — and "two doors that disagree about what a role is"
 * is the entire bug this work closes. A regression here is invisible in every other test: each
 * screen keeps working, they just quietly stop meaning the same thing.
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
const teamModal = read('components', 'accessV2', 'CreateRoleWizard.jsx');
const voteModal = read('components', 'voting', 'CreateVoteModal.js');
const proposalForm = read('hooks', 'useProposalForm.js');
const intentGallery = read('components', 'voting', 'create', 'IntentGallery.js');
const rolesPanel = read('components', 'accessV2', 'RolesGroupsPanel.jsx');

describe('both doors render the same form', () => {
  it('reads the files at all (guards against a silently empty scan)', () => {
    expect(roleForm).toContain('export default function RoleForm');
    expect(teamModal).toContain('export default function CreateRoleWizard');
  });

  it('/team’s modal is a shell around RoleForm, not a second form', () => {
    expect(teamModal).toContain("import RoleForm from './RoleForm'");
    expect(teamModal).toMatch(/<RoleForm[\s\S]*?value=\{form\}/);
    // The decisions live in the form: the shell must not have grown its own pickers back.
    expect(teamModal).not.toContain('PermissionPicker');
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
  it('both doors build through buildRoleFormBatch', () => {
    for (const [name, src] of [['/team modal', teamModal], ['useProposalForm', proposalForm]]) {
      expect(src, `${name} does not import the shared encoder`).toContain('buildRoleFormBatch');
      expect(src.split('buildRoleFormBatch(').length - 1, `${name} never calls it`).toBeGreaterThan(0);
    }
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

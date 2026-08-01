/**
 * Every template in the gallery must validate the moment it's applied — no user
 * edits. A validation rule that a shipped template violates is an un-actionable
 * deploy blocker on the most common path into the wizard, and the hand-built
 * fixtures in deploymentMapper.test.js can't catch it.
 */

import { describe, it, expect } from 'vitest';
import { deployerReducer, initialState, ACTION_TYPES } from '../context/deployerReducer';
import { TEMPLATE_IDS, getTemplateDefaults } from '../templates/templateDefinitions';
import { validateDeploymentConfig } from './deploymentMapper';
describe('shipped templates', () => {
  it.each(Object.values(TEMPLATE_IDS))('%s validates cleanly out of the box', (id) => {
    const s = deployerReducer(initialState, { type: ACTION_TYPES.APPLY_TEMPLATE, payload: getTemplateDefaults(id) });
    const st = { ...s, organization: { ...s.organization, name: 'Check', description: 'desc' } };
    const { isValid, errors } = validateDeploymentConfig(st);
    expect(errors).toEqual([]);
    expect(isValid).toBe(true);
  });
});

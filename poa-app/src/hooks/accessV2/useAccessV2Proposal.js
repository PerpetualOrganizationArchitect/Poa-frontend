/**
 * useAccessV2Proposal — submit a governance batch from `lib/accessV2/proposalBuilders`.
 *
 * The builders produce exactly the `{target, value, data}[]` the existing proposal flow already
 * speaks, so this hook is thin on purpose: it wraps the batch as a binding Yes/No proposal
 * (`batches = [batch, []]` — the winning option runs the batch, "No" runs nothing) and hands it to
 * `VotingService.createHybridProposal`, the same path the setter/election/create-role wizards use.
 *
 * SPONSORSHIP CAVEAT (deliberate, do not "fix"): a seed- or cutover-scale batch must NOT go
 * through the sponsored path. Those are the migration ceremonies, they are far outside the
 * rulebook's gas hints, and they are run from a funded EOA per the runbook. Ordinary role-creation
 * proposals are small and go through the normal sponsored flow like any other proposal — this hook
 * therefore refuses anything over `MAX_SPONSORED_CALLS` rather than quietly burning a UserOp.
 */

import { useCallback, useState } from 'react';
import { usePOContext } from '@/context/POContext';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks/useWeb3Services';
import { checkBatchSubmittable, MAX_SPONSORED_CALLS } from '@/lib/accessV2/submission';
import { useOrgAuthority } from './useOrgAuthority';

export { MAX_SPONSORED_CALLS };

export function useAccessV2Proposal() {
  const { votingContractAddress, hybridVotingContractAddress } = usePOContext();
  const { voting } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const authority = useOrgAuthority();
  const [submitting, setSubmitting] = useState(false);

  const votingAddress = votingContractAddress || hybridVotingContractAddress;

  /**
   * @param {object} built - a builder result: `{ batch, summaries, warnings, gasLimit }`
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} [opts.description]
   * @param {number} [opts.durationMinutes=4320] - 3 days
   * @param {string[]} [opts.restrictedSubjectIds] - subject-restricted (exec-only) proposal
   */
  const submit = useCallback(
    async (built, { title, description = '', durationMinutes = 4320, restrictedSubjectIds = [] } = {}) => {
      if (!authority.enabled) {
        return { success: false, error: new Error('This org is not on the new roles system yet.') };
      }
      if (!voting || !votingAddress) {
        return { success: false, error: new Error('We’re still getting things ready — please try again in a moment.') };
      }
      const batch = built?.batch || [];
      const check = checkBatchSubmittable(batch);
      if (!check.ok) return { success: false, error: new Error(check.message) };

      setSubmitting(true);
      try {
        return await executeWithNotification(
          () =>
            voting.createHybridProposal(
              votingAddress,
              {
                name: title,
                description,
                durationMinutes,
                numOptions: 2,
                optionNames: ['Yes', 'No'],
                // "Yes" runs the batch; "No" runs nothing.
                batches: [batch, []],
                actionSummaries: built?.summaries || [],
                hatIds: restrictedSubjectIds || [],
              },
              // The winning batch executes inside announceWinner's try/catch, which prices only
              // the caught-failure path. Carry the builder's floor through.
              built?.gasLimit ? { gasLimit: built.gasLimit } : {}
            ),
          {
            pendingMessage: 'Creating proposal...',
            successMessage: 'Proposal created',
            errorMessage: 'Could not create the proposal',
            refreshEvent: 'proposal:created',
          }
        );
      } finally {
        setSubmitting(false);
      }
    },
    [authority.enabled, voting, votingAddress, executeWithNotification]
  );

  return { submit, submitting, enabled: authority.enabled && Boolean(votingAddress) };
}

export default useAccessV2Proposal;

/**
 * CreateRoleWizard — /team's door to "make a new role or group", as ONE governance proposal.
 *
 * A SHELL, deliberately: the modal, the submit button and the "what happens next" copy live here;
 * every decision lives in `RoleForm`, which the Create-a-Vote wizard renders too. That is the
 * point. Before this, /team's version could not set vouching, per-project task permissions or a
 * vote in binding votes, and the voting wizard's version could not make a group — so which door a
 * member happened to use decided what their role could do. One form, one encoder
 * (`lib/accessV2/roleFormBatch`), one answer.
 *
 * What is left here is only what a shell owes the member:
 *   • the batch is BUILT here, from the same pure encoder the form previews, and submitted through
 *     `useAccessV2Proposal` (which refuses anything over the on-chain 20-call ceiling rather than
 *     burning a UserOp on a `TooManyCalls` revert);
 *   • the submit button is gated on `roleFormError` — the same gate the vote wizard's step machine
 *     uses — so the two doors cannot disagree about whether a form is ready.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  HStack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import { useProjectContext } from '@/context/ProjectContext';
import { useVotingContext } from '@/context/VotingContext';
import {
  ROLE_FORM_KIND,
  buildRoleFormBatch,
  defaultRoleForm,
  roleFormCopy,
  roleFormError,
} from '@/lib/accessV2/roleFormBatch';
import { useAuthoritySubjects, useAuthorityMemberships, useAccessV2Proposal } from '@/hooks/accessV2';
import RoleForm from './RoleForm';

export default function CreateRoleWizard({ isOpen, onClose, activeProposals = [] }) {
  const { indexedSubjects, roles, groups, authority } = useAuthoritySubjects();
  const { inOrgUsers } = useAuthorityMemberships();
  const { submit, submitting } = useAccessV2Proposal();
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();
  const { projectsData } = useProjectContext() || {};
  const { votingClasses } = useVotingContext() || {};
  const { votingContractAddress, hybridVotingContractAddress, taskManagerContractAddress } = usePOContext();

  const [form, setForm] = useState(defaultRoleForm);

  const isGroup = form.kind === ROLE_FORM_KIND.GROUP;

  /**
   * Everything the form needs to describe the org back to the member — and everything the encoder
   * needs to predict the new subject's id. `inOrgUsers` mirrors the contract's own `_isInOrg`
   * (accepted ANYWHERE, eligibility irrelevant), which is what decides ADDED vs INVITED; an
   * accepted-but-lapsed member is in-org on chain, so offering them an invitation would be wrong.
   */
  const ctx = useMemo(() => ({
    authority: authority?.address || '',
    hybridVoting: votingContractAddress || hybridVotingContractAddress || '',
    taskManagerAddress: taskManagerContractAddress || '',
    indexedSubjects: indexedSubjects || [],
    roles: roles || [],
    groups: groups || [],
    projects: projectsData || [],
    votingClasses: votingClasses || [],
    inOrgUsers: inOrgUsers || new Set(),
    activeProposals,
  }), [
    authority?.address, votingContractAddress, hybridVotingContractAddress, taskManagerContractAddress,
    indexedSubjects, roles, groups, projectsData, votingClasses, inOrgUsers, activeProposals,
  ]);

  const formError = roleFormError(form);

  const built = useMemo(() => {
    if (formError || !ctx.authority) return null;
    try {
      return buildRoleFormBatch({ ...ctx, form });
    } catch {
      return null;
    }
  }, [ctx, form, formError]);

  const close = () => {
    setForm(defaultRoleForm());
    onClose?.();
  };

  const onSubmit = async () => {
    if (!built) return;
    // The description is the subject's on-chain metadata (`createRole`/`createGroup` take the
    // CID), so it is uploaded FIRST and the batch rebuilt with it — exactly what the vote wizard
    // does (useProposalForm). Before this, the same form on this door threw the paragraph away.
    let metadataCID = null;
    if (String(form.description || '').trim()) {
      try {
        const result = await addToIpfs(JSON.stringify({
          name: form.name || '',
          description: form.description || '',
        }));
        if (result?.path) metadataCID = ipfsCidToBytes32(result.path);
      } catch (err) {
        console.error('[CreateRoleWizard] metadata IPFS upload failed:', err);
        toast({
          title: 'Could not save the description',
          description: 'The upload to IPFS failed. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        return;
      }
    }
    const finalBuilt = metadataCID ? buildRoleFormBatch({ ...ctx, form, metadataCID }) : built;
    const copy = roleFormCopy(form);
    const res = await submit(finalBuilt, {
      title: copy.title,
      // The same sentence the vote wizard writes; the enactment lines travel as actionSummaries.
      description: copy.description || finalBuilt.summaries.join('\n'),
    });
    if (res?.success) close();
  };

  const blockedReason = formError
    || (!ctx.authority ? 'Still loading this group’s roles — give it a moment.' : null)
    || (built && !built.submittable.ok ? built.submittable.message : null);

  return (
    <Modal isOpen={isOpen} onClose={close} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="white" borderRadius="2xl">
        <ModalHeader color="warmGray.900">
          Create a role or group
          <Text fontSize="sm" color="warmGray.500" fontWeight="normal" mt={1}>
            It opens a vote — the {isGroup ? 'group' : 'role'} exists once that vote passes.
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={2}>
          <RoleForm value={form} onChange={setForm} ctx={ctx} variant="light" />
        </ModalBody>

        <ModalFooter>
          <HStack w="full" justify="space-between">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            {/* The REASON is never in a tooltip: a disabled Chakra button swallows pointer
                events, so the explanation would be unreachable. RoleForm renders it inline on
                the step that owns the answer, which is also where it can be fixed. */}
            <HStack spacing={3}>
              {blockedReason && (
                <Text fontSize="xs" color="warmGray.500" maxW="300px" textAlign="right">
                  {blockedReason}
                </Text>
              )}
              <Button
                colorScheme="coral"
                onClick={onSubmit}
                isLoading={submitting}
                isDisabled={!built || Boolean(blockedReason)}
                data-testid="role-form-submit"
              >
                Open the vote
              </Button>
            </HStack>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

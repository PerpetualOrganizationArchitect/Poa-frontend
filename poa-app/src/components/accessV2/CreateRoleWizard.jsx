/**
 * CreateRoleWizard — "make a new role" as ONE governance proposal.
 *
 * Four steps: Basics -> Group -> Permissions -> People, then a review that spells out every call
 * the batch will make and every warning the builder raised.
 *
 * The things this screen is careful about, because the contract is:
 *   • GRANT vs OFFER. Someone already in the org is ADDED; anyone else is INVITED and accepts it
 *     themselves. `grant` on an out-of-org address does NOT revert — the contract writes the rule
 *     and emits RoleOffered instead of flipping acceptance — so getting this wrong does not break
 *     the batch, it silently turns "Added" into "invitation pending". The badge and the summary
 *     would then describe something that did not happen, which is why the classification comes
 *     from the fold mirror (the contract's own `_isInOrg`: accepted anywhere), never from a guess.
 *   • STICKY. "Only a vote can change this" locks the seat to governance forever and survives
 *     resignation. It is the right default for an election result and the wrong one for everything
 *     else, so it is off by default and explained inline.
 *   • The id-prediction race. Another open role/group proposal executing first shifts the new
 *     subject's id and every permission in this batch lands on the wrong role.
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
  VStack,
  HStack,
  Text,
  Input,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  NumberInput,
  NumberInputField,
  Alert,
  AlertIcon,
  Box,
  Badge,
  Radio,
  RadioGroup,
  Stack,
  IconButton,
  Divider,
  Progress,
  Tag,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import PermissionPicker from './PermissionPicker';
import { STICKY_COPY } from '@/lib/accessV2/rules';
import { predictLints, LINT_COPY } from '@/lib/accessV2/vouch';
import { buildCreateRoleBatch } from '@/lib/accessV2/proposalBuilders';
import { useAuthoritySubjects, useAuthorityMemberships, useAccessV2Proposal } from '@/hooks/accessV2';

const STEPS = ['Basics', 'Group', 'Permissions', 'People', 'Review'];

const emptyHolder = () => ({ address: '', sticky: false });

export default function CreateRoleWizard({ isOpen, onClose, activeProposals = [] }) {
  const { indexedSubjects, groups, authority } = useAuthoritySubjects();
  const { inOrgUsers } = useAuthorityMemberships();
  const { submit, submitting } = useAccessV2Proposal();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [imageURI, setImageURI] = useState('');
  const [limited, setLimited] = useState(false);
  const [maxMembers, setMaxMembers] = useState(5);
  const [openRole, setOpenRole] = useState(false);
  const [groupIds, setGroupIds] = useState([]);
  const [perms, setPerms] = useState({});
  const [holders, setHolders] = useState([]);

  /**
   * Addresses already in the org — the grant-vs-offer decision, from the fold mirror.
   * `inOrgUsers` mirrors the contract's `_isInOrg` (accepted ANYWHERE, eligibility irrelevant),
   * not "currently an active member": an accepted-but-lapsed member is in-org on chain, and
   * offering them an invitation they have to accept would be wrong.
   */
  const inOrg = inOrgUsers || new Set();

  const built = useMemo(() => {
    if (!name.trim() || !authority?.address) return null;
    try {
      return buildCreateRoleBatch({
        authority: authority.address,
        existingSubjects: indexedSubjects,
        activeProposals,
        config: {
          name: name.trim(),
          imageURI,
          maxMembers: limited ? Number(maxMembers) || 0 : 0,
          defaultAllow: openRole,
          groupIds,
          perms,
          initialHolders: holders
            .filter((h) => /^0x[0-9a-fA-F]{40}$/.test(h.address))
            .map((h) => ({
              address: h.address,
              inOrg: inOrg.has(h.address.toLowerCase()),
              sticky: h.sticky,
            })),
        },
      });
    } catch {
      return null;
    }
  }, [name, imageURI, limited, maxMembers, openRole, groupIds, perms, holders, indexedSubjects, activeProposals, authority, inOrg]);

  const lints = useMemo(
    () =>
      predictLints({
        defaultAllow: openRole,
        maxMembers: limited ? Number(maxMembers) : 0,
        hasStrongPerms: Object.values(perms).some(Boolean),
      }),
    [openRole, limited, maxMembers, perms]
  );

  const reset = () => {
    setStep(0); setName(''); setImageURI(''); setLimited(false); setMaxMembers(5);
    setOpenRole(false); setGroupIds([]); setPerms({}); setHolders([]);
  };

  const close = () => { reset(); onClose?.(); };

  const onSubmit = async () => {
    if (!built) return;
    const res = await submit(built, {
      title: `Create the role “${name.trim()}”`,
      description: built.summaries.join('\n'),
    });
    if (res?.success) close();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="white" borderRadius="2xl">
        <ModalHeader color="warmGray.900">
          Create a role
          <Progress
            value={((step + 1) / STEPS.length) * 100}
            size="xs"
            colorScheme="coral"
            mt={3}
            borderRadius="full"
          />
          <Text fontSize="sm" color="warmGray.500" fontWeight="normal" mt={2}>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          {step === 0 && (
            <VStack align="stretch" spacing={5}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stewards" />
              </FormControl>

              <FormControl>
                <FormLabel>Image</FormLabel>
                <Input value={imageURI} onChange={(e) => setImageURI(e.target.value)} placeholder="ipfs://… (optional)" />
              </FormControl>

              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <FormLabel mb={0}>Anyone in the org can join</FormLabel>
                  <FormHelperText mt={0}>
                    Open roles need no invitation — people add themselves. Leave this off for a titled role.
                  </FormHelperText>
                </Box>
                <Switch isChecked={openRole} onChange={(e) => setOpenRole(e.target.checked)} colorScheme="coral" />
              </FormControl>

              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <FormLabel mb={0}>Limit the number of seats</FormLabel>
                  <FormHelperText mt={0}>Off means unlimited.</FormHelperText>
                </Box>
                <Switch isChecked={limited} onChange={(e) => setLimited(e.target.checked)} colorScheme="coral" />
              </FormControl>

              {limited && (
                <NumberInput min={1} value={maxMembers} onChange={(v) => setMaxMembers(v)}>
                  <NumberInputField />
                </NumberInput>
              )}

              {lints.map((l) => (
                <Alert key={l.code} status="warning" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  {l.message || LINT_COPY[l.code]}
                </Alert>
              ))}
            </VStack>
          )}

          {step === 1 && (
            <VStack align="stretch" spacing={4}>
              <Text color="warmGray.600" fontSize="sm">
                Groups bundle permissions. A role in a group gets everything the group gives — and
                when the group changes, every role in it changes at once.
              </Text>
              {groups.length === 0 ? (
                <Alert status="info" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  This org has no groups yet. You can add this role to one later.
                </Alert>
              ) : (
                <Wrap>
                  {groups.map((g) => {
                    const on = groupIds.includes(g.subjectId);
                    return (
                      <WrapItem key={g.subjectId}>
                        <Tag
                          size="lg"
                          cursor="pointer"
                          colorScheme={on ? 'coral' : 'gray'}
                          variant={on ? 'solid' : 'subtle'}
                          onClick={() =>
                            setGroupIds((prev) =>
                              on ? prev.filter((id) => id !== g.subjectId) : [...prev, g.subjectId]
                            )
                          }
                        >
                          {g.name}
                        </Tag>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              )}
            </VStack>
          )}

          {step === 2 && (
            <VStack align="stretch" spacing={4}>
              <Text color="warmGray.600" fontSize="sm">
                What this role can do. Anything the role’s groups already give is on top of this.
              </Text>
              <PermissionPicker value={perms} onChange={setPerms} />
            </VStack>
          )}

          {step === 3 && (
            <VStack align="stretch" spacing={4}>
              <Text color="warmGray.600" fontSize="sm">
                Who holds it from day one. People already in the org are added directly; anyone else
                gets an invitation they accept themselves.
              </Text>

              {holders.map((h, i) => {
                const valid = /^0x[0-9a-fA-F]{40}$/.test(h.address);
                const known = valid && inOrg.has(h.address.toLowerCase());
                return (
                  <Box key={i} borderWidth="1px" borderColor="warmGray.100" borderRadius="lg" p={3}>
                    <HStack>
                      <Input
                        size="sm"
                        placeholder="0x…"
                        value={h.address}
                        onChange={(e) =>
                          setHolders((prev) => prev.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))
                        }
                      />
                      {valid && (
                        <Badge colorScheme={known ? 'green' : 'purple'}>{known ? 'Added' : 'Invited'}</Badge>
                      )}
                      <IconButton
                        aria-label="Remove"
                        size="sm"
                        variant="ghost"
                        icon={<FiTrash2 />}
                        onClick={() => setHolders((prev) => prev.filter((_, j) => j !== i))}
                      />
                    </HStack>
                    <RadioGroup
                      mt={3}
                      value={h.sticky ? 'sticky' : 'delegable'}
                      onChange={(v) =>
                        setHolders((prev) => prev.map((x, j) => (j === i ? { ...x, sticky: v === 'sticky' } : x)))
                      }
                    >
                      <Stack spacing={2}>
                        {['delegable', 'sticky'].map((mode) => (
                          <Radio key={mode} value={mode} colorScheme="coral" alignItems="flex-start">
                            <VStack align="start" spacing={0} ml={1}>
                              <Text fontSize="sm" fontWeight="medium">{STICKY_COPY[mode].label}</Text>
                              <Text fontSize="xs" color="warmGray.500">{STICKY_COPY[mode].help}</Text>
                            </VStack>
                          </Radio>
                        ))}
                      </Stack>
                    </RadioGroup>
                  </Box>
                );
              })}

              <Button leftIcon={<FiPlus />} size="sm" variant="outline" onClick={() => setHolders((p) => [...p, emptyHolder()])}>
                Add someone
              </Button>
            </VStack>
          )}

          {step === 4 && (
            <VStack align="stretch" spacing={4}>
              {built ? (
                <>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="warmGray.500" textTransform="uppercase" mb={2}>
                      If this passes
                    </Text>
                    <VStack align="stretch" spacing={1}>
                      {built.summaries.map((s, i) => (
                        <Text key={i} fontSize="sm" color="warmGray.700">• {s}</Text>
                      ))}
                    </VStack>
                  </Box>
                  <Divider borderColor="warmGray.100" />
                  {built.warnings.map((w, i) => (
                    <Alert key={i} status="warning" borderRadius="md" fontSize="sm">
                      <AlertIcon />
                      {w}
                    </Alert>
                  ))}
                  <Text fontSize="xs" color="warmGray.500">
                    {built.batch.length} step{built.batch.length === 1 ? '' : 's'} in one proposal.
                  </Text>
                </>
              ) : (
                <Alert status="error" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  Give the role a name before proposing it.
                </Alert>
              )}
            </VStack>
          )}
        </ModalBody>

        <ModalFooter>
          <HStack w="full" justify="space-between">
            <Button variant="ghost" onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                colorScheme="coral"
                onClick={() => setStep((s) => s + 1)}
                isDisabled={step === 0 && !name.trim()}
              >
                Next
              </Button>
            ) : (
              <Button colorScheme="coral" onClick={onSubmit} isLoading={submitting} isDisabled={!built}>
                Open the vote
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

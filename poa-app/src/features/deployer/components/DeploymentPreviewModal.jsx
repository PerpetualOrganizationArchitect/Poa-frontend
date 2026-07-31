/**
 * DeploymentPreviewModal - shows the simulated deployment before the real send.
 *
 * Rendered after a read-only simulation of deployFullOrg succeeds. Surfaces the
 * decoded config (incl. the new taskManagerPerms / ddInitialTargets / bootstrap)
 * and the predicted module addresses returned by the dry-run. No transaction has
 * been sent yet — the user confirms or cancels here.
 */

import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
  VStack,
  HStack,
  Box,
  Badge,
  Divider,
  SimpleGrid,
  Icon,
  Tag,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { PiCheckCircle } from 'react-icons/pi';
import { TaskPermission, hasPermission } from '@/util/permissions';

const MASK_LABELS = [
  { bit: TaskPermission.CREATE, label: 'Create' },
  { bit: TaskPermission.CLAIM, label: 'Claim' },
  { bit: TaskPermission.REVIEW, label: 'Review' },
  { bit: TaskPermission.ASSIGN, label: 'Assign' },
  { bit: TaskPermission.SELF_REVIEW, label: 'Self-Review' },
  { bit: TaskPermission.BUDGET, label: 'Budget' },
  { bit: TaskPermission.EDIT_META, label: 'Edit Meta' },
  { bit: TaskPermission.EDIT_FULL, label: 'Edit Full' },
];

const PREDICTED_MODULES = [
  ['executor', 'Executor'],
  ['hybridVoting', 'Hybrid Voting'],
  ['directDemocracyVoting', 'Direct Democracy'],
  ['quickJoin', 'Quick Join'],
  ['participationToken', 'Participation Token'],
  ['taskManager', 'Task Manager'],
  ['educationHub', 'Education Hub'],
  ['paymentManager', 'Payment Manager'],
  ['eligibilityModule', 'Eligibility'],
  ['zkEmailInvites', 'Email Invites'],
];

const short = (a) => (a && typeof a === 'string' && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const toNum = (v) => {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (v.toNumber) { try { return v.toNumber(); } catch { return Number(v.toString()); } }
  return Number(v.toString());
};
const isZeroAddr = (a) => !a || /^0x0+$/.test(a);

function Row({ label, children }) {
  return (
    <HStack justify="space-between" align="start" spacing={4}>
      <Text fontSize="sm" color="warmGray.500" minW="120px">{label}</Text>
      <Box flex="1" textAlign="right">{children}</Box>
    </HStack>
  );
}

export function DeploymentPreviewModal({ data, onConfirm, onCancel }) {
  const isOpen = !!data;
  if (!isOpen) return null;

  const { orgName, isPasskey, deployerAddress, networkName, fundingEth, params, predicted, zkEmailInvitesEnabled } = data;
  const roles = params?.roles || [];
  const tmp = params?.taskManagerPerms || { roleIndices: [], masks: [] };
  const tmpEntries = (tmp.roleIndices || []).map((ri, i) => ({
    roleIndex: toNum(ri),
    mask: toNum(tmp.masks?.[i]),
  }));
  const ddTargets = params?.ddInitialTargets || [];
  const projects = params?.bootstrap?.projects || [];
  const tasks = params?.bootstrap?.tasks || [];

  const metaAdminIdx = toNum(params?.metadataAdminRoleIndex);
  const metaAdminLabel = Number.isFinite(metaAdminIdx) && metaAdminIdx < roles.length
    ? (roles[metaAdminIdx]?.name || `Role ${metaAdminIdx}`)
    : 'Governance only';

  return (
    // zIndex must clear the ReviewStep DeploymentOverlay (zIndex 9999), which is
    // visible while this modal awaits confirmation — otherwise it intercepts the
    // Confirm/Cancel clicks and the deploy hangs.
    <Modal isOpen={isOpen} onClose={onCancel} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay zIndex={10000} />
      <ModalContent containerProps={{ zIndex: 10001 }}>
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={PiCheckCircle} color="green.500" />
            <Text>Review &amp; confirm deployment</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Alert status="success" borderRadius="md" fontSize="sm">
              <AlertIcon />
              Simulated successfully — this is a read-only dry run. No transaction has been sent yet.
            </Alert>

            <VStack align="stretch" spacing={2}>
              <Row label="Organization"><Text fontWeight="600">{orgName}</Text></Row>
              <Row label="Network"><Text>{networkName}</Text></Row>
              <Row label="Deployer">
                <Text fontFamily="mono" fontSize="sm">{short(deployerAddress)}</Text>
                <Badge ml={2} colorScheme={isPasskey ? 'purple' : 'blue'}>{isPasskey ? 'Passkey' : 'Wallet'}</Badge>
              </Row>
              <Row label="Roles"><Text>{roles.length}</Text></Row>
              <Row label="Voting classes"><Text>{(params?.hybridClasses || []).length}</Text></Row>
              <Row label="Metadata admin"><Text>{metaAdminLabel}</Text></Row>
              {Number(fundingEth) > 0 && (
                <Row label="Paymaster funding"><Text>{fundingEth} (native)</Text></Row>
              )}
            </VStack>

            {/* New deploy-time config */}
            {(tmpEntries.length > 0 || ddTargets.length > 0 || projects.length > 0 || tasks.length > 0) && (
              <>
                <Divider />
                <VStack align="stretch" spacing={3}>
                  {tmpEntries.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="600" mb={1}>Org-wide task permissions</Text>
                      <VStack align="stretch" spacing={1}>
                        {tmpEntries.map(({ roleIndex, mask }) => (
                          <HStack key={roleIndex} align="start" spacing={2} flexWrap="wrap">
                            <Text fontSize="sm" color="warmGray.600" minW="100px">
                              {roles[roleIndex]?.name || `Role ${roleIndex}`}:
                            </Text>
                            <HStack flexWrap="wrap" spacing={1}>
                              {MASK_LABELS.filter((m) => hasPermission(mask, m.bit)).map((m) => (
                                <Tag key={m.label} size="sm" colorScheme="purple">{m.label}</Tag>
                              ))}
                            </HStack>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  )}
                  {ddTargets.length > 0 && (
                    <Row label="DD targets"><Text>{ddTargets.length} contract(s) whitelisted</Text></Row>
                  )}
                  {(projects.length > 0 || tasks.length > 0) && (
                    <Row label="Initial work"><Text>{projects.length} project(s), {tasks.length} task(s)</Text></Row>
                  )}
                </VStack>
              </>
            )}

            {/* Predicted module addresses from the simulation */}
            {predicted && (
              <>
                <Divider />
                <Box>
                  <Text fontSize="sm" fontWeight="600" mb={2}>Predicted contracts</Text>
                  <SimpleGrid columns={2} spacingX={4} spacingY={1}>
                    {PREDICTED_MODULES.map(([key, label]) => {
                      const addr = predicted[key];
                      if (isZeroAddr(addr)) return null;
                      return (
                        <HStack key={key} justify="space-between">
                          <Text fontSize="xs" color="warmGray.500">{label}</Text>
                          <Text fontSize="xs" fontFamily="mono">{short(addr)}</Text>
                        </HStack>
                      );
                    })}
                  </SimpleGrid>
                  {zkEmailInvitesEnabled && !isZeroAddr(predicted.zkEmailInvites) && (
                    <Text fontSize="xs" color="warmGray.500" mt={2}>
                      Email Invites will be deployed, but its invite list starts empty — nobody can
                      claim a role by email until you add domains or addresses in Settings and
                      activate the list with a governance vote.
                    </Text>
                  )}
                </Box>
              </>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onCancel}>Cancel</Button>
          <Button colorScheme="purple" onClick={onConfirm}>Confirm &amp; Deploy</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default DeploymentPreviewModal;

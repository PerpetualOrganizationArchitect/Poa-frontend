/**
 * FolderTreeEditor
 *
 * Edit-mode for the folder tree. Renders the tree as a list with per-row
 * controls (rename, add child, delete, reparent via dropdown), plus a
 * project assignment picker. Save pins JSON to IPFS and calls setFolders
 * CAS-guarded against the root the doc was loaded from.
 *
 * On FoldersRootStale: opens a conflict modal showing the current on-chain
 * tree vs the user's pending edits. The user can discard their edits and
 * start over (MVP). Auto-merge intentionally deferred per spec.
 */

import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Input,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Alert,
  AlertIcon,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Divider,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';

import { useIPFScontext } from '@/context/ipfsContext';
import { useWeb3 } from '@/hooks';
import { usePOContext } from '@/context/POContext';
import { useProjectContext } from '@/context/ProjectContext';
import { ipfsCidToBytes32, parseProjectId } from '@/services/web3/utils/encoding';
import { inputStyles } from '@/components/shared/glassStyles';

import { validateFolderDoc, FOLDERS_SCHEMA_VERSION } from '@/lib/folders/schema';
import {
  computeSortOrder,
  descendantsOf,
  generateFolderId,
  moveProject,
  unassignedProjectIds,
} from '@/lib/folders/tree';
import { parseFoldersRootStale } from '@/lib/folders/cas';
import { useRefreshEmit, RefreshEvent } from '@/context/RefreshContext';
import FolderTreeView from './FolderTreeView';
import OrganizerHatAdminPanel from './OrganizerHatAdminPanel';
import { useFolderDoc } from './useFolderDoc';

// Dark glass shell — matches AddTaskModal so the editor doesn't look like
// a stray light Chakra modal grafted into the sidebar context.
const modalGlassStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(15, 10, 25, 0.97)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const selectStyles = {
  ...inputStyles,
  sx: {
    '& option': {
      bg: 'gray.800',
      color: 'white',
    },
  },
};

function FolderRow({ folder, allFolders, projectsByPid, depth, onChange, onDelete }) {
  const disallowed = useMemo(() => descendantsOf(allFolders, folder.id), [allFolders, folder.id]);
  const candidates = allFolders.filter((f) => !disallowed.has(f.id));

  return (
    <Box
      pl={depth * 4 + 3}
      py={2.5}
      borderBottom="1px solid"
      borderColor="whiteAlpha.100"
      borderLeft="3px solid"
      borderLeftColor="purple.400"
      borderRadius="md"
      bg="whiteAlpha.50"
      mb={1.5}
    >
      <HStack align="flex-start" spacing={2}>
        <Input
          size="sm"
          value={folder.name}
          placeholder="Folder name"
          onChange={(e) =>
            onChange({ ...folder, name: e.target.value })
          }
          maxW="240px"
          {...inputStyles}
        />
        <Select
          size="sm"
          value={folder.parentId ?? ''}
          maxW="220px"
          onChange={(e) => {
            const next = e.target.value === '' ? null : e.target.value;
            // Recompute sortOrder among NEW siblings so the move lands at the end.
            const newSiblings = allFolders
              .filter((f) => f.parentId === next && f.id !== folder.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const newSort = computeSortOrder(newSiblings, newSiblings.length);
            onChange({ ...folder, parentId: next, sortOrder: newSort });
          }}
          {...selectStyles}
        >
          <option value="">(top level)</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.id.slice(0, 10)}
            </option>
          ))}
        </Select>

        <Tooltip label="Delete folder">
          <IconButton
            aria-label="Delete folder"
            size="sm"
            icon={<DeleteIcon />}
            variant="ghost"
            colorScheme="red"
            onClick={() => onDelete(folder.id)}
          />
        </Tooltip>
      </HStack>

      {/* Project assignments for this folder — folder.projectIds is bytes32,
          projectsByPid gives us the rich project record for display. */}
      {(folder.projectIds || []).length > 0 && (
        <Wrap mt={2} spacing={2}>
          {(folder.projectIds || []).map((pid) => {
            const proj = projectsByPid.get(pid);
            return (
              <WrapItem key={pid}>
                <Tag size="sm" colorScheme="blue" borderRadius="full" variant="subtle">
                  <TagLabel>{proj?.name || pid.slice(0, 10) + '…'}</TagLabel>
                  <TagCloseButton
                    onClick={() =>
                      onChange({
                        ...folder,
                        projectIds: (folder.projectIds || []).filter((p) => p !== pid),
                      })
                    }
                  />
                </Tag>
              </WrapItem>
            );
          })}
        </Wrap>
      )}
    </Box>
  );
}

export default function FolderTreeEditor({
  isOpen,
  onClose,
  foldersRoot,
  organizerHatIds = [],
}) {
  const toast = useToast();
  const { addToIpfs } = useIPFScontext();
  const { task: taskService, executeWithNotification } = useWeb3();
  const { taskManagerContractAddress } = usePOContext();
  // ProjectContext exposes the list as `projectsData`; alias it to a saner
  // local name and build a bytes32-keyed view so we can interop with the
  // canonical project-id form used by folder.projectIds (per spec).
  const { projectsData: projects = [] } = useProjectContext() || {};
  const { emit } = useRefreshEmit();

  // bytes32 id → project. The subgraph entity id is
  // `{taskManager}-{bytes32}`; the spec wants raw bytes32 in folder
  // assignments. Normalizing here lets the rest of the modal speak
  // bytes32 throughout.
  const projectsByPid = useMemo(() => {
    const m = new Map();
    for (const p of projects) m.set(parseProjectId(p.id), p);
    return m;
  }, [projects]);

  const { doc: loadedDoc, loading, error, loadedRoot } = useFolderDoc(foldersRoot);

  // Working copy of folder state. Initialised from the loaded doc each time
  // the modal opens so re-opens always start from the latest on-chain root.
  const [folders, setFolders] = useState([]);
  const [savingError, setSavingError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null); // { actualRoot, theirDoc }

  React.useEffect(() => {
    if (isOpen) {
      // Normalize project ids to bytes32 on load. Any pre-fix folder docs
      // pinned with composite ids get silently migrated on the next save.
      setFolders(
        (loadedDoc?.folders || []).map((f) => ({
          ...f,
          projectIds: (f.projectIds || []).map((pid) => parseProjectId(pid)),
        }))
      );
      setSavingError(null);
      setConflict(null);
      setSaving(false);
    }
  }, [isOpen, loadedDoc]);

  const updateFolder = (next) =>
    setFolders((prev) => prev.map((f) => (f.id === next.id ? next : f)));

  const addFolder = (parentId = null) => {
    const siblings = folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const sortOrder = computeSortOrder(siblings, siblings.length);
    const newFolder = {
      id: generateFolderId(),
      name: '',
      parentId,
      sortOrder,
      projectIds: [],
    };
    setFolders((prev) => [...prev, newFolder]);
  };

  const deleteFolder = (folderId) => {
    // Drops the entire subtree. Users who want to keep children should
    // reparent them first; we don't auto-promote because that would silently
    // change the parent association of unrelated rows.
    const toRemove = descendantsOf(folders, folderId);
    setFolders((prev) => prev.filter((f) => !toRemove.has(f.id)));
  };

  const handleAssignProject = (folderId, projectId) => {
    setFolders((prev) => moveProject(prev, projectId, folderId));
  };

  const dirty = useMemo(() => {
    const a = JSON.stringify(loadedDoc?.folders || []);
    const b = JSON.stringify(folders);
    return a !== b;
  }, [loadedDoc, folders]);

  // Folder.projectIds and the unassigned check both operate on bytes32 ids.
  // The subgraph hands us composite ids — normalize once and stay in
  // bytes32 land from here down.
  const allProjectPids = useMemo(
    () => projects.map((p) => parseProjectId(p.id)),
    [projects]
  );
  const unassigned = useMemo(
    () => unassignedProjectIds(folders, allProjectPids),
    [folders, allProjectPids]
  );

  const handleSave = async () => {
    if (saving) return; // double-click guard
    setSavingError(null);
    setConflict(null);

    const docToPin = { schemaVersion: FOLDERS_SCHEMA_VERSION, folders };
    const { valid, errors } = validateFolderDoc(docToPin);
    if (!valid) {
      setSavingError(new Error(errors.join(' ')));
      return;
    }

    if (!taskService || !taskManagerContractAddress) {
      setSavingError(new Error('Still getting things ready — give it a moment, then try again.'));
      return;
    }
    if (loadedRoot === null) {
      // Defensive: prop is set but IPFS fetch hasn't populated loadedRoot yet.
      // Saving with a wrong expected root would just trigger CAS — but the
      // user would see a misleading "conflict" when really we just hadn't
      // finished loading. Block instead.
      setSavingError(new Error('Folder tree is still loading — wait a moment and retry.'));
      return;
    }

    setSaving(true);
    let newRoot;
    try {
      const pinResult = await addToIpfs(JSON.stringify(docToPin));
      newRoot = ipfsCidToBytes32(pinResult.path);
    } catch (e) {
      setSaving(false);
      setSavingError(e);
      return;
    }

    const result = await executeWithNotification(
      () => taskService.setFolders(taskManagerContractAddress, loadedRoot, newRoot),
      {
        pendingMessage: 'Publishing folder tree...',
        successMessage: 'Folder tree updated.',
        refreshEvent: RefreshEvent.FOLDERS_UPDATED,
      }
    );
    setSaving(false);

    if (result?.success) {
      onClose();
      return;
    }

    // Distinguish CAS staleness from other failures.
    const stale = parseFoldersRootStale(result?.error);
    if (stale) {
      try {
        const actualRoot = stale.actual || (await taskService.readFoldersRoot(taskManagerContractAddress));
        setConflict({ actualRoot });
      } catch (e) {
        setConflict({ actualRoot: null });
        setSavingError(e);
      }
      return;
    }

    setSavingError(result?.error || new Error('Failed to publish folder tree.'));
  };

  const handleDiscardAndReload = () => {
    setConflict(null);
    // Force the parent page (and any other listeners) to re-pull the latest
    // on-chain root. Without this, re-opening the editor would re-collide
    // with the same stale `expectedRoot` and CAS would fail again.
    emit(RefreshEvent.FOLDERS_UPDATED, { source: 'cas-discard' });
    onClose();
    toast({
      title: 'Reloaded',
      description: 'Pulled the latest folder tree. Re-open editor to retry your edits.',
      status: 'info',
      duration: 4000,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent bg="transparent" textColor="white">
        <div style={modalGlassStyle} />
        <ModalHeader color="white">Edit folder tree</ModalHeader>
        <ModalCloseButton color="whiteAlpha.700" />
        <ModalBody>
          {loading && <Text color="whiteAlpha.700">Loading current tree...</Text>}
          {error && (
            <Alert status="error" mb={3} borderRadius="md" bg="red.900" color="white">
              <AlertIcon color="red.200" />
              {error.message}
            </Alert>
          )}

          {savingError && (
            <Alert status="error" mb={3} borderRadius="md" bg="red.900" color="white">
              <AlertIcon color="red.200" />
              {savingError.message || String(savingError)}
            </Alert>
          )}

          <VStack align="stretch" spacing={2}>
            <HStack justify="space-between">
              <Text fontSize="sm" color="whiteAlpha.700">
                {folders.length} folder{folders.length === 1 ? '' : 's'} · {unassigned.length} unassigned project{unassigned.length === 1 ? '' : 's'}
              </Text>
              <Button size="sm" leftIcon={<AddIcon />} colorScheme="purple" onClick={() => addFolder(null)}>
                New folder
              </Button>
            </HStack>

            <Divider borderColor="whiteAlpha.200" />

            {folders.length === 0 ? (
              <Box
                py={6}
                px={4}
                borderRadius="md"
                bg="whiteAlpha.50"
                border="1px dashed"
                borderColor="whiteAlpha.200"
                textAlign="center"
              >
                <Text color="whiteAlpha.700" fontSize="sm">
                  No folders yet. Click <b>New folder</b> to start organizing projects.
                </Text>
              </Box>
            ) : (
              folders
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    allFolders={folders}
                    projectsByPid={projectsByPid}
                    depth={0}
                    onChange={updateFolder}
                    onDelete={deleteFolder}
                  />
                ))
            )}

            {projects.length > 0 && folders.length > 0 && (
              <>
                <Divider mt={4} borderColor="whiteAlpha.200" />
                <Text fontWeight="600" fontSize="sm" mt={2} color="white">
                  Assign projects to folders
                </Text>
                <VStack spacing={2} align="stretch">
                  {projects.map((p) => {
                    const pid = parseProjectId(p.id);
                    const currentFolder = folders.find((f) =>
                      (f.projectIds || []).includes(pid)
                    );
                    return (
                      <HStack key={p.id} spacing={2}>
                        <Text fontSize="sm" flex="1" isTruncated color="whiteAlpha.900">
                          {p.name}
                        </Text>
                        <Select
                          size="sm"
                          maxW="240px"
                          value={currentFolder?.id ?? ''}
                          onChange={(e) =>
                            handleAssignProject(e.target.value === '' ? null : e.target.value, pid)
                          }
                          {...selectStyles}
                        >
                          <option value="">(unassigned)</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name || f.id.slice(0, 10)}
                            </option>
                          ))}
                        </Select>
                      </HStack>
                    );
                  })}
                </VStack>
              </>
            )}

            {/* Organizer-hat admin lives in an accordion footer so it
                doesn't dominate the editor but is reachable when needed
                (e.g. an org admin opens the editor to grant a new hat). */}
            <Accordion allowToggle mt={4}>
              <AccordionItem border="1px solid" borderColor="whiteAlpha.150" borderRadius="md">
                <AccordionButton _hover={{ bg: 'whiteAlpha.50' }}>
                  <Box flex="1" textAlign="left">
                    <Text fontSize="sm" fontWeight="600" color="white">
                      Manage organizer hats
                    </Text>
                    <Text fontSize="xs" color="whiteAlpha.600">
                      Who can publish folder updates ({organizerHatIds.length}{' '}
                      hat{organizerHatIds.length === 1 ? '' : 's'} configured)
                    </Text>
                  </Box>
                  <AccordionIcon color="whiteAlpha.700" />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <OrganizerHatAdminPanel organizerHatIds={organizerHatIds} />
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" color="whiteAlpha.800" mr={3} onClick={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            onClick={handleSave}
            isLoading={saving}
            loadingText="Publishing..."
            isDisabled={!dirty || loading || loadedRoot === null}
          >
            Save & publish
          </Button>
        </ModalFooter>

        {/* Conflict modal: another organizer published while you were editing */}
        <Modal isOpen={!!conflict} onClose={() => setConflict(null)} size="2xl">
          <ModalOverlay bg="blackAlpha.800" />
          <ModalContent bg="transparent" textColor="white">
            <div style={modalGlassStyle} />
            <ModalHeader color="white">Folder tree out of date</ModalHeader>
            <ModalCloseButton color="whiteAlpha.700" />
            <ModalBody>
              <Alert status="warning" mb={3} borderRadius="md" bg="orange.900" color="white">
                <AlertIcon color="orange.200" />
                Another organizer published a new folder tree while you were editing.
                Your changes were NOT saved.
              </Alert>
              <Text fontSize="sm" color="whiteAlpha.700" mb={2}>
                Current on-chain tree:
              </Text>
              <Box
                border="1px solid"
                borderColor="whiteAlpha.150"
                borderRadius="md"
                p={2}
                bg="whiteAlpha.50"
              >
                <ConflictView actualRoot={conflict?.actualRoot} />
              </Box>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" color="whiteAlpha.800" mr={3} onClick={() => setConflict(null)}>
                Keep my edits open
              </Button>
              <Button colorScheme="purple" onClick={handleDiscardAndReload}>
                Discard mine & reload
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </ModalContent>
    </Modal>
  );
}

function ConflictView({ actualRoot }) {
  const { doc, loading, error } = useFolderDoc(actualRoot);
  if (loading) return <Text fontSize="sm" color="gray.500">Loading current tree...</Text>;
  if (error) return <Text fontSize="sm" color="red.500">{error.message}</Text>;
  return <FolderTreeView doc={doc} />;
}

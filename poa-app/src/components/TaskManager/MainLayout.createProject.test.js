import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ethers } from 'ethers';
import { TaskService } from '@/services/web3/domain/TaskService';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import MainLayout from '@/components/TaskManager/MainLayout';

const state = vi.hoisted(() => ({ modal: null, roles: ['123'], task: null, notify: null, upload: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('@chakra-ui/icons', () => ({ AddIcon: () => null, TimeIcon: () => null }));
vi.mock('react-dnd', () => ({ DndProvider: ({ children }) => children }));
vi.mock('react-dnd-html5-backend', () => ({ HTML5Backend: {} }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: vi.fn() }) }));
vi.mock('@/components/TaskManager/ProjectSidebar', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/TaskBoard', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/CreateProjectModal', () => ({ default: props => { state.modal = props; return null; } }));
vi.mock('@/components/TaskManager/MobileTopBar', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/ProjectSwitcherDrawer', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/views/AllTasksView', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/views/MyWorkView', () => ({ default: () => null }));
vi.mock('@/components/folders/FolderTreeEditor', () => ({ default: () => null }));
vi.mock('@/components/folders/useFolderDoc', () => ({ useFolderDoc: () => ({ doc: null, loading: false }) }));
vi.mock('@/context/TaskBoardContext', () => ({ TaskBoardProvider: ({ children }) => children }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ projects: [], selectedProject: null }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: state.upload }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: {} }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ accountAddress: '0x' + 'a'.repeat(40) }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ taskManagerContractAddress: '0x' + '1'.repeat(40), roleHatIds: state.roles, creatorHatIds: ['123'] }) }));
vi.mock('@/hooks', () => ({
  useWeb3: () => ({ task: state.task, executeWithNotification: state.notify }),
  useOrgTheme: () => ({}),
  useTaskManagerV4State: () => ({ organizerHatIds: [], loading: false }),
}));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/features/tour', () => ({ useTour: () => ({ isActive: false }) }));

describe('MainLayout project submission through TaskService', () => {
  let execute;
  let createWritable;
  const hash = '0x' + '2'.repeat(64);
  beforeEach(() => {
    state.roles = ['123'];
    state.modal = null;
    execute = vi.fn().mockResolvedValue({ success: true });
    createWritable = vi.fn().mockReturnValue({ address: '0x' + '1'.repeat(40) });
    state.task = new TaskService({ createWritable }, { execute });
    state.notify = vi.fn(async fn => fn());
    state.upload = vi.fn().mockResolvedValue({ path: bytes32ToIpfsCid(hash) });
  });
  const render = () => {
    renderToStaticMarkup(React.createElement(MainLayout));
    expect(state.modal?.onCreateProject).toBeTypeOf('function');
    return state.modal.onCreateProject;
  };

  it.each([['migrated roles', ['123']], ['no legacy roles', []]])('creates a modal project with %s and preserves its configuration', async (_, roles) => {
    state.roles = roles;
    const create = render();
    const cap = ethers.BigNumber.from('12000000000000000000');
    const manager = '0x' + 'a'.repeat(40);
    const bounty = '0x' + 'b'.repeat(40);
    await create({ name: 'A native project', description: 'Keep this description', cap, managers: [manager], createHats: [], claimHats: [], reviewHats: [], assignHats: [], bountyTokens: [bounty], bountyCaps: ['4500000'] });
    expect(state.upload).toHaveBeenCalledWith(JSON.stringify({ description: 'Keep this description' }));
    expect(execute).toHaveBeenCalledTimes(1);
    const [contract, method, [tuple]] = execute.mock.calls[0];
    expect(contract.address).toBe('0x' + '1'.repeat(40));
    expect(method).toBe('createProject');
    expect(ethers.utils.toUtf8String(tuple[0])).toBe('A native project');
    expect(tuple.slice(1)).toEqual([hash, cap, [manager], [], [], [], [], [bounty], ['4500000']]);
    expect(state.notify.mock.calls[0][1].refreshEvent).toBe('project:created');
  });

  it.each([['migrated roles', ['123']], ['no legacy roles', []]])('keeps quick creation usable with %s', async (_, roles) => {
    state.roles = roles;
    await render()('Quick project');
    const tuple = execute.mock.calls[0][2][0];
    expect(ethers.utils.toUtf8String(tuple[0])).toBe('Quick project');
    expect(tuple.slice(1)).toEqual([ethers.constants.HashZero, 0, [], [], [], [], [], [], []]);
    expect(state.upload).not.toHaveBeenCalled();
  });

  it.each(['createHats', 'claimHats', 'reviewHats', 'assignHats'])('rejects explicit retired %s before preparing a transaction', async field => {
    await expect(render()({ name: 'Old draft', [field]: ['123'] })).rejects.toThrow(/membership authority/);
    expect(createWritable).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});

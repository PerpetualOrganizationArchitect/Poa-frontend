/**
 * TaskService
 * Handles Task Manager operations for projects and tasks
 */

import { ethers } from 'ethers';
import TaskManagerABI from '../../../../abi/TaskManagerNew.json';
import {
  stringToBytes,
  stringToBytes32,
  ipfsCidToBytes32,
  parseTaskId,
  parseProjectId,
} from '../utils/encoding';
import {
  requireAddress,
  requireString,
  requireValidPayout,
} from '../utils/validation';
import { getTokenByAddress } from '../../../util/tokens';

/**
 * Run an async mapper over `items` with at most `limit` concurrent in-flight
 * promises, preserving input order in the result. Used to throttle parallel
 * IPFS uploads in createTasksBatch.
 */
async function mapWithConcurrency(items, mapper, limit) {
  const results = new Array(items.length);
  let nextIdx = 0;
  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    worker
  );
  await Promise.all(workers);
  return results;
}

/**
 * TaskService - Project and task management
 */
export class TaskService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {Object} ipfsService - IPFS service for metadata storage
   */
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  // ============================================
  // Project Functions
  // ============================================

  /**
   * Create a new project
   * @param {string} contractAddress - TaskManager contract address
   * @param {Object} projectData - Project data
   * @param {string} projectData.name - Project name
   * @param {string} [projectData.metadataHash=''] - IPFS metadata hash
   * @param {number} [projectData.cap=0] - PT cap (0 = unlimited)
   * @param {string[]} [projectData.managers=[]] - Manager addresses
   * @param {number[]} [projectData.createHats=[]] - Hat IDs for create permission
   * @param {number[]} [projectData.claimHats=[]] - Hat IDs for claim permission
   * @param {number[]} [projectData.reviewHats=[]] - Hat IDs for review permission
   * @param {number[]} [projectData.assignHats=[]] - Hat IDs for assign permission
   * @param {string[]} [projectData.bountyTokens=[]] - Bounty token addresses
   * @param {string[]} [projectData.bountyCaps=[]] - Bounty caps per token (wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createProject(contractAddress, projectData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(projectData.name, 'Project name');

    const {
      name,
      metadataHash = '',
      cap = 0,
      managers = [],
      createHats = [],
      claimHats = [],
      reviewHats = [],
      assignHats = [],
      bountyTokens = [],
      bountyCaps = [],
    } = projectData;

    if ([createHats, claimHats, reviewHats, assignHats].some(ids => ids.length > 0)) {
      throw new Error('Project role permissions must be configured through the membership authority.');
    }
    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const titleBytes = stringToBytes(name);
    const metaHash = metadataHash ? ipfsCidToBytes32(metadataHash) : ethers.constants.HashZero;

    // Contract expects a single struct tuple (BootstrapProjectConfig)
    const projectStruct = [
      titleBytes,
      metaHash,
      cap,
      managers,
      createHats,
      claimHats,
      reviewHats,
      assignHats,
      bountyTokens,
      bountyCaps,
    ];

    return this.txManager.execute(
      contract,
      'createProject',
      [projectStruct],
      options
    );
  }

  /**
   * Delete a project
   * @param {string} contractAddress - TaskManager contract address
   * @param {string} projectId - Project ID (bytes32 or string)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async deleteProject(contractAddress, projectId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);

    return this.txManager.execute(
      contract,
      'deleteProject',
      [pid],
      { ...options, isDelete: true }
    );
  }

  // ============================================
  // Task Functions
  // ============================================

  /**
   * Create a new task
   * @param {string} contractAddress - TaskManager contract address
   * @param {Object} taskData - Task data
   * @param {number} taskData.payout - Payout amount
   * @param {string} taskData.name - Task name
   * @param {string} taskData.description - Task description
   * @param {string} taskData.projectId - Project ID (bytes32 or string)
   * @param {string} [taskData.location=''] - Task location
   * @param {string} [taskData.difficulty='medium'] - Task difficulty
   * @param {number} [taskData.estHours=0] - Estimated hours
   * @param {string} [taskData.bountyToken=AddressZero] - Bounty token address
   * @param {number} [taskData.bountyPayout=0] - Bounty payout
   * @param {boolean} [taskData.requiresApplication=false] - Requires application
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createTask(contractAddress, taskData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(taskData.name, 'Task name');
    requireValidPayout(taskData.payout);

    const {
      payout,
      name,
      description = '',
      projectId,
      location = '',
      difficulty = 'medium',
      estHours = 0,
      bountyToken = ethers.constants.AddressZero,
      bountyPayout = 0,
      requiresApplication = false,
      dueDate = null, // soft due date (unix seconds) — metadata only
      absoluteDeadline = 0, // on-chain calendar cutoff (unix seconds, 0 = none)
      completionWindow = 0, // on-chain per-claim window (seconds, 0 = none)
    } = taskData;

    // Upload metadata to IPFS if service available
    let metadataHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const ipfsData = {
        name,
        description,
        location,
        difficulty,
        estHours,
        submission: '',
        // Omit the key entirely when unset so undated tasks keep the legacy JSON shape.
        ...(dueDate ? { dueDate: Math.floor(Number(dueDate)) } : {}),
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const titleBytes = stringToBytes(name);
    const pid = parseProjectId(projectId);

    // Convert payout to wei (18 decimals for participation token)
    const payoutWei = ethers.utils.parseUnits(payout.toString(), 18);

    // Convert bounty payout to wei based on token decimals
    let bountyPayoutWei = 0;
    if (bountyPayout && Number(bountyPayout) > 0 && bountyToken !== ethers.constants.AddressZero) {
      const tokenInfo = getTokenByAddress(bountyToken);
      bountyPayoutWei = ethers.utils.parseUnits(bountyPayout.toString(), tokenInfo.decimals);
    }

    return this.txManager.execute(
      contract,
      'createTask',
      [
        payoutWei,
        titleBytes,
        metadataHash,
        pid,
        bountyToken,
        bountyPayoutWei,
        requiresApplication,
        Math.floor(Number(absoluteDeadline)) || 0,
        Math.floor(Number(completionWindow)) || 0,
      ],
      options
    );
  }

  /**
   * Create many tasks in a single transaction.
   * @param {string} contractAddress - TaskManager contract address
   * @param {string} projectId - Project ID (raw bytes32 or composite "{address}-{id}")
   * @param {Array<Object>} tasks - Per-task data, same shape as createTask's taskData (minus projectId)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createTasksBatch(contractAddress, projectId, tasks, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('createTasksBatch: tasks[] must be a non-empty array');
    }
    tasks.forEach((t, i) => {
      requireString(t.name, `tasks[${i}].name`);
      requireValidPayout(t.payout);
    });

    const buildInput = async (t) => {
      let metadataHash = ethers.constants.HashZero;
      if (this.ipfs) {
        const ipfsData = {
          name: t.name,
          description: t.description ?? '',
          location: t.location ?? '',
          difficulty: t.difficulty ?? 'medium',
          estHours: t.estHours ?? 0,
          submission: '',
          ...(t.dueDate ? { dueDate: Math.floor(Number(t.dueDate)) } : {}),
        };
        const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
        metadataHash = ipfsCidToBytes32(ipfsResult.path);
      }

      const payoutWei = ethers.utils.parseUnits(t.payout.toString(), 18);

      const bountyToken = t.bountyToken || ethers.constants.AddressZero;
      let bountyPayoutWei = ethers.BigNumber.from(0);
      if (
        t.bountyPayout &&
        Number(t.bountyPayout) > 0 &&
        bountyToken !== ethers.constants.AddressZero
      ) {
        const tokenInfo = getTokenByAddress(bountyToken);
        bountyPayoutWei = ethers.utils.parseUnits(t.bountyPayout.toString(), tokenInfo.decimals);
      }

      return {
        // Field names must match the v6 CreateTaskInput components exactly
        // (ethers v5 encodes named tuples by component name).
        payout: payoutWei,
        title: stringToBytes(t.name),
        metadataHash,
        bountyToken,
        bountyPayout: bountyPayoutWei,
        requiresApplication: !!t.requiresApplication,
        absoluteDeadline: Math.floor(Number(t.absoluteDeadline)) || 0,
        completionWindow: Math.floor(Number(t.completionWindow)) || 0,
      };
    };

    // Cap simultaneous IPFS uploads to keep large batches under
    // gateway/Pinata rate limits and avoid bursty failures. 5 is enough
    // throughput for realistic batches (10–20) without hammering the API.
    const inputs = await mapWithConcurrency(tasks, buildInput, 5);

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);

    return this.txManager.execute(contract, 'createTasksBatch', [pid, inputs], options);
  }

  /**
   * Claim a task
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async claimTask(contractAddress, taskId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(contract, 'claimTask', [parsedTaskId], options);
  }

  /**
   * Release a claimed task back to the pool (TaskManager v7).
   *
   * The claimer may ALWAYS release their own claim — the contract runs no
   * permission check on that branch, deliberately: an assignee never needed
   * CLAIM to hold the task, and hats get revoked mid-claim, so gating this
   * would trap exactly the people it frees. Anyone else needs ASSIGN on the
   * project AND an already-expired claim. Only CLAIMED tasks; a SUBMITTED task
   * must be rejected first (both refusals surface as BadStatus).
   *
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async unclaimTask(contractAddress, taskId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(contract, 'unclaimTask', [parsedTaskId], options);
  }

  /**
   * Submit a task for review
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {string} submissionCid - IPFS CID of submission metadata
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async submitTask(contractAddress, taskId, submissionCid, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    // submissionCid is an IPFS CID (Qm...), convert to bytes32 properly
    const submissionHash = ipfsCidToBytes32(submissionCid);

    return this.txManager.execute(
      contract,
      'submitTask',
      [parsedTaskId, submissionHash],
      options
    );
  }

  /**
   * Complete/approve a task
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async completeTask(contractAddress, taskId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(contract, 'completeTask', [parsedTaskId], options);
  }

  /**
   * Reject a submitted task, moving it back to CLAIMED status
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {string} rejectionCid - IPFS CID of rejection reason metadata
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async rejectTask(contractAddress, taskId, rejectionCid, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const rejectionHash = ipfsCidToBytes32(rejectionCid);

    return this.txManager.execute(
      contract,
      'rejectTask',
      [parsedTaskId, rejectionHash],
      options
    );
  }

  /**
   * Update a task
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} updateData - Update data
   * @param {number} updateData.payout - New payout
   * @param {string} updateData.name - New name
   * @param {string} [updateData.metadataHash] - New metadata hash
   * @param {string} [updateData.bountyToken=AddressZero] - Bounty token
   * @param {number} [updateData.bountyPayout=0] - Bounty payout
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async updateTask(contractAddress, taskId, updateData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(updateData.name, 'Task name');
    requireValidPayout(updateData.payout);

    const {
      payout,
      name,
      metadataHash,
      bountyToken = ethers.constants.AddressZero,
      bountyPayout = 0,
      absoluteDeadline = 0,
      completionWindow = 0,
    } = updateData;

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const titleBytes = stringToBytes(name);
    const metaHash = metadataHash ? stringToBytes32(metadataHash) : ethers.constants.HashZero;

    // Convert payout to wei (18 decimals for participation token)
    const payoutWei = ethers.utils.parseUnits(payout.toString(), 18);

    // Convert bounty payout to wei based on token decimals
    let bountyPayoutWei = 0;
    if (bountyPayout && Number(bountyPayout) > 0 && bountyToken !== ethers.constants.AddressZero) {
      const tokenInfo = getTokenByAddress(bountyToken);
      bountyPayoutWei = ethers.utils.parseUnits(bountyPayout.toString(), tokenInfo.decimals);
    }

    return this.txManager.execute(
      contract,
      'updateTask',
      [
        parsedTaskId,
        payoutWei,
        titleBytes,
        metaHash,
        bountyToken,
        bountyPayoutWei,
        Math.floor(Number(absoluteDeadline)) || 0,
        Math.floor(Number(completionWindow)) || 0,
      ],
      options
    );
  }

  /**
   * Edit a task with IPFS metadata update
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} taskData - Full task data
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async editTask(contractAddress, taskId, taskData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(taskData.name, 'Task name');
    requireValidPayout(taskData.payout);

    const {
      payout,
      name,
      description = '',
      location = '',
      difficulty = 'medium',
      estHours = 0,
      bountyToken = ethers.constants.AddressZero,
      bountyPayout = 0,
      dueDate = null,
      // Callers must pass the task's CURRENT on-chain values when not editing
      // deadlines — defaulting to 0 here would silently clear them.
      absoluteDeadline = 0,
      completionWindow = 0,
    } = taskData;

    // Upload new metadata to IPFS if service available
    let metadataHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const ipfsData = {
        name,
        description,
        location,
        difficulty,
        estHours,
        submission: '',
        ...(dueDate ? { dueDate: Math.floor(Number(dueDate)) } : {}),
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const titleBytes = stringToBytes(name);

    // Convert payout to wei (18 decimals for participation token)
    const payoutWei = ethers.utils.parseUnits(payout.toString(), 18);

    // Convert bounty payout to wei based on token decimals
    let bountyPayoutWei = 0;
    if (bountyPayout && Number(bountyPayout) > 0 && bountyToken !== ethers.constants.AddressZero) {
      const tokenInfo = getTokenByAddress(bountyToken);
      bountyPayoutWei = ethers.utils.parseUnits(bountyPayout.toString(), tokenInfo.decimals);
    }

    return this.txManager.execute(
      contract,
      'updateTask',
      [
        parsedTaskId,
        payoutWei,
        titleBytes,
        metadataHash,
        bountyToken,
        bountyPayoutWei,
        Math.floor(Number(absoluteDeadline)) || 0,
        Math.floor(Number(completionWindow)) || 0,
      ],
      options
    );
  }

  /**
   * Edit only a CLAIMED / SUBMITTED task's title + metadata hash (TaskManager v5).
   * Used by holders of TaskPerm.EDIT_META who cannot edit payout / bounty.
   * The contract reverts BadStatus on COMPLETED / CANCELLED tasks and Unauthorized if
   * the caller lacks EDIT_META / EDIT_FULL (or PM / executor) on the task's project.
   *
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} metadata - { name, description, location, difficulty, estHours }
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async editTaskMetadata(contractAddress, taskId, metadata, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(metadata.name, 'Task name');

    const {
      name,
      description = '',
      location = '',
      difficulty = 'medium',
      estHours = 0,
      dueDate = null,
    } = metadata;

    let metadataHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const ipfsData = {
        name,
        description,
        location,
        difficulty,
        estHours,
        submission: '',
        ...(dueDate ? { dueDate: Math.floor(Number(dueDate)) } : {}),
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const titleBytes = stringToBytes(name);

    return this.txManager.execute(
      contract,
      'updateTaskMetadata',
      [parsedTaskId, titleBytes, metadataHash],
      options
    );
  }

  /**
   * Cancel/delete a task
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async cancelTask(contractAddress, taskId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(
      contract,
      'cancelTask',
      [parsedTaskId],
      { ...options, isDelete: true }
    );
  }

  // ============================================
  // Application Functions
  // ============================================

  /**
   * Apply for a task that requires application
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {Object} applicationData - Application data to upload to IPFS
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async applyForTask(contractAddress, taskId, applicationData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    // Upload application to IPFS
    let applicationHash = ethers.constants.HashZero;
    if (this.ipfs && applicationData) {
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(applicationData));
      applicationHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(
      contract,
      'applyForTask',
      [parsedTaskId, applicationHash],
      options
    );
  }

  /**
   * Approve an application for a task
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {string} applicantAddress - Address of applicant to approve
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async approveApplication(contractAddress, taskId, applicantAddress, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireAddress(applicantAddress, 'Applicant address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(
      contract,
      'approveApplication',
      [parsedTaskId, applicantAddress],
      options
    );
  }

  // ============================================
  // Assignment Functions
  // ============================================

  /**
   * Assign a task to a specific user
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {string} assigneeAddress - Address to assign the task to
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async assignTask(contractAddress, taskId, assigneeAddress, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireAddress(assigneeAddress, 'Assignee address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);

    return this.txManager.execute(
      contract,
      'assignTask',
      [parsedTaskId, assigneeAddress],
      options
    );
  }

  // ============================================
  // Project Budget Functions (TaskPerm.BUDGET)
  // ============================================

  /**
   * Resize a project's participation-token cap.
   * Permission: executor OR caller has TaskPerm.BUDGET on `projectId`.
   * Contract reverts CapBelowCommitted if newCap < currently-spent.
   */
  async setProjectCap(contractAddress, projectId, newCapWei, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);
    const newCap = ethers.BigNumber.from(newCapWei);

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256'],
      [pid, newCap]
    );
    const PROJECT_CAP_KEY = 6;

    return this.txManager.execute(
      contract,
      'setConfig',
      [PROJECT_CAP_KEY, encoded],
      options
    );
  }

  /**
   * Resize a project's per-token bounty cap.
   * Permission: executor OR caller has TaskPerm.BUDGET on `projectId`.
   * Contract reverts CapBelowCommitted if newCap < currently-spent for that token.
   */
  async setBountyCap(contractAddress, projectId, tokenAddress, newCapWei, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireAddress(tokenAddress, 'Bounty token address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);
    const newCap = ethers.BigNumber.from(newCapWei);

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'address', 'uint256'],
      [pid, tokenAddress, newCap]
    );
    const BOUNTY_CAP_KEY = 4;

    return this.txManager.execute(
      contract,
      'setConfig',
      [BOUNTY_CAP_KEY, encoded],
      options
    );
  }

  // ============================================
  // Folders & Organizer Hats (v4)
  // ============================================

  /**
   * Publish a new folder-tree root, CAS-guarded against concurrent edits.
   * Permission: executor OR any wearer of an organizerHatIds hat.
   * Contract reverts FoldersRootStale(expected, actual) if another organizer
   * already moved the root — callers MUST handle this and re-prompt.
   *
   * @param {string} contractAddress
   * @param {string} expectedCurrentRoot bytes32 hex; pass HashZero for the
   *                                     uninitialized state (no folders yet).
   * @param {string} newRoot             bytes32 hex; HashZero clears the tree.
   */
  async setFolders(contractAddress, expectedCurrentRoot, newRoot, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    return this.txManager.execute(
      contract,
      'setFolders',
      [expectedCurrentRoot, newRoot],
      options
    );
  }

  /**
   * Add or remove a hat from the org's organizerHatIds array (executor-only).
   * Use the governance-vote path in normal operation; this is the raw setter
   * for direct executor calls.
   */
  async setOrganizerHatAllowed(contractAddress, hatId, allowed, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'bool'],
      [ethers.BigNumber.from(hatId), Boolean(allowed)]
    );
    const ORGANIZER_HAT_ALLOWED_KEY = 7;

    return this.txManager.execute(
      contract,
      'setConfig',
      [ORGANIZER_HAT_ALLOWED_KEY, encoded],
      options
    );
  }

  /**
   * Lens read for a project's PT budget. Returns `{ cap, spent, exists }`
   * as BigNumber. The subgraph (#177) does NOT index `spent`, so the
   * EditBudgetModal needs this to compute the `newCap < spent` warning
   * that prevents users tripping `CapBelowCommitted`.
   */
  async readProjectBudget(contractAddress, projectId) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);
    const PROJECT_LENS_KEY = 2;
    const encodedPid = ethers.utils.defaultAbiCoder.encode(['bytes32'], [pid]);
    const raw = await contract.getLensData(PROJECT_LENS_KEY, encodedPid);
    const [cap, spent, exists] = ethers.utils.defaultAbiCoder.decode(
      ['uint128', 'uint128', 'bool'],
      raw
    );
    return { cap, spent, exists };
  }

  /**
   * Lens read for a project's bounty-token budget. Returns `{ cap, spent }`
   * for the given (project, token) pair.
   */
  async readBountyBudget(contractAddress, projectId, tokenAddress) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireAddress(tokenAddress, 'Bounty token address');

    const contract = this.factory.createReadOnly(contractAddress, TaskManagerABI);
    const pid = parseProjectId(projectId);
    const BOUNTY_BUDGET_LENS_KEY = 9;
    const encoded = ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'address'],
      [pid, tokenAddress]
    );
    const raw = await contract.getLensData(BOUNTY_BUDGET_LENS_KEY, encoded);
    const [cap, spent] = ethers.utils.defaultAbiCoder.decode(['uint128', 'uint128'], raw);
    return { cap, spent };
  }

  /**
   * Lens fallback: read the current foldersRoot from the contract.
   * Use this when the subgraph hasn't indexed FoldersUpdated yet, or to
   * re-fetch the latest root mid-edit for CAS rebase.
   * Returns bytes32 hex (HashZero if uninitialized).
   */
  async readFoldersRoot(contractAddress) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, TaskManagerABI);
    const FOLDERS_ROOT_KEY = 10;
    const raw = await contract.getLensData(FOLDERS_ROOT_KEY, '0x');
    const [root] = ethers.utils.defaultAbiCoder.decode(['bytes32'], raw);
    return root;
  }

  /**
   * Lens fallback: read the current organizerHatIds array.
   * Returns an array of decimal-string hat IDs.
   */
  async readOrganizerHatIds(contractAddress) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, TaskManagerABI);
    const ORGANIZER_HAT_IDS_KEY = 11;
    const raw = await contract.getLensData(ORGANIZER_HAT_IDS_KEY, '0x');
    const [ids] = ethers.utils.defaultAbiCoder.decode(['uint256[]'], raw);
    return ids.map((id) => id.toString());
  }

  /**
   * Create and immediately assign a task to a specific user
   * @param {string} contractAddress - TaskManager contract address
   * @param {Object} taskData - Task data (same as createTask)
   * @param {string} assigneeAddress - Address to assign the task to
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createAndAssignTask(contractAddress, taskData, assigneeAddress, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireAddress(assigneeAddress, 'Assignee address');
    requireString(taskData.name, 'Task name');
    requireValidPayout(taskData.payout);

    const {
      payout,
      name,
      description = '',
      projectId,
      location = '',
      difficulty = 'medium',
      estHours = 0,
      bountyToken = ethers.constants.AddressZero,
      bountyPayout = 0,
      requiresApplication = false,
      dueDate = null, // soft due date (unix seconds) — metadata only
      absoluteDeadline = 0, // on-chain calendar cutoff (unix seconds, 0 = none)
      completionWindow = 0, // on-chain per-claim window (seconds, 0 = none)
    } = taskData;

    // Upload metadata to IPFS if service available
    let metadataHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const ipfsData = {
        name,
        description,
        location,
        difficulty,
        estHours,
        submission: '',
        // Omit the key entirely when unset so undated tasks keep the legacy JSON shape.
        ...(dueDate ? { dueDate: Math.floor(Number(dueDate)) } : {}),
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const titleBytes = stringToBytes(name);
    const pid = parseProjectId(projectId);

    // Convert payout to wei (18 decimals for participation token)
    const payoutWei = ethers.utils.parseUnits(payout.toString(), 18);

    // Convert bounty payout to wei based on token decimals
    let bountyPayoutWei = 0;
    if (bountyPayout && Number(bountyPayout) > 0 && bountyToken !== ethers.constants.AddressZero) {
      const tokenInfo = getTokenByAddress(bountyToken);
      bountyPayoutWei = ethers.utils.parseUnits(bountyPayout.toString(), tokenInfo.decimals);
    }

    return this.txManager.execute(
      contract,
      'createAndAssignTask',
      [
        payoutWei,
        titleBytes,
        metadataHash,
        pid,
        assigneeAddress,
        bountyToken,
        bountyPayoutWei,
        requiresApplication,
        Math.floor(Number(absoluteDeadline)) || 0,
        Math.floor(Number(completionWindow)) || 0,
      ],
      options
    );
  }
}

/**
 * Create a TaskService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {Object} [ipfsService] - IPFS service
 * @returns {TaskService}
 */
export function createTaskService(factory, txManager, ipfsService = null) {
  return new TaskService(factory, txManager, ipfsService);
}

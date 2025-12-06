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
   * @param {number} [projectData.cap=0] - Task cap (0 = unlimited)
   * @param {string[]} [projectData.managers=[]] - Manager addresses
   * @param {number[]} [projectData.createHats=[]] - Hat IDs for create permission
   * @param {number[]} [projectData.claimHats=[]] - Hat IDs for claim permission
   * @param {number[]} [projectData.reviewHats=[]] - Hat IDs for review permission
   * @param {number[]} [projectData.assignHats=[]] - Hat IDs for assign permission
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
    } = projectData;

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const titleBytes = stringToBytes(name);
    const metaHash = metadataHash ? stringToBytes32(metadataHash) : ethers.constants.HashZero;

    return this.txManager.execute(
      contract,
      'createProject',
      [titleBytes, metaHash, cap, managers, createHats, claimHats, reviewHats, assignHats],
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
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);

    const titleBytes = stringToBytes(name);
    const pid = parseProjectId(projectId);

    return this.txManager.execute(
      contract,
      'createTask',
      [payout, titleBytes, metadataHash, pid, bountyToken, bountyPayout, requiresApplication],
      options
    );
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

    console.log("Claiming task with ID:", parsedTaskId);

    return this.txManager.execute(contract, 'claimTask', [parsedTaskId], options);
  }

  /**
   * Submit a task for review
   * @param {string} contractAddress - TaskManager contract address
   * @param {string|number} taskId - Task ID
   * @param {string} submissionData - Submission data/notes
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async submitTask(contractAddress, taskId, submissionData, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const submissionHash = stringToBytes32(submissionData);

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
    } = updateData;

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const titleBytes = stringToBytes(name);
    const metaHash = metadataHash ? stringToBytes32(metadataHash) : ethers.constants.HashZero;

    return this.txManager.execute(
      contract,
      'updateTask',
      [parsedTaskId, payout, titleBytes, metaHash, bountyToken, bountyPayout],
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
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      metadataHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, TaskManagerABI);
    const parsedTaskId = parseTaskId(taskId);
    const titleBytes = stringToBytes(name);

    return this.txManager.execute(
      contract,
      'updateTask',
      [parsedTaskId, payout, titleBytes, metadataHash, ethers.constants.AddressZero, 0],
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

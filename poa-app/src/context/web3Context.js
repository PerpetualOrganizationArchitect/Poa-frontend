// Web3Context.js - Updated for POP contracts on Hoodi testnet
import React, { createContext, useState, useEffect, useContext } from 'react';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { useIPFScontext } from './ipfsContext';
import { parseTaskId, parseModuleId } from '../util/taskUtils';

// New POP ABIs
import UniversalAccountRegistry from "../../abi/UniversalAccountRegistry.json";
import QuickJoin from "../../abi/QuickJoinNew.json";
import HybridVoting from "../../abi/HybridVotingNew.json";
import DirectDemocracyVoting from "../../abi/DirectDemocracyVotingNew.json";
import TaskManager from "../../abi/TaskManagerNew.json";
import EducationHub from "../../abi/EducationHubNew.json";

import { useAccount } from "wagmi";
import { useEthersProvider, useEthersSigner } from '@/components/ProviderConverter';

// Import the notification context
import { useNotificationContext } from './NotificationContext';
import { useVotingContext } from './VotingContext';

const Web3Context = createContext();

export const useWeb3Context = () => {
    return useContext(Web3Context);
}

// Infrastructure address on Hoodi testnet
const UNIVERSAL_ACCOUNT_REGISTRY_ADDRESS = "0xDdB1DA30020861d92c27aE981ac0f4Fe8BA536F2";

export const Web3Provider = ({ children }) => {
    const [isNetworkModalOpen, setNetworkModalOpen] = useState(false);
    const [account, setAccount] = useState("0x00");

    const { address, chainId } = useAccount();
    const provider = useEthersProvider();
    const signer = useEthersSigner();

    const {refetch} = useVotingContext();

    // Define a uniform gas price
    const GAS_PRICE = ethers.utils.parseUnits('1', 'gwei');

    useEffect(() => {
        console.log("provider: ", provider);
        console.log("address1: ", address);

        setAccount(address);
    }, [address]);

    const { addToIpfs, fetchFromIpfs } = useIPFScontext();

    const getContractInstance = (contractAddress, contractABI) => {
        return new ethers.Contract(contractAddress, contractABI, signer);
    };

    const checkNetwork = () => {
        if (chainId !== 560048) {
            setNetworkModalOpen(true);
            return false;
        }
        return true;
    };

    const closeNetworkModal = () => {
        setNetworkModalOpen(false);
    };

    // Import the notification context functions
    const { addNotification, updateNotification } = useNotificationContext();

    // Helper: Convert string to bytes
    const stringToBytes = (str) => {
        return ethers.utils.toUtf8Bytes(str);
    };

    // Helper: Convert string to bytes32 hash (for descriptions, submissions, etc.)
    const stringToBytes32 = (str) => {
        return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
    };

    // Helper: Encode IPFS CIDv0 (Qm...) to bytes32
    // CIDv0 = base58(0x1220 + 32-byte-sha256-hash)
    // We store just the 32-byte hash portion, which fits in bytes32
    const ipfsCidToBytes32 = (cid) => {
        if (!cid || cid === '') return ethers.constants.HashZero;
        try {
            // Decode base58 CID, skip 2-byte multihash prefix (0x12 0x20), get 32-byte hash
            const decoded = bs58.decode(cid);
            const hashBytes = decoded.slice(2); // Skip the 0x12 0x20 prefix
            return ethers.utils.hexlify(hashBytes);
        } catch (error) {
            console.warn('Failed to encode IPFS CID to bytes32:', error);
            return ethers.constants.HashZero;
        }
    };

    // Helper: Decode bytes32 back to IPFS CIDv0
    const bytes32ToIpfsCid = (bytes32Hash) => {
        if (!bytes32Hash || bytes32Hash === ethers.constants.HashZero) return null;
        try {
            // Prepend multihash prefix (0x1220 = sha2-256, 32 bytes)
            const hashBytes = ethers.utils.arrayify(bytes32Hash);
            const withPrefix = new Uint8Array([0x12, 0x20, ...hashBytes]);
            return bs58.encode(withPrefix);
        } catch (error) {
            console.warn('Failed to decode bytes32 to IPFS CID:', error);
            return null;
        }
    };

    // ============================================
    // User Account Functions (UniversalAccountRegistry)
    // ============================================

    // Create New User
    async function createNewUser(username) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(UNIVERSAL_ACCOUNT_REGISTRY_ADDRESS, UniversalAccountRegistry);
        const notificationId = addNotification('Creating new user...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.registerAccount(username);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.registerAccount(username, gasOptions);
            await tx.wait();
            console.log("User registered");
            updateNotification(notificationId,'User registered successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error creating new user:", error);
            updateNotification(notificationId,'Error creating new user.', 'error');
        }
    }

    // Change Username
    async function changeUsername(username) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(UNIVERSAL_ACCOUNT_REGISTRY_ADDRESS, UniversalAccountRegistry);
        const notificationId = addNotification('Changing username...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.changeUsername(username);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.changeUsername(username, gasOptions);
            await tx.wait();
            console.log("Username changed");
            updateNotification(notificationId,'Username changed successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error changing username:", error);
            updateNotification(notificationId,'Error changing username.', 'error');
        }
    }

    // ============================================
    // Quick Join Functions
    // ============================================

    // Quick Join - No User (creates account + joins org)
    async function quickJoinNoUser(contractAddress, username) {
        console.log("Username being passed:", username);
        console.log("Contract address:", contractAddress);

        if (!checkNetwork()) {
            return;
        }

        const notificationId = addNotification('Joining organization...', 'loading');

        try {
            const contract = getContractInstance(contractAddress, QuickJoin);

            const gasEstimate = await contract.estimateGas.quickJoinNoUser(username);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.quickJoinNoUser(username, gasOptions);

            console.log("Transaction sent:", tx.hash);

            const receipt = await tx.wait();

            console.log("Transaction mined:", receipt.transactionHash);
            console.log("User joined successfully with username:", username);
            updateNotification(notificationId,'User joined successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error during quickJoinNoUser:", error);
            updateNotification(notificationId,'Error joining organization.', 'error');

            if (error.reason) {
                console.error("Revert reason:", error.reason);
            } else if (error.error && error.error.reason) {
                console.error("Revert reason:", error.error.reason);
            } else if (error.data) {
                const iface = new ethers.utils.Interface(QuickJoin);
                try {
                    const decodedError = iface.parseError(error.data);
                    console.error("Decoded error:", decodedError);
                } catch (parseError) {
                    console.error("Error parsing revert reason:", parseError);
                }
            } else {
                console.error("Error message:", error.message);
            }
        }
    }

    // Quick Join - With User (already has account, just joins org)
    async function quickJoinWithUser(contractAddress) {
        if (!checkNetwork()) {
            return;
        }

        const notificationId = addNotification('Joining organization...', 'loading');

        try {
            const contract = getContractInstance(contractAddress, QuickJoin);

            const gasEstimate = await contract.estimateGas.quickJoinWithUser();
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.quickJoinWithUser(gasOptions);
            await tx.wait();
            console.log("User joined with existing username");
            updateNotification(notificationId,'User joined successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error joining with existing username:", error);
            updateNotification(notificationId,'Error joining organization.', 'error');
        }
    }

    // ============================================
    // Hybrid Voting Functions
    // ============================================

    // Create Proposal for Hybrid Voting
    async function createProposalParticipationVoting(
        contractAddress,
        proposalName,
        proposalDescription,
        proposalDurationMinutes,
        numOptions,
        batches = [],  // Array of Call[][] for execution
        hatIds = []    // Optional hat IDs to restrict voting
    ) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, HybridVoting);

        const notificationId = addNotification('Creating hybrid proposal...', 'loading');

        try {
            // Convert title to bytes and description to bytes32 hash
            const titleBytes = stringToBytes(proposalName);
            const descriptionHash = stringToBytes32(proposalDescription);

            // Duration is in minutes
            const durationMinutes = Math.max(1, Math.floor(proposalDurationMinutes));

            const gasEstimate = await contract.estimateGas.createProposal(
                titleBytes,
                descriptionHash,
                durationMinutes,
                numOptions,
                batches,
                hatIds
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.createProposal(
                titleBytes,
                descriptionHash,
                durationMinutes,
                numOptions,
                batches,
                hatIds,
                gasOptions
            );
            await tx.wait();
            console.log("Hybrid proposal created");
            updateNotification(notificationId,'Hybrid proposal created successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error creating hybrid proposal:", error);
            updateNotification(notificationId,'Error creating hybrid proposal.', 'error');
        }
    }

    // Hybrid Vote - Now uses msg.sender, supports weighted votes
    async function hybridVote(contractAddress, proposalID, optionIndices, weights) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, HybridVoting);

        const notificationId = addNotification('Casting hybrid vote...', 'loading');

        try {
            // Ensure weights sum to 100
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            if (totalWeight !== 100) {
                throw new Error("Total weight must sum to 100");
            }

            const gasEstimate = await contract.estimateGas.vote(proposalID, optionIndices, weights);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.vote(proposalID, optionIndices, weights, gasOptions);
            await tx.wait();
            console.log("Voted in hybrid voting");
            updateNotification(notificationId,'Hybrid vote cast successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error voting in hybrid voting:", error);
            updateNotification(notificationId,'Error casting hybrid vote.', 'error');
        }
    }

    // Get Winner Hybrid Voting
    async function getWinnerHybridVoting(contractAddress, proposalID) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, HybridVoting);

        const notificationId = addNotification('Announcing winner...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.announceWinner(proposalID);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.announceWinner(proposalID, gasOptions);
            const receipt = await tx.wait();
            console.log("Winner announced");
            updateNotification(notificationId,'Winner announced successfully!', 'success');
            refetch();
            return receipt;
        } catch (error) {
            console.error("Error announcing winner:", error);
            updateNotification(notificationId,'Error announcing winner.', 'error');
        }
    }

    // ============================================
    // Direct Democracy Voting Functions
    // ============================================

    // Create Proposal Direct Democracy Voting
    async function createProposalDDVoting(
        contractAddress,
        proposalName,
        proposalDescription,
        proposalDurationMinutes,
        numOptions,
        batches = [],  // Array of Call[][] for execution
        hatIds = []    // Optional hat IDs to restrict voting
    ) {
        if (!checkNetwork()) {
            return;
        }

        const contract = getContractInstance(contractAddress, DirectDemocracyVoting);

        const notificationId = addNotification('Creating Direct Democracy proposal...', 'loading');

        try {
            // Convert title to bytes and description to bytes32 hash
            const titleBytes = stringToBytes(proposalName);
            const descriptionHash = stringToBytes32(proposalDescription);

            // Duration is in minutes
            const durationMinutes = Math.max(1, Math.floor(proposalDurationMinutes));

            const gasEstimate = await contract.estimateGas.createProposal(
                titleBytes,
                descriptionHash,
                durationMinutes,
                numOptions,
                batches,
                hatIds
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.createProposal(
                titleBytes,
                descriptionHash,
                durationMinutes,
                numOptions,
                batches,
                hatIds,
                gasOptions
            );
            await tx.wait();

            refetch();
            console.log("DD proposal created");
            updateNotification(notificationId,'Direct Democracy proposal created successfully!', 'success');
        } catch (error) {
            console.error("Error creating DD proposal:", error);
            updateNotification(notificationId,'Error creating Direct Democracy proposal.', 'error');
        }
    }

    // DD Vote - Now uses msg.sender
    async function ddVote(contractAddress, proposalID, optionIndices, weights) {
        if (!checkNetwork()) {
            return;
        }

        const contract = getContractInstance(contractAddress, DirectDemocracyVoting);

        const notificationId = addNotification('Casting Direct Democracy vote...', 'loading');

        try {
            // Ensure the total weight is 100
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            if (totalWeight !== 100) {
                throw new Error("Total weight must sum to 100");
            }

            // Convert to uint8 arrays
            const idxs = optionIndices.map(i => Number(i));
            const wts = weights.map(w => Number(w));

            const gasEstimate = await contract.estimateGas.vote(proposalID, idxs, wts);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.vote(proposalID, idxs, wts, gasOptions);
            await tx.wait();
            console.log("Voted in DD voting");
            updateNotification(notificationId,'Direct Democracy vote cast successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error voting in DD voting:", error);
            updateNotification(notificationId,'Error casting Direct Democracy vote.', 'error');
        }
    }

    // Get Winner DD Voting
    async function getWinnerDDVoting(contractAddress, proposalID) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, DirectDemocracyVoting);

        const notificationId = addNotification('Announcing winner...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.announceWinner(proposalID);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.announceWinner(proposalID, gasOptions);
            await tx.wait();
            console.log("Winner announced");
            updateNotification(notificationId,'Winner announced successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error announcing winner:", error);
            updateNotification(notificationId,'Error announcing winner.', 'error');
        }
    }

    // ============================================
    // Task Manager Functions
    // ============================================

    // Create Project
    async function createProject(
        contractAddress,
        projectName,
        metadataHash = "",
        cap = 0,
        managers = [],
        createHats = [],
        claimHats = [],
        reviewHats = [],
        assignHats = []
    ) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);

        const notificationId = addNotification('Creating project...', 'loading');

        try {
            const titleBytes = stringToBytes(projectName);
            const metaHash = metadataHash ? stringToBytes32(metadataHash) : ethers.constants.HashZero;

            const gasEstimate = await contract.estimateGas.createProject(
                titleBytes,
                metaHash,
                cap,
                managers,
                createHats,
                claimHats,
                reviewHats,
                assignHats
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.createProject(
                titleBytes,
                metaHash,
                cap,
                managers,
                createHats,
                claimHats,
                reviewHats,
                assignHats,
                gasOptions
            );
            const receipt = await tx.wait();
            console.log("Project created");
            updateNotification(notificationId,'Project created successfully!', 'success');
            refetch();

            // Return the project ID from the event
            const projectCreatedEvent = receipt.events?.find(e => e.event === 'ProjectCreated');
            return projectCreatedEvent?.args?.id;
        } catch (error) {
            console.error("Error creating project:", error);
            updateNotification(notificationId,'Error creating project.', 'error');
        }
    }

    // Create Task
    async function createTask(
        contractAddress,
        payout,
        taskDescription,
        projectId, // bytes32 project ID
        estHours,
        difficulty,
        taskLocation,
        taskName,
        bountyToken = ethers.constants.AddressZero,
        bountyPayout = 0,
        requiresApplication = false
    ) {
        if (!checkNetwork()) {
            return;
        }

        // Create IPFS metadata
        let ipfsHash = await ipfsAddTask(taskName, taskDescription, taskLocation, difficulty, estHours, "");
        let metadataHash = ipfsCidToBytes32(ipfsHash.path);

        const contract = getContractInstance(contractAddress, TaskManager);

        const notificationId = addNotification('Creating task...', 'loading');

        try {
            const titleBytes = stringToBytes(taskName);

            // If projectId is a string (old format), convert to bytes32
            const pid = typeof projectId === 'string' && !projectId.startsWith('0x')
                ? stringToBytes32(projectId)
                : projectId;

            const gasEstimate = await contract.estimateGas.createTask(
                payout,
                titleBytes,
                metadataHash,
                pid,
                bountyToken,
                bountyPayout,
                requiresApplication
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.createTask(
                payout,
                titleBytes,
                metadataHash,
                pid,
                bountyToken,
                bountyPayout,
                requiresApplication,
                gasOptions
            );
            await tx.wait();
            console.log("Task created");
            updateNotification(notificationId,'Task created successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error creating task:", error);
            updateNotification(notificationId,'Error creating task.', 'error');
            throw error;
        }
    }

    // Claim Task
    async function claimTask(contractAddress, taskID) {
        if (!checkNetwork()) {
            return;
        }

        console.log("Claiming task with ID:", taskID);
        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Claiming task...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.claimTask(newTaskID);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.claimTask(newTaskID, gasOptions);
            await tx.wait();
            console.log("Task claimed");
            updateNotification(notificationId,'Task claimed successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error claiming task:", error);
            updateNotification(notificationId,'Error claiming task.', 'error');
            throw error;
        }
    }

    // Complete Task
    async function completeTask(contractAddress, taskID) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Completing task...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.completeTask(newTaskID);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.completeTask(newTaskID, gasOptions);
            await tx.wait();
            console.log("Task completed");
            updateNotification(notificationId,'Task completed successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error completing task:", error);
            updateNotification(notificationId,'Error completing task.', 'error');
            throw error;
        }
    }

    // Submit Task
    async function submitTask(contractAddress, taskID, submissionData) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Submitting task...', 'loading');

        try {
            // Convert submission to bytes32 hash
            const submissionHash = stringToBytes32(submissionData);

            const gasEstimate = await contract.estimateGas.submitTask(newTaskID, submissionHash);
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.submitTask(newTaskID, submissionHash, gasOptions);
            await tx.wait();
            console.log("Task submitted");
            updateNotification(notificationId,'Task submitted successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error submitting task:", error);
            updateNotification(notificationId,'Error submitting task.', 'error');
            throw error;
        }
    }

    // Update Task
    async function updateTask(
        contractAddress,
        taskID,
        payout,
        taskName,
        metadataHash,
        bountyToken = ethers.constants.AddressZero,
        bountyPayout = 0
    ) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Updating task...', 'loading');

        try {
            const titleBytes = stringToBytes(taskName);
            const metaHash = stringToBytes32(metadataHash);

            const gasEstimate = await contract.estimateGas.updateTask(
                newTaskID,
                payout,
                titleBytes,
                metaHash,
                bountyToken,
                bountyPayout
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.updateTask(
                newTaskID,
                payout,
                titleBytes,
                metaHash,
                bountyToken,
                bountyPayout,
                gasOptions
            );
            await tx.wait();
            console.log("Task updated");
            updateNotification(notificationId,'Task updated successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error updating task:", error);
            updateNotification(notificationId,'Error updating task.', 'error');
            throw error;
        }
    }

    // Edit Task (wrapper around updateTask with IPFS)
    async function editTaskWeb3(
        contractAddress,
        payout,
        taskDescription,
        projectName,
        estHours,
        difficulty,
        taskLocation,
        taskName,
        taskID
    ) {
        if (!checkNetwork()) {
            return;
        }
        let ipfsHash = await ipfsAddTask(taskName, taskDescription, taskLocation, difficulty, estHours, "");

        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Editing task...', 'loading');

        try {
            const titleBytes = stringToBytes(taskName);
            const metaHash = ipfsCidToBytes32(ipfsHash.path);

            const gasEstimate = await contract.estimateGas.updateTask(
                newTaskID,
                payout,
                titleBytes,
                metaHash,
                ethers.constants.AddressZero,
                0
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.updateTask(
                newTaskID,
                payout,
                titleBytes,
                metaHash,
                ethers.constants.AddressZero,
                0,
                gasOptions
            );
            await tx.wait();
            console.log("Task edited");
            updateNotification(notificationId,'Task edited successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error editing task:", error);
            updateNotification(notificationId,'Error editing task.', 'error');
            throw error;
        }
    }

    // Delete Project
    async function deleteProject(contractAddress, projectId) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);

        const notificationId = addNotification('Deleting project...', 'loading');

        try {
            // Convert project name to bytes32 if it's a string
            const pid = typeof projectId === 'string' && !projectId.startsWith('0x')
                ? stringToBytes32(projectId)
                : projectId;

            const gasEstimate = await contract.estimateGas.deleteProject(pid);
            const gasLimit = gasEstimate.mul(133).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };
            const tx = await contract.deleteProject(pid, gasOptions);
            await tx.wait();
            console.log("Project deleted");
            updateNotification(notificationId,'Project deleted successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error deleting project:", error);
            updateNotification(notificationId,'Error deleting project.', 'error');
        }
    }

    // Cancel/Delete Task
    async function deleteTaskWeb3(contractAddress, taskID) {
        if (!checkNetwork()) {
            return;
        }
        const contract = getContractInstance(contractAddress, TaskManager);
        const newTaskID = parseTaskId(taskID);

        const notificationId = addNotification('Cancelling task...', 'loading');

        try {
            const gasEstimate = await contract.estimateGas.cancelTask(newTaskID);
            const gasLimit = gasEstimate.mul(133).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };
            const tx = await contract.cancelTask(newTaskID, gasOptions);
            await tx.wait();
            console.log("Task cancelled");
            updateNotification(notificationId,'Task cancelled successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error cancelling task:", error);
            updateNotification(notificationId,'Error cancelling task.', 'error');
            throw error;
        }
    }

    // ============================================
    // Education Hub Functions
    // ============================================

    // Create Education Module
    async function createEduModule(
        contractAddress,
        moduleTitle,
        moduleDescription,
        moduleLink,
        moduleQuestion,
        payout,
        answers,
        correctAnswer
    ) {
        if (!checkNetwork()) {
            return;
        }

        const contract = getContractInstance(contractAddress, EducationHub);

        // Create content object and upload to IPFS
        const data = {
            title: moduleTitle,
            description: moduleDescription,
            link: moduleLink,
            question: moduleQuestion,
            answers: answers,
        };

        const ipfsHash = await addToIpfs(JSON.stringify(data));
        const contentHash = ipfsCidToBytes32(ipfsHash.path);

        let correctAnswerIndex = answers.indexOf(correctAnswer);

        const notificationId = addNotification('Creating education module...', 'loading');

        try {
            const titleBytes = stringToBytes(moduleTitle);

            const gasEstimate = await contract.estimateGas.createModule(
                titleBytes,
                contentHash,
                payout,
                correctAnswerIndex
            );
            const gasLimit = gasEstimate.mul(127).div(100);
            const gasOptions = {
                gasLimit: gasLimit,
                gasPrice: GAS_PRICE,
            };

            const tx = await contract.createModule(
                titleBytes,
                contentHash,
                payout,
                correctAnswerIndex,
                gasOptions
            );
            await tx.wait();
            console.log("Module created");
            updateNotification(notificationId,'Education module created successfully!', 'success');
            refetch();
        } catch (error) {
            console.error("Error creating education module:", error);
            updateNotification(notificationId,'Error creating education module.', 'error');
        }
    }

    // Complete Module
    async function completeModule(contractAddress, moduleId, answer) {
        if (!checkNetwork()) {
            return;
        }

        const contract = getContractInstance(contractAddress, EducationHub);

        const actualModuleId = parseModuleId(moduleId);

        if (!actualModuleId) {
            console.error(`Invalid moduleId: ${moduleId}`);
            return false;
        }

        const notificationId = addNotification('Completing module...', 'loading');

        try {
            console.log(`Completing module ${actualModuleId} with answer ${answer}`);
            const gasEstimate = await contract.estimateGas.completeModule(actualModuleId, answer);
            const gasLimit = gasEstimate.mul(127).div(100);

            const tx = await contract.completeModule(actualModuleId, answer, {
                gasLimit,
                gasPrice: GAS_PRICE,
            });
            await tx.wait();
            console.log(`Module ${actualModuleId} completed by user.`);
            updateNotification(notificationId,'Module completed successfully!', 'success');
            refetch();
            return true;
        } catch (error) {
            console.error(`Error completing module ${moduleId}:`, error);
            updateNotification(notificationId,'Error completing module.', 'error');
            return false;
        }
    }

    // ============================================
    // IPFS Helper Functions
    // ============================================

    // IPFS Add Task
    async function ipfsAddTask(taskName, taskDescription, taskLocation, difficulty, estHours, submission) {
        const data = {
            name: taskName,
            description: taskDescription,
            location: taskLocation,
            difficulty: difficulty,
            estHours: estHours,
            submission: submission,
        };
        const json = JSON.stringify(data);
        const ipfsHash = await addToIpfs(json);

        return ipfsHash;
    }

    return (
        <Web3Context.Provider value={{
            address,
            chainId,
            signer,
            isNetworkModalOpen,
            closeNetworkModal,
            setAccount,
            // User Account Functions
            createNewUser,
            changeUsername,
            // Quick Join Functions
            quickJoinNoUser,
            quickJoinWithUser,
            // Hybrid Voting Functions
            createProposalParticipationVoting,
            hybridVote,
            getWinnerHybridVoting,
            // DD Voting Functions
            createProposalDDVoting,
            ddVote,
            getWinnerDDVoting,
            // Task Manager Functions
            createProject,
            createTask,
            claimTask,
            completeTask,
            submitTask,
            updateTask,
            editTaskWeb3,
            deleteProject,
            deleteTaskWeb3,
            // Education Hub Functions
            createEduModule,
            completeModule,
            // IPFS Helpers
            ipfsAddTask,
            bytes32ToIpfsCid,
        }}>
            {children}
        </Web3Context.Provider>
    );
};

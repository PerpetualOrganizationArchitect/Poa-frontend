import OrgDeployer from "../abi/OrgDeployer.json";
import { ethers } from "ethers";

// Infrastructure addresses on Hoodi testnet
const ORG_DEPLOYER_ADDRESS = "0x888daCE32d8BCdDD95BA9D490643663C25810ded";
const UNIVERSAL_REGISTRY_ADDRESS = "0xDdB1DA30020861d92c27aE981ac0f4Fe8BA536F2";

export async function main(
    memberTypeNames,
    executivePermissionNames,
    POname,
    quadraticVotingEnabled,
    democracyVoteWeight,
    participationVoteWeight,
    hybridVotingEnabled,
    participationVotingEnabled,
    electionEnabled,
    educationHubEnabled,
    logoURL,
    infoIPFSHash,
    votingControlType,
    quorumPercentageDD,
    quorumPercentagePV,
    username,
    wallet,
    customRoles = null  // Optional: pre-configured roles with additionalWearers
  ) {
    console.log("Creating new DAO with OrgDeployer...");

    // Validate wallet/signer
    if (!wallet) {
      throw new Error("Wallet/signer is required. Please connect your wallet first.");
    }

    // Get deployer address - ethers signers may need getAddress()
    let deployerAddress;
    try {
      deployerAddress = wallet.address || (await wallet.getAddress());
      if (!deployerAddress) {
        throw new Error("Could not get wallet address");
      }
    } catch (err) {
      throw new Error(`Failed to get deployer address from wallet: ${err.message}`);
    }

    console.log("Deployer address:", deployerAddress);
    console.log("Input parameters:", {
      memberTypeNames,
      executivePermissionNames,
      POname,
      quadraticVotingEnabled,
      democracyVoteWeight,
      participationVoteWeight,
      hybridVotingEnabled,
      participationVotingEnabled,
      electionEnabled,
      educationHubEnabled,
      logoURL,
      infoIPFSHash,
      votingControlType,
      quorumPercentageDD,
      quorumPercentagePV,
      username,
    });

    // Generate orgId from name
    const orgId = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(POname.toLowerCase().replace(/\s+/g, '-'))
    );
    console.log("Generated orgId:", orgId);

    // Build hybrid voting classes
    const hybridClasses = buildHybridClasses(
      hybridVotingEnabled,
      quadraticVotingEnabled,
      democracyVoteWeight,
      participationVoteWeight
    );

    // Build roles - use customRoles if provided, otherwise generate from member types
    const roles = customRoles || buildRoles(memberTypeNames, executivePermissionNames);

    // Build role assignments
    const roleAssignments = buildRoleAssignments(memberTypeNames, executivePermissionNames);

    // Construct DeploymentParams
    const deploymentParams = {
      orgId: orgId,
      orgName: POname,
      registryAddr: UNIVERSAL_REGISTRY_ADDRESS,
      deployerAddress: deployerAddress,
      deployerUsername: username || "",
      autoUpgrade: true,
      hybridQuorumPct: quorumPercentagePV || 50,
      ddQuorumPct: quorumPercentageDD || 50,
      hybridClasses: hybridClasses,
      ddInitialTargets: [],
      roles: roles,
      roleAssignments: roleAssignments,
    };

    console.log("Deploying new DAO with the following parameters:", deploymentParams);
    console.log("OrgDeployer address:", ORG_DEPLOYER_ADDRESS);
    console.log("OrgDeployer ABI loaded:", Array.isArray(OrgDeployer) ? `${OrgDeployer.length} entries` : typeof OrgDeployer);

    // Debug: Log detailed role structure
    console.log("=== ROLES DETAIL ===");
    console.log("Using customRoles:", customRoles !== null);
    deploymentParams.roles.forEach((role, idx) => {
      console.log(`Role [${idx}]:`, JSON.stringify(role, (key, value) => {
        // Handle BigNumber serialization
        if (value && value._isBigNumber) {
          return `BigNumber(${value.toString()})`;
        }
        return value;
      }, 2));
    });

    const orgDeployer = new ethers.Contract(ORG_DEPLOYER_ADDRESS, OrgDeployer, wallet);
    console.log("OrgDeployer contract instance created");

    try {
      // First, try a static call to get the revert reason if it would fail
      console.log("Testing deployment with staticCall...");
      try {
        await orgDeployer.callStatic.deployFullOrg(deploymentParams, {
          gasLimit: 25000000,
        });
        console.log("staticCall succeeded - proceeding with actual transaction");
      } catch (staticError) {
        console.error("staticCall failed - transaction would revert:", staticError);
        // Try to extract the revert reason
        if (staticError.reason) {
          console.error("Revert reason:", staticError.reason);
        }
        if (staticError.errorName) {
          console.error("Error name:", staticError.errorName);
        }
        if (staticError.errorArgs) {
          console.error("Error args:", staticError.errorArgs);
        }
        throw staticError;
      }

      // Check wallet balance before attempting transaction
      const balance = await wallet.getBalance();
      const gasPrice = await wallet.getGasPrice();
      const estimatedCost = gasPrice.mul(25000000);
      console.log("Wallet balance:", ethers.utils.formatEther(balance), "ETH");
      console.log("Gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "gwei");
      console.log("Estimated max cost:", ethers.utils.formatEther(estimatedCost), "ETH");

      if (balance.lt(estimatedCost)) {
        console.error("WARNING: Wallet balance may be insufficient for transaction!");
      }

      // Estimate gas first to get actual requirement
      console.log("Estimating gas...");
      let estimatedGas;
      try {
        estimatedGas = await orgDeployer.estimateGas.deployFullOrg(deploymentParams);
        console.log("Estimated gas:", estimatedGas.toString());
      } catch (estimateError) {
        console.error("Gas estimation failed:", estimateError);
        // Fallback to high limit
        estimatedGas = ethers.BigNumber.from(25000000);
      }

      // Add 20% buffer to estimated gas
      const gasLimitWithBuffer = estimatedGas.mul(120).div(100);
      console.log("Gas limit with buffer:", gasLimitWithBuffer.toString());

      console.log("Sending transaction...");
      let tx;
      try {
        tx = await orgDeployer.deployFullOrg(deploymentParams, {
          gasLimit: gasLimitWithBuffer,
        });
      } catch (txError) {
        console.error("Transaction send failed:", txError);
        console.error("Error code:", txError.code);
        console.error("Error message:", txError.message);
        if (txError.error) {
          console.error("Inner error:", txError.error);
        }
        if (txError.transaction) {
          console.error("Transaction data length:", txError.transaction.data?.length);
        }
        throw txError;
      }

      console.log("Transaction sent:", tx.hash);
      console.log("Waiting for confirmation...");
      const receipt = await tx.wait();

      console.log("Deployment transaction was successful!");
      console.log("Transaction hash:", receipt.transactionHash);

      // Parse OrgDeployed event to get contract addresses
      const orgDeployedEvent = receipt.events?.find(e => e.event === 'OrgDeployed');
      if (orgDeployedEvent) {
        console.log("Deployed contracts:", {
          orgId: orgDeployedEvent.args.orgId,
          executor: orgDeployedEvent.args.executor,
          hybridVoting: orgDeployedEvent.args.hybridVoting,
          directDemocracyVoting: orgDeployedEvent.args.directDemocracyVoting,
          quickJoin: orgDeployedEvent.args.quickJoin,
          participationToken: orgDeployedEvent.args.participationToken,
          taskManager: orgDeployedEvent.args.taskManager,
          educationHub: orgDeployedEvent.args.educationHub,
          paymentManager: orgDeployedEvent.args.paymentManager,
          eligibilityModule: orgDeployedEvent.args.eligibilityModule,
          toggleModule: orgDeployedEvent.args.toggleModule,
          topHatId: orgDeployedEvent.args.topHatId?.toString(),
          roleHatIds: orgDeployedEvent.args.roleHatIds?.map(id => id.toString()),
        });
      }

      return {
        receipt,
        orgId,
        contracts: orgDeployedEvent?.args || {},
      };
    } catch (error) {
      console.error("An error occurred during deployment:", error);
      throw error;
    }
  }

// Helper: Build hybrid voting classes
function buildHybridClasses(hybridEnabled, quadratic, ddWeight, ptWeight) {
  if (!hybridEnabled) {
    // Pure direct democracy - single DIRECT class
    return [{
      strategy: 0, // DIRECT (1-person-1-vote based on hat)
      slicePct: 100,
      quadratic: false,
      minBalance: 0,
      asset: ethers.constants.AddressZero,
      hatIds: [],
    }];
  }

  // Hybrid: DIRECT + ERC20_BAL
  return [
    {
      strategy: 0, // DIRECT
      slicePct: ddWeight || 50,
      quadratic: false,
      minBalance: 0,
      asset: ethers.constants.AddressZero,
      hatIds: [],
    },
    {
      strategy: 1, // ERC20_BAL (ParticipationToken)
      slicePct: ptWeight || 50,
      quadratic: quadratic || false,
      minBalance: ethers.utils.parseEther("1"),
      asset: ethers.constants.AddressZero, // Will use org's ParticipationToken
      hatIds: [],
    },
  ];
}

// Helper: Build roles from member types
function buildRoles(memberTypes, executiveRoles) {
  // Find the top-level admin role index (first executive, or first role if no executives)
  const topLevelRoleIndex = executiveRoles.length > 0
    ? Math.max(0, memberTypes.indexOf(executiveRoles[0]))
    : 0;

  return memberTypes.map((name, idx) => {
    // Determine adminRoleIndex:
    // - Top-level role uses type(uint256).max (ethers.constants.MaxUint256)
    // - All other roles point to the top-level role
    // NOTE: Self-referential admin (adminRoleIndex == idx) is NOT allowed by the contract
    const isTopLevelRole = idx === topLevelRoleIndex;

    return {
      name: name,
      image: "",
      canVote: true,
      vouching: {
        enabled: false,
        quorum: 0,
        voucherRoleIndex: 0,
        combineWithHierarchy: false,
      },
      defaults: {
        eligible: true,
        standing: true,
      },
      hierarchy: {
        // type(uint256).max means "use ELIGIBILITY_ADMIN hat as parent" (top-level role)
        // Other roles point to the top-level admin role index
        adminRoleIndex: isTopLevelRole
          ? ethers.constants.MaxUint256  // Top-level role
          : topLevelRoleIndex,           // Child roles point to admin
      },
      distribution: {
        mintToDeployer: idx === 0, // Mint first role to deployer
        mintToExecutor: false,
        additionalWearers: [],
      },
      hatConfig: {
        maxSupply: 1000,
        mutableHat: true,
      },
    };
  });
}

// Helper: Build role assignment bitmaps
function buildRoleAssignments(memberTypes, executiveRoles) {
  // Use regular numbers instead of BigInt - safe for small role counts (< 32 roles)
  // BigInt literals (1n, 0n) cannot be JSON-serialized for RPC calls
  const allRolesBitmap = (1 << memberTypes.length) - 1;

  // Find executive role indexes
  let executiveBitmap = 0;
  executiveRoles.forEach(execRole => {
    const idx = memberTypes.indexOf(execRole);
    if (idx !== -1) {
      executiveBitmap |= (1 << idx);
    }
  });

  // If no executives specified, use first role
  if (executiveBitmap === 0) {
    executiveBitmap = 1;
  }

  return {
    quickJoinRolesBitmap: 1, // Only first role (MEMBER) can quick join
    tokenMemberRolesBitmap: allRolesBitmap, // All roles can hold tokens
    tokenApproverRolesBitmap: executiveBitmap, // Executives can approve token requests
    taskCreatorRolesBitmap: allRolesBitmap, // All roles can create tasks
    educationCreatorRolesBitmap: executiveBitmap, // Executives can create education
    educationMemberRolesBitmap: allRolesBitmap, // All roles can access education
    hybridProposalCreatorRolesBitmap: allRolesBitmap, // All roles can create proposals
    ddVotingRolesBitmap: allRolesBitmap, // All roles can vote in DD
    ddCreatorRolesBitmap: allRolesBitmap, // All roles can create DD polls
  };
}

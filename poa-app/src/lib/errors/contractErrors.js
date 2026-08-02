/**
 * contractErrors.js
 * Shared contract-revert decoding used by BOTH transaction paths:
 *   - EOA / direct ethers tx  → ErrorParser.parseError
 *   - Passkey / ERC-4337 UserOp → SmartAccountTransactionManager._parseAAError
 *
 * The goal is that any revert from a POA contract surfaces a specific, actionable
 * message to the user regardless of which signing path produced it.
 *
 * Three pieces:
 *   1. CONTRACT_ERROR_SELECTORS — authoritative 4-byte selector → error name map,
 *      GENERATED from the contracts' compiled ABIs, UNIONed with what is already
 *      here (see the note on CONTRACT_ERROR_SELECTORS below). This is the
 *      cross-contract fallback; when a built ethers Interface is available, ABI
 *      decoding is preferred (it also recovers error args).
 *   2. CONTRACT_ERROR_MESSAGES — error name → friendly, user-facing message.
 *   3. Decode helpers that extract the revert bytes from the wildly different
 *      error envelopes ethers v5 and viem/Pimlico produce, then turn them into a
 *      message.
 */

import { ethers } from 'ethers';

// Standard Solidity revert selectors.
const ERROR_STRING_SELECTOR = '0x08c379a0'; // Error(string)  — require(cond, "msg")
const PANIC_SELECTOR = '0x4e487b71'; // Panic(uint256) — assert/overflow/div-by-zero

/**
 * Authoritative selector → error name, generated from every ABI the frontend
 * sends a write transaction to, PLUS the delegatecall libraries whose reverts
 * bubble up unchanged but never appear in a contract's own ABI (VotingErrors,
 * RoleResolver, ModuleDeploymentLib, the Paymaster* libs) and the Hats-protocol
 * errors that surface on every join/claim path.
 *
 * DO NOT hand-edit selectors — regenerate from the contracts' compiled ABIs. The
 * generator must UNION with what is already here, never replace: contracts are
 * upgraded chain-by-chain, so a name deleted upstream (e.g. `NotAuthorizedAdmin`,
 * removed by POP PR #185) is still emitted by every not-yet-upgraded proxy.
 *
 * This map only matters when no Interface is in scope (e.g. a revert that
 * originated in a *different* contract than the one we called).
 */
export const CONTRACT_ERROR_SELECTORS = {
  '0xc22f9f2c': 'AccountExists',
  '0xf1fc16eb': 'AccountUnknown',
  '0x9996b315': 'AddressEmptyCode',
  '0x0cd96ab8': 'AllHatsWorn',
  '0xc39f6ac4': 'AllowlistNotActive',
  '0x00a81806': 'AlreadyApplied',
  '0x101f817a': 'AlreadyApproved',
  '0x646cf558': 'AlreadyClaimed',
  '0x195332a5': 'AlreadyCompleted',
  '0x0dc10197': 'AlreadyExecuted',
  '0x475a2535': 'AlreadyFinalized',
  '0xa741a045': 'AlreadySet',
  '0x7c9a1cf9': 'AlreadyVoted',
  '0xbde702e3': 'AlreadyVouched',
  '0x643d2083': 'AlreadyWearingHat',
  '0x0b792c8f': 'ApplicationAlreadyExists',
  '0xa24a13a6': 'ArrayLengthMismatch',
  '0x1b96a06a': 'ArrayLenMismatch',
  '0xbe9faef2': 'AutoUpgradeRequired',
  '0x5c975bda': 'BadStatus',
  '0xee755c3e': 'BeaconNotSet',
  '0x50b2c4e1': 'BudgetExceeded',
  '0x5c0dee5d': 'CallFailed',
  '0xd2f2c18b': 'CannotRemoveLastCredential',
  '0xd8d6426c': 'CannotVouchForSelf',
  '0xd2aff4b8': 'CapBelowCommitted',
  '0x2520601d': 'CheckpointUnorderedInsertion',
  '0x283dc311': 'ClaimerNotEligible',
  '0x4dece07e': 'ClaimPeriodNotExpired',
  '0xc02d3ee3': 'ContractNotDeployed',
  '0x371bf39e': 'ContractUnknown',
  '0xaa3ea2ac': 'CredentialExists',
  '0x115267f3': 'CredentialNotActive',
  '0xb7199d4c': 'CredentialNotFound',
  '0x70414907': 'DefaultEligibilityConflictsWithVouch',
  '0xa6461e39': 'DistributionAlreadyFinalized',
  '0x3a35c2f9': 'DistributionNotFound',
  '0x13b1cf58': 'DuplicateIndex',
  '0x7cdd5ac5': 'DurationOutOfRange',
  '0xf645eedf': 'ECDSAInvalidSignature',
  '0xfce698f7': 'ECDSAInvalidSignatureLength',
  '0xd78bce0c': 'ECDSAInvalidSignatureS',
  '0x341f54fd': 'EmailAlreadyRegistered',
  '0xc2e5347d': 'EmptyBatch',
  '0xdf296b44': 'EmptyHats',
  '0x3e89cbb3': 'EmptyInit',
  '0xecd7b0d1': 'EmptyString',
  '0xa5bb9bde': 'EmptyTitle',
  '0xd93c0665': 'EnforcedPause',
  '0x63e8b3e8': 'EPOnly',
  '0x4c9c8ce3': 'ERC1967InvalidImplementation',
  '0xb398979f': 'ERC1967NonPayable',
  '0x1cb15d26': 'ERC20ExceededSafeSupply',
  '0xfb8f41b2': 'ERC20InsufficientAllowance',
  '0xe450d38c': 'ERC20InsufficientBalance',
  '0xe602df05': 'ERC20InvalidApprover',
  '0xec442f05': 'ERC20InvalidReceiver',
  '0x96c6fd1e': 'ERC20InvalidSender',
  '0x94280d62': 'ERC20InvalidSpender',
  '0xecd3f81e': 'ERC5805FutureLookup',
  '0x6ff07140': 'ERC6372InconsistentClock',
  '0xb12d13eb': 'ETHTransferFailed',
  '0xacfdb444': 'ExecutionFailed',
  '0x8dfc202b': 'ExpectedPause',
  '0xd6bda275': 'FailedCall',
  '0xcd4e6167': 'FeeTooHigh',
  '0x6a1abd22': 'FoldersRootStale',
  '0xb2577430': 'GasTooHigh',
  '0x11af4dd6': 'GracePeriodSpendLimitReached',
  '0xfecca77f': 'GuardianAlreadyExists',
  '0x6677f3c8': 'GuardianDoesNotExist',
  '0xb45a4631': 'HasNotVouched',
  '0xe629aba3': 'HatNotActive',
  '0x748382d5': 'HatOpenlyClaimable',
  '0xe12b1f85': 'ImplZero',
  '0x3cb97240': 'Ineligible',
  '0x9f8dcc9b': 'InitFailed',
  '0x0710b3e1': 'InsufficientDelivery',
  '0xcb15adf1': 'InsufficientDepositForSolidarity',
  '0x356680b7': 'InsufficientFunds',
  '0xd0c84c62': 'InsufficientOrgBalance',
  '0x752d88c0': 'InvalidAccountNonce',
  '0xe6c4247b': 'InvalidAddress',
  '0xb5f71a2e': 'InvalidAnswer',
  '0x391ab2ea': 'InvalidApplicationHash',
  '0x94ef741a': 'InvalidChars',
  '0x0f0f97d1': 'InvalidCheckpoint',
  '0x1e565eaa': 'InvalidClassCount',
  '0x769d11e4': 'InvalidDeadline',
  '0x165a0726': 'InvalidDKIMKey',
  '0x88ac0897': 'InvalidEpochLength',
  '0xb43a0650': 'InvalidHatId',
  '0x63df8171': 'InvalidIndex',
  '0xf92ee8a9': 'InvalidInitialization',
  '0xade46c67': 'InvalidJoinTime',
  '0x5fbda299': 'InvalidMaxDailyVouches',
  '0xd5f24564': 'InvalidMembershipHat',
  '0x9dd854d3': 'InvalidMerkleRoot',
  '0x756688fe': 'InvalidNonce',
  '0x82ed6225': 'InvalidOnboardingRequest',
  '0x83c2a767': 'InvalidOrgDeployRequest',
  '0xc1144a2c': 'InvalidOrgId',
  '0xd2529034': 'InvalidParam',
  '0x25d8dfa4': 'InvalidPaymasterData',
  '0xe3813bd4': 'InvalidPayout',
  '0x09bde339': 'InvalidProof',
  '0xee032808': 'InvalidProposal',
  '0xa2d0fee8': 'InvalidPublicKey',
  '0xd1735779': 'InvalidQuorum',
  '0x25bf35eb': 'InvalidRoleConfiguration',
  '0x394e0cef': 'InvalidRuleId',
  '0x8baa579f': 'InvalidSignature',
  '0x815e1d64': 'InvalidSigner',
  '0xfea59956': 'InvalidSliceSum',
  '0x3b00c964': 'InvalidString',
  '0x6c27c5f2': 'InvalidSubjectType',
  '0xaabd5a09': 'InvalidThreshold',
  '0xfd684c3b': 'InvalidUser',
  '0xa9146eeb': 'InvalidVersion',
  '0x585b9263': 'InvalidWeight',
  '0xff633a38': 'LengthMismatch',
  '0x4028a50d': 'MaxCredentialsReached',
  '0xbdf91dc1': 'ModuleExists',
  '0x10e2e5bb': 'ModuleUnknown',
  '0x594ea677': 'NewUserVouchingRestricted',
  '0xa4f5cfae': 'NoActiveApplication',
  '0xffe68de3': 'NoApplicationRequired',
  '0xd1e1fa49': 'NoPendingRecovery',
  '0x7bfa4b9f': 'NotAdmin',
  // Hats-protocol `NotAdmin(address,uint256)`. Deliberately NOT called `NotAdmin`:
  // PaymasterHub already owns that name at 0x7bfa4b9f. Keep this alias when
  // regenerating — a raw ABI dump would name it `NotAdmin` and collide.
  '0xf921ec01': 'NotAdminHats',
  '0x475d03f7': 'NotAGuardian',
  '0xb287a82f': 'NotApplicant',
  '0x65f84cc0': 'NotApprover',
  '0x9fa7b4bb': 'NotAuthorizedAdmin',
  '0x9d28e06e': 'NotAuthorizedEmailVerifier',
  '0x69d6514c': 'NotAuthorizedExecutor',
  '0xd059c6eb': 'NotAuthorizedToVouch',
  '0x95530668': 'NotClaimer',
  '0x93687c0b': 'NotCreator',
  '0x8b906c97': 'NotDeployer',
  '0xf8eb54de': 'NotEligible',
  '0xc32d1d76': 'NotExecutor',
  '0xc5723b51': 'NotFound',
  '0x57afcad4': 'NotInAllowlist',
  '0xd7e6bcf8': 'NotInitializing',
  '0x291fc442': 'NotMember',
  '0x7c214f04': 'NotOperator',
  '0x8f40e9c4': 'NotOrganizer',
  '0x77a74ec9': 'NotOrgExecutor',
  '0xa810544a': 'NotOrgMetadataAdmin',
  '0x30cd7471': 'NotOwner',
  '0x00bd7754': 'NotPoaManager',
  '0xe39da59e': 'NotRequester',
  '0x16c726b1': 'NotSuperAdmin',
  '0x87517b30': 'NotTaskOrEdu',
  '0xb8d29e28': 'NotToggleAdmin',
  '0x68c00a8a': 'NoUsername',
  '0xcad2ae02': 'NullifierAlreadyUsed',
  '0xda522463': 'OnboardingDailyLimitExceeded',
  '0x8ce687c3': 'OnboardingDisabled',
  '0x0d9680c5': 'OnboardingLimitExceeded',
  '0xbd07c551': 'OnlyEntryPoint',
  '0xcae1d956': 'OnlyGuardian',
  '0xe4e906bd': 'OnlyGuardianOrSelf',
  '0x1eba6865': 'OnlyMasterDeploy',
  '0x14d4a4e8': 'OnlySelf',
  '0xacf09f4f': 'OptedOut',
  '0xaa969a7e': 'OrgAlreadyRegistered',
  '0xc0f1a1e0': 'OrgDeployDailyLimitExceeded',
  '0x18b96352': 'OrgDeployDisabled',
  '0x5408dab9': 'OrgDeployLimitExceeded',
  '0x031cc96e': 'OrgExists',
  '0x3821115b': 'OrgExistsMismatch',
  '0xad3bba04': 'OrgIsBanned',
  '0xe09046c4': 'OrgNotRegistered',
  '0xa513ba5e': 'OrgUnknown',
  '0x03135f5a': 'OverClaimed',
  '0x35278d12': 'Overflow',
  '0x1e4fbdf7': 'OwnableInvalidOwner',
  '0x118cdaa7': 'OwnableUnauthorizedAccount',
  '0x00e1e703': 'OwnerOnlyDuringBootstrap',
  '0xc832858d': 'PasskeyFactoryNotSet',
  '0x9e87fac8': 'Paused',
  '0xe3985b98': 'RecoveryAlreadyPending',
  '0x0a9a2f0e': 'RecoveryDelayNotPassed',
  '0x94c07f8b': 'RecoveryDisabled',
  '0xfab70774': 'RecoveryNotPending',
  '0x3ee5aeb5': 'ReentrancyGuardReentrantCall',
  '0xed3ba6a6': 'Reentrant',
  '0x15236fdf': 'RequestHashAlreadyFailed',
  '0x36838924': 'RequestUnknown',
  '0x235dddba': 'RequiresApplication',
  '0x3665a1ba': 'RoleNotAllowed',
  '0x2240f884': 'RuleDenied',
  '0x6dfcc650': 'SafeCastOverflowedUintDowncast',
  '0x5274afe7': 'SafeERC20FailedOperation',
  '0x4c3b76bf': 'SameImplementation',
  '0xd133618f': 'SelfReviewNotAllowed',
  '0x0819bdcd': 'SignatureExpired',
  '0x08c60247': 'SolidarityDistributionIsPaused',
  '0xa438d5df': 'SolidarityLimitExceeded',
  '0xd4a04991': 'SpentUnderflow',
  '0xb11b2ad8': 'StringTooLong',
  '0x9eec2ff8': 'SweepFailed',
  '0x48cbf26d': 'TargetNotAllowed',
  '0x48502cd8': 'TargetSelf',
  '0xb61fefab': 'ThresholdExceedsGuardianCount',
  '0x621e25c3': 'TimelockNotExpired',
  '0x24a25c57': 'TitleTooLong',
  '0x2fe9c4b2': 'TokenNotWired',
  '0xf5dedbff': 'TooManyCalls',
  '0x50d51d8b': 'TooManyClasses',
  '0xc07a9fb9': 'TooManyHats',
  '0x1bca9042': 'TooManyOptions',
  '0x68ed5629': 'TooManyPollHats',
  '0x90b8ec18': 'TransferFailed',
  '0x8574adcf': 'TransfersDisabled',
  '0x8953e7e0': 'TypeExists',
  '0x633cee1a': 'TypeTaken',
  '0x3ebe849b': 'TypeUnknown',
  '0x82b42900': 'Unauthorized',
  '0x5c427cd9': 'UnauthorizedCaller',
  '0x4cd3e2eb': 'UnregisteredRole',
  '0xc6de466a': 'UnsupportedType',
  '0x16d17376': 'UsernameEmpty',
  '0x6bc324ad': 'UsernameTaken',
  '0xfb98085e': 'UsernameTooLong',
  '0xe07c8dba': 'UUPSUnauthorizedCallContext',
  '0xaa1d49a4': 'UUPSUnsupportedProxiableUUID',
  '0xb305d11d': 'VersionExists',
  '0x23b81033': 'VersionUnknown',
  '0x4683af0e': 'VotesExpiredSignature',
  '0x1e34f61a': 'VotingExpired',
  '0x8089789a': 'VotingOpen',
  '0xf536e173': 'VouchingNotEnabled',
  '0x76370673': 'VouchingRateLimitExceeded',
  '0xd7dbfbb3': 'WeightSumNot100',
  '0xde7ad8ef': 'WouldDrainRecoveryFunds',
  '0x2d6ac127': 'WrongToken',
  '0xd92e233d': 'ZeroAddress',
  '0x1f2a2005': 'ZeroAmount',
  '0x40ab3afe': 'ZeroClaimer',
  '0xe5d19efb': 'ZeroDepositor',
  '0xe0830f6b': 'ZeroUser',
};

/**
 * Error name → friendly, actionable, user-facing message.
 * Written for a non-technical org member. Keyed by the exact contract error
 * name (PascalCase) so lookups are O(1) and never collide via substring.
 *
 * Covers the user-facing flows: vouch/role (EligibilityModule), join
 * (QuickJoin), tasks (TaskManager v6), token requests + treasury
 * (ParticipationToken / PaymentManager), and voting.
 */
export const CONTRACT_ERROR_MESSAGES = {
  // ---- EligibilityModule: vouching & role claiming (accept-role flow) ----
  AlreadyVouched: 'You have already vouched for this person. Each member can only vouch once per applicant.',
  ApplicationAlreadyExists: 'This person already has a pending join application. Wait for it to be approved or declined before submitting another.',
  CannotVouchForSelf: "You can't vouch for yourself. Ask another member of the organization to vouch for you.",
  HasNotVouched: "You haven't vouched for this person, so there's nothing to undo.",
  InvalidApplicationHash: "The application details couldn't be verified. Refresh the page and resubmit your application.",
  InvalidHatId: "That role doesn't exist in this organization. Pick a valid role and try again.",
  InvalidJoinTime: 'This join request is outside the allowed time window. Refresh and try joining again.',
  InvalidMembershipHat: "This organization's membership role isn't set up correctly. Contact an organization admin.",
  InvalidQuorum: 'The number of vouches required is misconfigured. An organization admin needs to fix the vouching quorum.',
  InvalidUser: "That account can't be used for this action. Make sure you're connected with the right wallet or passkey.",
  NewUserVouchingRestricted: 'You joined too recently to vouch for others yet. New members must wait before they can vouch — try again later, or ask a longer-standing member.',
  NoActiveApplication: 'There is no pending application for this role. You may need to apply first, or it was already handled.',
  NotAuthorizedAdmin: "You don't have admin permission for this action. Ask an organization admin to do it or to grant you the admin role.",
  NotAuthorizedToVouch: "Your role isn't allowed to vouch for new members. Ask an admin to grant your role vouching permission.",
  NotSuperAdmin: "Only the organization's super admin can do this. Contact the super admin.",
  VouchingNotEnabled: "Vouch-to-join isn't turned on for this organization. An admin must enable vouching before members can vouch.",
  VouchingRateLimitExceeded: "You've hit the vouching limit for now. Wait a while before vouching for someone else.",
  Ineligible: "You're not eligible for this role yet. You may need more vouches, or you may already hold a conflicting role.",

  // ---- QuickJoin: joining an org ----
  NoUsername: 'You need a username before joining. Set up your account name first, then join the organization.',
  OnlyMasterDeploy: "This action is restricted to the deployment system and can't be triggered manually.",
  PasskeyFactoryNotSet: "Passkey sign-up isn't configured for this organization yet. Join with a connected wallet instead, or contact an admin.",
  ZeroUser: 'No account was provided for this action. Reconnect your wallet or passkey and try again.',

  // ---- TaskManager: claim / submit / review / create (task flows) ----
  // v7 note: releasing a claim shares this error for two distinct cases — wrong status,
  // and "the claim you tried to release hasn't expired yet" — so the copy stays neutral.
  BadStatus: "This task isn't in the right state for that action — it may already be claimed, released, submitted, or completed. Refresh the board and try again.",
  NotClaimer: 'Only the person who claimed this task can do this. If it should be yours, claim it first.',
  NotFound: 'This task no longer exists or could not be found. It may have been deleted — refresh the board.',
  RequiresApplication: 'This task requires an application before you can claim it. Apply first, then claim once you are accepted.',
  NoApplicationRequired: "This task is open to claim directly and doesn't take applications. Just claim it.",
  AlreadyApplied: "You've already applied for this task. Wait for a reviewer to accept or decline your application.",
  NotApplicant: "You haven't applied for this task, so there's no application to act on. Apply first if you want to claim it.",
  InvalidDeadline: "The deadline isn't valid — it must be in the future. Pick a later date and try again.",
  SelfReviewNotAllowed: "You can't review your own submission. Another team member with review permission needs to approve it.",
  // Declared by BOTH BudgetLib (project token budget) and PaymasterHubErrors (gas
  // budget) — same selector, two meanings. Callers that know they're on the
  // sponsored-gas path should surface their own copy before consulting this map.
  BudgetExceeded: "This would go over a configured budget — either the project's token budget or the organization's gas allowance. Lower the amount, or ask an admin to raise the budget.",
  EmptyBatch: 'No items were selected for this bulk action. Select at least one task and try again.',
  NotCreator: "You don't have permission to create projects or tasks here. Ask an admin to grant your role the create permission.",
  NotExecutor: "This action can only be run by the organization's executor, usually via a passed governance proposal. It can't be triggered directly.",
  NotOrganizer: "You don't hold a folder-organizer role. Ask an admin to grant your role the organizer permission to reorganize the board.",
  EmptyTitle: "The task title can't be blank. Enter a title and try again.",
  TitleTooLong: 'The task title is too long. Shorten it and try again.',
  InvalidPayout: 'The payout amount is invalid. Enter a payout greater than zero and try again.',
  InvalidString: 'One of the text fields contains invalid characters or is malformed. Re-enter it and try again.',
  CapBelowCommitted: "The new budget cap is lower than what's already committed to tasks in this project. Raise the cap to at least the committed amount, or remove some tasks first.",
  SpentUnderflow: 'The project budget accounting is out of sync. Refresh and try again, or contact an admin.',
  FoldersRootStale: 'Another organizer changed the board layout while you were editing. Your changes were not saved — refresh and try again.',

  // ---- Shared permission / address guards ----
  Unauthorized: "You don't have permission for this action. Your role may be missing the required permission — contact an organization admin to have it granted.",
  RoleNotAllowed: "Your role isn't allowed to perform this action.",
  ZeroAddress: 'A required wallet address is missing or empty. Refresh the page and try again.',
  InvalidAddress: "The wallet address provided isn't valid. Reconnect your wallet or passkey and try again.",

  // ---- ParticipationToken: token / share requests ----
  NotMember: 'You must be a member of this organization to request shares. Make sure you have been assigned a member role.',
  ZeroAmount: 'The amount must be greater than zero.',
  NotApprover: "You don't have permission to approve requests.",
  AlreadyApproved: 'This request has already been approved.',
  RequestUnknown: 'This request no longer exists.',
  NotRequester: 'Only the person who made this request can cancel it.',
  AlreadySet: 'This value has already been configured.',
  TransfersDisabled: 'Transfers are disabled for participation shares.',
  NotTaskOrEdu: 'Only the task or education contracts can mint participation tokens.',

  // ---- PaymentManager: treasury / distributions ----
  InsufficientFunds: 'The treasury has insufficient funds for this operation.',
  InsufficientOrgBalance: "The organization's treasury balance is too low for this operation.",
  TransferFailed: 'Token transfer failed. Please check the token approval and try again.',
  AlreadyClaimed: 'You have already claimed this distribution.',
  OverClaimed: 'This would claim more than your allocation.',
  OptedOut: 'This account has opted out of distributions.',
  DistributionNotFound: 'That distribution does not exist.',
  DistributionAlreadyFinalized: 'This distribution has already been finalized.',
  ClaimPeriodNotExpired: 'The claim period for this distribution has not ended yet.',
  InvalidProof: 'Your distribution claim could not be verified. Refresh and try again.',
  SafeERC20FailedOperation: 'The token transfer was rejected by the token contract.',

  // ---- Voting ----
  AlreadyVoted: 'You have already voted on this proposal.',
  VotingExpired: 'Voting has ended for this proposal.',
  VotingOpen: 'Voting is still in progress for this proposal.',
  DurationOutOfRange: 'The voting duration is outside the allowed range.',
  TooManyOptions: 'There are too many options for this poll.',
  TooManyCalls: 'There are too many actions in this proposal batch.',
  WeightSumNot100: 'Your vote weights must add up to 100.',
  InvalidWeight: 'One of your vote weights is invalid.',
  InvalidThreshold: 'The approval threshold is invalid (it must be between 1 and 100).',
  InvalidProposal: 'This proposal is invalid or no longer exists.',
  DuplicateIndex: 'You selected the same option twice.',
  TargetNotAllowed: "The target contract isn't on this organization's voting allowlist. An admin must add it via a governance proposal.",
  // Thrown by the Executor (and, on pre-#185 deployments, by the voting contracts).
  // Self-amendment IS the intended governance path — POP PR #185 reverted the blanket
  // voting-contract guard — so the copy must not tell people to switch voting contracts.
  TargetSelf: 'This proposal targets a protocol contract with an action it will not accept on itself. Pick a different target for that action.',
  AlreadyExecuted: 'This proposal has already been executed.',

  // ---- Account registry / usernames ----
  AccountExists: 'You already have an account registered.',
  UsernameTaken: 'That username is already taken. Please choose another.',
  UsernameEmpty: 'Please enter a username.',
  UsernameTooLong: 'That username is too long.',
  InvalidChars: 'The username contains invalid characters. Use letters, numbers, and basic punctuation only.',

  // ---- Education hub ----
  InvalidAnswer: 'That answer is incorrect. Please review the material and try again.',

  // ---- Pause / generic guards ----
  EnforcedPause: 'This action is paused right now. Try again later or contact an admin.',
  Paused: 'This contract is currently paused.',

  // ---- Hats protocol (surfaces on every join / role-claim path) ----
  NotEligible: "You're not eligible for this role yet. You may need to be vouched for first.",
  AlreadyWearingHat: 'You already hold this role.',
  AllHatsWorn: 'This role has reached its member limit. Ask an admin to raise the limit.',
  HatNotActive: 'This role is currently switched off. Ask an admin to re-activate it.',
  NotAdminHats: "You don't administer that role, so you can't change it.",

  // ---- QuickJoin: H-03 open-hat claim gate ----
  // Raised both when the hat really is open-to-everyone AND when the eligibility
  // probe reverts (module missing / non-conforming) — the contract fails closed.
  HatOpenlyClaimable:
    "That role can't be claimed this way. Either it's already open to everyone (so an admin grants it directly), or this organization's role module needs attention. Ask an organization admin.",
  TooManyHats: 'Too many roles were requested at once (the limit is 20). Ask an admin to split this into smaller batches.',

  // ---- ZK Email invites: role claim ----
  // ZkEmailInvites raises this after it fails to grant email-eligibility — the org's
  // EligibilityModule may predate the email-verified path, or the claimer may be
  // barred from the role. Don't assert which.
  ClaimerNotEligible:
    "Your invite checked out, but this organization couldn't grant you the role. Ask an organization admin to check the role's eligibility settings.",
  EmailAlreadyRegistered:
    'This email address has already been used to claim a role here. Ask an organization admin to re-open it if you need to claim again.',
  NullifierAlreadyUsed: 'This email has already been used for a claim. Send yourself a fresh claim email and try again.',
  NotInAllowlist:
    "Your email address isn't on this organization's invite list. Ask an admin to add it, then send your claim email again.",
  AllowlistNotActive:
    "Email invites aren't switched on for this organization yet. An admin has to activate the invite list before anyone can claim.",
  InvalidDKIMKey:
    "Your email provider's signature couldn't be verified for this organization. Send the claim from a supported provider, or ask an admin to register your domain.",
  ZeroClaimer: 'No account was provided for this claim. Reconnect your wallet or passkey and try again.',
  EmptyHats: 'This invite has no roles attached. Ask an organization admin to fix the invite.',

  // ---- EligibilityModule: M-03 default-eligibility / vouching conflict ----
  // Fires when a role has vouching + "combine with hierarchy" while also being
  // default-eligible: the hierarchy path is ORed in, so the quorum never binds.
  DefaultEligibilityConflictsWithVouch:
    "A role can't be \"eligible by default\" while it also requires vouches combined with the role hierarchy — the vouch requirement would never apply. Turn off \"Eligible by default\" for that role.",
  InvalidMaxDailyVouches: 'That daily vouch limit is out of range. Pick a valid limit and try again.',
  NotAuthorizedEmailVerifier:
    "Only the organization itself, or a contract it has approved to grant roles, can mark an email as verified. Ask an organization admin.",

  // ---- Org deployment ----
  InvalidRoleConfiguration:
    'One of your roles is misconfigured. Check that you have between 1 and 32 roles, that every role has a name, that roles requiring vouches have a vouch count above zero and point at a real voucher role, and that no role is its own admin.',
  OrgExistsMismatch: 'An organization with this name already exists. Pick a different name and try again.',
  Reentrant: 'A deployment is already in progress. Wait for it to finish before starting another.',
  UnregisteredRole:
    "One of the permissions in your setup points at a role that doesn't exist. Go back to the Permissions step and re-check which roles are selected.",
  EmptyInit: 'A module was configured with no setup data. Refresh the deployment wizard and try again.',
  InitFailed: "One of the organization's modules failed to initialize. Review your settings and deploy again.",
  UnsupportedType: "One of the modules in this deployment isn't supported on this network yet. Refresh to pick up the latest modules.",

  // ---- Voting configuration (VotingErrors lib — never in the voting contract ABIs) ----
  TooManyPollHats: 'Too many roles were selected for this poll. Narrow it to fewer roles and try again.',
  InvalidSliceSum: 'The voting-power split has to add up to 100%. Adjust the percentages and try again.',
  TooManyClasses: 'Too many voting classes are configured. Remove one and try again.',
  InvalidClassCount: "The voting classes are misconfigured for this organization. An admin needs to fix the voting setup.",

  // ---- Executor / proposal execution ----
  CallFailed:
    'One of the actions in this proposal failed when it ran, so nothing was applied. Check the target contract and its inputs, then create a corrected proposal.',
  SweepFailed: 'The transfer out of the executor was rejected by the receiving address.',
  // Executor raises this from many admin entry points, not just hat minting.
  UnauthorizedCaller: "This account or contract isn't authorized to perform that action for this organization.",
  TimelockNotExpired: 'This change is still in its waiting period. Try again once the timelock has elapsed.',

  // ---- Paymaster sponsorship (gas sponsor declined) ----
  OnboardingLimitExceeded:
    'This organization has used up its sponsored sign-ups for now. Try again later, or join with a wallet that can pay its own gas.',
  OrgIsBanned: 'Gas sponsorship is disabled for this organization. Use a wallet that can pay its own gas.',
  OrgDeployDisabled: 'Sponsored organization deployment is currently switched off. Deploy with a funded wallet instead.',
  OnboardingDisabled: 'Sponsored sign-ups are currently switched off. Join with a wallet that can pay its own gas.',
  OnboardingDailyLimitExceeded: "Today's sponsored sign-ups are used up. Try again tomorrow, or use a funded wallet.",
  OrgDeployDailyLimitExceeded: "Today's sponsored deployments are used up. Try again tomorrow, or deploy with a funded wallet.",
  OrgDeployLimitExceeded: 'This account has reached its sponsored-deployment limit. Deploy with a funded wallet instead.',
  SolidarityLimitExceeded: "This organization has used up its shared gas allowance. Top up the organization's gas balance.",
  SolidarityDistributionIsPaused: 'Shared gas sponsorship is paused right now. Try again later.',
  GracePeriodSpendLimitReached:
    "This organization's starter gas allowance is used up. Top up its gas balance to keep sponsoring transactions.",
  InsufficientDepositForSolidarity: "The organization's gas balance is too low to sponsor this. Top it up and try again.",
  RuleDenied: "This action isn't on the organization's sponsored list, so gas can't be covered. Use a funded wallet.",
  GasTooHigh: 'This transaction needs more gas than the organization sponsors. Use a funded wallet, or ask an admin to raise the limit.',
  FeeTooHigh: 'The network fee is above what this organization sponsors right now. Try again when fees drop.',

  // ---- Cash out ----
  NotOwner: 'Only the account that made this request can recover it. Switch to that account and try again.',
  NoPendingRecovery: 'There is nothing to recover for this request — it may already have been recovered or completed.',
  RequestHashAlreadyFailed: 'This request has already been marked as failed. Recover the funds instead of retrying.',
  ETHTransferFailed: 'The transfer was rejected by the receiving address.',
  WouldDrainRecoveryFunds: 'This withdrawal would use funds reserved for pending recoveries. Lower the amount and try again.',
  WrongToken: 'The wrong token was supplied for this cash-out. Refresh and try again.',
  InsufficientDelivery:
    'Less arrived than was promised, so the transfer was rolled back. Nothing was lost — try again.',
  NotAuthorizedExecutor: 'This cash-out can only be completed by the authorized relay. Contact support if it stays stuck.',
  ZeroDepositor: 'No depositor was recorded for this request. Refresh and try again.',

  // ---- Passkey account ----
  InvalidSignature: "Your passkey signature wasn't accepted. Sign in again with the passkey registered to this account.",
  OnlyEntryPoint: 'This action can only run as part of a sponsored transaction. Refresh and try again.',
  OnlySelf: 'This action can only be performed by your own account. Refresh and try again.',
  ExecutionFailed: 'The action inside your transaction failed. Refresh and try again.',
  BeaconNotSet: "Passkey accounts aren't configured on this network yet. Join with a connected wallet instead.",
  MaxCredentialsReached: 'This account already has the maximum number of passkeys. Remove one before adding another.',
  CannotRemoveLastCredential: "You can't remove your only passkey — add another one first, or you'd lose access to this account.",
  CredentialExists: 'That passkey is already registered to this account.',
  CredentialNotActive: 'That passkey is no longer active on this account.',
  CredentialNotFound: "That passkey isn't registered to this account.",
  GuardianAlreadyExists: 'That account is already a recovery guardian.',
  GuardianDoesNotExist: "That account isn't a recovery guardian.",
  NotAGuardian: "You're not a recovery guardian for that account.",
  InvalidPublicKey: "That passkey's public key isn't valid. Create the passkey again and retry.",
  RecoveryDisabled: 'Recovery is switched off for this account. Add guardians and set a threshold first.',
  ThresholdExceedsGuardianCount: 'The approval threshold is higher than the number of guardians. Lower it, or add more guardians.',
  RecoveryAlreadyPending: 'A recovery is already in progress for this account.',
  RecoveryDelayNotPassed: 'The recovery waiting period has not finished yet.',
  RecoveryNotPending: 'There is no recovery in progress for this account.',
  OnlyGuardian: 'Only a recovery guardian can do this.',
  OnlyGuardianOrSelf: 'Only you or one of your recovery guardians can do this.',

  // ---- Misc modules ----
  TokenNotWired: "The participation-token contract isn't wired to this education hub yet. An admin has to finish the setup first.",
  EmptyString: "That field can't be blank. Enter a value and try again.",
  StringTooLong: 'That value is too long. Shorten it and try again.',
  NotToggleAdmin: "You don't have permission to switch roles on or off. Ask an organization admin.",
  AlreadyCompleted: "You've already completed this module.",
  ERC20InsufficientBalance: "You don't have enough tokens for this transfer.",
  ERC20InsufficientAllowance: 'This contract is not approved to move that many of your tokens yet. Approve it and try again.',
  ReentrancyGuardReentrantCall: 'That action is already running. Wait for it to finish before trying again.',
};

/**
 * Friendly messages for legacy `require(cond, "string")` reverts (Error(string)).
 * Keyed by a lowercased substring of the require message. Kept small — most
 * POA contracts use custom errors; this covers the few Hats-protocol-style
 * string reverts (e.g. the role-claim eligibility check) so the passkey path
 * shows the same actionable copy as the EOA path's REVERT_PATTERNS.
 */
const REQUIRE_STRING_MESSAGES = {
  'not eligible to claim hat': "You're not eligible to claim this role yet. You may need more vouches, or you may already hold it.",
  'not eligible': "You're not eligible for this action yet.",
  'already wearing': 'You already hold this role.',
};

/**
 * Resolve a friendly message for a contract error NAME. Returns null if the name
 * has no curated message (callers then fall back to a generic message or to the
 * raw name).
 */
export function messageForErrorName(name) {
  if (!name) return null;
  return CONTRACT_ERROR_MESSAGES[name] || null;
}

/**
 * Resolve a friendly message for a raw require()-string revert reason via
 * substring match. Returns null when nothing matches (caller shows the raw string).
 */
export function messageForRequireString(reason) {
  if (!reason || typeof reason !== 'string') return null;
  const lower = reason.toLowerCase();
  for (const [key, message] of Object.entries(REQUIRE_STRING_MESSAGES)) {
    if (lower.includes(key)) return message;
  }
  return null;
}

/** True for a `0x…` string with at least a 4-byte selector of payload. */
function looksLikeRevertData(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(s.trim());
}

/**
 * Normalize an `abi` argument (array of fragments, JSON ABI, or an already-built
 * ethers Interface) into an Interface, or null.
 */
function toInterface(abi) {
  if (!abi) return null;
  if (typeof abi.parseError === 'function') return abi; // already an Interface
  try {
    return new ethers.utils.Interface(abi);
  } catch {
    return null;
  }
}

/**
 * Decode raw revert bytes into { name, reason, message, isStringError, args }.
 *
 * Handles the three on-chain revert shapes:
 *   - Error(string)  → returns the embedded string as `reason` (isStringError)
 *   - Panic(uint256) → a generic internal-error message
 *   - custom error   → name via the supplied Interface (preferred) or the
 *                      selector map; `message` is the curated friendly message
 *                      (or null if the name has no curated copy).
 *
 * Returns null when `data` isn't decodable revert bytes.
 *
 * @param {string} data - hex revert data (0x…)
 * @param {Array|Object} [abi] - contract ABI/fragments or a built ethers Interface
 */
export function decodeRevertData(data, abi = null) {
  if (!looksLikeRevertData(data)) return null;
  const hex = data.trim().toLowerCase();
  const selector = hex.slice(0, 10);

  // Error(string) — the classic require/revert string (e.g. "Not eligible to claim hat")
  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const [reason] = ethers.utils.defaultAbiCoder.decode(['string'], '0x' + hex.slice(10));
      if (!reason) return null;
      return {
        name: 'Error',
        reason,
        message: messageForErrorName(reason) || messageForRequireString(reason),
        isStringError: true,
      };
    } catch {
      return null;
    }
  }

  // Panic(uint256) — assert / arithmetic overflow / etc.
  if (selector === PANIC_SELECTOR) {
    return {
      name: 'Panic',
      reason: 'Panic',
      message: 'The transaction hit an internal contract error. Please refresh and try again, or contact an admin if it persists.',
    };
  }

  // Custom error: prefer the contract's own Interface (recovers args + exact name).
  const iface = toInterface(abi);
  if (iface) {
    try {
      const decoded = iface.parseError(hex);
      return { name: decoded.name, reason: decoded.name, message: messageForErrorName(decoded.name), args: decoded.args };
    } catch {
      /* fall through to selector map */
    }
  }

  // Cross-contract fallback: selector → name map.
  const name = CONTRACT_ERROR_SELECTORS[selector];
  if (name) return { name, reason: name, message: messageForErrorName(name) };

  return null;
}

/**
 * Walk an ethers-style error object and return the FIRST hex blob that looks
 * like revert data. ethers v5 stows it inconsistently depending on whether the
 * failure was a sent-tx revert or a gas-estimation (UNPREDICTABLE_GAS_LIMIT)
 * wrapper, so we probe the gas-estimation locations first (error.error.data.data
 * / error.error.data) before the top-level (error.data) used by sent-tx reverts.
 */
export function extractRevertDataFromError(error) {
  if (!error || typeof error !== 'object') return null;
  const candidates = [];
  const seen = new Set();
  const visit = (node, depth) => {
    if (!node || depth > 6 || seen.has(node)) return;
    if (typeof node === 'string') {
      if (looksLikeRevertData(node)) candidates.push(node);
      return;
    }
    if (typeof node !== 'object') return;
    seen.add(node);
    // Gas-estimation wrapper: revert bytes nested under error.error.data(.data)
    if (node.error && typeof node.error === 'object') visit(node.error, depth + 1);
    if (node.data !== undefined) visit(node.data, depth + 1);
    if (node.originalError) visit(node.originalError, depth + 1);
    if (node.cause && typeof node.cause === 'object') visit(node.cause, depth + 1);
  };
  // Probe the nested gas-estimation path first, then the whole tree.
  visit(error.error?.data?.data, 0);
  visit(error.error?.data, 0);
  visit(error.data, 0);
  if (candidates.length === 0) visit(error, 0);
  return candidates.find(looksLikeRevertData) || null;
}

/**
 * Extract candidate revert-data hex blobs from a FREE-TEXT error message
 * (viem / Pimlico bundler / passkey path). CRITICAL: only hex that FOLLOWS a
 * revert marker ("reason:", "reverted …") is returned — never blind-scanned —
 * so we don't accidentally grab the UserOp's own `sender`/`callData`/`paymaster`
 * hex (which would mis-decode to a confidently-wrong error). Longest blobs come
 * first (string reverts and custom errors with args are longer than bare
 * selectors), and callers should decode each in order, taking the first that
 * resolves to a known error.
 *
 * @returns {string[]} de-duplicated candidate hex strings, longest first
 */
export function extractRevertDataFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  // Anchor to a revert marker, allowing intervening words/punctuation but NOT
  // another `0x…` (so we bind to the hex closest after the marker).
  const re = /(?:revert(?:ed|s)?|reason)[^0]*?(0x[0-9a-fA-F]{8,})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * One-shot helper: given an error envelope (object) and/or its message text,
 * return a decoded { name, reason, message, isStringError } or null.
 * Tries structured object extraction first (EOA), then anchored text extraction
 * (passkey/bundler), decoding each text candidate until one resolves to a KNOWN
 * error (a curated message, a custom-error name, or a string reason).
 *
 * @param {Object} [error] - the error object (ethers or viem)
 * @param {string} [text] - free-text message(s) to scan (joined)
 * @param {Array|Object} [abi] - contract ABI/fragments or Interface for custom-error names
 */
export function decodeContractRevert(error = null, text = '', abi = null) {
  // 1. Structured (EOA / ethers): the revert bytes live in the error object.
  if (error) {
    const data = extractRevertDataFromError(error);
    if (data) {
      const decoded = decodeRevertData(data, abi);
      if (decoded) return decoded;
    }
  }

  // 2. Free-text (passkey / viem bundler): scan anchored hex candidates and keep
  // the first that decodes to something we recognize.
  if (text) {
    const candidates = extractRevertDataFromText(text);
    let firstAny = null;
    for (const hex of candidates) {
      const decoded = decodeRevertData(hex, abi);
      if (!decoded) continue;
      if (!firstAny) firstAny = decoded;
      // Prefer a candidate we have a curated message for, or a string reason.
      if (decoded.message || decoded.isStringError) return decoded;
    }
    if (firstAny) return firstAny;
  }

  return null;
}

# Wave G frontend retirement

Support requires the indexed MembershipAuthority address, current binding and a positive cutover timestamp.
The same rule applies to org discovery, direct links, cached lookup hints and cross-chain profile memberships.
Missing schema or authority read errors fail closed. There is no fixed survivor name allowlist.

Kansas Blockchain/KUBI, Decentral Park, Poa and migrated Test6 retain their organization ids and all activity.
The public Test6 directory exclusion remains a sandbox presentation choice; direct sandbox routes still work.
No activity query has a migration-date cutoff. Unmigrated Argus and other old orgs stay indexed for archival
integrity, but cannot be selected or opened as supported organizations. Native V2 deployments are supported.

Joining uses authority `canClaim` preflight and `claim`; vouches use subject-specific authority actions.
Current QuickJoin autojoin and org-sponsored registration remain available for authority QJ_AUTOJOIN roles;
other account creation uses protocol registration before a role is claimed. Legacy application,
vouch-first passkey and caller-selected QuickJoin Hats claim APIs are removed. Legacy transaction decoding
for retained activity remains available. New org deployment rejects VERSION major 1.

Project/education/token/voting permission controls use the current authority model and fail closed on missing
permission reads. Project masks resolve role and group context independently, honoring explicit zero overrides
and `inheritGlobal`. New projects inherit current organization permissions and submit empty retired role arrays.

## Release order

Publish the authority-aware subgraph before shipping this frontend. Verify each surviving org is indexed as
bound/cut over at its serving endpoint. This branch does not broadcast, deploy, upgrade beacons or publish.
Run the repository build, unit suite, lint and production E2E leakage check, then verify supported org history,
retired direct links, explore/search, current joining and project permissions in desktop and mobile browsers.

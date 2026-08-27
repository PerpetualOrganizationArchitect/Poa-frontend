/**
 * `Project.managers` is fetched by its OWN document (FETCH_PROJECT_MANAGERS) rather
 * than as a field on the ~60-field projects document, because one unknown field fails
 * the whole document and that one backs the entire task board.
 *
 * That split only works because of a non-obvious Apollo property, which this file pins:
 * both documents select `projects(where: { deleted: false }, first: 50)` with IDENTICAL
 * arguments, so they write to the SAME cache field key on the same `TaskManager` entity.
 *
 * The consequence that matters: when the projects document's 40s poll brings in a
 * project the managers query has never seen (someone else created one), the managers
 * query's cached diff becomes INCOMPLETE, so its cache-first watchQuery refetches by
 * itself. Without that, a project manager would be denied their own affordances until a
 * full reload — and `FETCH_PROJECT_MANAGERS` has no poll of its own.
 *
 * If someone changes either document's `projects` arguments, these tests fail and the
 * self-heal is silently gone.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryCache, ApolloClient, ApolloLink, Observable, gql } from '@apollo/client';
import { FETCH_PROJECT_MANAGERS, FETCH_PROJECTS_DATA_NEW } from './queries';

const ORG = '0x112de94b';
const TM = '0xd17d6038';
const MANAGER = '0xc04c8604';

const managersResult = (count) => ({
  organization: {
    __typename: 'Organization',
    id: ORG,
    taskManager: {
      __typename: 'TaskManager',
      id: TM,
      projects: Array.from({ length: count }, (_, i) => ({
        __typename: 'Project',
        id: `${TM}-${i}`,
        managers: [{ __typename: 'ProjectManager', manager: i === 3 ? MANAGER : `0xmgr${i}` }],
      })),
    },
  },
});

/** Stand-in for the board poll: the SAME `projects` field + args as the real document. */
const PROJECTS_MINI = gql`
  query FetchProjectsMini($orgId: Bytes!) {
    organization(id: $orgId) {
      id
      taskManager {
        id
        projects(where: { deleted: false }, first: 50) {
          id
          title
        }
      }
    }
  }
`;

const projectsResult = (count) => ({
  organization: {
    __typename: 'Organization',
    id: ORG,
    taskManager: {
      __typename: 'TaskManager',
      id: TM,
      projects: Array.from({ length: count }, (_, i) => ({
        __typename: 'Project', id: `${TM}-${i}`, title: `p${i}`,
      })),
    },
  },
});

describe('FETCH_PROJECT_MANAGERS shares a cache field key with the board document', () => {
  it('writes to the same TaskManager.projects storeFieldName', () => {
    const a = new InMemoryCache();
    a.writeQuery({ query: FETCH_PROJECT_MANAGERS, variables: { orgId: ORG }, data: managersResult(3) });
    const b = new InMemoryCache();
    b.writeQuery({ query: FETCH_PROJECTS_DATA_NEW, variables: { orgId: ORG }, data: projectsResult(3) });

    const keyOf = (cache) => Object.keys(cache.extract()[`TaskManager:${TM}`])
      .filter((k) => k.startsWith('projects'));

    expect(keyOf(a)).toEqual(keyOf(b));
    // Guard the args themselves, so a future edit to either document is loud.
    expect(keyOf(a)).toEqual(['projects({"first":50,"where":{"deleted":false}})']);
  });
});

describe('managers self-heal when the board poll adds an unseen project', () => {
  it('refetches on its own, so a new project\'s manager is not stranded', async () => {
    const cache = new InMemoryCache();
    let managersCalls = 0;
    let projectCount = 3;

    const link = new ApolloLink((op) => new Observable((obs) => {
      if (op.operationName === 'FetchProjectManagers') managersCalls += 1;
      obs.next({
        data: op.operationName === 'FetchProjectManagers'
          ? managersResult(projectCount)
          : projectsResult(projectCount),
      });
      obs.complete();
    }));
    const client = new ApolloClient({ link, cache });

    const managersObs = client.watchQuery({
      query: FETCH_PROJECT_MANAGERS, variables: { orgId: ORG }, fetchPolicy: 'cache-first',
    });
    managersObs.subscribe({ next: () => {} });
    await new Promise((r) => setTimeout(r, 10));

    expect(managersCalls).toBe(1);
    expect(managersObs.getCurrentResult().data.organization.taskManager.projects).toHaveLength(3);

    // The board's poll tick: another member's new project lands via the OTHER document.
    projectCount = 4;
    await client.query({ query: PROJECTS_MINI, variables: { orgId: ORG }, fetchPolicy: 'network-only' });
    await new Promise((r) => setTimeout(r, 50));

    const projects = managersObs.getCurrentResult().data?.organization?.taskManager?.projects || [];
    expect(managersCalls).toBe(2);            // refetched without anyone asking
    expect(projects).toHaveLength(4);
    expect(projects.find((p) => p.id === `${TM}-3`).managers[0].manager).toBe(MANAGER);
  });
});

describe('managersLoaded across an org switch', () => {
  /**
   * `ProjectContext.managersLoaded` is `!!managersData?.organization?.taskManager`, and the
   * CLAIM gate only DENIES once it is true. Switching orgs must therefore not leave the
   * previous org's TaskManager visible on the observable: `managers` would then be read
   * from an org the user is not even looking at, and `_isPM` would answer for the wrong
   * project set — allowing or denying claims on the strength of stale authority.
   */
  it('does not report the previous org\'s TaskManager while the new org is still in flight', async () => {
    const ORG2 = '0xdeadbeef';
    const TM2 = '0xfeedface';
    const cache = new InMemoryCache();
    let resolveSecond;
    const link = new ApolloLink((op) => new Observable((obs) => {
      if (op.variables.orgId === ORG) {
        obs.next({ data: managersResult(2) });
        obs.complete();
        return;
      }
      // Hold the second org's response open — this is the window under test.
      resolveSecond = () => {
        obs.next({
          data: {
            organization: {
              __typename: 'Organization', id: ORG2,
              taskManager: {
                __typename: 'TaskManager', id: TM2,
                projects: [{ __typename: 'Project', id: `${TM2}-0`, managers: [] }],
              },
            },
          },
        });
        obs.complete();
      };
    }));
    const client = new ApolloClient({ link, cache });

    const obs = client.watchQuery({
      query: FETCH_PROJECT_MANAGERS, variables: { orgId: ORG }, fetchPolicy: 'cache-first',
    });
    obs.subscribe({ next: () => {}, error: () => {} });
    await new Promise((r) => setTimeout(r, 10));
    expect(obs.getCurrentResult().data?.organization?.taskManager?.id).toBe(TM);

    obs.setVariables({ orgId: ORG2 });
    await new Promise((r) => setTimeout(r, 10));

    // The gate must read "not loaded", never the old org's TaskManager.
    const inFlight = obs.getCurrentResult().data?.organization?.taskManager;
    expect(inFlight?.id).not.toBe(TM);
    expect(!!inFlight).toBe(false);

    resolveSecond();
    await new Promise((r) => setTimeout(r, 10));
    expect(obs.getCurrentResult().data?.organization?.taskManager?.id).toBe(TM2);
  });
});

import { isSupportedOrganization, ORGANIZATION_SUPPORT_FIELDS } from '@/lib/supportedOrganizations';

const PAGE_SIZE = 100;
export const ORGANIZATION_DIRECTORY_QUERY = `
  query FetchAllOrgs($after: Bytes!, $first: Int!) {
    organizations(first: $first, where: { id_gt: $after }, orderBy: id, orderDirection: asc) {
      id name metadataHash deployedAt
      ${ORGANIZATION_SUPPORT_FIELDS}
      metadata { description logo }
      participationToken { id totalSupply }
      quickJoin { id }
      users(first: 1000) { id }
    }
  }
`;

/** Every page must support cutover fields. Never retry with a legacy schema document. */
export async function fetchSupportedOrganizations(endpoint, { fetcher = fetch } = {}) {
  const organizations = [];
  let after = '0x';
  while (true) {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ORGANIZATION_DIRECTORY_QUERY, variables: { after, first: PAGE_SIZE } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Organization directory HTTP ${response.status}`);
    const json = await response.json();
    if (json?.errors?.length) throw new Error(json.errors[0].message || 'Organization directory query failed');
    const page = json?.data?.organizations;
    if (!Array.isArray(page)) throw new Error('Organization directory returned no organization list');
    organizations.push(...page.filter(isSupportedOrganization));
    if (page.length < PAGE_SIZE) return organizations;
    const next = page.at(-1)?.id;
    if (!next || next <= after) throw new Error('Organization directory cursor did not advance');
    after = next;
  }
}

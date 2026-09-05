/**
 * Graph-node caps collection queries, so an org-wide membership roster must be read in pages.
 * Keep this outside React so the completeness and no-progress guarantees stay directly testable.
 */

export const AUTHORITY_MEMBERSHIP_PAGE_SIZE = 1000;

function assertPage(page) {
  if (!Array.isArray(page)) {
    throw new Error('The membership subgraph returned an invalid page.');
  }
}
/**
 * Append every membership page, deduplicating by the entity id Graph supplies on every row.
 * A full page with no new ids means the endpoint ignored `skip` (or otherwise stopped making
 * progress); fail closed instead of looping forever or calling a partial roster complete.
 */
export async function fetchAllAuthorityMembershipRows({
  firstPage,
  fetchPage,
  pageSize = AUTHORITY_MEMBERSHIP_PAGE_SIZE,
}) {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('Membership page size must be a positive integer.');
  }
  if (typeof fetchPage !== 'function') {
    throw new Error('A membership page loader is required.');
  }

  const rows = [];
  const seenIds = new Set();
  let page = firstPage;
  let skip = 0;

  while (true) {
    assertPage(page);
    if (page.length > pageSize) {
      throw new Error('The membership subgraph returned more rows than requested.');
    }

    let added = 0;
    for (const row of page) {
      const id = String(row?.id || '');
      if (!id) throw new Error('A membership row is missing its entity id.');
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      rows.push(row);
      added += 1;
    }

    skip += page.length;
    if (page.length < pageSize) return rows;
    if (added === 0) {
      throw new Error('Membership pagination made no progress.');
    }

    page = await fetchPage({ first: pageSize, skip });
  }
}

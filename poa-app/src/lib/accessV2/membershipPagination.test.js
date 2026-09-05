import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_MEMBERSHIP_PAGE_SIZE,
  fetchAllAuthorityMembershipRows,
} from './membershipPagination';

const row = (id) => ({ id: `membership-${id}` });

describe('fetchAllAuthorityMembershipRows', () => {
  it('does not issue another request when the first page is complete', async () => {
    const fetchPage = vi.fn();
    await expect(fetchAllAuthorityMembershipRows({
      firstPage: [row(1)],
      fetchPage,
      pageSize: 2,
    })).resolves.toEqual([row(1)]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('loads role holders beyond the real 1,000-row graph page cap', async () => {
    const firstPage = Array.from(
      { length: AUTHORITY_MEMBERSHIP_PAGE_SIZE },
      (_, index) => row(index),
    );
    const fetchPage = vi.fn().mockResolvedValue([row(AUTHORITY_MEMBERSHIP_PAGE_SIZE)]);

    const result = await fetchAllAuthorityMembershipRows({ firstPage, fetchPage });

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledWith({
      first: AUTHORITY_MEMBERSHIP_PAGE_SIZE,
      skip: AUTHORITY_MEMBERSHIP_PAGE_SIZE,
    });
    expect(result).toHaveLength(AUTHORITY_MEMBERSHIP_PAGE_SIZE + 1);
    expect(result.at(-1)).toEqual(row(AUTHORITY_MEMBERSHIP_PAGE_SIZE));
  });

  it('keeps paging after an exact multiple until a short terminal page arrives', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce([row(3), row(4)])
      .mockResolvedValueOnce([]);

    await expect(fetchAllAuthorityMembershipRows({
      firstPage: [row(1), row(2)],
      fetchPage,
      pageSize: 2,
    })).resolves.toEqual([row(1), row(2), row(3), row(4)]);
    expect(fetchPage.mock.calls).toEqual([
      [{ first: 2, skip: 2 }],
      [{ first: 2, skip: 4 }],
    ]);
  });

  it('fails closed when a full page repeats instead of marking partial data complete', async () => {
    const firstPage = [row(1), row(2)];
    await expect(fetchAllAuthorityMembershipRows({
      firstPage,
      fetchPage: vi.fn().mockResolvedValue(firstPage),
      pageSize: 2,
    })).rejects.toThrow(/made no progress/i);
  });

  it('propagates a later-page failure', async () => {
    await expect(fetchAllAuthorityMembershipRows({
      firstPage: [row(1), row(2)],
      fetchPage: vi.fn().mockRejectedValue(new Error('gateway unavailable')),
      pageSize: 2,
    })).rejects.toThrow('gateway unavailable');
  });
});

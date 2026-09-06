import { describe, expect, it } from 'vitest';
import { parseEml } from '@/lib/zkemail/prover';

describe('email claim identity', () => {
  it('keeps the proven From domain separate from a mail provider’s DKIM signing domain', () => {
    const parsed = parseEml('From: Alice <Alice@ACME.org>\r\nDKIM-Signature: v=1; d=provider.net;\r\n s=mail; b=proof\r\n\r\nBody');
    expect(parsed.fromEmail).toBe('Alice@ACME.org');
    expect(parsed.fromDomain).toBe('acme.org');
    expect(parsed.dkimDomain).toBe('provider.net');
  });
});

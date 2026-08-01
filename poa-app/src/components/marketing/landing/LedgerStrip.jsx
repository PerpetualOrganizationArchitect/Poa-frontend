import React from 'react';
import { LEDGER } from '@/components/marketing/landingCopy';
import { LedgerBand } from '@/components/marketing/primitives';

// The civic-navy ledger stat band brought up under the hero: the one full-bleed
// civic moment at the fold. Real Argus capture numbers only.

export default function LedgerStrip() {
  return (
    <LedgerBand
      title={LEDGER.title}
      refLabel={LEDGER.ref}
      cells={LEDGER.cells}
      ariaLabel="Poa by the numbers"
    />
  );
}

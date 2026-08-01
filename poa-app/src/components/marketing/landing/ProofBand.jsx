import React from 'react';
import NextLink from 'next/link';
import { PROOF } from '@/components/marketing/landingCopy';
import { SectionShell } from '@/components/marketing/primitives';
import useLandingRegistry from '@/components/marketing/landing/useLandingRegistry';

// Section 7 · Proof band. The trust engine: the keep-verbatim line, LIVE
// registry counts, and the explore link. Live numbers are the proof. The count
// sentence renders in a height-reserved slot: it fills once the (deduped,
// cross-chain) registry fetch answers and stays quietly empty if it never does,
// so there is no hydration mismatch and no layout shift. Mirrors the charter
// proof section's live-count behavior exactly.

const C = PROOF;

export default function ProofBand() {
  const { isLoading, counts } = useLandingRegistry();
  const showCount = !isLoading && counts.orgs > 0;

  return (
    <SectionShell id="proof" rail={C.rail} hairline ariaLabelledby="proof-heading">
      <div className="pa-proof-inner poa-reveal">
        <p className="pa-kicker">
          <span className="pa-kicker-no">07</span>
          {C.kicker}
        </p>

        <p className="pa-proof-line" id="proof-heading">
          Every organization on Poa is public:{' '}
          <span className="pa-proof-line-em">its rules, its decisions, its books.</span>
        </p>

        <div className="pa-proof-count" aria-live="polite">
          {showCount ? (
            <span className="pa-proof-count-text">
              <span className="pa-proof-count-num">{counts.orgs}</span> organization
              {counts.orgs === 1 ? '' : 's'}
              {counts.members > 0 ? (
                <>
                  {' and '}
                  <span className="pa-proof-count-num">{counts.members}</span> member
                  {counts.members === 1 ? '' : 's'}
                </>
              ) : (
                ''
              )}{' '}
              {C.countSuffix}
            </span>
          ) : null}
        </div>

        <NextLink href={C.ctaHref} className="pa-cta-ghost pa-proof-cta">
          {C.cta}
          <span className="pa-arrow">→</span>
        </NextLink>
      </div>

      <style jsx>{`
        .pa-proof-inner {
          grid-column: 2 / 13;
          text-align: center;
          padding: 8px 0;
        }
        .pa-proof-inner :global(.pa-kicker) {
          justify-content: center;
        }
        .pa-proof-line {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 580;
          font-weight: 580;
          font-size: clamp(1.7rem, 3.6vw, 2.9rem);
          line-height: 1.16;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0 auto 24px;
          max-width: 22ch;
        }
        .pa-proof-line-em {
          color: var(--signal-deep);
        }
        .pa-proof-count {
          min-height: 1.9rem;
          margin-bottom: 20px;
        }
        .pa-proof-count-text {
          font-family: var(--mono);
          font-size: 14px;
          letter-spacing: 0.03em;
          color: var(--steel);
        }
        .pa-proof-count-num {
          color: var(--signal);
          font-weight: 500;
        }
        /* .pa-proof-cta is on a NextLink; scope via the parent + :global(). */
        .pa-proof-inner :global(.pa-proof-cta) {
          justify-content: center;
        }

        @media (max-width: 1080px) {
          .pa-proof-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-proof-inner {
            grid-column: 1 / 2;
          }
          .pa-proof-line {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

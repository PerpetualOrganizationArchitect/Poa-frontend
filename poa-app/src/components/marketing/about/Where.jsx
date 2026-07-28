import React from 'react';
import NextLink from 'next/link';
import { WHERE } from '@/components/marketing/aboutCopy';
import { SectionShell } from '@/components/marketing/primitives';
import useLandingRegistry from '@/components/marketing/landing/useLandingRegistry';

// Block 5 · Where we are. Honest and small: a plain statement of the current
// state, the LIVE registry counts as the proof of that honesty, and the explore
// link. The count sentence renders in a height-reserved slot: it fills once the
// (deduped, cross-chain) registry fetch answers and stays quietly empty if it
// never does, so there is no hydration mismatch and no layout shift. Mirrors the
// landing ProofBand's live-count behavior.

const C = WHERE;

export default function Where() {
  const { isLoading, counts } = useLandingRegistry();
  const showCount = !isLoading && counts.orgs > 0;

  return (
    <SectionShell id="about-where" rail={C.rail} hairline ariaLabelledby="about-where-heading">
      <div className="pa-where-inner poa-reveal">
        <p className="pa-kicker">
          <span className="pa-kicker-no">05</span>
          {C.kicker}
        </p>

        <h2 className="pa-where-head" id="about-where-heading">
          {C.heading}
        </h2>
        <p className="pa-where-body">{C.body}</p>

        <div className="pa-where-count" aria-live="polite">
          {showCount ? (
            <span className="pa-where-count-text">
              <span className="pa-where-count-num">{counts.orgs}</span> organization
              {counts.orgs === 1 ? '' : 's'}
              {counts.members > 0 ? (
                <>
                  {' and '}
                  <span className="pa-where-count-num">{counts.members}</span> member
                  {counts.members === 1 ? '' : 's'}
                </>
              ) : (
                ''
              )}{' '}
              {C.countSuffix}
            </span>
          ) : null}
        </div>

        <NextLink href={C.ctaHref} className="pa-cta-ghost pa-where-cta">
          {C.cta}
          <span className="pa-arrow">→</span>
        </NextLink>
      </div>

      <style jsx>{`
        .pa-where-inner {
          grid-column: 2 / 12;
          padding: 8px 0;
        }
        .pa-where-head {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(1.9rem, 4vw, 3rem);
          line-height: 1.04;
          letter-spacing: -0.022em;
          color: var(--ink);
          margin: 0 0 22px;
          max-width: 18ch;
        }
        .pa-where-body {
          font-size: 18px;
          line-height: 1.6;
          color: var(--steel);
          margin: 0 0 28px;
          max-width: 52ch;
        }
        .pa-where-count {
          min-height: 1.9rem;
          margin-bottom: 22px;
        }
        .pa-where-count-text {
          font-family: var(--mono);
          font-size: 14px;
          letter-spacing: 0.03em;
          color: var(--steel);
        }
        .pa-where-count-num {
          color: var(--signal);
          font-weight: 500;
        }

        @media (max-width: 1080px) {
          .pa-where-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-where-inner {
            grid-column: 1 / 2;
          }
          .pa-where-head,
          .pa-where-body {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

import React from 'react';
import NextLink from 'next/link';
import { START_CLOSE } from '@/components/marketing/landingCopy';
import { SectionShell, RulePair } from '@/components/marketing/primitives';

// Section 9 · Start + close. Convert: the compressed three steps
// (choose the rules → bring the people → run it in the open), the always-safe
// charges-nothing line, and the CTA pair. The closing grace note lives in the
// footer colophon, not here (BRIEF §2 demotion).

const C = START_CLOSE;

export default function StartClose() {
  return (
    <SectionShell id="start" rail={C.rail} hairline ariaLabelledby="start-heading">
      <div className="pa-start-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">09</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="start-heading">
          {C.heading}
        </h2>
      </div>

      <ol className="pa-start-steps poa-reveal">
        {C.steps.map((s) => (
          <li key={s.no} className="pa-start-step">
            <span className="pa-start-no">{s.no}</span>
            <div>
              <h3 className="pa-start-title">{s.title}</h3>
              <p className="pa-start-text">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="pa-start-cta poa-reveal">
        <div className="pa-start-cta-row">
          <NextLink href="/create" className="pa-cta-solid pa-cta-lg">
            {C.ctaPrimary}
          </NextLink>
          <NextLink href={C.ctaSecondaryHref} className="pa-cta-ghost">
            {C.ctaSecondary}
            <span className="pa-arrow">→</span>
          </NextLink>
        </div>
        <p className="pa-start-quiet">
          <span className="pa-start-quiet-tick" aria-hidden="true" />
          {C.quiet}
        </p>
      </div>

      <style jsx>{`
        .pa-start-head {
          grid-column: 2 / 6;
        }
        .pa-start-steps {
          grid-column: 6 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-start-step {
          display: flex;
          gap: 22px;
          padding: 24px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-start-step:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-start-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--bone);
          background: var(--ink);
          padding: 3px 7px;
          height: fit-content;
          flex: none;
          letter-spacing: 0.04em;
        }
        .pa-start-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 21px;
          letter-spacing: -0.012em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-start-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 52ch;
        }
        .pa-start-cta {
          grid-column: 6 / 14;
          margin-top: 44px;
          padding-top: 32px;
          border-top: 2px solid var(--ink);
        }
        .pa-start-cta-row {
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .pa-start-quiet {
          margin: 24px 0 0;
          padding-left: 18px;
          position: relative;
          font-size: 14.5px;
          color: var(--steel);
        }
        .pa-start-quiet-tick {
          position: absolute;
          left: 0;
          top: 7px;
          width: 8px;
          height: 8px;
          background: var(--signal);
        }

        @media (max-width: 1080px) {
          .pa-start-head,
          .pa-start-steps,
          .pa-start-cta {
            grid-column: 2 / 14;
          }
          .pa-start-steps {
            margin-top: 36px;
          }
        }
        @media (max-width: 720px) {
          .pa-start-head,
          .pa-start-steps,
          .pa-start-cta {
            grid-column: 1 / 2;
          }
          .pa-start-text {
            max-width: 100%;
          }
          .pa-start-cta-row :global(.pa-cta-solid.pa-cta-lg) {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </SectionShell>
  );
}

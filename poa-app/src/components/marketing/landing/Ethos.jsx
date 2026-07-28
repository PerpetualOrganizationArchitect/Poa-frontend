import React from 'react';
import NextLink from 'next/link';
import { ETHOS } from '@/components/marketing/landingCopy';
import useLandingRegistry, {
  internalOrgUrl,
} from '@/components/marketing/landing/useLandingRegistry';

// Section 8 · Ethos plate. The mission-charged moment on the civic-deep plate.
// "The people who do the work own the most" promoted to the centerpiece; the
// affirmation-of-property body (no villains); the single permitted
// rented-software sentence; and the self-host line, linked to the live Poa org
// only once the registry confirms it exists (a structural answer to "who is we").

const C = ETHOS;

export default function Ethos() {
  const { isLoading, orgs } = useLandingRegistry();
  const poaOrg = !isLoading ? orgs.find((po) => po.id?.toLowerCase() === 'poa') : null;

  return (
    <section className="pa-ethos" id="the-reason" aria-labelledby="ethos-heading">
      <div className="pa-container pa-grid">
        <span className="pa-rail pa-rail-band" aria-hidden="true">
          {C.rail}
        </span>

        <div className="pa-ethos-inner poa-reveal">
          <div className="pa-ethos-rule" aria-hidden="true">
            <span className="pa-ethos-rule-sig" />
            <span className="pa-ethos-rule-hair" />
          </div>
          <p className="pa-kicker pa-kicker-inv">
            <span className="pa-kicker-no pa-kicker-no-inv">08</span>
            {C.kicker}
          </p>

          <h2 className="pa-ethos-center" id="ethos-heading">
            {C.centerpiece}
          </h2>

          <p className="pa-ethos-body">{C.body}</p>
          <p className="pa-ethos-rented">{C.rented}</p>

          <p className="pa-ethos-self">
            {C.selfHost}{' '}
            {poaOrg ? (
              <NextLink href={internalOrgUrl(poaOrg.id)} className="pa-ethos-link">
                {C.selfHostLink}
              </NextLink>
            ) : (
              <span className="pa-ethos-link-flat">{C.selfHostLink}</span>
            )}
            .
          </p>
        </div>
      </div>

      <style jsx>{`
        .pa-ethos {
          background: var(--civic-deep);
          color: var(--bone);
          padding: 104px 0;
          border-top: 3px solid var(--signal);
        }
        .pa-ethos-inner {
          grid-column: 2 / 12;
        }
        .pa-ethos-rule {
          margin-bottom: 26px;
        }
        .pa-ethos-rule-sig,
        .pa-ethos-rule-hair {
          display: block;
        }
        .pa-ethos-rule-sig {
          width: 64px;
          height: 3px;
          background: var(--signal);
        }
        .pa-ethos-rule-hair {
          width: 100%;
          max-width: 420px;
          height: 1px;
          background: var(--hair-inv);
          margin-top: 7px;
        }
        .pa-ethos-center {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(2.4rem, 5vw, 4rem);
          line-height: 1.02;
          letter-spacing: -0.024em;
          color: var(--bone);
          margin: 0 0 34px;
          max-width: 18ch;
        }
        .pa-ethos-body {
          font-size: clamp(1.15rem, 2vw, 1.4rem);
          line-height: 1.5;
          color: rgba(247, 246, 242, 0.9);
          margin: 0 0 24px;
          max-width: 52ch;
        }
        .pa-ethos-rented {
          font-size: 17px;
          line-height: 1.6;
          color: rgba(247, 246, 242, 0.68);
          margin: 0 0 30px;
          max-width: 56ch;
        }
        .pa-ethos-self {
          font-size: 16px;
          line-height: 1.6;
          color: rgba(247, 246, 242, 0.72);
          margin: 0;
          padding-top: 26px;
          border-top: 1px solid var(--hair-inv);
          max-width: 56ch;
        }
        /* .pa-ethos-link is on a NextLink; scope via the parent + :global(). */
        .pa-ethos-self :global(.pa-ethos-link) {
          font-family: var(--mono);
          font-size: 14px;
          color: var(--signal);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          white-space: nowrap;
        }
        .pa-ethos-self :global(.pa-ethos-link):hover {
          color: var(--bone);
          text-decoration-thickness: 2px;
        }
        .pa-ethos-link-flat {
          color: rgba(247, 246, 242, 0.72);
        }

        @media (max-width: 1080px) {
          .pa-ethos-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-ethos {
            padding: 64px 0;
          }
          .pa-ethos-inner {
            grid-column: 1 / 2;
          }
          .pa-ethos-body,
          .pa-ethos-rented,
          .pa-ethos-self {
            max-width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

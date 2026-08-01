import React from 'react';
import NextLink from 'next/link';
import { HOLD } from '@/components/marketing/aboutCopy';
import useLandingRegistry, {
  internalOrgUrl,
} from '@/components/marketing/landing/useLandingRegistry';

// Block 4 · How we hold ourselves to it. The one full-bleed color moment on this
// quieter page: a civic-deep band carrying the self-accountability paragraph,
// the AGPL / self-host / no-lock-in points, and the keep-verbatim self-host line
// linked to the live Poa org only once the registry confirms it exists (a
// structural answer to "who is we"). Mirrors the landing Ethos plate exactly.

const C = HOLD;

export default function HowWeHold() {
  const { isLoading, orgs } = useLandingRegistry();
  const poaOrg = !isLoading ? orgs.find((po) => po.id?.toLowerCase() === 'poa') : null;

  return (
    <section className="pa-hold" id="about-hold" aria-labelledby="about-hold-heading">
      <div className="pa-container pa-grid">
        <span className="pa-rail pa-rail-band" aria-hidden="true">
          {C.rail}
        </span>

        <div className="pa-hold-inner poa-reveal">
          <div className="pa-hold-rule" aria-hidden="true">
            <span className="pa-hold-rule-sig" />
            <span className="pa-hold-rule-hair" />
          </div>
          <p className="pa-kicker pa-kicker-inv">
            <span className="pa-kicker-no pa-kicker-no-inv">04</span>
            {C.kicker}
          </p>

          <h2 className="pa-hold-head" id="about-hold-heading">
            {C.heading}
          </h2>
          <p className="pa-hold-body">{C.body}</p>

          <ul className="pa-hold-points">
            {C.points.map((p) => (
              <li key={p.title} className="pa-hold-point">
                <span className="pa-hold-tick" aria-hidden="true" />
                <div>
                  <h3 className="pa-hold-title">{p.title}</h3>
                  <p className="pa-hold-text">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="pa-hold-self">
            {C.selfHost}{' '}
            {poaOrg ? (
              <NextLink href={internalOrgUrl(poaOrg.id)} className="pa-hold-link">
                {C.selfHostLink}
              </NextLink>
            ) : (
              <span className="pa-hold-link-flat">{C.selfHostLink}</span>
            )}
            .
          </p>
        </div>
      </div>

      <style jsx>{`
        .pa-hold {
          background: var(--civic-deep);
          color: var(--bone);
          padding: 104px 0;
          border-top: 3px solid var(--signal);
        }
        .pa-hold-inner {
          grid-column: 2 / 12;
        }
        .pa-hold-rule {
          margin-bottom: 26px;
        }
        .pa-hold-rule-sig,
        .pa-hold-rule-hair {
          display: block;
        }
        .pa-hold-rule-sig {
          width: 64px;
          height: 3px;
          background: var(--signal);
        }
        .pa-hold-rule-hair {
          width: 100%;
          max-width: 420px;
          height: 1px;
          background: var(--hair-inv);
          margin-top: 7px;
        }
        .pa-hold-head {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(2.1rem, 4.4vw, 3.4rem);
          line-height: 1.04;
          letter-spacing: -0.022em;
          color: var(--bone);
          margin: 0 0 26px;
          max-width: 18ch;
        }
        .pa-hold-body {
          font-size: clamp(1.1rem, 1.9vw, 1.35rem);
          line-height: 1.5;
          color: rgba(247, 246, 242, 0.9);
          margin: 0;
          max-width: 54ch;
        }
        .pa-hold-points {
          list-style: none;
          margin: 36px 0 0;
          padding: 0;
        }
        .pa-hold-point {
          display: flex;
          gap: 16px;
          padding: 18px 0;
          border-top: 1px solid var(--hair-inv);
        }
        .pa-hold-point:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-hold-tick {
          width: 9px;
          height: 9px;
          background: var(--signal);
          flex: none;
          margin-top: 7px;
        }
        .pa-hold-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          margin: 0 0 5px;
          color: var(--bone);
        }
        .pa-hold-text {
          font-size: 15.5px;
          line-height: 1.55;
          color: rgba(247, 246, 242, 0.78);
          margin: 0;
          max-width: 52ch;
        }
        .pa-hold-self {
          font-size: 16px;
          line-height: 1.6;
          color: rgba(247, 246, 242, 0.72);
          margin: 34px 0 0;
          padding-top: 26px;
          border-top: 1px solid var(--hair-inv);
          max-width: 56ch;
        }
        /* .pa-hold-link is on a NextLink; scope via the parent + :global(). */
        .pa-hold-self :global(.pa-hold-link) {
          font-family: var(--mono);
          font-size: 14px;
          color: var(--signal);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          white-space: nowrap;
        }
        .pa-hold-self :global(.pa-hold-link):hover {
          color: var(--bone);
          text-decoration-thickness: 2px;
        }
        .pa-hold-link-flat {
          color: rgba(247, 246, 242, 0.72);
        }

        @media (max-width: 1080px) {
          .pa-hold-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-hold {
            padding: 64px 0;
          }
          .pa-hold-inner {
            grid-column: 1 / 2;
          }
          .pa-hold-body,
          .pa-hold-text,
          .pa-hold-self {
            max-width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

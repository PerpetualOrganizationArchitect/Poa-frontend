import React from 'react';
import NextLink from 'next/link';
import { DOCS_HERO, DOCS_SECTIONS, DOCS_BENEFITS } from '@/components/marketing/docsCopy';

const C = DOCS_HERO;

export default function DocsHero() {
  return (
    <section className="pa-dh" id="docs-hero" aria-labelledby="docs-hero-heading">
      <div className="pa-container pa-grid">
        <span className="pa-rail" aria-hidden="true">
          {C.rail}
        </span>

        <div className="pa-dh-inner poa-fade">
          <div className="pa-dh-rule" aria-hidden="true">
            <span className="pa-dh-rule-sig" />
            <span className="pa-dh-rule-hair" />
          </div>
          <p className="pa-kicker">
            <span className="pa-kicker-no">{C.no}</span>
            <span className="pa-nocaps">{C.kicker}</span>
          </p>
          <h1 className="pa-dh-head" id="docs-hero-heading">
            {C.heading}
            <br />
            {C.headingSecond}
          </h1>
          <p className="pa-dh-lead">{C.lead}</p>
          <p className="pa-dh-community">
            <NextLink href={C.communityHref}>{C.communityLabel}</NextLink> {C.communityText}
          </p>
          <div className="pa-dh-start">
            <NextLink href={C.startHref} className="pa-dh-primary">{C.startLabel} <span aria-hidden="true">→</span></NextLink>
            <NextLink href={C.createHref} className="pa-dh-secondary">{C.createLabel} <span aria-hidden="true">→</span></NextLink>
          </div>
          <nav className="pa-dh-chapters" aria-label="Guide chapters">
            {DOCS_SECTIONS.map((section) => (
              <a href={`#docs-sec-${section.no}`} key={section.no}>{section.heading}</a>
            ))}
          </nav>
          <div className="pa-dh-benefits" aria-labelledby="docs-benefits-heading">
            <h2 className="pa-dh-benefits-heading" id="docs-benefits-heading">{C.benefitsHeading}</h2>
            <ul className="pa-dh-ideas">
              {DOCS_BENEFITS.map((benefit) => (
                <li key={benefit.id}>
                  <NextLink href={`/docs/${benefit.id}`} className="pa-dh-idea">
                    <h3>{benefit.title}</h3>
                    <p>{benefit.detail}</p>
                    <span className="pa-dh-idea-label">{benefit.label} <span aria-hidden="true">→</span></span>
                  </NextLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <style jsx>{`
        .pa-dh {
          padding: 76px 0 44px;
        }
        .pa-dh-inner {
          grid-column: 2 / 14;
        }
        .pa-dh-rule {
          margin-bottom: 26px;
        }
        .pa-dh-rule-sig,
        .pa-dh-rule-hair {
          display: block;
        }
        .pa-dh-rule-sig {
          width: 56px;
          height: 3px;
          background: var(--signal);
        }
        .pa-dh-rule-hair {
          width: 100%;
          max-width: 380px;
          height: 1px;
          background: var(--hair-strong);
          margin-top: 7px;
        }
        .pa-dh-head {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-weight: 640;
          font-size: clamp(2.4rem, 5.4vw, 4.2rem);
          line-height: 1.0;
          letter-spacing: -0.026em;
          color: var(--ink);
          margin: 0 0 22px;
        }
        .pa-dh-lead {
          font-size: 18px;
          line-height: 1.6;
          color: var(--steel);
          margin: 0;
          max-width: 56ch;
        }

        .pa-dh-community {
          margin: 16px 0 0;
          max-width: 68ch;
          font-size: 15px;
          line-height: 1.6;
          color: var(--steel);
        }
        .pa-dh-community :global(a) {
          color: var(--signal-deep);
          text-underline-offset: 4px;
        }
        .pa-dh-start {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px 26px;
          margin-top: 28px;
        }
        .pa-dh-start :global(a) {
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          display: inline-flex;
          gap: 24px;
          align-items: center;
        }
        .pa-dh-start :global(.pa-dh-primary) {
          color: var(--paper);
          background: var(--ink);
          padding: 15px 20px;
        }
        .pa-dh-start :global(.pa-dh-secondary) {
          color: var(--ink);
          padding: 15px 0;
        }
        .pa-dh-start :global(a:hover) { text-decoration: underline; }
        .pa-dh-benefits { margin-top: 48px; }
        .pa-dh-benefits-heading {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: var(--steel);
          margin: 0;
        }
        .pa-dh-ideas {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 32px 56px;
          list-style: none;
          padding: 0;
          margin: 28px 0 0;
        }
        .pa-dh-ideas li {
          min-width: 0;
          border-top: 1px solid var(--hair);
          padding-top: 22px;
        }
        .pa-dh-ideas :global(.pa-dh-idea) {
          display: flex;
          flex-direction: column;
          height: 100%;
          color: var(--ink);
          text-decoration: none;
        }
        .pa-dh-ideas h3 {
          font-family: var(--archivo);
          font-weight: 600;
          font-size: 23px;
          line-height: 1.15;
          letter-spacing: -0.02em;
          margin: 0 0 12px;
        }
        .pa-dh-ideas p {
          font-size: 15px;
          line-height: 1.6;
          color: var(--steel);
          margin: 0 0 20px;
        }
        .pa-dh-idea-label {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          font-weight: 600;
          margin-top: auto;
          color: var(--signal-deep);
        }
        .pa-dh-ideas :global(.pa-dh-idea:hover) .pa-dh-idea-label {
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .pa-dh-chapters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 24px;
          border-top: 1px solid var(--hair);
          padding-top: 24px;
          margin-top: 32px;
          max-width: 100%;
        }
        .pa-dh-chapters a {
          color: var(--steel);
          font-size: 13px;
          text-underline-offset: 4px;
          text-decoration-color: var(--hair-strong);
        }
        .pa-dh-chapters a:hover { color: var(--ink); }
        .pa-dh-inner :global(a:focus-visible) {
          outline: 2px solid var(--signal-deep);
          outline-offset: 5px;
        }

        @media (max-width: 1080px) {
          .pa-dh-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-dh {
            padding: 44px 0 32px;
          }
          .pa-dh-inner {
            grid-column: 1 / 2;
          }
          .pa-dh-lead {
            max-width: 100%;
          }
          .pa-dh-benefits { margin-top: 36px; }
          .pa-dh-ideas {
            grid-template-columns: 1fr;
            gap: 28px;
            margin-top: 22px;
          }
          .pa-dh-ideas p {
            max-width: 46ch;
          }
        }
      `}</style>
    </section>
  );
}

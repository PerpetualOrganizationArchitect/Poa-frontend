import React from 'react';
import { DOCS_HERO } from '@/components/marketing/docsCopy';

// DocsHero - the manual masthead. A cover line, not a marketing hero: the mono
// kicker + numeral, the plain "Poa docs" heading in Archivo, and a one-sentence
// lead describing what the manual covers. Direction-A rule pair opens it.
// Motion is minimal (a single .poa-fade) - a manual, not a show.

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
            {C.kicker}
          </p>
          <h1 className="pa-dh-head" id="docs-hero-heading">
            {C.heading}
          </h1>
          <p className="pa-dh-lead">{C.lead}</p>
        </div>
      </div>

      <style jsx>{`
        .pa-dh {
          padding: 76px 0 44px;
        }
        .pa-dh-inner {
          grid-column: 2 / 12;
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
        }
      `}</style>
    </section>
  );
}

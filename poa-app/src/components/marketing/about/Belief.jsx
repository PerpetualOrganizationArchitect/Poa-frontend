import React from 'react';
import { BELIEF } from '@/components/marketing/aboutCopy';

// Block 1 · The belief. The page's one strong display moment: the belief line
// set large in Archivo, opened by the direction-A rule pair, with the dual-read
// paragraph beneath. Uses .poa-fade (transform-free, visible without JS) so the
// display line paints even before hydrate. This is the loud moment; the rest of
// the page is editorial calm.

const C = BELIEF;

export default function Belief() {
  return (
    <section className="pa-section pa-belief" id="belief" aria-labelledby="belief-heading">
      <div className="pa-container pa-grid">
        <span className="pa-rail" aria-hidden="true">
          {C.rail}
        </span>

        <div className="pa-belief-inner poa-fade">
          <div className="pa-belief-rule" aria-hidden="true">
            <span className="pa-belief-rule-sig" />
            <span className="pa-belief-rule-hair" />
          </div>
          <p className="pa-kicker">
            <span className="pa-kicker-no">01</span>
            {C.kicker}
          </p>
          <h1 className="pa-belief-head" id="belief-heading">
            {C.headline}
          </h1>
          <p className="pa-belief-body">{C.body}</p>
        </div>
      </div>

      <style jsx>{`
        .pa-belief {
          padding: 84px 0 76px;
        }
        .pa-belief-inner {
          grid-column: 2 / 13;
        }
        .pa-belief-rule {
          margin-bottom: 28px;
        }
        .pa-belief-rule-sig,
        .pa-belief-rule-hair {
          display: block;
        }
        .pa-belief-rule-sig {
          width: 64px;
          height: 3px;
          background: var(--signal);
        }
        .pa-belief-rule-hair {
          width: 100%;
          max-width: 420px;
          height: 1px;
          background: var(--hair-strong);
          margin-top: 7px;
        }
        .pa-belief-head {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-weight: 640;
          font-size: clamp(2.6rem, 6vw, 4.8rem);
          line-height: 1.0;
          letter-spacing: -0.026em;
          color: var(--ink);
          margin: 0 0 30px;
          max-width: 15ch;
        }
        .pa-belief-body {
          font-size: clamp(1.15rem, 1.7vw, 1.4rem);
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 54ch;
        }

        @media (max-width: 1080px) {
          .pa-belief-inner {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-belief {
            padding: 52px 0 48px;
          }
          .pa-belief-inner {
            grid-column: 1 / 2;
          }
          .pa-belief-head {
            font-size: clamp(2.3rem, 11vw, 3.4rem);
            max-width: 100%;
          }
          .pa-belief-body {
            max-width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

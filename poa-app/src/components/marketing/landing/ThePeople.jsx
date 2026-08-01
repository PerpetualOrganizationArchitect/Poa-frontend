import React from 'react';
import { THE_PEOPLE } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SectionShell, SpecPlate, RulePair } from '@/components/marketing/primitives';

// Section 6 · The people. Who-does-what pain → roles with exact written powers,
// join by vouch, audiences. Text head + points, the KUBI team-matrix plate
// (wide), then the audience ledger rows with real template names.

const S = PRODUCT_SHOTS;
const C = THE_PEOPLE;

export default function ThePeople() {
  return (
    <SectionShell id="the-people" rail={C.rail} hairline ariaLabelledby="people-heading">
      <div className="pa-people-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">06</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="people-heading">
          {C.heading}
        </h2>
        <p className="pa-lead">{C.lead}</p>
      </div>

      <ul className="pa-people-points poa-reveal">
        {C.points.map((p, i) => (
          <li key={p.title} className="pa-people-point">
            <span className="pa-people-no">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="pa-people-title">{p.title}</h3>
              <p className="pa-people-text">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="pa-people-plate poa-reveal">
        <SpecPlate shot={S.teamMatrix} wide fig={{ id: C.fig.id, txt: C.fig.txt }} />
      </div>

      <div className="pa-people-aud poa-reveal">
        <p className="pa-people-aud-head">Built for</p>
        <ul className="pa-people-aud-list">
          {C.audiences.map((a) => (
            <li key={a.template} className="pa-people-aud-row">
              <span className="pa-people-aud-line">{a.line}</span>
              <span className="pa-people-aud-tpl">template: {a.template}</span>
            </li>
          ))}
        </ul>
      </div>

      <style jsx>{`
        .pa-people-head {
          grid-column: 2 / 8;
        }
        .pa-people-points {
          grid-column: 8 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-people-point {
          display: flex;
          gap: 20px;
          padding: 20px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-people-point:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-people-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 3px;
          flex: none;
          width: 26px;
        }
        .pa-people-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 19px;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-people-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 44ch;
        }
        .pa-people-plate {
          grid-column: 2 / 14;
          margin-top: 56px;
        }
        .pa-people-aud {
          grid-column: 2 / 14;
          margin-top: 56px;
        }
        .pa-people-aud-head {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 8px;
        }
        .pa-people-aud-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .pa-people-aud-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 24px;
          padding: 18px 0;
          border-bottom: 1px solid var(--hair);
        }
        .pa-people-aud-row:first-child {
          border-top: 1px solid var(--hair);
        }
        .pa-people-aud-line {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 540;
          font-weight: 540;
          font-size: clamp(1.1rem, 2vw, 1.4rem);
          letter-spacing: -0.012em;
          color: var(--ink);
        }
        .pa-people-aud-tpl {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.02em;
          color: var(--signal-deep);
          flex: none;
        }

        @media (max-width: 1080px) {
          .pa-people-head,
          .pa-people-points,
          .pa-people-plate,
          .pa-people-aud {
            grid-column: 2 / 14;
          }
          .pa-people-points {
            margin-top: 36px;
          }
          .pa-people-plate {
            margin-top: 44px;
          }
        }
        @media (max-width: 720px) {
          .pa-people-head,
          .pa-people-points,
          .pa-people-plate,
          .pa-people-aud {
            grid-column: 1 / 2;
          }
          .pa-people-text {
            max-width: 100%;
          }
          .pa-people-aud-row {
            flex-direction: column;
            gap: 6px;
          }
        }
      `}</style>
    </SectionShell>
  );
}

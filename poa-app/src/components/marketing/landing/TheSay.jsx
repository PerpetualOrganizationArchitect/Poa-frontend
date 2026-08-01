import React from 'react';
import { THE_SAY } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SectionShell, SpecPlate, RulePair } from '@/components/marketing/primitives';

// Section 4 · The say. Governance pain → votes that count. Text column of
// points beside the KUBI vote-tally plate, with the keep-verbatim line
// ("Voting power is earned by participating, not bought.") promoted to a
// full-width pull rule beneath.

const S = PRODUCT_SHOTS;
const C = THE_SAY;

export default function TheSay() {
  return (
    <SectionShell id="the-say" rail={C.rail} hairline ariaLabelledby="say-heading">
      <div className="pa-say-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">04</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="say-heading">
          {C.heading}
        </h2>
        <p className="pa-lead">{C.lead}</p>

        <ul className="pa-say-points">
          {C.points.map((p) => (
            <li key={p.title} className="pa-say-point">
              <span className="pa-say-tick" aria-hidden="true" />
              <div>
                <h3 className="pa-say-title">{p.title}</h3>
                <p className="pa-say-text">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="pa-say-plate poa-reveal">
        <SpecPlate
          shot={S.voteTally}
          anno={C.fig.anno}
          annoPos="hero"
          fig={{ id: C.fig.id, txt: C.fig.txt }}
        />
      </div>

      <div className="pa-say-pull poa-reveal">
        <span className="pa-say-pull-mark" aria-hidden="true" />
        <p className="pa-say-pull-text">{C.earnedLine}</p>
      </div>

      <style jsx>{`
        .pa-say-head {
          grid-column: 2 / 8;
        }
        .pa-say-points {
          list-style: none;
          margin: 34px 0 0;
          padding: 0;
        }
        .pa-say-point {
          display: flex;
          gap: 16px;
          padding: 18px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-say-point:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-say-tick {
          width: 9px;
          height: 9px;
          background: var(--signal);
          flex: none;
          margin-top: 7px;
        }
        .pa-say-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          margin: 0 0 5px;
          color: var(--ink);
        }
        .pa-say-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 44ch;
        }
        .pa-say-plate {
          grid-column: 8 / 14;
          align-self: start;
          margin-top: 4px;
        }
        .pa-say-pull {
          grid-column: 2 / 12;
          margin-top: 56px;
          display: flex;
          align-items: baseline;
          gap: 18px;
        }
        .pa-say-pull-mark {
          display: inline-block;
          width: 40px;
          height: 3px;
          background: var(--signal);
          flex: none;
          transform: translateY(-8px);
        }
        .pa-say-pull-text {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 560;
          font-weight: 560;
          font-size: clamp(1.4rem, 2.6vw, 2rem);
          line-height: 1.24;
          letter-spacing: -0.018em;
          color: var(--ink);
          margin: 0;
          max-width: 24ch;
        }

        @media (max-width: 1080px) {
          .pa-say-head,
          .pa-say-plate,
          .pa-say-pull {
            grid-column: 2 / 14;
          }
          .pa-say-plate {
            margin-top: 44px;
            max-width: 620px;
          }
        }
        @media (max-width: 720px) {
          .pa-say-head,
          .pa-say-plate,
          .pa-say-pull {
            grid-column: 1 / 2;
          }
          .pa-say-plate {
            max-width: 100%;
          }
          .pa-say-text {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

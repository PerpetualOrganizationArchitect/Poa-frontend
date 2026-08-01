import React from 'react';
import { THE_WORK } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SectionShell, SpecPlate, RulePair } from '@/components/marketing/primitives';

// Section 3 · The work. Task-management pain → the ownership engine. A text
// column of points over the full-width Decentral Park board plate. The heading
// sits under #how-it-works so the nav / hero "See how it works" anchor lands
// here (this is where the mechanism starts).

const S = PRODUCT_SHOTS;
const C = THE_WORK;

export default function TheWork() {
  return (
    <SectionShell id="how-it-works" rail={C.rail} hairline ariaLabelledby="work-heading">
      <div className="pa-work-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">03</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="work-heading">
          {C.heading}
        </h2>
        <p className="pa-lead">{C.lead}</p>
      </div>

      <ul className="pa-work-points poa-reveal">
        {C.points.map((p, i) => (
          <li key={p.title} className="pa-work-point">
            <span className="pa-work-no">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="pa-work-title">{p.title}</h3>
              <p className="pa-work-text">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="pa-work-plate poa-reveal">
        <SpecPlate
          shot={S.tasksBoard}
          wide
          anno={C.fig.anno}
          annoPos="proof"
          fig={{ id: C.fig.id, txt: C.fig.txt }}
        />
      </div>

      <style jsx>{`
        .pa-work-head {
          grid-column: 2 / 8;
        }
        .pa-work-points {
          grid-column: 8 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-work-point {
          display: flex;
          gap: 20px;
          padding: 20px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-work-point:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-work-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 3px;
          flex: none;
          width: 26px;
        }
        .pa-work-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 19px;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-work-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 44ch;
        }
        .pa-work-plate {
          grid-column: 2 / 14;
          margin-top: 56px;
        }

        @media (max-width: 1080px) {
          .pa-work-head,
          .pa-work-points,
          .pa-work-plate {
            grid-column: 2 / 14;
          }
          .pa-work-points {
            margin-top: 36px;
          }
          .pa-work-plate {
            margin-top: 44px;
          }
        }
        @media (max-width: 720px) {
          .pa-work-head,
          .pa-work-points,
          .pa-work-plate {
            grid-column: 1 / 2;
          }
          .pa-work-text {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

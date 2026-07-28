import React from 'react';
import { THE_MONEY } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SpecPlate } from '@/components/marketing/primitives';

// Section 5 · The money (PEAK). Splitting-money pain → revenue share, set on the
// civic-deep (#0B1A2F) full-bleed band - the visual peak of the page. The Argus
// treasury plate in bone, a stat readout, the money-candor line, and the
// treasury-stats plate as supporting evidence. N1 cleared: strong revenue-share
// claims, always "when the organization distributes revenue".

const S = PRODUCT_SHOTS;
const C = THE_MONEY;

export default function TheMoney() {
  return (
    <section className="pa-band" id="the-money" aria-labelledby="money-heading">
      <div className="pa-container pa-grid pa-grid-band">
        <span className="pa-rail pa-rail-band" aria-hidden="true">
          {C.rail}
        </span>

        <div className="pa-band-text poa-reveal">
          <p className="pa-kicker pa-kicker-inv">
            <span className="pa-kicker-no pa-kicker-no-inv">05</span>
            {C.kicker}
          </p>
          <h2 className="pa-h2 pa-h2-inv" id="money-heading">
            {C.heading}
          </h2>
          <p className="pa-lead pa-lead-inv">{C.lead}</p>

          <ul className="pa-money-points">
            {C.points.map((p) => (
              <li key={p.title} className="pa-money-point">
                <span className="pa-money-tick" aria-hidden="true" />
                <div>
                  <h3 className="pa-money-title">{p.title}</h3>
                  <p className="pa-money-text">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <dl className="pa-stats">
            {C.stats.map((s) => (
              <div className="pa-stat" key={s.k}>
                <dt className={`pa-stat-k ${s.nocaps ? 'pa-nocaps' : ''}`}>{s.k}</dt>
                <dd className="pa-stat-v">{s.v}</dd>
              </div>
            ))}
          </dl>

          <p className="pa-money-candor">{C.candor}</p>
        </div>

        <div className="pa-band-plate poa-reveal">
          <SpecPlate
            shot={S.treasury}
            variant="navy"
            anno={C.fig.anno}
            annoPos="band"
            fig={{ id: C.fig.id, txt: C.fig.txt }}
          />
          <div className="pa-band-plate-stats">
            <SpecPlate
              shot={S.treasuryStats}
              variant="navy"
              fig={{ id: C.statsFig.id, txt: C.statsFig.txt }}
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        .pa-band {
          background: var(--civic-deep);
          padding: 96px 0;
          border-top: 3px solid var(--signal);
        }
        .pa-grid-band {
          align-items: start;
        }
        .pa-band-text {
          grid-column: 2 / 7;
        }
        .pa-money-points {
          list-style: none;
          margin: 32px 0 0;
          padding: 0;
        }
        .pa-money-point {
          display: flex;
          gap: 16px;
          padding: 16px 0;
          border-top: 1px solid var(--hair-inv);
        }
        .pa-money-point:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-money-tick {
          width: 9px;
          height: 9px;
          background: var(--signal);
          flex: none;
          margin-top: 7px;
        }
        .pa-money-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: -0.01em;
          margin: 0 0 5px;
          color: var(--bone);
        }
        .pa-money-text {
          font-size: 15.5px;
          line-height: 1.55;
          color: rgba(247, 246, 242, 0.78);
          margin: 0;
          max-width: 42ch;
        }
        .pa-stats {
          display: flex;
          gap: 34px;
          margin: 34px 0 0;
          padding-top: 24px;
          border-top: 1px solid var(--hair-inv);
        }
        .pa-stat {
          margin: 0;
        }
        .pa-stat-k {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal);
          margin: 0 0 6px;
        }
        .pa-stat-v {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: 24px;
          letter-spacing: -0.01em;
          color: var(--bone);
          margin: 0;
        }
        .pa-money-candor {
          margin: 30px 0 0;
          padding-left: 18px;
          position: relative;
          font-size: 15px;
          line-height: 1.55;
          color: rgba(247, 246, 242, 0.68);
          max-width: 44ch;
        }
        .pa-money-candor::before {
          content: '';
          position: absolute;
          left: 0;
          top: 8px;
          width: 8px;
          height: 8px;
          background: var(--signal);
        }
        .pa-band-plate {
          grid-column: 8 / 14;
        }
        .pa-band-plate-stats {
          margin-top: 22px;
        }

        @media (max-width: 1080px) {
          .pa-band-text,
          .pa-band-plate {
            grid-column: 2 / 14;
          }
          .pa-band-plate {
            margin-top: 44px;
            max-width: 620px;
          }
        }
        @media (max-width: 720px) {
          .pa-band {
            padding: 60px 0;
          }
          .pa-band-text,
          .pa-band-plate {
            grid-column: 1 / 2;
          }
          .pa-band-plate {
            max-width: 100%;
          }
          .pa-money-text,
          .pa-money-candor {
            max-width: 100%;
          }
          .pa-stats {
            gap: 20px;
            flex-wrap: wrap;
          }
          .pa-stat-v {
            font-size: 20px;
          }
        }
      `}</style>
    </section>
  );
}

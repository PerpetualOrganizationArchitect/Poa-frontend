import React from 'react';
import { WHAT } from '@/components/marketing/aboutCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SectionShell, RulePair, SpecPlate } from '@/components/marketing/primitives';

// Block 3 · What Poa is. Three sentences, benefit-first (BRIEF §6). Set as a
// heading + three numbered sentence rows in the text column, with one spec plate
// beside them (the treasury-stats crop: "transparent finances for all members,
// major spending requires a vote") so the prose earns a single piece of real
// product evidence without turning into a feature grid.

const S = PRODUCT_SHOTS;
const C = WHAT;

export default function WhatPoaIs() {
  return (
    <SectionShell id="about-what" rail={C.rail} hairline ariaLabelledby="about-what-heading">
      <div className="pa-aw-text poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">03</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="about-what-heading">
          {C.heading}
        </h2>

        <ol className="pa-aw-list">
          {C.sentences.map((s, i) => (
            <li key={i} className="pa-aw-item">
              <span className="pa-aw-no">{String(i + 1).padStart(2, '0')}</span>
              <p className="pa-aw-sentence">{s}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="pa-aw-plate poa-reveal">
        <SpecPlate
          shot={S.treasuryStats}
          anno="the books, open to every member"
          annoPos="band"
          fig={{
            id: 'fig 01',
            txt: 'a shared treasury · transparent finances, major spending by vote',
          }}
        />
      </div>

      <style jsx>{`
        .pa-aw-text {
          grid-column: 2 / 8;
        }
        .pa-aw-list {
          list-style: none;
          margin: 8px 0 0;
          padding: 0;
        }
        .pa-aw-item {
          display: flex;
          gap: 20px;
          padding: 20px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-aw-item:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-aw-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 4px;
          flex: none;
          width: 26px;
        }
        .pa-aw-sentence {
          font-size: 17.5px;
          line-height: 1.55;
          color: var(--ink);
          margin: 0;
          max-width: 46ch;
        }
        .pa-aw-plate {
          grid-column: 8 / 14;
          align-self: start;
          margin-top: 6px;
        }

        @media (max-width: 1080px) {
          .pa-aw-text,
          .pa-aw-plate {
            grid-column: 2 / 14;
          }
          .pa-aw-plate {
            margin-top: 44px;
            max-width: 620px;
          }
        }
        @media (max-width: 720px) {
          .pa-aw-text,
          .pa-aw-plate {
            grid-column: 1 / 2;
          }
          .pa-aw-sentence {
            max-width: 100%;
          }
          .pa-aw-plate {
            margin-top: 36px;
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

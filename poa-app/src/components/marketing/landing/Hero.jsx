import React from 'react';
import NextLink from 'next/link';
import { HERO } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SpecPlate, DataChipList } from '@/components/marketing/primitives';

// Section 1 · Hero. The core promise in five seconds: category eyebrow, the
// winning headline, the work → ownership → money + vote subline, a CTA pair, and
// the annotated task-payout spec plate with ledger chips. No quiet line (client
// removed it). Hero text uses .poa-fade (transform-free, visible without JS);
// the plate uses .poa-rise. The hero image is eager (above the fold).

const S = PRODUCT_SHOTS;

const HERO_CHIPS = [
  { label: 'reward', value: '50 shares', solid: true },
  { label: 'status', value: 'approved · ownership issued' },
  { label: 'claimed by', value: 'emmaphilosopher' },
  { label: 'difficulty', value: 'easy · 1h' },
];

export default function Hero() {
  return (
    <section className="pa-section pa-hero" id="top">
      <div className="pa-container pa-grid">
        <span className="pa-rail" aria-hidden="true">
          sec 01 / hero
        </span>

        <div className="pa-hero-text poa-fade">
          <p className="pa-eyebrow">
            <span className="pa-eyebrow-tick">§</span>
            {HERO.eyebrow}
          </p>
          <h1 className="pa-h1">{HERO.headline}</h1>
          <p className="pa-subline">{HERO.subline}</p>
          <div className="pa-cta-row">
            <NextLink href="/create" className="pa-cta-solid pa-cta-lg">
              {HERO.ctaPrimary}
            </NextLink>
            <a href="/#how-it-works" className="pa-cta-ghost">
              {HERO.ctaSecondary}
              <span className="pa-arrow">→</span>
            </a>
          </div>
        </div>

        <div className="pa-hero-plate poa-rise">
          <SpecPlate
            shot={S.taskDetail}
            eager
            anno="work approved · ownership issued"
            annoPos="hero"
            fig={{
              id: 'fig 01',
              txt: 'one completed task · reward 50 shares, claimed by a member',
            }}
          />
          <DataChipList chips={HERO_CHIPS} />
          <p className="pa-plate-note">
            <span className="pa-plate-note-tick" aria-hidden="true" />
            Ownership cannot be bought, sold, or given away. It is issued only when the work is
            approved.
          </p>
        </div>
      </div>

      <style jsx>{`
        .pa-hero {
          padding: 60px 0 56px;
        }
        .pa-hero-text {
          grid-column: 2 / 8;
          padding-top: 8px;
        }
        .pa-eyebrow {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 22px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pa-eyebrow-tick {
          color: var(--signal);
          font-size: 14px;
        }
        .pa-h1 {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-weight: 640;
          font-size: clamp(2.9rem, 7vw, 5.5rem);
          line-height: 0.98;
          letter-spacing: -0.025em;
          margin: 0 0 26px;
          color: var(--ink);
          max-width: 12ch;
        }
        .pa-subline {
          font-size: 19px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0 0 34px;
          max-width: 46ch;
        }
        .pa-cta-row {
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .pa-hero-plate {
          grid-column: 8 / 14;
          align-self: start;
          margin-top: 4px;
        }
        .pa-plate-note {
          margin: 18px 0 0;
          padding-left: 18px;
          position: relative;
          font-size: 14.5px;
          line-height: 1.5;
          color: var(--steel);
          max-width: 44ch;
        }
        .pa-plate-note-tick {
          position: absolute;
          left: 0;
          top: 8px;
          width: 8px;
          height: 8px;
          background: var(--signal);
        }

        @media (max-width: 1080px) {
          .pa-hero-text,
          .pa-hero-plate {
            grid-column: 2 / 14;
          }
          .pa-hero-plate {
            margin-top: 48px;
            max-width: 620px;
          }
        }
        @media (max-width: 720px) {
          .pa-hero {
            padding: 40px 0 52px;
          }
          .pa-hero-text,
          .pa-hero-plate {
            grid-column: 1 / 2;
          }
          .pa-h1 {
            font-size: clamp(2.6rem, 12vw, 3.6rem);
            max-width: 100%;
          }
          .pa-subline {
            font-size: 17px;
            max-width: 100%;
          }
          .pa-hero-plate {
            margin-top: 40px;
            max-width: 100%;
          }
          .pa-cta-row {
            gap: 16px;
          }
          .pa-cta-row :global(.pa-cta-solid.pa-cta-lg) {
            width: 100%;
            justify-content: center;
          }
          .pa-plate-note {
            max-width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

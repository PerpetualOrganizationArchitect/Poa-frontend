import React from 'react';
import NextLink from 'next/link';
import { HERO } from '@/components/marketing/landingCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';
import { SpecPlate } from '@/components/marketing/primitives';

const S = PRODUCT_SHOTS;

export default function Hero() {
  return (
    <section className="pa-section pa-hero" id="top">
      <div className="pa-container pa-grid">
        <span className="pa-rail" aria-hidden="true">
          sec 01 / hero
        </span>

        <div className="pa-hero-text poa-fade">
          <p className="pa-eyebrow">
            {HERO.eyebrow}
          </p>
          <h1 className="pa-h1" aria-label={HERO.headline}>{HERO.headlineLines.map((line) => <span key={line}>{line}</span>)}</h1>
          <p className="pa-subline">{HERO.subline}</p>
          <div className="pa-cta-row">
            <NextLink href="/create" className="pa-cta-solid pa-cta-lg">
              {HERO.ctaPrimary}
            </NextLink>
            <NextLink href="/#how-it-works" className="pa-cta-ghost">
              {HERO.ctaSecondary}
              <span className="pa-arrow">→</span>
            </NextLink>
          </div>
        </div>

        <div className="pa-hero-plate poa-rise">
          <SpecPlate
            shot={S.taskDetail}
            eager
          />
          <div className="pa-hero-receipt">
            <div><span className="pa-receipt-dot" aria-hidden="true" />A contribution. A stake.</div>
            <span className="pa-receipt-value">50 shares earned</span>
          </div>
          <p className="pa-plate-note">A real task, completed by a member of Decentral Park.</p>
        </div>
      </div>

      <style jsx>{`
        .pa-hero {
          padding: 100px 0 112px;
        }
        .pa-hero-text {
          grid-column: 2 / 8;
          padding-top: 0;
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
        .pa-h1 {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 580;
          font-weight: 580;
          font-size: clamp(3.5rem, 6.5vw, 5.6rem);
          line-height: 1.015;
          letter-spacing: -0.055em;
          margin: 0 0 28px;
          color: var(--ink);
          max-width: 12ch;
        }
        .pa-h1 > span { display: block; }
        .pa-subline {
          font-size: 19px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0 0 34px;
          max-width: 40ch;
        }
        .pa-cta-row {
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .pa-hero-plate {
          grid-column: 8 / 14;
          align-self: center;
          margin-top: 4px;
        }
        .pa-hero-receipt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 0 0; font-size: 14px; color: var(--steel); }
        .pa-hero-receipt > div { display: flex; align-items: center; gap: 9px; }
        .pa-receipt-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--signal); flex: none; }
        .pa-receipt-value { color: var(--signal-deep); font-weight: 600; white-space: nowrap; }
        .pa-plate-note { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--steel); }

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
            padding: 56px 0 64px;
          }
          .pa-hero-text,
          .pa-hero-plate {
            grid-column: 1 / 2;
          }
          .pa-h1 {
            font-size: clamp(2.8rem, 12.5vw, 4.5rem);
            max-width: 100%;
          }
          .pa-hero-receipt { font-size: 12px; gap: 10px; padding-top: 20px; }
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

import React from 'react';
import NextLink from 'next/link';
import { LEDGER } from '@/components/marketing/landingCopy';
import useLandingInflows from '@/hooks/useLandingInflows';
import useLandingRegistry from '@/components/marketing/landing/useLandingRegistry';

// Live activity follows the product story, with space for the numbers to speak.
export default function LedgerStrip() {
  const { counts, isLoading } = useLandingRegistry();
  const inflows = useLandingInflows();
  return (
    <section className="pa-activity" id="activity" aria-labelledby="activity-heading">
      <div className="pa-container pa-grid">
        <div className="pa-activity-intro">
          <p className="pa-kicker">Growing together</p>
          <h2 id="activity-heading">{LEDGER.title}</h2>
          <p>{LEDGER.description}</p>
          <NextLink href="/explore" className="pa-cta-ghost">Meet the organizations <span aria-hidden="true">↗</span></NextLink>
        </div>
        <div className="pa-activity-data">
        <dl className="pa-activity-numbers" aria-live="polite">
          <div className="pa-activity-stat">
            <dt>Organizations</dt>
            <dd>{isLoading ? '…' : counts.orgs.toLocaleString('en-US')}</dd>
          </div>
          <div className="pa-activity-stat">
            <dt>Total inflows</dt>
            <dd className="pa-activity-amount">
              <span className={`pa-activity-value ${inflows.status === 'unavailable' ? 'pa-activity-unavailable' : ''}`}>
                {inflows.isLoading ? <span aria-label="Loading total inflows">…</span> : inflows.formattedUsd || 'Unavailable'}
              </span>
            </dd>
          </div>
        </dl>
        <p className="pa-activity-note">
          Treasury, task bounties, and gas sponsorship. Recorded deposits, estimated in USD at current exchange rates.
        </p>
        {inflows.status === 'unavailable' && (
          <button type="button" className="pa-activity-retry" onClick={inflows.retry}>Try again</button>
        )}
        </div>
      </div>
      <style jsx>{`
        .pa-activity { padding: 88px 0; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
        .pa-activity-intro { grid-column: 2 / 7; }
        .pa-activity-intro h2 { font-family: var(--archivo); font-size: clamp(2rem, 3.3vw, 2.8rem); font-weight: 580; letter-spacing: -0.04em; line-height: 1.1; margin: 0 0 16px; }
        .pa-activity-intro > p:not(.pa-kicker) { color: var(--steel); font-size: 16px; margin: 0 0 24px; max-width: 28ch; }
        .pa-activity-data { grid-column: 8 / 14; padding-top: 4px; }
        .pa-activity-numbers { display: grid; grid-template-columns: 1fr 1.5fr; gap: 32px; margin: 0; }
        .pa-activity-stat { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
        dt { font-size: 14px; color: var(--steel); margin-bottom: 14px; }
        dd { font-family: var(--archivo); font-variant-numeric: tabular-nums; font-size: clamp(2.6rem, 4vw, 3.8rem); font-weight: 550; letter-spacing: -0.045em; line-height: 1.2; margin: 0 0 16px; white-space: nowrap; }
        .pa-activity-unavailable { font-size: 22px; letter-spacing: -0.02em; color: var(--steel); }
        .pa-activity-retry { background: none; border: 0; padding: 0; margin-top: 12px; color: var(--signal-deep); font-size: 14px; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
        .pa-activity-note { color: var(--steel); font-size: 12px; line-height: 1.6; margin: 22px 0 0; max-width: 56ch; }
        @media (max-width: 1080px) { .pa-activity-intro, .pa-activity-data { grid-column: 2 / 14; } .pa-activity-data { margin-top: 40px; max-width: 640px; } }
        @media (max-width: 720px) { .pa-activity { padding: 60px 0; } .pa-activity-intro, .pa-activity-data { grid-column: 1 / 2; } .pa-activity-numbers { grid-template-columns: 0.7fr 1.5fr; gap: 20px; } dd { font-size: clamp(1.75rem, 7vw, 2.6rem); } }
      `}</style>
    </section>
  );
}

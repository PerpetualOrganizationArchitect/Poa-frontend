import React from 'react';
import { PROBLEM } from '@/components/marketing/landingCopy';
import { SectionShell, RulePair } from '@/components/marketing/primitives';

// Section 2 · The problem. "From a group chat to an organization" - stuck-group
// vignettes (untracked work, unspoken splits, loudest-voice decisions), closing
// on the ownership line. No villains; the group is alive and stuck.

export default function Problem() {
  return (
    <SectionShell id="problem" rail={PROBLEM.rail} ariaLabelledby="problem-heading">
      <div className="pa-prob-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">02</span>
          {PROBLEM.kicker}
        </p>
        <h2 className="pa-h2" id="problem-heading">
          {PROBLEM.heading}
        </h2>
        <p className="pa-lead">{PROBLEM.lead}</p>
      </div>

      <ol className="pa-prob-items poa-reveal">
        {PROBLEM.items.map((it, i) => (
          <li key={it.title} className="pa-prob-item">
            <span className="pa-prob-no">{String(i + 1).padStart(2, '0')}</span>
            <div className="pa-prob-body">
              <h3 className="pa-prob-title">{it.title}</h3>
              <p className="pa-prob-text">{it.body}</p>
            </div>
          </li>
        ))}
        <li className="pa-prob-close">
          <span className="pa-prob-close-mark" aria-hidden="true" />
          <p className="pa-prob-close-text">{PROBLEM.close}</p>
        </li>
      </ol>

      <style jsx>{`
        .pa-prob-head {
          grid-column: 2 / 8;
        }
        .pa-prob-items {
          grid-column: 8 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-prob-item {
          display: flex;
          gap: 20px;
          padding: 22px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-prob-item:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-prob-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 3px;
          flex: none;
          width: 26px;
        }
        .pa-prob-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 20px;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-prob-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 46ch;
        }
        .pa-prob-close {
          display: flex;
          gap: 20px;
          margin-top: 26px;
          padding-top: 26px;
          border-top: 2px solid var(--ink);
        }
        .pa-prob-close-mark {
          width: 26px;
          flex: none;
          display: block;
          height: 3px;
          background: var(--signal);
          margin-top: 12px;
        }
        .pa-prob-close-text {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 560;
          font-weight: 560;
          font-size: clamp(1.15rem, 2vw, 1.5rem);
          line-height: 1.3;
          letter-spacing: -0.015em;
          color: var(--ink);
          margin: 0;
          max-width: 32ch;
        }

        @media (max-width: 1080px) {
          .pa-prob-head,
          .pa-prob-items {
            grid-column: 2 / 14;
          }
          .pa-prob-items {
            margin-top: 40px;
          }
        }
        @media (max-width: 720px) {
          .pa-prob-head,
          .pa-prob-items {
            grid-column: 1 / 2;
          }
          .pa-prob-text {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

import React from 'react';
import { PROBLEM } from '@/components/marketing/aboutCopy';
import { SectionShell, RulePair } from '@/components/marketing/primitives';

// Block 2 · The problem we saw. The group-chat era: a group forms in a chat and
// outgrows it, the record lives in memory, the money runs through a person, the
// ownership ends up with the platform. No villains but formlessness (BRIEF §3);
// the group is alive and stuck. Mirrors the landing Problem's editorial two-
// column layout so the two surfaces read as one system.

const C = PROBLEM;

export default function Problem() {
  return (
    <SectionShell id="about-problem" rail={C.rail} hairline ariaLabelledby="about-problem-heading">
      <div className="pa-ap-head poa-reveal">
        <RulePair />
        <p className="pa-kicker">
          <span className="pa-kicker-no">02</span>
          {C.kicker}
        </p>
        <h2 className="pa-h2" id="about-problem-heading">
          {C.heading}
        </h2>
        <p className="pa-lead">{C.lead}</p>
      </div>

      <ol className="pa-ap-items poa-reveal">
        {C.items.map((it, i) => (
          <li key={it.title} className="pa-ap-item">
            <span className="pa-ap-no">{String(i + 1).padStart(2, '0')}</span>
            <div className="pa-ap-body">
              <h3 className="pa-ap-title">{it.title}</h3>
              <p className="pa-ap-text">{it.body}</p>
            </div>
          </li>
        ))}
        <li className="pa-ap-close">
          <span className="pa-ap-close-mark" aria-hidden="true" />
          <p className="pa-ap-close-text">{C.close}</p>
        </li>
      </ol>

      <style jsx>{`
        .pa-ap-head {
          grid-column: 2 / 8;
        }
        .pa-ap-items {
          grid-column: 8 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-ap-item {
          display: flex;
          gap: 20px;
          padding: 22px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-ap-item:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-ap-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 3px;
          flex: none;
          width: 26px;
        }
        .pa-ap-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 20px;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-ap-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 46ch;
        }
        .pa-ap-close {
          display: flex;
          gap: 20px;
          margin-top: 26px;
          padding-top: 26px;
          border-top: 2px solid var(--ink);
        }
        .pa-ap-close-mark {
          width: 26px;
          flex: none;
          display: block;
          height: 3px;
          background: var(--signal);
          margin-top: 12px;
        }
        .pa-ap-close-text {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 560;
          font-weight: 560;
          font-size: clamp(1.15rem, 2vw, 1.5rem);
          line-height: 1.3;
          letter-spacing: -0.015em;
          color: var(--ink);
          margin: 0;
          max-width: 34ch;
        }

        @media (max-width: 1080px) {
          .pa-ap-head,
          .pa-ap-items {
            grid-column: 2 / 14;
          }
          .pa-ap-items {
            margin-top: 40px;
          }
        }
        @media (max-width: 720px) {
          .pa-ap-head,
          .pa-ap-items {
            grid-column: 1 / 2;
          }
          .pa-ap-text {
            max-width: 100%;
          }
        }
      `}</style>
    </SectionShell>
  );
}

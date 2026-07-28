import React from 'react';

// LedgerBand - the full-bleed civic-navy stat band. Big Archivo numerals, mono
// labels, hairline rules, a signal masthead tick. Real capture numbers only.
//
// Props:
//   title   mono masthead label (left)
//   ref     mono reference (right, hidden on mobile)
//   cells   [{ num, label, signal?, nocaps? }]
//   ariaLabel  accessible section label

export default function LedgerBand({ title, refLabel, cells = [], ariaLabel }) {
  return (
    <section className="pa-ledger" aria-label={ariaLabel}>
      <div className="pa-container">
        <div className="pa-ledger-head">
          <span className="pa-ledger-tick" aria-hidden="true" />
          <span className="pa-ledger-title">{title}</span>
          {refLabel ? <span className="pa-ledger-ref">{refLabel}</span> : null}
        </div>
        <dl className="pa-ledger-row" data-count={cells.length}>
          {cells.map((c, i) => (
            <div className="pa-ledger-cell" key={c.label || i}>
              <dd className={`pa-ledger-num ${c.signal ? 'pa-ledger-num-sig' : ''}`}>{c.num}</dd>
              <dt className={`pa-ledger-lab ${c.nocaps ? 'pa-nocaps' : ''}`}>{c.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <style jsx>{`
        .pa-ledger {
          background: var(--civic);
          color: var(--bone);
          padding: 30px 0 40px;
          border-top: 3px solid var(--signal);
        }
        .pa-ledger-head {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-bottom: 22px;
          border-bottom: 1px solid var(--hair-inv);
        }
        .pa-ledger-tick {
          width: 14px;
          height: 14px;
          background: var(--signal);
          flex: none;
        }
        .pa-ledger-title {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--bone);
        }
        .pa-ledger-ref {
          margin-left: auto;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--signal);
        }
        .pa-ledger-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin: 0;
          padding: 0;
        }
        .pa-ledger-cell {
          padding: 26px 32px 4px;
          padding-right: 32px;
          border-left: 1px solid var(--hair-inv);
          margin: 0;
        }
        .pa-ledger-cell:first-child {
          border-left: none;
          padding-left: 0;
        }
        .pa-ledger-num {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-weight: 640;
          font-size: clamp(2.6rem, 5.5vw, 4rem);
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: var(--bone);
          margin: 0 0 12px;
        }
        .pa-ledger-num-sig {
          color: var(--signal);
        }
        .pa-ledger-lab {
          font-family: var(--mono);
          font-size: 11.5px;
          letter-spacing: 0.03em;
          line-height: 1.45;
          text-transform: uppercase;
          color: rgba(244, 241, 233, 0.72);
          margin: 0;
          max-width: 22ch;
        }

        @media (max-width: 720px) {
          .pa-ledger {
            padding: 26px 0 30px;
          }
          .pa-ledger-row {
            grid-template-columns: 1fr 1fr;
            gap: 0 20px;
          }
          .pa-ledger-cell {
            padding: 22px 12px 4px 0;
          }
          .pa-ledger-cell,
          .pa-ledger-cell:first-child {
            border-left: none;
            padding-left: 0;
          }
          .pa-ledger-cell:last-child {
            grid-column: 1 / 3;
            border-top: 1px solid var(--hair-inv);
            margin-top: 6px;
          }
          .pa-ledger-ref {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}

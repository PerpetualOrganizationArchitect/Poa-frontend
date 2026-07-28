import React from 'react';

// DataChip - a mono key/value ledger chip read out of the exact numbers in a
// capture. `solid` gives one chip signal-orange mass. `DataChipList` wraps a set.
//
// Numbers here must be verifiable from the paired capture (BRIEF §9 chips rule):
// only values actually visible in the frame.

export function DataChip({ label, value, solid = false }) {
  return (
    <li className={`pa-chip ${solid ? 'pa-chip-solid' : ''}`}>
      <span className="pa-chip-k">{label}</span>
      <span className="pa-chip-v">{value}</span>

      <style jsx>{`
        .pa-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--mono);
          font-size: 11.5px;
          letter-spacing: 0.01em;
          line-height: 1;
          padding: 7px 11px;
          border: 1px solid var(--hair-strong);
          background: var(--paper);
          color: var(--ink);
        }
        .pa-chip-k {
          color: var(--steel);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 10px;
        }
        .pa-chip-v {
          color: var(--ink);
        }
        .pa-chip-solid {
          background: var(--signal);
          border-color: var(--signal);
          color: #fff;
        }
        .pa-chip-solid .pa-chip-k {
          color: rgba(255, 255, 255, 0.82);
        }
        .pa-chip-solid .pa-chip-v {
          color: #fff;
        }
      `}</style>
    </li>
  );
}

export function DataChipList({ chips = [], className = '', ariaHidden = true }) {
  return (
    <ul className={`pa-chips ${className}`} aria-hidden={ariaHidden}>
      {chips.map((c, i) => (
        <DataChip key={c.label || i} label={c.label} value={c.value} solid={c.solid} />
      ))}

      <style jsx>{`
        .pa-chips {
          list-style: none;
          margin: 20px 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        @media (max-width: 720px) {
          .pa-chips {
            gap: 8px;
          }
        }
      `}</style>
    </ul>
  );
}

export default DataChip;

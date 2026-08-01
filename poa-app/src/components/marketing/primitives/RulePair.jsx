import React from 'react';

// RulePair - the direction-A section marker: a short solid signal rule stacked
// over a long thin hairline. Opens a text column. `inv` for dark bands.

export default function RulePair({ inv = false, className = '' }) {
  return (
    <span className={`pa-rulepair ${className}`} aria-hidden="true">
      <span className="pa-rulepair-sig" />
      <span className={`pa-rulepair-hair ${inv ? 'pa-rulepair-hair-inv' : ''}`} />

      <style jsx>{`
        .pa-rulepair {
          display: block;
          margin: 0 0 26px;
        }
        .pa-rulepair-sig,
        .pa-rulepair-hair {
          display: block;
          height: 3px;
        }
        .pa-rulepair-sig {
          width: 56px;
          background: var(--signal);
        }
        .pa-rulepair-hair {
          width: 100%;
          max-width: 340px;
          height: 1px;
          background: var(--hair-strong);
          margin-top: 7px;
        }
        .pa-rulepair-hair-inv {
          background: var(--hair-inv);
        }
      `}</style>
    </span>
  );
}

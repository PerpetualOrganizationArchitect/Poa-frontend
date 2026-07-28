import React from 'react';

// MarketingRoot - the single scoped style host for the "public works" (direction
// A) marketing surface. Everything renders inside `.pa-root`, and every rule in
// the two style blocks below is prefixed by `.pa-root`, so nothing here can leak
// into app or charter routes. Section components + primitives assume these tokens
// and base classes exist; they add only their own layout styling.
//
// Fonts (Archivo, Public Sans, IBM Plex Mono) are declared in globals.css and
// referenced here by family name, so app routes never download them (they are
// only requested when a `.pa-root` element paints).
//
// styled-jsx only, no Chakra, no theme tokens. Motion is limited to the pure-CSS
// .poa-rise / .poa-fade / .poa-reveal classes defined in globals.css.

export default function MarketingRoot({ children, className = '', ...rest }) {
  return (
    <div className={`pa-root ${className}`} {...rest}>
      {children}

      <style jsx>{`
        /* -------------------- palette + type variables -------------------- */
        .pa-root {
          --bone: #f4f1e9;
          --bone-deep: #efeade;
          --paper: #faf8f2;
          --ink: #16181d;
          --steel: #4a4f58;
          --civic: #10243e;
          --civic-deep: #0b1a2f;
          --signal: #b45309;
          --signal-warm: #c2610a;
          --signal-deep: #7c2d12;
          --hair: #d6d1c3;
          --hair-strong: #c4bda9;
          --hair-inv: rgba(244, 241, 233, 0.22);
          --rail: 72px;
          --archivo: 'Archivo', system-ui, sans-serif;
          --sans: 'Public Sans', system-ui, sans-serif;
          --mono: 'IBM Plex Mono', 'Fira Code', ui-monospace, monospace;

          background: var(--bone);
          color: var(--ink);
          font-family: var(--sans);
          font-size: 17px;
          line-height: 1.65;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }
        .pa-root :global(*) {
          box-sizing: border-box;
        }

        /* -------------------- layout scaffolding -------------------- */
        .pa-root :global(.pa-container) {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
          width: 100%;
        }
        .pa-root :global(.pa-hairline) {
          height: 1px;
          background: var(--hair);
          width: 100%;
        }
        .pa-root :global(.pa-grid) {
          display: grid;
          grid-template-columns: var(--rail) repeat(12, 1fr);
          column-gap: 24px;
          align-items: start;
        }
        .pa-root :global(.pa-section) {
          padding: 92px 0;
        }

        /* -------------------- sticky rail marker -------------------- */
        .pa-root :global(.pa-rail) {
          grid-column: 1 / 2;
          position: sticky;
          top: 96px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--signal-deep);
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
          padding-top: 6px;
          align-self: start;
        }
        .pa-root :global(.pa-rail-band) {
          color: var(--signal);
        }

        /* brand-safe: a label containing the "Poa" mark must not be uppercased,
           since text-transform would render the banned all-caps brand form. */
        .pa-root :global(.pa-nocaps) {
          text-transform: none;
        }

        /* -------------------- kickers / headings / leads -------------------- */
        .pa-root :global(.pa-kicker) {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pa-root :global(.pa-kicker-no) {
          font-size: 12px;
          color: var(--bone);
          background: var(--ink);
          padding: 3px 7px;
          letter-spacing: 0.06em;
        }
        .pa-root :global(.pa-kicker-inv) {
          color: var(--signal);
        }
        .pa-root :global(.pa-kicker-no-inv) {
          background: var(--signal);
          color: var(--civic);
        }
        .pa-root :global(.pa-h2) {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(2rem, 4.2vw, 3.2rem);
          line-height: 1.02;
          letter-spacing: -0.022em;
          margin: 0 0 22px;
          max-width: 16ch;
        }
        .pa-root :global(.pa-h2-inv) {
          color: var(--bone);
        }
        .pa-root :global(.pa-lead) {
          font-size: 18px;
          line-height: 1.6;
          color: var(--steel);
          margin: 0;
          max-width: 42ch;
        }
        .pa-root :global(.pa-lead-inv) {
          color: rgba(247, 246, 242, 0.82);
        }

        /* -------------------- shared CTA buttons -------------------- */
        .pa-root :global(.pa-cta-solid) {
          display: inline-flex;
          align-items: center;
          background: var(--ink);
          color: var(--bone);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 9px 18px;
          border-radius: 2px;
          letter-spacing: 0.005em;
          border: none;
          cursor: pointer;
          font-family: var(--sans);
          transition: background 0.15s ease;
        }
        .pa-root :global(.pa-cta-solid:hover) {
          background: var(--civic);
        }
        .pa-root :global(.pa-cta-lg) {
          font-size: 15px;
          padding: 14px 26px;
        }
        .pa-root :global(.pa-cta-ghost) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--signal-deep);
          text-decoration: none;
          border: none;
          background: none;
          cursor: pointer;
          font-family: var(--sans);
          border-bottom: 1px solid var(--signal);
          padding: 0 0 2px;
        }
        .pa-root :global(.pa-cta-ghost .pa-arrow) {
          font-family: var(--mono);
          margin-left: 8px;
        }

        /* -------------------- responsive rail collapse -------------------- */
        @media (max-width: 720px) {
          .pa-root {
            --rail: 0px;
            font-size: 16px;
          }
          .pa-root :global(.pa-container) {
            padding: 0 20px;
          }
          .pa-root :global(.pa-grid) {
            grid-template-columns: 1fr;
            column-gap: 0;
          }
          .pa-root :global(.pa-rail) {
            display: none;
          }
          .pa-root :global(.pa-section) {
            padding: 56px 0;
          }
        }
      `}</style>
    </div>
  );
}

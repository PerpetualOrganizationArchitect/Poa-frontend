import React from 'react';

// SectionShell - the section scaffold every arc section shares: an outer
// <section> with an id (for the rail anchors + skip link), an optional top
// hairline, a `.pa-container.pa-grid`, and a sticky rail marker in column 1.
// Children fill the 12-col grid (columns set by the caller).
//
// Props:
//   id          section id (anchor target)
//   rail        mono rail-marker text ("sec 03 / the work")
//   railInv     tint the rail signal-orange (dark bands)
//   hairline    render a full-bleed 1px hairline above the section
//   band        skip default section padding (dark bands set their own)
//   ariaLabel / ariaLabelledby
//   className   extra class on <section>

export default function SectionShell({
  id,
  rail,
  railInv = false,
  hairline = false,
  band = false,
  ariaLabel,
  ariaLabelledby,
  className = '',
  gridClassName = '',
  children,
}) {
  return (
    <>
      {hairline ? <div className="pa-hairline" /> : null}
      <section
        id={id}
        className={`${band ? '' : 'pa-section'} ${className}`}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      >
        <div className={`pa-container pa-grid ${gridClassName}`}>
          {rail ? (
            <span className={`pa-rail ${railInv ? 'pa-rail-band' : ''}`} aria-hidden="true">
              {rail}
            </span>
          ) : null}
          {children}
        </div>
      </section>
    </>
  );
}

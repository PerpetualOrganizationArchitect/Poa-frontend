import React from 'react';

// SpecPlate - the direction-A "spec plate": a device-free product crop, matted
// on bone, framed in a 1px ink hairline, with corner registration ticks, an
// optional mono annotation leader line pointing into the frame, and a mono
// figure bar below. This is the workhorse product-evidence device.
//
// Props:
//   shot        a PRODUCT_SHOTS entry ({ src, width, height, alt, org })
//   fig         { id, txt }              mono figure bar caption
//   anno        string                   optional floating annotation label
//   annoPos     'hero'|'band'|'proof'    where the leader line sits (default hero)
//   variant     'bone'|'navy'            navy = on a dark band (inverted mat/frame)
//   wide        boolean                  full-bleed wide plate (proof board)
//   eager       boolean                  eager-load (hero only); else lazy
//   className   extra class on the <figure>
//
// All styling is scoped under .pa-plate-root so it stays inside `.pa-root`.

export default function SpecPlate({
  shot,
  fig,
  anno,
  annoPos = 'hero',
  variant = 'bone',
  wide = false,
  eager = false,
  className = '',
}) {
  if (!shot) return null;
  const inv = variant === 'navy';

  return (
    <figure className={`pa-plate-root ${className}`}>
      <div
        className={[
          'pa-plate',
          inv ? 'pa-plate-onnavy' : '',
          wide ? 'pa-plate-wide' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={`pa-tick pa-tick-tl ${inv ? 'pa-tick-inv' : ''}`} aria-hidden="true" />
        <span className={`pa-tick pa-tick-tr ${inv ? 'pa-tick-inv' : ''}`} aria-hidden="true" />
        <span className={`pa-tick pa-tick-bl ${inv ? 'pa-tick-inv' : ''}`} aria-hidden="true" />
        <span className={`pa-tick pa-tick-br ${inv ? 'pa-tick-inv' : ''}`} aria-hidden="true" />

        <div className={`pa-plate-mat ${inv ? 'pa-plate-mat-bone' : ''}`}>
          <div className={`pa-plate-frame ${inv ? 'pa-plate-frame-inv' : ''}`}>
            <img
              src={shot.src}
              width={shot.width / 2}
              height={shot.height / 2}
              alt={shot.alt}
              className="pa-plate-img"
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
            />
          </div>
        </div>

        {anno ? (
          <div className={`pa-anno pa-anno-${annoPos}`} aria-hidden="true">
            {annoPos === 'band' ? (
              <>
                <span className={`pa-anno-dot ${inv ? 'pa-anno-dot-inv' : ''}`} />
                <span className={`pa-anno-leader ${inv ? 'pa-anno-leader-inv' : ''}`} />
                <span className={`pa-anno-label ${inv ? 'pa-anno-label-inv' : ''}`}>{anno}</span>
              </>
            ) : annoPos === 'proof' ? (
              <>
                <span className="pa-anno-label">{anno}</span>
                <span className="pa-anno-leader pa-anno-leader-down" />
                <span className="pa-anno-dot" />
              </>
            ) : (
              <>
                <span className={`pa-anno-label ${inv ? 'pa-anno-label-inv' : ''}`}>{anno}</span>
                <span className={`pa-anno-leader ${inv ? 'pa-anno-leader-inv' : ''}`} />
                <span className={`pa-anno-dot ${inv ? 'pa-anno-dot-inv' : ''}`} />
              </>
            )}
          </div>
        ) : null}
      </div>

      {fig ? (
        <figcaption className={`pa-figbar ${inv ? 'pa-figbar-inv' : ''}`}>
          <span className={`pa-figbar-id ${inv ? 'pa-figbar-id-inv' : ''}`}>{fig.id}</span>
          <span className={`pa-figbar-txt ${inv ? 'pa-figbar-txt-inv' : ''}`}>
            {shot.org ? `${shot.org} · ` : ''}
            {fig.txt}
          </span>
        </figcaption>
      ) : null}

      <style jsx>{`
        .pa-plate-root {
          margin: 0;
        }

        /* -------------------- plate frame -------------------- */
        .pa-plate {
          position: relative;
          padding: 14px;
          background: var(--bone-deep);
          border: 1px solid var(--hair-strong);
        }
        .pa-plate-onnavy {
          background: rgba(255, 255, 255, 0.03);
          border-color: var(--hair-inv);
        }
        .pa-plate-mat {
          background: var(--paper);
          border: 1.5px solid var(--ink);
          padding: 10px;
          box-shadow: 0 1px 0 var(--hair);
        }
        .pa-plate-onnavy .pa-plate-mat {
          border-color: var(--paper);
        }
        .pa-plate-mat-bone {
          background: var(--paper);
        }
        .pa-plate-frame {
          border: 1px solid var(--ink);
          overflow: hidden;
          background: #0d0f14;
          line-height: 0;
        }
        .pa-plate-frame-inv {
          border-color: var(--ink);
        }
        .pa-plate-wide .pa-plate-frame {
          background: #17141f;
        }
        .pa-plate-img {
          display: block;
          width: 100%;
          height: auto;
        }

        /* -------------------- corner registration ticks -------------------- */
        .pa-tick {
          position: absolute;
          width: 11px;
          height: 11px;
          z-index: 2;
        }
        .pa-tick::before,
        .pa-tick::after {
          content: '';
          position: absolute;
          background: var(--signal);
        }
        .pa-tick::before {
          width: 11px;
          height: 1px;
          top: 5px;
        }
        .pa-tick::after {
          width: 1px;
          height: 11px;
          left: 5px;
        }
        .pa-tick-tl {
          top: 0;
          left: 0;
        }
        .pa-tick-tr {
          top: 0;
          right: 0;
        }
        .pa-tick-bl {
          bottom: 0;
          left: 0;
        }
        .pa-tick-br {
          bottom: 0;
          right: 0;
        }

        /* -------------------- figure bar -------------------- */
        .pa-figbar {
          display: flex;
          gap: 14px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--hair);
          font-family: var(--mono);
          font-size: 11.5px;
          line-height: 1.5;
          letter-spacing: 0.01em;
          color: var(--steel);
        }
        .pa-figbar-id {
          color: var(--signal-deep);
          flex: none;
          font-weight: 500;
        }
        .pa-figbar-txt {
          text-transform: none;
        }
        .pa-figbar-inv {
          border-top-color: var(--hair-inv);
          color: rgba(247, 246, 242, 0.7);
        }
        .pa-figbar-id-inv {
          color: var(--signal);
        }
        .pa-figbar-txt-inv {
          color: rgba(247, 246, 242, 0.78);
        }

        /* -------------------- annotation leader lines -------------------- */
        .pa-anno {
          position: absolute;
          display: flex;
          align-items: center;
          z-index: 3;
          pointer-events: none;
        }
        .pa-anno-label {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.01em;
          color: var(--ink);
          background: var(--signal);
          padding: 3px 8px;
          white-space: nowrap;
          line-height: 1.3;
        }
        .pa-anno-label-inv {
          background: var(--signal);
          color: var(--ink);
        }
        .pa-anno-leader {
          height: 1px;
          width: 34px;
          background: var(--signal);
          flex: none;
        }
        .pa-anno-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          border: 1.5px solid var(--signal);
          background: transparent;
          flex: none;
        }
        .pa-anno-hero {
          right: -8px;
          bottom: 74px;
          flex-direction: row-reverse;
        }
        .pa-anno-band {
          left: 47%;
          bottom: 150px;
        }
        .pa-anno-proof {
          left: 3%;
          top: -6px;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }
        .pa-anno-leader-down {
          width: 1px;
          height: 58px;
          margin-left: 30px;
        }

        @media (max-width: 720px) {
          /* Annotations are tight on narrow screens; the fig bars carry the
             same information in-flow. */
          .pa-anno {
            display: none;
          }
        }
      `}</style>
    </figure>
  );
}

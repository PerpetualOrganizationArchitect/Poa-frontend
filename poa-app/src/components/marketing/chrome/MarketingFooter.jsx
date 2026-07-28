import React from 'react';
import NextLink from 'next/link';
import { FOOTER_FULL } from '@/components/marketing/landingCopy';

// MarketingFooter - the direction-A colophon, scaled up from the proto footer.
// Ink ground, the mark large in bone, the "Poa itself runs..." self-host line,
// two nav columns, and a rule-triple colophon carrying std. 001, the closing
// grace note ("Start something that lasts.", demoted here from a headline), and
// the year. Plain <a>/NextLink + styled-jsx, no Chakra.

const F = FOOTER_FULL;

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="pa-footer">
      <div className="pa-container pa-grid pa-grid-footer">
        <span className="pa-rail" aria-hidden="true">
          colophon
        </span>

        <div className="pa-footer-brand">
          <span className="pa-brand-mark-lg">Poa</span>
          <p className="pa-footer-tag">{F.tagline}</p>
          <p className="pa-footer-self">{F.selfHost}</p>
        </div>

        <div className="pa-footer-cols">
          {F.columns.map((col) => (
            <nav key={col.heading} className="pa-footer-col" aria-label={col.heading}>
              <span className="pa-footer-col-head">{col.heading}</span>
              <ul className="pa-footer-list">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="pa-footer-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <NextLink href={link.href} className="pa-footer-link">
                        {link.label}
                      </NextLink>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="pa-container">
        <div className="pa-footer-rules" aria-hidden="true">
          <span className="pa-footer-rule-sig" />
          <span className="pa-footer-rule-mid" />
          <span className="pa-footer-rule-hair" />
        </div>
        <div className="pa-footer-fine">
          <span className="pa-footer-fine-id">{F.std}</span>
          <span className="pa-footer-fine-txt">{F.colophon}</span>
          <span className="pa-footer-grace">{F.graceNote}</span>
          <span className="pa-footer-year">© {year} Poa</span>
        </div>
      </div>

      <style jsx>{`
        .pa-footer {
          background: var(--ink);
          color: var(--bone);
          padding: 72px 0 40px;
        }
        .pa-grid-footer {
          align-items: start;
        }
        .pa-footer :global(.pa-rail) {
          color: var(--signal);
        }
        .pa-footer-brand {
          grid-column: 2 / 8;
        }
        .pa-brand-mark-lg {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 720;
          font-weight: 720;
          font-size: 44px;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--bone);
          display: inline-block;
          margin-bottom: 16px;
        }
        .pa-footer-tag {
          font-size: 18px;
          color: var(--bone);
          margin: 0 0 12px;
          max-width: 30ch;
        }
        .pa-footer-self {
          font-size: 14px;
          color: rgba(247, 246, 242, 0.62);
          margin: 0;
          max-width: 42ch;
        }
        .pa-footer-cols {
          grid-column: 9 / 14;
          display: flex;
          gap: 48px;
          padding-top: 8px;
        }
        .pa-footer-col-head {
          display: block;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--signal);
          margin-bottom: 16px;
        }
        .pa-footer-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        /* footer links sit on NextLink + plain <a>; scope via the list parent
           + :global() so both host kinds pick up the styling. */
        .pa-footer-list :global(.pa-footer-link) {
          font-size: 15px;
          color: rgba(247, 246, 242, 0.82);
          text-decoration: none;
        }
        .pa-footer-list :global(.pa-footer-link):hover {
          color: var(--signal);
        }

        .pa-footer-rules {
          margin: 56px 0 20px;
        }
        .pa-footer-rule-sig,
        .pa-footer-rule-mid,
        .pa-footer-rule-hair {
          display: block;
        }
        .pa-footer-rule-sig {
          height: 3px;
          background: var(--signal);
        }
        .pa-footer-rule-mid {
          height: 2px;
          background: rgba(247, 246, 242, 0.28);
          margin-top: 3px;
        }
        .pa-footer-rule-hair {
          height: 1px;
          background: rgba(247, 246, 242, 0.14);
          margin-top: 3px;
        }
        .pa-footer-fine {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: rgba(247, 246, 242, 0.5);
          margin: 0;
          display: flex;
          gap: 16px 20px;
          flex-wrap: wrap;
          align-items: baseline;
        }
        .pa-footer-fine-id {
          color: var(--signal);
        }
        .pa-footer-grace {
          margin-left: auto;
          color: rgba(247, 246, 242, 0.72);
        }

        @media (max-width: 1080px) {
          .pa-footer-brand {
            grid-column: 2 / 14;
          }
          .pa-footer-cols {
            grid-column: 2 / 14;
            margin-top: 40px;
          }
        }
        @media (max-width: 720px) {
          .pa-footer-brand,
          .pa-footer-cols {
            grid-column: 1 / 2;
          }
          .pa-footer-cols {
            gap: 36px;
          }
          .pa-footer-grace {
            margin-left: 0;
            width: 100%;
          }
        }
      `}</style>
    </footer>
  );
}

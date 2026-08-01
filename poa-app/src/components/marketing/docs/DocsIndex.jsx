import React from 'react';
import NextLink from 'next/link';
import { DOCS_SECTIONS, DOCS_CATCHALL } from '@/components/marketing/docsCopy';

// DocsIndex - the manual's table of contents. Groups every post into task-first
// chapters (DOCS_SECTIONS), in reading order, and renders each chapter as a
// numbered section whose entries are a plain hairline-ruled list: the slug as a
// mono reference, a hub display title (manual register), and a one-line blurb.
// Every article link keeps its existing slug (/docs/<id>), so nothing breaks.
// Anything not placed in a section falls into an "Everything else" catch-all so
// no post ever goes missing.
//
// Section entries carry the hub's OWN title/blurb (curated in docsCopy, in the
// clean manual register), never the article front-matter, so the index obeys the
// banned-vocab gate. Catch-all entries (e.g. the three test posts, or any newly
// added doc) fall back to the post's own title and show no blurb. The article
// page itself still renders the post's own title + body verbatim.

function buildGroups(allPostsData) {
  const present = new Set(allPostsData.map((p) => p.id));
  const placed = new Set();
  const groups = [];

  for (const section of DOCS_SECTIONS) {
    // Keep only entries whose article actually exists in the post set.
    const entries = section.entries
      .filter((e) => present.has(e.id))
      .map((e) => {
        placed.add(e.id);
        return e;
      });
    if (entries.length) groups.push({ ...section, entries });
  }

  // Catch-all: any post not explicitly placed (e.g. newly added docs or the
  // three test posts). Normalized to the same {id,title,blurb} shape; the title
  // falls back to the post's own, blurb is omitted. Alphabetical id order.
  const leftover = allPostsData
    .filter((p) => !placed.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, title: p.title || p.id, blurb: '' }));
  if (leftover.length) groups.push({ ...DOCS_CATCHALL, entries: leftover });

  return groups;
}

export default function DocsIndex({ allPostsData }) {
  const groups = buildGroups(allPostsData || []);

  return (
    <div className="pa-di">
      {groups.map((group) => (
        <section
          key={group.heading}
          className="pa-di-section"
          aria-labelledby={`docs-sec-${group.no}`}
        >
          <div className="pa-hairline" />
          <div className="pa-container pa-grid">
            <span className="pa-rail" aria-hidden="true">
              {group.rail}
            </span>

            <div className="pa-di-head">
              <p className="pa-kicker">
                <span className="pa-kicker-no">{group.no}</span>
                contents
              </p>
              <h2 className="pa-di-title" id={`docs-sec-${group.no}`}>
                {group.heading}
              </h2>
            </div>

            <ol className="pa-di-list">
              {group.entries.map((entry, entryIdx) => (
                <li key={entry.id} className="pa-di-item">
                  <NextLink href={`/docs/${entry.id}`} className="pa-di-link">
                    {/* mono index, not the raw slug: hub visible text obeys the
                        banned-vocab list, and some article slugs carry exempt
                        substrate vocabulary (e.g. gas-sponsor). */}
                    <span className="pa-di-slug" aria-hidden="true">
                      {String(entryIdx + 1).padStart(2, '0')}
                    </span>
                    <span className="pa-di-body">
                      <span className="pa-di-entry-title">{entry.title}</span>
                      {entry.blurb ? (
                        <span className="pa-di-blurb">{entry.blurb}</span>
                      ) : null}
                    </span>
                    <span className="pa-di-arrow" aria-hidden="true">
                      →
                    </span>
                  </NextLink>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ))}

      <style jsx>{`
        .pa-di-section {
          padding-bottom: 8px;
        }
        .pa-di-section .pa-container {
          padding-top: 56px;
          padding-bottom: 56px;
        }
        .pa-di-head {
          grid-column: 2 / 6;
          position: sticky;
          top: 96px;
          align-self: start;
        }
        .pa-di-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(1.6rem, 3vw, 2.3rem);
          line-height: 1.06;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0;
          max-width: 14ch;
        }
        .pa-di-list {
          grid-column: 6 / 14;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .pa-di-item {
          border-top: 1px solid var(--hair);
        }
        .pa-di-item:first-child {
          border-top: none;
        }
        /* the row link is a NextLink (component), so styled-jsx does not scope
           the rendered <a>; target it via the list parent + :global(). */
        .pa-di-list :global(.pa-di-link) {
          display: grid;
          grid-template-columns: 130px 1fr auto;
          align-items: baseline;
          gap: 22px;
          padding: 20px 6px 20px 0;
          text-decoration: none;
          color: var(--ink);
          transition: background 0.15s ease, padding 0.15s ease;
        }
        .pa-di-list :global(.pa-di-link):hover {
          background: var(--bone-deep);
          padding-left: 12px;
          padding-right: 12px;
        }
        .pa-di-slug {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.02em;
          color: var(--signal-deep);
          padding-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pa-di-body {
          display: block;
        }
        .pa-di-entry-title {
          display: block;
          font-family: var(--archivo);
          font-variation-settings: 'wght' 560;
          font-weight: 560;
          font-size: 19px;
          letter-spacing: -0.012em;
          line-height: 1.2;
          color: var(--ink);
        }
        .pa-di-blurb {
          display: block;
          font-size: 15px;
          line-height: 1.5;
          color: var(--steel);
          margin-top: 4px;
          max-width: 54ch;
        }
        .pa-di-arrow {
          font-family: var(--mono);
          font-size: 15px;
          color: var(--steel);
          padding-top: 2px;
          transition: color 0.15s ease, transform 0.15s ease;
        }
        .pa-di-list :global(.pa-di-link):hover .pa-di-arrow {
          color: var(--signal);
          transform: translateX(3px);
        }

        @media (max-width: 1080px) {
          .pa-di-head {
            grid-column: 2 / 14;
            position: static;
            margin-bottom: 24px;
          }
          .pa-di-title {
            max-width: 100%;
          }
          .pa-di-list {
            grid-column: 2 / 14;
          }
        }
        @media (max-width: 720px) {
          .pa-di-section .pa-container {
            padding-top: 40px;
            padding-bottom: 40px;
          }
          .pa-di-head,
          .pa-di-list {
            grid-column: 1 / 2;
          }
          .pa-di-list :global(.pa-di-link) {
            grid-template-columns: 1fr auto;
            gap: 14px;
          }
          /* slug drops below the title on phones to keep the row legible */
          .pa-di-slug {
            grid-column: 1 / 2;
            grid-row: 2;
            padding-top: 6px;
          }
          .pa-di-body {
            grid-column: 1 / 2;
            grid-row: 1;
          }
          .pa-di-arrow {
            grid-column: 2 / 3;
            grid-row: 1;
          }
          .pa-di-blurb {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

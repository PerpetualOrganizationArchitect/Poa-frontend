import React from 'react';
import NextLink from 'next/link';
import Image from 'next/image';
import { DOCS_SECTIONS } from '@/components/marketing/docsCopy';
import { DOCS_MEDIA, DOCS_EXAMPLE_IMAGES } from '@/components/marketing/docsMedia';

// Only curated, published guides appear in the public reading path.
function buildGroups(allPostsData) {
  const present = new Set(allPostsData.map((post) => post.id));
  return DOCS_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => present.has(entry.id)),
  })).filter((section) => section.entries.length);
}

export default function DocsIndex({ allPostsData }) {
  const groups = buildGroups(allPostsData || []);

  return (
    <div className="pa-di">
      {groups.map((group) => (
        <section
          key={group.heading}
          className={`pa-di-section${group.layout === 'examples' ? ' pa-di-examples' : ''}`}
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
              <p className="pa-di-description">{group.description}</p>
            </div>

            <ol className="pa-di-list">
              {group.entries.map((entry, entryIdx) => (
                <li key={entry.id} className="pa-di-item">
                  <NextLink href={`/docs/${entry.id}`} className="pa-di-link">
                    <span className="pa-di-slug" aria-hidden="true">
                      {String(entryIdx + 1).padStart(2, '0')}
                    </span>
                    <span className="pa-di-body">
                      {group.layout === 'examples' && DOCS_EXAMPLE_IMAGES[entry.id] ? (
                        <Image
                          className="pa-di-example-image"
                          src={DOCS_EXAMPLE_IMAGES[entry.id]}
                          width={DOCS_MEDIA[DOCS_EXAMPLE_IMAGES[entry.id]].width}
                          height={DOCS_MEDIA[DOCS_EXAMPLE_IMAGES[entry.id]].height}
                          alt=""
                          loading="lazy"
                          sizes="(max-width: 720px) 100vw, 33vw"
                        />
                      ) : null}
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
          scroll-margin-top: 96px;
        }
        .pa-di-description {
          font-size: 15px;
          line-height: 1.6;
          color: var(--steel);
          max-width: 28ch;
          margin: 18px 22px 0 0;
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
          grid-template-columns: 36px 1fr auto;
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
        .pa-di-list :global(.pa-di-link:focus-visible) {
          outline: 2px solid var(--signal-deep);
          outline-offset: 5px;
        }

        .pa-di-examples .pa-di-head {
          grid-column: 2 / 14;
          position: static;
          margin-bottom: 28px;
        }
        .pa-di-examples .pa-di-title { max-width: 100%; }
        .pa-di-examples .pa-di-description { max-width: 64ch; }
        .pa-di-examples .pa-di-list {
          grid-column: 2 / 14;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 28px 32px;
        }
        .pa-di-examples .pa-di-item { border-top: 0; min-width: 0; }
        .pa-di-examples .pa-di-item:first-child { grid-column: 1 / -1; }
        .pa-di-examples .pa-di-slug { display: none; }
        .pa-di-examples :global(.pa-di-link) {
          grid-template-columns: 1fr auto;
          gap: 12px;
          padding: 0;
        }
        .pa-di-examples :global(.pa-di-link):hover {
          padding: 0;
          background: transparent;
        }
        .pa-di-examples :global(.pa-di-link):hover .pa-di-entry-title {
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .pa-di-examples .pa-di-item:not(:first-child) .pa-di-body { grid-column: 1 / -1; }
        .pa-di-examples .pa-di-item:not(:first-child) .pa-di-arrow { display: none; }
        .pa-di-examples :global(.pa-di-example-image) {
          display: block;
          width: 100%;
          height: auto;
          margin-bottom: 20px;
          background: var(--bone-deep);
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
          .pa-di-examples .pa-di-head,
          .pa-di-examples .pa-di-list { grid-column: 1 / 2; }
          .pa-di-examples .pa-di-list { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>
    </div>
  );
}

import React from 'react';
import NextLink from 'next/link';
import { DOCS_ARTICLE } from '@/components/marketing/docsCopy';

// DocsArticle - the direction-A reader shell around a rendered docs post. A
// typographic pass only: it does NOT change how content is sourced or rendered.
// The page still passes postData.contentHtml (the exact same markdown pipeline
// output) and it is dropped in via dangerouslySetInnerHTML unchanged, so the
// article BODY is byte-identical and every in-article anchor/id the pipeline
// produced (heading ids, in-page links) is preserved.
//
// The reskin is purely the frame + the Direction-A treatment of the rendered
// markup: a readable ~680px measure, Archivo headings, Public Sans body, Plex
// Mono for code, hairline rules, signal-orange links/marks. All body element
// styling is scoped under .pa-article via :global() (the markup is injected, so
// styled-jsx cannot scope-class it directly).
//
// No motion library. Motion is a single .poa-fade on the header - a manual, not
// a show.

const C = DOCS_ARTICLE;

export default function DocsArticle({ postData, navigationData, relatedPosts }) {
  const { prev, next } = navigationData || { prev: null, next: null };
  const isoDate = postData.date ? new Date(postData.date).toISOString() : null;
  const humanDate = postData.date
    ? new Date(postData.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const title = postData.title || postData.id;

  return (
    <article className="pa-article-wrap">
      <div className="pa-container">
        {/* Breadcrumb - same anchors as before (home, docs, current). */}
        <nav className="pa-crumb" aria-label="Breadcrumb">
          <NextLink href={C.homeHref} className="pa-crumb-link">
            {C.home}
          </NextLink>
          <span className="pa-crumb-sep" aria-hidden="true">
            /
          </span>
          <NextLink href={C.backHref} className="pa-crumb-link">
            {C.backLabel}
          </NextLink>
          <span className="pa-crumb-sep" aria-hidden="true">
            /
          </span>
          <span className="pa-crumb-current">{title}</span>
        </nav>

        <header className="pa-article-head poa-fade">
          <div className="pa-article-rule" aria-hidden="true">
            <span className="pa-article-rule-sig" />
            <span className="pa-article-rule-hair" />
          </div>
          <p className="pa-article-meta">
            <span className="pa-article-cat">{postData.category || 'Docs'}</span>
            {humanDate && isoDate ? (
              <>
                <span className="pa-article-dot" aria-hidden="true">
                  ·
                </span>
                <time dateTime={isoDate}>
                  {C.updatedPrefix} {humanDate}
                </time>
              </>
            ) : null}
            <span className="pa-article-dot" aria-hidden="true">
              ·
            </span>
            <span>{C.author}</span>
          </p>
          <h1 className="pa-article-title">{title}</h1>
        </header>

        {/* Rendered markdown - sourced + rendered exactly as before. The
            .markdown-content / article-content classes are kept so the global
            stylesheet's base rules still apply; .pa-article layers the
            Direction-A treatment on top, scoped to this shell only. */}
        <div
          className="pa-article markdown-content article-content"
          dangerouslySetInnerHTML={{ __html: postData.contentHtml }}
        />

        {relatedPosts && relatedPosts.length > 0 && (
          <section className="pa-article-related" aria-labelledby="pa-related-heading">
            <h2 className="pa-related-heading" id="pa-related-heading">
              {C.relatedHeading}
            </h2>
            <ul className="pa-related-list">
              {relatedPosts.map((rp) => (
                <li key={rp.id} className="pa-related-item">
                  <NextLink href={`/docs/${rp.id}`} className="pa-related-link">
                    <span className="pa-related-slug" aria-hidden="true">
                      /{rp.id}
                    </span>
                    <span className="pa-related-title">{rp.title}</span>
                  </NextLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="pa-article-nav" aria-label="Previous and next">
          <div className="pa-article-nav-cell">
            {prev ? (
              <NextLink href={`/docs/${prev.id}`} className="pa-article-nav-link pa-prev">
                <span className="pa-article-nav-dir">← {C.prevLabel}</span>
                <span className="pa-article-nav-name">{prev.title || prev.id}</span>
              </NextLink>
            ) : null}
          </div>

          <NextLink href={C.backHref} className="pa-article-nav-all">
            {C.allLabel}
          </NextLink>

          <div className="pa-article-nav-cell pa-article-nav-cell-end">
            {next ? (
              <NextLink href={`/docs/${next.id}`} className="pa-article-nav-link pa-next">
                <span className="pa-article-nav-dir">{C.nextLabel} →</span>
                <span className="pa-article-nav-name">{next.title || next.id}</span>
              </NextLink>
            ) : null}
          </div>
        </nav>
      </div>

      <style jsx>{`
        .pa-article-wrap {
          padding: 40px 0 88px;
        }
        /* Narrow the container to a readable measure for the article route. */
        .pa-article-wrap :global(.pa-container) {
          max-width: 780px;
        }

        /* -------------------- breadcrumb -------------------- */
        .pa-crumb {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.02em;
          color: var(--steel);
          margin-bottom: 36px;
          flex-wrap: wrap;
        }
        .pa-crumb :global(.pa-crumb-link) {
          color: var(--signal-deep);
          text-decoration: none;
        }
        .pa-crumb :global(.pa-crumb-link):hover {
          color: var(--signal);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .pa-crumb-sep {
          color: var(--hair-strong);
        }
        .pa-crumb-current {
          color: var(--steel);
        }

        /* -------------------- header -------------------- */
        .pa-article-head {
          margin-bottom: 44px;
        }
        .pa-article-rule {
          margin-bottom: 22px;
        }
        .pa-article-rule-sig,
        .pa-article-rule-hair {
          display: block;
        }
        .pa-article-rule-sig {
          width: 52px;
          height: 3px;
          background: var(--signal);
        }
        .pa-article-rule-hair {
          width: 100%;
          max-width: 320px;
          height: 1px;
          background: var(--hair-strong);
          margin-top: 7px;
        }
        .pa-article-meta {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--steel);
          margin: 0 0 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pa-article-cat {
          color: var(--signal-deep);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .pa-article-dot {
          color: var(--hair-strong);
        }
        .pa-article-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-weight: 640;
          font-size: clamp(2.1rem, 4.6vw, 3.4rem);
          line-height: 1.04;
          letter-spacing: -0.024em;
          color: var(--ink);
          margin: 0;
        }

        /* -------------------- related entries -------------------- */
        .pa-article-related {
          margin-top: 64px;
          padding-top: 32px;
          border-top: 1px solid var(--hair);
        }
        .pa-related-heading {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 16px;
        }
        .pa-related-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .pa-related-item {
          border-top: 1px solid var(--hair);
        }
        .pa-related-item:first-child {
          border-top: none;
        }
        .pa-related-list :global(.pa-related-link) {
          display: flex;
          align-items: baseline;
          gap: 16px;
          padding: 14px 4px;
          text-decoration: none;
          color: var(--ink);
          transition: background 0.15s ease, padding 0.15s ease;
        }
        .pa-related-list :global(.pa-related-link):hover {
          background: var(--bone-deep);
          padding-left: 10px;
          padding-right: 10px;
        }
        .pa-related-slug {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--signal-deep);
          flex: none;
          min-width: 130px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pa-related-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 540;
          font-weight: 540;
          font-size: 16px;
          letter-spacing: -0.01em;
          color: var(--ink);
        }

        /* -------------------- prev / next -------------------- */
        .pa-article-nav {
          margin-top: 56px;
          padding-top: 28px;
          border-top: 2px solid var(--ink);
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: start;
          gap: 20px;
        }
        .pa-article-nav-cell-end {
          text-align: right;
        }
        .pa-article-nav :global(.pa-article-nav-link) {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          text-decoration: none;
          max-width: 26ch;
        }
        .pa-article-nav :global(.pa-next) {
          align-items: flex-end;
          margin-left: auto;
        }
        .pa-article-nav-dir {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--signal-deep);
        }
        .pa-article-nav-name {
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.3;
        }
        .pa-article-nav :global(.pa-article-nav-link):hover .pa-article-nav-name {
          color: var(--signal-deep);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .pa-article-nav :global(.pa-article-nav-all) {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--steel);
          text-decoration: none;
          padding-top: 2px;
          white-space: nowrap;
        }
        .pa-article-nav :global(.pa-article-nav-all):hover {
          color: var(--signal);
        }

        @media (max-width: 640px) {
          .pa-article-nav {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .pa-article-nav-cell-end {
            text-align: left;
          }
          .pa-article-nav :global(.pa-next) {
            align-items: flex-start;
            margin-left: 0;
          }
          .pa-article-nav :global(.pa-article-nav-all) {
            order: 3;
          }
          .pa-related-slug {
            min-width: 0;
          }
        }
      `}</style>

      {/* Direction-A treatment of the injected markdown. The markup is dropped
          in via dangerouslySetInnerHTML, so styled-jsx can't add its scope class
          to those elements; every rule is written as .pa-article :global(...) so
          it lands on the rendered body without leaking outside this shell. */}
      <style jsx global>{`
        .pa-root .pa-article {
          font-family: var(--sans);
          font-size: 17px;
          line-height: 1.72;
          color: var(--ink);
        }
        /* Reset the global .markdown-content / .article-content base look that
           targets the old app theme, so the Direction-A rules below own it. */
        .pa-root .pa-article,
        .pa-root .pa-article.article-content {
          letter-spacing: 0;
        }

        .pa-root .pa-article > :first-child {
          margin-top: 0;
        }

        .pa-root .pa-article p {
          font-size: 17px;
          line-height: 1.72;
          color: var(--ink);
          margin: 0 0 1.4rem;
        }
        /* Lead paragraph: quietly larger, steel, sets the opening tone. */
        .pa-root .pa-article.article-content > p:first-of-type {
          font-size: 19px;
          line-height: 1.6;
          color: var(--steel);
        }

        .pa-root .pa-article h1,
        .pa-root .pa-article h2,
        .pa-root .pa-article h3,
        .pa-root .pa-article h4,
        .pa-root .pa-article h5,
        .pa-root .pa-article h6 {
          font-family: var(--archivo);
          color: var(--ink);
          line-height: 1.14;
          letter-spacing: -0.018em;
          scroll-margin-top: 88px;
        }
        .pa-root .pa-article h2 {
          font-variation-settings: 'wght' 620;
          font-weight: 620;
          font-size: clamp(1.5rem, 2.6vw, 1.95rem);
          margin: 2.8rem 0 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--hair);
        }
        .pa-root .pa-article h3 {
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: clamp(1.25rem, 2vw, 1.5rem);
          margin: 2.2rem 0 0.8rem;
        }
        .pa-root .pa-article h4 {
          font-variation-settings: 'wght' 600;
          font-weight: 600;
          font-size: 1.15rem;
          margin: 1.8rem 0 0.6rem;
        }

        .pa-root .pa-article ul,
        .pa-root .pa-article ol {
          margin: 0 0 1.4rem;
          padding-left: 1.4rem;
        }
        .pa-root .pa-article li {
          margin-bottom: 0.5rem;
          line-height: 1.66;
        }
        .pa-root .pa-article li::marker {
          color: var(--signal);
        }
        .pa-root .pa-article li p {
          margin-bottom: 0.5rem;
        }

        .pa-root .pa-article a {
          color: var(--signal-deep);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 2.5px;
          transition: color 0.15s ease;
        }
        .pa-root .pa-article a:hover {
          color: var(--signal);
          text-decoration-thickness: 2px;
        }

        .pa-root .pa-article blockquote {
          margin: 1.8rem 0;
          padding: 4px 0 4px 22px;
          border-left: 3px solid var(--signal);
          background: none;
          border-radius: 0;
          font-style: normal;
          color: var(--steel);
        }
        .pa-root .pa-article blockquote p {
          color: var(--steel);
          margin-bottom: 0.75rem;
        }
        .pa-root .pa-article blockquote p:last-child {
          margin-bottom: 0;
        }

        .pa-root .pa-article code {
          font-family: var(--mono);
          font-size: 0.88em;
          padding: 0.15em 0.4em;
          background: var(--bone-deep);
          border: 1px solid var(--hair);
          border-radius: 2px;
          color: var(--signal-deep);
        }
        .pa-root .pa-article pre {
          margin: 1.6rem 0;
          padding: 18px 20px;
          border-radius: 2px;
          overflow-x: auto;
          background: var(--civic-deep);
          border: 1px solid var(--civic);
        }
        .pa-root .pa-article pre code {
          background: none;
          border: none;
          padding: 0;
          font-size: 0.9em;
          line-height: 1.6;
          color: var(--bone);
        }

        .pa-root .pa-article hr {
          margin: 2.4rem 0;
          border: 0;
          height: 1px;
          background: var(--hair);
        }

        .pa-root .pa-article img {
          max-width: 100%;
          height: auto;
          margin: 2rem auto;
          display: block;
          border: 1px solid var(--hair);
          border-radius: 2px;
          box-shadow: none;
        }

        .pa-root .pa-article table {
          width: 100%;
          margin: 1.8rem 0;
          border-collapse: collapse;
          border: 1px solid var(--hair);
          border-radius: 0;
          font-size: 15px;
        }
        .pa-root .pa-article th,
        .pa-root .pa-article td {
          padding: 0.6rem 0.9rem;
          border: 1px solid var(--hair);
          text-align: left;
        }
        .pa-root .pa-article th {
          background: var(--bone-deep);
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--steel);
        }
      `}</style>
    </article>
  );
}

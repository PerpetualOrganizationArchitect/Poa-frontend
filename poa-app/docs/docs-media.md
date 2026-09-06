# Documentation media

Maintainer reference for the documentation images added on 2026-09-06.

## Editorial artwork

Generated with the built-in imagegen tool. These are illustrative images, not documentary photographs of Poa communities. The selected set follows the requested nature direction: believable natural textures and explicitly abstract colorful art, with no people or arranged-stone still lifes. Optimized to WebP at quality 78 without cropping. All five originals are 1536 × 1024; deployed assets are below.

### water-ripples

File: `public/images/docs/water-ripples.webp`

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: quiet editorial nature image for a calm elevated documentation website. A close, beautifully simple study of gentle overlapping circular ripples on still muted sage-green water, soft afternoon sunlight, a little reflection of pale sky, subtle real texture and optical imperfections. Nothing else in frame. Natural abstract composition, contemplative but fresh, generous visual breathing room, refined editorial nature photography, wide landscape 3:2. No people, hands, animals, buildings, text, symbols, logos, product screens, glowing sci-fi, decorative borders, or overdramatic lighting.

### branching-light

File: `public/images/docs/branching-light.webp`

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: simple natural abstract editorial image for calm website documentation. A few delicate olive-like leafy branches entering the frame at the edges, overlapping with their softly focused shadows on an off-white warm plaster wall. The branching shadows make an airy organic composition with a large quiet center, light and shadow doing most of the work. Real subtle plaster grain, muted green leaves, warm afternoon sunshine, editorial art photography, thoughtful asymmetry, wide landscape 3:2. No people, hands, pots, buildings visible beyond the wall, text, logos, diagrams, decorative graphics, synthetic glow.

### open-horizon

File: `public/images/docs/open-horizon.webp`

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: quiet landscape photograph for elevated documentation about independence. Minimal open sea horizon on a calm clear morning, pale blue-gray sky meeting muted sage-blue water, a small section of weathered pale stone at the bottom of the frame. The water has fine natural ripples and the horizon is slightly above center. Generous space, very restrained color, clear soft daylight, beautiful realistic natural texture, serene but not sentimental travel-ad imagery. Wide landscape 3:2. No people, hands, animals, boats, buildings, text, logos, dramatic sunset, lens flare, neon or borders.

### moss-light

File: `public/images/docs/moss-light.webp`

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: close-up nature photograph that gives breathing room in calm independent-minded documentation. A truly believable close photograph of lush green moss growing unevenly across damp bark and a weathered root in a temperate forest. Fine tiny moss fronds, a few brown leaf fragments, irregular patches of moist earth, natural microtexture. Gentle dappled daylight, honest rich moss greens and deep brown, not gray beige luxury branding. A quietly beautiful detail someone might notice on a walk, imperfect and unstaged. Wide landscape 3:2 composition. Absolutely no arranged or balanced stones, studio setting, glossy 3D render, geometric props, plants in pots, fake miniature landscape, people, hands, animals, writing, logos, or text.

### nature-in-conversation

File: `public/images/docs/nature-in-conversation.webp`

Exact generation prompt:

> Use case: illustration-story. Asset type: colorful abstract nature art for a thoughtful article inviting AI agents to form independent collectives and build together. An original fine-art print inspired by leaves, waterways, branching growth, seeds, and reflected light. Large simple organic cut-paper shapes and visible soft monotype ink textures on warm uncoated paper: forest green, moss, cobalt blue, sun-warmed orange, pale pink, and cream. Shapes touch, overlap, and leave generous breathing room, balanced with no center or hierarchy. Bold and free yet calm, tactile, slightly irregular edges, flat expressive artwork that is clearly art rather than a simulation of real objects. Refined independent art-book sensibility. Wide landscape 3:2. No writing, logos, diagrams, nodes, arrows, robots, computers, people, faces, floating glass pebbles, 3D renders, gradients, or corporate vector illustration.

## Product screenshots

- `public/images/docs/template-gallery.webp`: fresh read-only capture of `/create/` from this workspace's static export on 2026-09-06. Captured the actual template gallery element at 1280 × 960 viewport and 2× device scale, producing 1788 × 1124 pixels. No account sign-in, submissions, organization transactions, data seeding, or UI-text alteration. WebP quality 88. The setup wizard offers six configurable starting models.
- Reused `public/images/product/tasks-board.webp` and `task-detail.webp` from Decentral Park, `team-matrix.webp` from Kansas Blockchain (KUBI), and `treasury.webp` from Argus. Existing public capture provenance is in `src/components/marketing/productShots.js` and `scripts/marketing/capture-product-shots.mjs`. These show example configurations and historical records, not universal defaults or live balances. Argus's displayed BREAD distributions are fully claimed.
- The existing `vote-tally.webp` is intentionally excluded from the docs: its earlier capture hid a failed execution status. A tally must not be presented as proof that an action succeeded.

## Rendering and updates

`src/components/marketing/docsMedia.js` records actual image dimensions and whether each file is editorial or a screenshot. Standalone Markdown images registered there become semantic figures; the Markdown image title becomes an escaped caption. Screenshots link to the original image in a new tab for readable details. Images reserve their space and load lazily. Unknown or inline image syntax keeps normal Markdown behavior.

The editorial selection is deliberately limited: five nature images punctuate the club, cooperative, open-source, independence, and agent essays after their examples. They retain descriptive alt text without visible captions and are displayed at a maximum width of 560px. Practical guides use screenshots beside the steps or records they explain. Twelve articles contain a figure; the remaining guides have no image requirement. The introduction shows a real task, while the ownership guide explains that same task's reward. The member-directory capture is not used in the joining guide because it does not demonstrate joining.

To update an image, preserve its source and caption meaning, verify actual dimensions in the manifest, and inspect desktop and mobile layouts. The docs hub uses three selected nature images in its examples section, after the benefits, setup guidance, and feature reference. No runtime image service or remote asset dependency is needed.

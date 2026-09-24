# Central landing assets

The founder and team photographs are illustrative AI-generated images from the approved Sary design prototype. They do not depict identified customers or claim an endorsement. The responsive WebP derivatives are 640px and 1024px wide. Production pages use local assets only.

Typography uses IBM Plex Sans Arabic (Light, Regular, SemiBold), distributed under the SIL Open Font License 1.1. The full license is in `fonts/OFL.txt`. Upstream: https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic. No demonstration-only Expo font files are included.

Icons are inline SVG paths in `shared/central/icons.ts`. The existing Sary brand image remains `/sari-logo.png`.

The current homepage/login portrait is `sary-director-{640,1024}.webp`. It was generated with the built-in image tool, then edited with the original `/sari-logo.png` as the badge reference. Its full-resolution source is `docs/assets/sary-sales-director.png`; it is an illustrative fictional character. No sales results or customer endorsements are implied.

The social sharing image is `sary-sales-partner-social-v1.jpg` (1200 × 630, JPEG). The built-in image tool reframed the existing hero portrait with an extended green background; the face and badge stay inside a centred square crop. The output was resized and JPEG-encoded for delivery. The versioned URL replaces `social.jpg` in Open Graph, Twitter cards and article structured data. The on-page photographs remain unchanged.

Final built-in image edit prompt:

```text
Use case: identity-preserve.
Asset type: Sary website Open Graph social sharing photo, landscape 1200 x 630 pixels (1.9048:1).
Input image 1 is the edit target: the EXISTING website hero portrait. Make a landscape sharing version by reframing and extending only the dark forest-green photographic background.
Keep exactly the same man, recognizable face, hairstyle, expression, white Saudi thobe, green lanyard and original Sary logo on his ID badge. No redesign of the logo or portrait. Place the man centrally; show head to lower chest including the entire ID badge. Keep hair with comfortable top margin and the complete badge above the bottom margin. Face and ID must both remain inside the central square crop used by messaging apps. Subject large and confident, natural original studio lighting, matching subtle green halo background extended horizontally edge to edge. Photorealistic, simple, clean.
No additional words, headings, slogans, logos, UI, frames, objects, people or watermark. Do not add floating cards. Preserve the existing portrait; only change the framing and extend the background for the wide card.
```

`brands/` contains locally served original vendor assets. `brands/sources.json` records the upstream URLs (retrieved 2026-09-24). Salla and Zid SVGs were extracted from their official website headers without redesigning their paths. Google Calendar and Sheets use the current official Google Workspace product icons. Google Analytics uses the supplied horizontal wordmark with its linkback and a minimum rendered size of 154 × 50. Vendor marks identify the tools and do not imply endorsement. Zahy is explicitly an ecosystem link, separate from the existing ZahyPi AI connector.

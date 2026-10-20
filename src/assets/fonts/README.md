# Brand fonts

Self-hosted fonts from the Google Fonts source repository, retrieved 20 October 2026:

- [Instrument Serif Regular and Italic](https://github.com/google/fonts/tree/main/ofl/instrumentserif), see `instrument-serif-OFL.txt` for the authoritative copyright and SIL Open Font License.
- [Geist variable upright](https://github.com/google/fonts/tree/main/ofl/geist); see `geist-OFL.txt` for the authoritative copyright and SIL Open Font License. The application uses weights 400 and 500.

The original TTF files were losslessly packaged as WOFF2 using fontTools with Brotli. No glyphs were removed or outlines modified. `font-display: swap` and system fallbacks keep forms usable while fonts load. The stylesheet disables synthetic font styles and uses the separately supplied Instrument Serif italic face.

These are served only through explicit same-origin URLs in `src/platform/application.ts`. The build copies these assets and removes the previous font output before copying, preventing obsolete files from surviving an incremental build.

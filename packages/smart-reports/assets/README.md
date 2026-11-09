# Bundled report fonts

PDF reports use the local, unmodified Noto Sans CJK Japanese regular OpenType font with the existing Instrument Sans Latin-extension WOFF as a fallback for accented European characters. Runtime rendering never downloads fonts or follows report-provided asset paths. Keep the upstream licence beside the font.

Upstream: [Noto CJK](https://github.com/notofonts/noto-cjk), Sans 2.004, immutable revision `523d033d6cb47f4a80c58a35753646f5c3608a78`.

| Asset                     |    Bytes | SHA-256                                                            |
| ------------------------- | -------: | ------------------------------------------------------------------ |
| NotoSansCJKjp-Regular.otf | 16467736 | `68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5` |
| NotoSansCJK-OFL.txt       |     4301 | `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2` |

Licence: SIL Open Font License 1.1. `make smart-report-pdf-font-check` verifies all local hashes; `make smart-report-pdf-fonts` downloads missing Noto files from the pinned upstream revision or copies the missing Instrument Sans files from the existing locked `@fontsource/instrument-sans` 5.2.8 package; it verifies every file before writing. The fonts provide Latin/CJK coverage; renderer tests must explicitly cover unsupported-glyph behaviour as well as accented and CJK text. No universal glyph-coverage claim is made.

Instrument Sans upstream: [Instrument Sans](https://github.com/Instrument/instrument-sans), bundled from the already installed Fontsource 5.2.8 distribution. WOFF is retained because its composite accented glyphs pass PDF subsetting and text-extraction checks with the selected renderer. Both licences remain alongside the unmodified font files.

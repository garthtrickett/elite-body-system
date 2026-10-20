# Harry Baldwin / Elite Body System — brand findings

Source: [Harry Baldwin — Brand Foundations v1.0.pdf](Harry%20Baldwin%20-%20Brand%20Foundations%20v1.0.pdf), 29 pages, supplied by the operator on 20 October 2026. The deck credits Earth Design Studio and describes itself as Brand Direction / Vol. 01 / 2026.

This is a working reference for design, copy and product decisions. Page references use the PDF's numbered pages. **Source guidance** below records the deck; **implementation recommendations** translate it into practical choices. The deck remains authoritative for visual examples. Proposed logos and mockups remain proposals, and the deck alone does not authorize an app redesign or new functionality.

## Brand idea and positioning

The organising principle is restraint: reduce the method, words and visual elements to what earns its place (p. 5). The brand should feel timeless, disciplined, earned, natural, rooted in traditional training, and oriented toward lifelong practice. Its distinction is calm confidence in a loud fitness market (pp. 5–7).

Harry's story supplies the credibility: broad training experience, burnout, and a rebuilding process spanning sleep, nutrition, mindset and the nervous system (pp. 2–4). These are claims presented by the deck, not independently verified findings. Page 3 also presents a +120 kg weighted dip, +30 kg muscle-up, +10 kg lean muscle and 15,000 coaching hours; retain their context and verify them before using them as public proof points.

The offer combines training, nutrition, mindset and recovery. Page 16 describes a course undertaken independently or through customised one-to-one coaching, supported by an app, with a six-month foundation and continued lifelong practice. This describes the brand's intended offer, not implemented software or a guaranteed result.

The desired outcome is sustained elite physical condition: strength, leanness and energy (pp. 25–26). Physical transformation remains central, while capability and a coherent method lead the message. Avoid reducing the brand to either appearance alone or vague wellness.

## Audience

Page 8 names founders, CEOs, doctors, physios and people accomplished in their own fields, mostly in their 30s to 50s. They already train consistently and believe their physical performance could improve.

**Implementation recommendation:** address an experienced, capable adult. Explain the next useful action clearly, respect their time, and avoid manufactured urgency or patronising motivation. The stated audience is positioning guidance, not a software eligibility restriction.

## Voice and copy

The voice is calm, direct and earned: an experienced mentor with little need to impress (p. 12). Short statements carry conviction; the language should make the method feel clear and attainable through sustained work.

Representative lines in the deck include:

- “Capability first. The body follows.” (pp. 12, 21)
- “Your genetics are not the ceiling.” (p. 12)
- “Built, not bought.” (p. 12)
- “Stronger now than at twenty.” (p. 8)

Pages 6–7 and 12 reject shouting, rapid transformation promises, countdown discounts, generic self-improvement slogans and grind culture. Avoid exclamation-heavy commands, neon promotions and motivational filler.

**Implementation recommendation:** use direct verbs for controls and short, specific feedback. State what happened and the useful next step. Reserve expressive brand statements for moments where they add meaning; routine validation and errors still need explicit, readable explanations. Do not turn the story's health and performance claims into universal promises.

## Typography

Page 13 specifies two families:

| Family | Specified styles | Source role | Practical use |
| --- | --- | --- | --- |
| **Instrument Serif** | Regular and Italic | The voice: statements, quotations and significant moments; large and infrequent | Expressive headlines and short coaching statements; occasional italic emphasis |
| **Geist** | Regular and Medium | Labels, body copy and numbers; clean and restrained | Supporting copy, controls, form labels, units and routine interface text |

**Implementation recommendation:** map Regular to `font-weight: 400` and Medium to `500`; Italic uses `font-style: italic`. These numeric mappings are implementation conventions rather than values printed in the deck. Geist means the proportional sans-serif family; the deck does not specify Geist Mono.

The screen mockups also use serif treatments for day titles, session headings and prominent metrics (pp. 21–23). This creates a nuance: the typography page assigns numbers to Geist, while the visual examples sometimes use serif numerals. Use Geist as the default for functional numeric information, and make deliberate exceptions when reproducing a specific approved composition.

The deck does not define a complete type scale, line-height system, letter-spacing tokens or responsive sizes. Do not treat measurements inferred from mockups as specified brand values. Small labels in presentation imagery should not dictate unreadable production text.

Font binaries and a font licence bundle are not supplied separately with this PDF. Obtain and verify the intended font files and licences before implementation; the PDF is a visual reference, not an installable font package.

## Colour palette

These hex values are transcribed from the printed labels on pages 14–15, rather than sampled from compressed photography:

| Colour | Hex | RGB | Intended role |
| --- | --- | --- | --- |
| Off-black | **`#11100E`** | `17, 16, 14` | Main dark surface; warm near-black |
| Off-white | **`#F3F0EA`** | `243, 240, 234` | Main light tone and primary text on dark surfaces |
| Grey | **`#86827B`** | `134, 130, 123` | Supporting neutral in the palette; specific UI roles require design decisions |
| Olive | **`#6A6C4B`** | `106, 108, 75` | Sole chromatic accent; used sparingly to identify what matters |

Page 14 compares pure black `#000000` and pure white `#FFFFFF` with the warmer brand pairing. Pure black and white are comparison samples, not the principal palette to adopt.

Page 15 gives unusually specific olive rules:

- Keep it below **5% of any layout**.
- Never use it as a background.
- Never apply it over photography.

Olive connects to military history, field equipment, discipline and resilience. The muted palette is intended to evoke considered materials and lasting value (p. 15).

**Source tension:** pages 20–23 show olive app-icon treatments, controls and small indicators, including filled buttons. Those examples sit alongside the written prohibition on backgrounds. A reasonable working interpretation is to avoid olive page backgrounds and large panels while allowing small functional accents shown in the mockups. This is an interpretation, not a resolved exception in the source; confirm the intended scope before broad use of filled olive surfaces.

**Implementation recommendations:** define the four source colours centrally, then derive any additional surface, border, focus and status tokens deliberately. The deck does not supply semantic error/success colours or a full interaction palette. Check contrast at the actual text size, especially grey and olive, and pair state colours with text or shape. Visual restraint must retain clear focus, error, disabled and loading feedback.

Calculated contrast ratios for the exact solid colours below are implementation findings, not specifications from the PDF. Opacity, image overlays and alternate surfaces will change the results.

| Pair | Contrast ratio |
| --- | --- |
| Off-white / off-black | 16.72:1 |
| Grey / off-black | 4.97:1 |
| Olive / off-black | 3.49:1 |
| Off-white / olive | 4.78:1 |

Olive provides substantially less text contrast on the dark surface than off-white. Use it deliberately, rather than inheriting it as the default text colour for small labels.

The following is a proposed CSS reference, not an existing application API. Fallbacks are recommendations; the named families and four hex values come from the deck.

```css
:root {
  --brand-off-black: #11100e;
  --brand-off-white: #f3f0ea;
  --brand-grey: #86827b;
  --brand-olive: #6a6c4b;
  --brand-font-display: "Instrument Serif", Georgia, serif;
  --brand-font-body: "Geist", system-ui, sans-serif;
}
```

## Photography and art direction

Pages 9–11 call for an established gym environment photographed with an art photographer's eye: natural light, grain, physical texture, real skin, chalk and iron. Include pauses between sets and stillness as well as effort.

Black-and-white images should feel warm rather than cold grey. Colour images are low in saturation with warm, soft blacks and fine grain. Avoid glossy, highly saturated, aggressively contrasty fitness imagery. The deck explicitly rejects mirror selfies, flexing and artificial gloss as art-direction references (p. 9).

The photographic examples centre Harry and real training. Pages 24 and 27–28 show social and website applications; they demonstrate how images and typography can share a visual language, not a complete content production specification. Do not infer permission to reuse unrelated stock subjects or treat illustrative testimonials as verified customer endorsements.

## Logo and brand relationship

The deck introduces Harry Baldwin alongside Elite Body System, with Harry's experience and voice grounding the method. It does not fully specify a corporate brand hierarchy or trademark policy.

Pages 17–19 present inspiration, a **proposed** EBS mark and its rationale: peak performance, overcoming challenge, athletic motion and life hurdles. Pages 20 and 29 show further applications of the symbol and wordmarks. The examples connect the EBS abbreviation, the full Elite Body System name and Harry Baldwin attribution.

No production vector files, clear-space rules, minimum sizes, complete lockup inventory or final logo approval are supplied separately. Treat the PDF logo as a reference; obtain approved artwork before replacing existing marks. A trademark symbol in a mockup is not evidence of registration.

## App and website direction

Page 21 is the clearest product guidance:

1. Keep the app recognisably in the same brand world as the deck, social content and Harry himself, using the same two fonts and restrained palette.
2. Present a useful training log with honest progress. Avoid confetti, flames, neon and badges.
3. Give each screen one clear purpose, generous space, prominent numbers and restrained labels. Content should help the person train, eat, think or recover that day.
4. Carry Harry's short, direct coaching voice through the interface, with serif statements used where appropriate.

The examples show consistency across the four pillars, nutrition figures, the next session, a daily priority, exercise details, set logging and a timer (pp. 21–22). Page 23 extends the visual language across phone, desktop and watch. Pages 27–28 explore monochrome and muted-colour website hero treatments.

These are concept examples, not authorization or specifications for watch support, new navigation, nutrition calculations, workout timers, reporting or other product functionality. Mockup numbers, dates, names and progress values are illustrative; they do not establish business rules or client records.

**Implementation recommendation:** make hierarchy do the work: a clear primary action, readable metrics, limited decoration and sufficient spacing. A principal task can contain supporting information; the deck's daily overview itself includes several related sections. Do not interpret one purpose per screen as a requirement to fragment every metric into a separate route.

## Relationship to the current repository

At review time, `src/styles.css` uses **Bebas Neue** for display text and **Work Sans** for the app interface. Those are not the families specified in this pack. The existing prototype and this brand direction should therefore be reconciled explicitly in a future implementation task.

This reference does not change application styles, install fonts, replace logos or alter product behaviour. When a brand implementation is requested, the practical sequence is:

1. Obtain approved fonts and logo assets, and resolve the olive-background interpretation.
2. Establish the source palette and type roles in shared styling.
3. Apply them to a representative screen, including forms, errors, loading and keyboard focus.
4. Review mobile and desktop readability, contrast, hierarchy and image treatment before extending across the app.

## Decisions still open

- Final approval and deliverables for the proposed logo.
- Whether small olive-filled controls are an approved exception to the written background rule.
- Approved font files, licensing and loading strategy.
- A responsive type scale, spacing scale, interactive states and accessible semantic colours.
- Which mockup treatments should be reproduced literally and which remain illustrative.
- Verification and permission for public biographical, performance and testimonial claims.

## Page index

| Pages | Contents |
| --- | --- |
| 1 | Cover and project attribution |
| 2–4 | Harry's story, experience and belief |
| 5–7 | Restraint, market distinction and rejected visual language |
| 8 | Audience |
| 9–11 | Art direction, moodboard and photographic treatment |
| 12 | Voice and copy examples |
| 13 | Font families, styles and roles |
| 14–15 | Warm monochrome comparison, exact palette and olive rules |
| 16 | Offer and four pillars |
| 17–20 | Logo inspiration, proposed mark, rationale and applications |
| 21–23 | App principles, example screens and device compositions |
| 24 | Social applications |
| 25–26 | Transformation and lasting physical condition |
| 27–28 | Website styling concepts |
| 29 | Closing statement and studio attribution |

## Review record

The findings were checked against rendered pages because the PDF contains no extractable text. Refinement checked source accuracy, completeness and implementation usefulness. In particular, it retained the exact palette and font styles, separated source direction from recommendations, captured the olive/background and numeral-treatment tensions, and distinguished proposed visuals from approved assets and implemented product behaviour. A further implementation pass added calculated contrast ratios and a clearly labelled CSS reference. File checks confirmed the relative PDF link resolves and the repository copy is byte-for-byte identical to the upload.

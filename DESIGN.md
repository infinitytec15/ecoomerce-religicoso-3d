---
name: "Âmago 3D"
description: "Warm, tactile contemporary Christian objects, expressed through a navigable visual commerce prototype."
colors:
  olive: "#3e4934"
  olive-light: "#e9eddf"
  paper: "#faf9f5"
  white: "#fff"
  ink: "#282c25"
  muted: "#65695f"
  line: "#dedfd6"
  terra: "#aa5438"
  red: "#b1372d"
  olive-hover: "#2d3825"
  field-line: "#bfc3b6"
  badge-olive-ink: "#39452e"
  badge-terra-bg: "#f1e3da"
  badge-terra-ink: "#89422e"
  summary: "#eeeee6"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(3rem,5.1vw,5rem)"
    fontWeight: 550
    lineHeight: 1.04
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(1.7rem,3vw,2.6rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.035em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.02em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".86rem"
    fontWeight: 550
  button:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".88rem"
    fontWeight: 550
rounded:
  badge: "4px"
  chip: "6px"
  control: "8px"
  field: "9px"
  product-image: "10px"
  panel: "12px"
  banner: "14px"
  hero: "16px"
  circle: "50%"
spacing:
  8: "8px"
  12: "12px"
  16: "16px"
  20: "20px"
  24: "24px"
  28: "28px"
  32: "32px"
  48: "48px"
components:
  button-primary:
    backgroundColor: "{colors.olive}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 23px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.olive-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 23px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.olive-light}"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 23px"
    height: "48px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "48px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "11px 20px"
    height: "43px"
  chip-active:
    backgroundColor: "{colors.olive}"
    textColor: "{colors.white}"
  badge-olive:
    backgroundColor: "{colors.olive-light}"
    textColor: "{colors.badge-olive-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 9px"
  summary-card:
    backgroundColor: "{colors.summary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "25px"
---

# Design System: Âmago 3D

## Overview

**Creative North Star: "A contemporary object shop"**

The confirmed world pairs cream, olive and terracotta with contemporary Christian objects. The implemented system reads as a quiet design shop: warm paper, precise sans typography, generous imagery and useful commerce controls. The phrase above is a code-led interpretation, not a separately approved brand metaphor.

The interface uses open product layouts and restrained panels for purchasing, account and support tasks. Generated conceptual product imagery supplies tactile filament texture. Three home compositions test the same visual world; none is recorded as the chosen composition or as a global layout requirement.

**Key Characteristics:**
- Warm paper grounds with olive structure and selective terracotta accents.
- Manrope headlines paired with DM Sans controls and reading text.
- Flat product listings, restrained rounded panels and authored stroke icons.
- Compact state feedback with a reduced-motion override.

This scan describes the shipped HTML/CSS/JavaScript prototype. Palette and name are user-confirmed; descriptive language and named rules are interpretations of the implemented artifact. No approved visual comp or quality-board reference exists.

## Colors

The palette feels warm and mineral: cream grounds, dark olive structure and a restrained fired-clay accent. Frontmatter is the normative value reference.

### Primary
- **Structured Olive** (`olive`): primary buttons, announcement bar, active controls, focus outlines and checkout progress.
- **Pale Olive** (`olive-light`): selected and explanatory surfaces, selected account navigation and success markers.
- **Deep Olive** (`olive-hover`): primary button hover.

### Secondary
- **Terracotta** (`terra`): special collection links and selected favorites.
- **Terracotta Wash / Ink** (`badge-terra-bg`, `badge-terra-ink`): waiting-Pix status badge.

### Neutral
- **Warm Paper** (`paper`): page, drawer and light action surfaces.
- **White** (`white`): fields and text on dark actions.
- **Charcoal Olive** (`ink`): principal reading text.
- **Sage Gray** (`muted`): descriptions and supporting price information.
- **Paper Divider** (`line`): low-emphasis separators and chip boundaries.
- **Field Boundary** (`field-line`): shared input borders.
- **Summary Paper** (`summary`): order summary and confirmation panels.
- **Olive Badge Ink** (`badge-olive-ink`): small green status labels.

The functional error color (`red`) is reserved for validation text. One-off hero and image-ground tones remain implementation details rather than a new global scale.

**The Olive Structure Rule.** Use olive for primary actions, selected controls and the main structural accent. Keep terracotta for secondary emphasis and contextual status.

## Typography

**Display Font:** Manrope, with sans-serif fallback.
**Body Font:** DM Sans, with sans-serif fallback.

**Character:** Close-tracked, softly geometric headlines sit above clear, compact commerce text. Both families are locally bundled through the font stylesheet.

### Hierarchy
- **Display:** the frontmatter records the Essência hero declaration. It is deliberately composition-specific; the shared page heading uses `clamp(2.3rem,5vw,4.6rem)`, weight 650 and line-height 1.15. The Essência hero becomes 4rem at the intermediate breakpoint, 3.1rem on mobile and 5.6rem above 1600px.
- **Headline:** fluid section headings use the headline token. Mobile section headings commonly override to 1.55rem.
- **Title:** section subheads use the title token; product-card names use DM Sans at .91rem, weight 500 and line-height 1.5, reducing to .78rem on mobile.
- **Body:** the root default is 1rem. Descriptive commerce copy commonly uses .84rem to .94rem; paragraphs use line-height 1.65. No universal prose measure is declared.
- **Label:** field labels use the label token. Button text uses its separate compact role. Small copy uses .79rem and line-height 1.5 unless a component overrides it.

The font files supply static weights 400/500/600/700 for DM Sans and 400/500/600/700/800 for Manrope. CSS also requests intermediate weights such as 550 and 650; those are source declarations, with browser font matching determining the rendered static face. Font synthesis is disabled.

**The Two Families Rule.** Use Manrope for display and headings; use DM Sans for reading, controls, prices and product-card names.

## Layout

The main container is centered, capped at 1360px, with total horizontal subtraction of 96px on desktop. Below 1100px that subtraction becomes 48px; below 760px it becomes 36px. The shared spacing vocabulary is recorded in frontmatter, with task-specific gaps chosen from the existing code rather than a mandatory mathematical scale.

Desktop product browsing uses four columns with 24px gaps, or three columns inside a sidebar layout. Ateliê also uses three columns. Below 760px all product grids use two columns. The catalog sidebar is 205px on desktop, 170px at the intermediate breakpoint, and becomes a toggled filter panel on mobile. Header search moves into mobile navigation; the category row remains horizontally scrollable.

Product detail uses two columns in a 1.08/.92 proportion, with a 65px gap; mobile stacks them. Checkout uses a flexible content column plus a 365px summary, reduced to 320px below 1100px. Its maximum width is 1120px, and the summary is sticky at 24px on desktop. Below 760px checkout becomes a vertical flow and the summary follows the form. Account and support also stack on mobile.

The three home compositions remain surface explorations. Their editorial split, immersive olive image treatment and direct catalog browsing are not mandatory on unrelated screens.

## Elevation & Depth

The storefront is flat at rest. Tonal panels, imagery, thin borders and whitespace create hierarchy. The modal backdrop dims the page; only transient drawer and toast surfaces use diffuse shadow. Product image hover scales the image subtly (1.035 over 280ms), without lifting the card.

### Shadow Vocabulary
- **Drawer:** `0 20px 64px #222b2726`; separates the slide-in task panel from the dimmed store.
- **Toast:** `0 6px 24px #1a26152e`; makes short feedback legible above page content.

**The Flat Product Rule.** Keep product listings flat at rest. Reserve diffuse shadows for the drawer and toast rather than placing every product inside a raised card.

## Shapes

Corners are gently rounded rather than uniformly pill-shaped. The frontmatter records the observed control, field, product-image, panel, banner and hero radii. Circular treatments belong to icon actions, swatches and progress/success markers. Thin dividers separate repeated rows and accordions.

Ateliê adds an asymmetric image corner (100px 12px 12px 12px on desktop, 60px 8px 8px 8px on mobile). This remains a composition-specific treatment. The floating prototype switcher is an exploration utility and is excluded from the storefront shape and elevation system.

## Components

### Buttons
Tactile, compact and explicit. Primary actions use the olive surface and white text; secondary actions use a transparent surface with a 1px muted olive boundary. The light variant sits on the dark home composition. Standard buttons have a minimum height of 48px; the frontmatter height describes that minimum, not a forced fixed height.

Hover darkens the primary surface or adds pale olive to the secondary surface. Pressing scales buttons to .975 over 150ms. Keyboard focus uses a 2px olive outline with a 4px offset. Disabled buttons have .5 opacity and a not-allowed cursor. Small variants use a 40px minimum height and 9px 15px padding.

### Chips
Collection links are lightly rounded outlined controls. Default chips are transparent with a divider-color border; hover and active states use olive with white text. The mobile variant uses 9px 12px padding and a 39px minimum height.

### Cards / Containers
Product cards remain unboxed. Their portrait images have a 1/1.13 aspect ratio by default, with softly rounded clipping, small information tags and circular favorite/add controls. Product names, price, installment copy and color swatches sit directly beneath the image. Checkout and confirmation panels use summary paper, panel corners and 25px interior padding.

### Inputs / Fields
White fields use a thin field boundary, gentle field corners and a minimum height of 48px. Labels are above the field with an 8px gap. The caret and global focus treatment use olive. Validation copy uses functional red. Native radio/checkbox controls use olive accent color; no invented custom disabled-input treatment is established.

### Navigation
Desktop navigation uses DM Sans at .82rem with a 32px link gap. Hover turns text terracotta; a current link has a 2px olive underline. Mobile uses .75rem text, a 23px gap and horizontal scrolling. Account navigation uses pale olive for its selected item, then wraps into a compact row on mobile.

### Product Detail Badge
The category and collection badge follows the product-detail title and precedes the description, with 18px bottom spacing. Its light olive fill is a supporting classification treatment, not a headline eyebrow.

### Drawer and Feedback
A paper drawer is at most 480px wide and takes full viewport height. It enters from 30px right over 240ms with the source easing `cubic-bezier(.23,1,.32,1)`. Toast opacity and position transition over 220ms. The global reduced-motion media query removes transitions and animations. Dialog keyboard focus is trapped while open, Escape closes it, and focus returns to the initiating control.

## Do's and Don'ts

### Do:
- **Do** keep primary actions olive and preserve visible keyboard focus.
- **Do** use tactile product imagery and retain its conceptual-image disclosure.
- **Do** use flat product grids and tonal panels to distinguish reading from task areas.
- **Do** stack major task columns on mobile and retain a two-column product grid.
- **Do** place the product-detail category badge below the product title.
- **Do** preserve the reduced-motion override for transitions and animations.

### Don't:
- **Don't** use terracotta as the default primary purchase-action color.
- **Don't** replace the authored SVG stroke icons with font glyphs.
- **Don't** inherit the prototype picker’s system font, glass treatment or pill shape as storefront brand primitives.
- **Don't** promote one home composition into a universal layout rule before a direction is chosen.

Not canonized or repaired: the prototype picker's system typeface and glass pill are utility chrome, not a brand pattern; unused source sand is excluded from the token set; intermediate font-weight requests are documented as matching behavior rather than guaranteed distinct faces. No application defects are repaired by this documentation pass.

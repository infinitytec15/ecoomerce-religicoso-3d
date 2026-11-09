---
name: "Âmago 3D"
description: "A warm Christian home and gifting world, expressed through a navigable visual commerce prototype."
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
  olive-hover: "#293520"
  faith-cream: "#fff7e9"
  faith-gold: "#e8c47c"
  field-line: "#bfc3b6"
  badge-olive-ink: "#39452e"
  badge-terra-bg: "#f1e3da"
  badge-terra-ink: "#89422e"
  summary: "#eeeee6"
  prayer-paper: "#fffdf8"
  club-emphasis: "#9b4b30"
  club-plan-paper: "#fffaf0"
  admin-sidebar: "#2f402b"
  admin-sidebar-hover: "#405339"
  admin-nav-text: "#d7dfcd"
  admin-nav-active: "#e8eddd"
  admin-nav-active-ink: "#2d4424"
  admin-workground: "#f3f4ed"
  admin-surface: "#fffef8"
  admin-ink: "#263023"
  admin-muted: "#65705d"
  admin-line: "#dfe4d7"
  admin-field: "#fffef9"
  admin-field-line: "#d7dece"
  admin-focus: "#875038"
  admin-table-head: "#eef1e7"
  admin-table-hover: "#f7f8f0"
  production-lane: "#e8eddf"
  op-dialog-paper: "#fcfaf3"
  status-neutral-bg: "#edf0e8"
  status-neutral-ink: "#4c5942"
  status-good-bg: "#e8f0df"
  status-good-ink: "#3b562c"
  status-warn-bg: "#fbefd3"
  status-warn-ink: "#775818"
  status-bad-bg: "#f7e7e2"
  status-bad-ink: "#8f422f"
  status-info-bg: "#e9eef0"
  status-info-ink: "#405763"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(4.7rem,7.1vw,6rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-.04em"
  story-headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.4rem,4vw,3.5rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-.03em"
  collection-title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "3.35rem"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-.03em"
  product-title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "3.3rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.035em"
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
  club-display:
    fontFamily: "Cormorant Garamond, serif"
    fontSize: "clamp(3.2rem,5vw,5.4rem)"
    fontWeight: 500
    lineHeight: .98
    letterSpacing: "-.035em"
  admin-headline:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-.02em"
  admin-title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-.02em"
  admin-subtitle:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-.02em"
  admin-body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  admin-table:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.55
  operational-status:
    fontFamily: "DM Sans, sans-serif"
    fontSize: ".7rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
  auth-headline:
    fontFamily: "Cormorant Garamond, serif"
    fontSize: "46px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-.025em"
  auth-story:
    fontFamily: "Cormorant Garamond, serif"
    fontSize: "52px"
    fontWeight: 500
    lineHeight: .99
    letterSpacing: "-.025em"
  auth-body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
  auth-label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  badge: "4px"
  chip: "6px"
  control: "7px"
  field: "9px"
  product-image: "10px"
  panel: "12px"
  banner: "14px"
  hero: "16px"
  circle: "50%"
  admin-panel: "11px"
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
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.olive-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 23px"
    height: "50px"
  button-secondary-hover:
    backgroundColor: "{colors.olive-light}"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 23px"
    height: "50px"
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
  prayer-card:
    backgroundColor: "{colors.prayer-paper}"
    textColor: "{colors.olive}"
    rounded: "{rounded.panel}"
    padding: "23px"
  summary-card:
    backgroundColor: "{colors.summary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "25px"
  admin-button:
    backgroundColor: "{colors.olive}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "38px"
  admin-field:
    backgroundColor: "{colors.admin-field}"
    textColor: "#2e3c25"
    rounded: "{rounded.control}"
    height: "40px"
  admin-panel:
    backgroundColor: "{colors.admin-surface}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.admin-panel}"
    padding: "24px"
  operational-status:
    backgroundColor: "{colors.status-neutral-bg}"
    textColor: "{colors.status-neutral-ink}"
    typography: "{typography.operational-status}"
    rounded: "{rounded.chip}"
    padding: "5px 9px"
  operational-status-good:
    backgroundColor: "{colors.status-good-bg}"
    textColor: "{colors.status-good-ink}"
  operational-status-warn:
    backgroundColor: "{colors.status-warn-bg}"
    textColor: "{colors.status-warn-ink}"
  operational-status-bad:
    backgroundColor: "{colors.status-bad-bg}"
    textColor: "{colors.status-bad-ink}"
  operational-status-info:
    backgroundColor: "{colors.status-info-bg}"
    textColor: "{colors.status-info-ink}"
  auth-input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "52px"
  auth-primary:
    backgroundColor: "{colors.olive}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    height: "51px"
---

# Design System: Âmago 3D

## Overview

**Creative North Star: "Faith makes a home"**

The confirmed world pairs cream, olive and terracotta with contemporary Christian objects. The approved iteration brings daily devotion, home and giving into the foreground: expressive serif words, generous color regions and a human devotional scene make faith tangible. The phrase above and this atmosphere language describe the implemented interpretation, not a separately approved brand metaphor.

The interface keeps open product layouts and restrained panels for purchasing, account and support tasks. Devotional feedback, a prayer signup invitation, the Cantinho da Fé wall and interactive 3D previews extend this world without changing commerce layouts. A generated lifestyle scene shows hands resting on an open Bible beside printed Christian objects; the existing generated product contact sheet supplies tactile filament texture throughout browsing. Catholic and Evangelical routes are distinct and equally visible. The user selected Essência as the definitive home composition. Its “A fé faz morada” story and devotional scene now form the single home; the variant picker, alternate routing and keyboard shortcuts have been removed. This selection does not impose the home composition on unrelated task screens.


The monthly club extends the same tactile Christian world with basket photography, Cormorant storytelling and familiar subscription forms. Its operations workspace deliberately reduces expression: cream workgrounds, an olive sidebar, DM Sans headings and compact shared records keep daily work understandable. This is an ordinary code-led extension of the confirmed world. The later explicit Essência selection establishes the definitive home without changing the operational pattern.

The shared sign-in surface brings the same devotional photograph and serif/olive identity into a focused entry task for customers and staff. It introduces no new color identity: visible test access, labeled fields and calm arrival motion support the local demonstration.

**Key Characteristics:**
- Warm paper grounds, olive navigation and footer, terracotta welcome and gifting regions, cream and gold accents.
- Cormorant Garamond for storytelling, collection and product titles; Manrope and DM Sans for task hierarchy and controls.
- Daily devotion and giving contexts expressed through imagery and substantive Christian copy.
- Flat product listings, restrained rounded panels and authored stroke icons.
- Compact state feedback and a brief Bible arrival gesture with reduced-motion support.
- Prayer, community and interactive product exploration extend the same palette and serif/sans role split.
- Tactile monthly curation for shoppers; quiet DM Sans tables, linked records and production stages for operators.
- A definitive Essência home and a focused, responsive sign-in surface using the same devotional image and palette.

This scan describes the shipped HTML/CSS/JavaScript prototype. Palette and name are user-confirmed; descriptive language and named rules are interpretations of the implemented artifact. No approved visual comp or quality-board reference exists.

## Colors

The palette feels warm and mineral: cream grounds, dark olive structure and generous fired-clay storytelling regions. Frontmatter is the normative value reference.

### Primary
- **Structured Olive** (`olive`): navigation and footer grounds, primary buttons, active controls, focus outlines, product prices and checkout progress.
- **Pale Olive** (`olive-light`): selected and explanatory surfaces, selected account navigation and success markers.
- **Deep Olive** (`olive-hover`): primary button hover.

### Secondary
- **Terracotta** (`terra`): welcome bar, Evangelical home card, personalization banner, serif emphasis, selected favorites and product-detail price. Purchase buttons remain olive.
- **Terracotta Wash / Ink** (`badge-terra-bg`, `badge-terra-ink`): waiting-Pix status badge.

### Tertiary
- **Warm Gold** (`faith-gold`): navigation hover/current underline, footer headings and italic emphasis on olive story regions.

### Neutral
- **Warm Paper** (`paper`): page, drawer and light action surfaces.
- **White** (`white`): fields and text on dark actions.
- **Charcoal Olive** (`ink`): principal reading text.
- **Sage Gray** (`muted`): descriptions and supporting price information.
- **Paper Divider** (`line`): low-emphasis separators and chip boundaries.
- **Field Boundary** (`field-line`): shared input borders.
- **Summary Paper** (`summary`): order summary and confirmation panels.
- **Prayer Paper** (`prayer-paper`): repeated prayer-wall reading cards.
- **Olive Badge Ink** (`badge-olive-ink`): small green status labels.
- **Devotional Cream** (`faith-cream`): text and light story surfaces against olive and terracotta.

The functional error color (`red`) is reserved for validation text. One-off category grounds remain implementation details rather than a new global scale. The unused faith-clay and faith-green trial values are excluded.

**The Olive Structure Rule.** Use olive for primary purchase actions and shared navigation structure. Terracotta can fill story and gifting regions; gold marks emphasis against olive.


### Operational roles
The operational palette is a scoped extension. `admin-sidebar` and its hover/text/active tokens express the olive navigation family; `admin-workground`, `admin-surface` and `admin-line` separate workspace, panels and records. `admin-ink` and `admin-muted` carry reading hierarchy. `admin-field` and `admin-field-line` identify editable controls; `admin-focus` supplies the local terracotta keyboard outline. `admin-table-head` is reused for table headers and flow summaries, with `admin-table-hover` for row inspection. `production-lane` groups production stages. `op-dialog-paper` is the shared subscription/operational dialog surface. `club-emphasis` is the darker terracotta used by club serif emphasis and operational link hover; `club-plan-paper` is the club's plan-summary surface.

Status colors are semantic pairs, not category branding. `status-good-*` covers active, paid, delivered and resolved states; `status-warn-*` covers pending, paused and waiting states; `status-bad-*` covers cancelled, refunded, refused, inactive and maintenance states; `status-info-*` covers remaining informational states. `status-neutral-*` is the base treatment. Always keep the written status. Production priority currently falls through to the informational treatment; this is not an established priority-color convention.

**The Operational Status Rule.** Reuse the shared status pairs across subscriber and operator records; keep status text visible and reserve color for meaning rather than decorative row variation.

## Typography

**Display Font:** Cormorant Garamond, with Georgia and serif fallbacks.
**Task Heading Font:** Manrope, with sans-serif fallback.
**Body Font:** DM Sans, with sans-serif fallback.

**Character:** Close-tracked, expressive serif headlines and true italic emphasis give the home, collection and product titles a warm devotional voice. Geometric task headings and compact commerce text remain clear and familiar. All three families are locally bundled.

### Hierarchy
- **Display:** frontmatter records the active Essência hero declaration. It becomes 5.1rem below 1100px, 4.55rem on mobile and 6rem above 1600px. This is the confirmed home display, not a task-page default.
- **Story headline:** home section headings use the story-headline token, reducing to 2.15rem on mobile. Italic emphasis uses the 500 face and terracotta on cream, or cream/gold on dark regions. Category-card titles use 2.35rem; quotation and personalization treatments have their own larger story scale.
- **Collection / product title:** collection headings use 3.35rem, reducing to 2.8rem below 1100px and 2.6rem on mobile. Product-detail titles use 3.3rem, reducing to 2.8rem on mobile.
- **Task headline:** the headline token remains Manrope for commerce and account sections. Shared task page headings use `clamp(2.3rem,5vw,4.6rem)`, weight 650 and line-height 1.15. Existing component-specific sizes remain in place.
- **Title:** section subheads use the title token; product-card names use DM Sans at .91rem, weight 600 and line-height 1.5, reducing to .78rem on mobile.
- **Body:** the root default is 1rem. Descriptive commerce copy commonly uses .84rem to .94rem; paragraphs use line-height 1.65. No universal prose measure is declared.
- **Label:** field labels use the label token. Button text uses its separate compact role. Small copy uses .79rem and line-height 1.5 unless a component overrides it.

The font files supply normal and italic Cormorant Garamond at 500/600, static weights 400/500/600/700 for DM Sans and 400/500/600/700/800 for Manrope. CSS also requests intermediate sans weights such as 550 and 650; those are source declarations, with browser font matching determining the rendered static face. Font synthesis is disabled.

**The Story and Task Rule.** Use Cormorant Garamond for the implemented storytelling, collection and product-title roles. Preserve Manrope task headings and DM Sans reading, controls, prices and product-card names.


### Club and operational hierarchy
The club display uses its scoped frontmatter role at weight 500, with a 3.5rem heading at the 850px and 600px breakpoints. Club section titles use Cormorant at `clamp(2.3rem,3.8vw,3.6rem)`, line-height 1.05, reducing to 2.6rem below 600px. The subscription checkout retains a serif 3.3rem title, reducing to 2.5rem below 600px; it does not change the storefront's existing type roles.

Operations uses DM Sans throughout headings, records and controls, with the admin-headline/title/subtitle/body/table roles in frontmatter. Page headings reduce to 25px below 850px and 24px below 600px. Operational subcomponents use 12px stage/card headings and 10–12px table, label and metadata copy; small timestamps are supporting information, not a global reading-text default. Numeric records use tabular figures. Buttons use 12px text (11px for small variants), and fields/labels use 12px. Maintain meaningful table headings and compact grouping rather than importing the large consumer display ramp into repeated work.

**The Quiet Operations Rule.** Keep Cormorant storytelling in shopper surfaces and DM Sans hierarchy inside administration; retain the shared olive, cream and terracotta family.

### Sign-in hierarchy
Sign-in uses the scoped auth-headline and auth-story serif roles, with DM Sans auth-body and auth-label. At 1500px the form title grows to 50px and the story title to 60px; at 1050px they reduce to 42px and 44px. At 700px the story is hidden and the 42px form title remains. Field text is 13px on desktop and 16px on mobile, preserving the 12px label. These are entry-task roles; the administrative workspace continues to use its compact DM Sans heading ramp.

## Layout

The main container is centered, capped at 1360px, with total horizontal subtraction of 96px on desktop. Below 1100px that subtraction becomes 48px; below 760px it becomes 36px. The shared spacing vocabulary is recorded in frontmatter, with task-specific gaps chosen from the existing code rather than a mandatory mathematical scale.

Desktop product browsing uses four columns with 24px gaps, or three columns inside a sidebar layout. The definitive Essência home uses a four-product featured grid. Below 760px all product grids use two columns. The catalog sidebar is 205px on desktop, 170px at the intermediate breakpoint, and becomes a toggled filter panel on mobile. Header search moves into mobile navigation; the category row remains horizontally scrollable.

Product detail uses two columns in a 1.08/.92 proportion, with a 65px gap; mobile stacks them. Checkout uses a flexible content column plus a 365px summary, reduced to 320px below 1100px. Its maximum width is 1120px, and the summary is sticky at 24px on desktop. Below 760px checkout becomes a vertical flow and the summary follows the form. Account and support also stack on mobile.

Cantinho da Fé uses a flexible wall plus a 355px sticky compose panel (310px below 1100px); below 760px the compose panel moves above the wall and becomes static. The newsletter dialog splits an olive story column and cream form column in an .85/1.15 ratio, then stacks on mobile. Shared feature dialogs are capped at 850px wide (960px for the viewer), with a scrollable maximum height of `calc(100dvh - 120px)` and 28px overlay padding (16px on mobile). The viewer stage uses a 260px minimum desktop height, 235px on mobile.

The selected Essência home uses an .85/1.15 split between story and devotional image. Its denominational and personalized home routes use three columns, stacking vertically below 760px. Occasion links form two columns and then one. Story hero and gifting regions stack on mobile; collection banners hide their supporting image. This home composition is not mandatory on unrelated task screens.


Club discovery uses a 1/1.08 hero with a 48px gap and a 500px-minimum basket image. Plan explanation sits beside a 390px summary on desktop; these columns stack below 600px. Subscription self-service uses horizontally scrollable tabs, a cover/details layout and linked charge, shipment and conversation records. The club checkout reuses the existing checkout grid; its extra photographic summary is hidden below 600px while the form retains plan/profile information.

Administration has a fixed 238px sidebar, a 76px sticky top bar and a workspace with matching left offset. Main content is capped at 1700px with 34px 32px 46px padding; at 1500px and above, horizontal padding grows to 46px. At 1150px the sidebar/offset reduce to 210px and dashboard side content stacks. At 850px navigation becomes an in-flow, horizontally scrollable row, the workspace offset clears and the top bar becomes 63px. At 600px main horizontal padding is 16px, detail/support layouts stack and search/filter controls wrap.

Operational tables own their horizontal scroll, preserving semantic columns inside a bounded wrapper. The production board has four stages with a 210px minimum column width and 16px gaps; below 600px four 250px columns remain inside the board's horizontal scroll. Do not force the full page wider to accommodate records or the board. Four metric cells become two below 1150px; printer summaries become one column below 600px. These density rules are specific to operations, not replacements for the storefront's mobile product grid.

Sign-in has a 100px brand/store-return header and two equal columns within a 1680px maximum, with 48px horizontal padding and a 70px gap. Its form is capped at 400px (425px at 1500px), within a 540px region; the large breakpoint increases the two-column gap to 120px. At 1050px header height becomes 86px, horizontal padding becomes 30px and the grid is .95/1. At 700px the photograph/story region is hidden, the header is 80px and the single-column form is capped at 520px with 23px horizontal padding. The mobile field has a 54px minimum wrapper and the primary action a 53px minimum. Do not reuse the operational sidebar inside this focused entry surface.

## Elevation & Depth

Product listings and task panels are flat at rest. Tonal regions, imagery, thin borders and whitespace create hierarchy. The modal backdrop dims the page; drawer and toast surfaces use diffuse shadow. Home storytelling adds localized shadows to the rotated seal and dedication note, suggesting printed material rather than raised product cards. Feature dialogs reuse drawer elevation; the devotional toast, arrival gesture, persistent verse trigger and gallery 3D trigger use localized diffuse shadows. Prayer-wall cards remain flat with thin boundaries. Product image hover scales the image subtly (1.035 over 280ms); home category imagery uses the same scale over 260ms, without lifting the card.

Operational panels, table rows, metric cells and production cards remain flat, separated by tonal grounds and thin lines. Shared operational dialogs use `0 18px 80px #17211633`; the notification popover uses `0 12px 32px #26352222`. Neither shadow becomes a default record-card treatment.

### Shadow Vocabulary
- **Drawer:** `0 20px 64px #222b2726`; separates the slide-in task panel from the dimmed store.
- **Toast:** `0 6px 24px #1a26152e`; makes short feedback legible above page content.
- **Home seal:** `0 10px 24px #3e321527`; anchors the small rotated story seal.
- **Dedication note:** `0 8px 22px #633f1b30`; separates the rotated gift note from conceptual product artwork.
- **Verse toast:** `0 12px 42px #25341f2b`; separates lower-left devotional feedback.
- **Bible arrival:** `0 10px 30px #25351e26`; anchors the brief nonblocking arrival gesture.
- **Verse / 3D triggers:** `0 5px 18px #26331d30` / `0 5px 18px #23331924`; small persistent or contextual entry controls.

**The Flat Product Rule.** Keep product listings flat at rest. Confine shadows to transient feedback/dialogs, the implemented home seal/dedication accents and the small verse/3D entry controls.

## Shapes

Corners are gently rounded rather than uniformly pill-shaped. The frontmatter records the observed control, field, product-image, panel, banner and hero radii. Circular treatments belong to icon actions, swatches and progress/success markers. Thin dividers separate repeated rows and accordions.

The active Essência scene has an asymmetric corner (120px 16px 16px 16px on desktop, 85px 12px 12px 12px on mobile). Story collection cards and home product images use 12px corners; standard catalog images retain their existing 10px treatment. The seal and small scene icon use arch-like silhouettes. These remain storytelling treatments rather than new universal radius requirements. The former prototype switcher has been removed and supplies no reusable storefront shape or elevation pattern.

Operational panels use the admin-panel radius, production jobs use 8px corners and lanes use 10px; compact fields and buttons use control corners. The club basket photo continues the asymmetric story silhouette (140px 16px 16px 16px, reducing to 85px 12px 12px 12px below 600px). This is image framing, not the shape of administrative panels.

Sign-in frames the devotional photograph and olive story region with an asymmetric 100px 14px 14px 14px corner, reducing the leading corner to 80px at 1050px. Fields use the existing field radius; this frame does not redefine ordinary panel corners. The form stays unboxed, without an elevated login card.

## Components

### Buttons
Tactile, compact and explicit. Primary actions use the olive surface and white text; secondary actions use a transparent surface with a 1px muted olive boundary. The light variant sits on the terracotta gifting region. Standard buttons now have 7px corners and a minimum height of 50px; the frontmatter height describes that minimum, not a forced fixed height. Fields retain their 48px minimum.

Hover darkens the primary surface or adds pale olive to the secondary surface. Pressing scales buttons to .975 over 150ms. Keyboard focus uses a 2px olive outline with a 5px button offset (4px elsewhere). Links on olive navigation, footer and quotation grounds, plus personalization actions, switch the outline to gold for contrast. Navigation uses a 5px inset outline so it stays visible within the mobile scroll strip. The cream scene-note link uses an olive 4px inset outline,. Disabled buttons have .5 opacity and a not-allowed cursor. Small variants use a 40px minimum height and 9px 15px padding. Mobile home hero actions use a 47px minimum; local exceptions do not redefine task controls.

### Chips
Collection links are lightly rounded outlined controls. Default chips are transparent with a divider-color border; hover and active states use olive with white text. The mobile variant uses 9px 12px padding and a 39px minimum height.

### Cards / Containers
Product cards remain unboxed. Their portrait images have a 1/1.13 aspect ratio by default, with softly rounded clipping, small information tags and circular favorite/add controls. Home images use 1/1.12 on desktop and 1/1.2 on mobile. Quick-add circles now use olive and cream, changing to terracotta on hover. Product names, olive price, installment copy and color swatches sit directly beneath the image. Checkout and confirmation panels use summary paper, panel corners and 25px interior padding.

### Inputs / Fields
White fields use a thin field boundary, gentle field corners and a minimum height of 48px. Labels are above the field with an 8px gap. The caret and global focus treatment use olive. Validation copy uses functional red. Native radio/checkbox controls use olive accent color; no invented custom disabled-input treatment is established.

### Navigation
Desktop navigation uses an olive ground, devotional cream text, DM Sans at .82rem and a 24px link gap (22px at intermediate widths). Hover turns text gold; a current link has a 2px gold underline. Personalized navigation and the Cantinho da Fé community link are gold. The terracotta welcome bar and olive footer include prayer-signup triggers. Mobile uses .73rem text, a 22px gap and horizontal scrolling. The welcome bar is terracotta; the footer repeats olive with cream reading text and gold headings. Account navigation retains pale olive for its selected item, then wraps into a compact row on mobile.

### Faith Collection and Occasion Routes
The home collection cards give Catholic, Evangelical and personalized routes distinct pale-olive, terracotta and warm-paper grounds, with serif titles and product contact-sheet crops. The title and route copy occupy their own region; the image remains contained at the lower right. On mobile they stack at a minimum height of 270px. Collection/occasion banners use a 70/30 copy/image split, reducing to copy only on mobile; personalized banners use terracotta. These story entry points lead to functional catalog filters, not separate commerce systems. Occasion links use authored stroke icons and thin dividers.

### Devotional Story Regions
The generated hero image retains an explicit conceptual-scene alt description. The olive quotation region pairs a Cormorant quotation with its linked scripture attribution; the terracotta gifting panel pairs conceptual artwork and a dedication note with a personalization action. They are implemented home patterns rather than mandatory blocks on checkout, account or support pages.

### Product Detail Badge
The category and collection badge follows the product-detail title and precedes the description, with 18px bottom spacing. Its light olive fill is a supporting classification treatment, not a headline eyebrow.

### Verse Feedback and Bible Arrival
The devotional toast sits at the lower left above a circular verse trigger, with a cream surface, olive Cormorant text (1.5rem, 600), terracotta icon/actions and linked scripture attribution. It lasts 10 seconds, offers close and next actions, pauses dismissal on hover or keyboard focus, and is inert and hidden from assistive technology when closed. Automatic route feedback is throttled to 30 seconds and withheld on checkout/confirmation routes. Its transform/opacity transition is 220ms. A decorative, pointer-transparent Bible-opening arrival lasts 280ms with 220ms page turns; it never blocks navigation and is skipped for reduced motion or recent keyboard navigation.

### Prayer Signup Dialog
The olive story half uses cream serif text and gold emphasis; the paper form half retains labeled sans fields, an explicit local-demo notice and required consent. Title sizes are 3.2rem/2.5rem desktop, 2.35rem/2rem mobile. A first-visit invitation waits 12 seconds and avoids active forms, checkout, the community page and other dialogs; close/decline snoozes it. Top-bar/footer/community triggers remain available. The success state states that no email is sent; subscription and cancellation are browser-local demonstrations.

### Cantinho da Fé
The community hero keeps the established serif voice (4.7rem desktop, 3.15rem mobile) and olive/terracotta emphasis. Prayer cards lead with a serif title (1.9rem, 600; 1.75rem mobile), followed by category/date, reading copy, author and a separated action row. Prayer paper, a thin divider border, panel corners and 23px padding (20px mobile) distinguish each post without shadow. Category chips expose pressed state. The pale compose panel uses familiar labeled fields, anonymous posting enabled by default, required consent and a character count. Samples stay labeled; local prayer toggles, sample hiding and own-post removal never imply internet publication or real community counts.

### Interactive Product Preview
The gallery's olive 3D entry opens the shared dialog with an informative header, warm neutral canvas stage, compact orbit/zoom/reset toolbar and existing color selectors. A locally bundled lazy viewer renders procedural illustrative meshes; these are visual previews, not manufacturing files. Pointer drag, wheel/pinch, arrow keys, plus/minus and zero/reset support exploration. Auto-rotation starts off and is explicitly toggled; user orbit stops it. The focusable canvas has an inset terracotta outline; controls retain names and pressed states. Loading and retry states preserve access to photographs. Closing disposes the renderer and controls. The preview uses realistic scene lighting and object shadows, separate from flat interface-card elevation.

### Drawer and Feedback
A paper drawer is at most 480px wide and takes full viewport height. It enters from 30px right over 240ms with the source easing `cubic-bezier(.23,1,.32,1)`. Toast opacity and position transition over 220ms. Feature dialogs enter with opacity/transform over 240ms and reuse the same focus trap, Escape close and focus restoration. The global reduced-motion media query removes CSS transitions and animations; the Bible arrival JavaScript separately skips playback. Dialog keyboard focus is trapped while open, Escape closes it, and focus returns to the initiating control.


### Monthly Club and Subscriber Records
Basket imagery, conceptual-image disclosure, a single recurring price and profile choice carry the club's warm character. Checkout uses the reduced commerce header, three explicit steps and familiar radio/field controls. Keep the floating devotional trigger hidden during subscription checkout; the removed variant picker is absent throughout the application. Subscriber tabs separate contract, shipments, charges and support; action labels describe pause, resume, skip and cancellation. Shipment cards retain written status, product previews and a four-step progress line; discussion messages distinguish staff replies with pale olive and opposite alignment.

### Operational Navigation and Controls
The olive sidebar pairs authored SVG icons with visible route names. Current navigation uses the pale active ground and dark active ink; hover uses the darker olive family. At compact widths preserve horizontal navigation scrolling and readable labels. Operational buttons have a 38px minimum height (34px for small variants), and fields have a 40px minimum; these local values do not reduce storefront task controls. Keyboard focus uses a 2px admin-focus outline with a 3px offset. Admin panels use a thin admin-line boundary and 24px padding (18px below 600px).

### Status and Record Tables
Use the shared semantic status pairs described in Colors, with compact chip corners, written labels and no shadow. Table headers use scoped column headings, a pale tonal background and 12px 14px padding; cells use 15px 14px padding, subtle horizontal rules, tabular numeric figures and an inspection hover. Keep linked identifiers visibly actionable, long values wrappable and product thumbnails beside item names. Empty tables span all columns with a practical filter-recovery message. On mobile retain the table inside its own scroll wrapper; do not turn every cell into an unrelated card.

### Production Board
Four tonal lanes represent Fila, Impressão, Acabamento and Conferência. Each lane has a title/count and flat light job cards containing identifier, product/order link, assignment, printer, estimate, due date and the next explicit stage action. Empty lanes retain their title and explanatory message. Stage advance is an ordinary button action; no drag interaction is implied. Printer summaries sit above the board. Preserve scoped horizontal scrolling so the daily sequence remains recognizable on mobile.

### Operational Feedback and Dialogs
Administration suppresses the Bible arrival, devotional toast and floating devotional entry; the variant picker is removed throughout the application. Automatic prayer-signup invitation is cancelled on admin routes; the campaign screen retains an explicit preview action. Operational confirmations and forms use the shared cream dialog with a sticky header and scrolling body, compact DM Sans labels and the existing focus/Escape behavior. These scoped interruptions and task dialogs preserve the storefront's devotional features elsewhere.

### Shared Customer and Staff Sign-in
The full-page entry pairs the existing conceptual devotional photograph, an olive story region and a paper form region. The header contains the brand and return-to-store link. Visible customer/team links switch audience; customer access also offers sign-in/create-account modes. Current audience uses olive text and a 2px underline. Keep the photograph's conceptual-image disclosure, explicit test-access path and local-demo explanation visible in their respective regions.

Labeled white fields use field-line borders, field corners and the compact sans type roles. Focus-within changes the boundary to olive and adds a 2px pale-olive outline with a 2px offset; invalid fields use validation red. The password visibility action uses an authored eye SVG, a visible focus state, accessible action name and pressed state. Preserve the olive primary action, bordered demonstration action and remember-email wording. Primary and demo buttons press to .985; fine-pointer hover shifts the primary arrow 3px and turns auxiliary actions terracotta. Error text uses an alert region and receives focus; recovery feedback uses a polite status region and pale olive.

Arrival is a single purposeful WAAPI sequence for a changed audience/form view: form content rises 10px with opacity over 240ms; the photograph reveals a 4% bottom inset and rises 6px over 280ms on the login view. Both use the existing easing. Reduced motion substitutes a 100ms form opacity change and skips the photograph motion; recent keyboard activity suppresses entry animation. The form remains available throughout. Sign-in hides the devotional trigger, verse toast and Bible arrival rather than adding attention competition.

Customer sign-in, registration and recovery are demonstrations. Staff test fixtures are publicly supplied; sessionStorage records a tab-local demonstration session and returns the user to the intended permitted admin route. It provides no real authentication or permission boundary. Password values are not persisted, optional remembered email stays local and recovery sends no email. These disclosures belong alongside the entry task, not hidden behind the animation.

## Do's and Don'ts

### Do:
- **Do** keep primary actions olive and preserve visible keyboard focus.
- **Do** use the serif story roles alongside the existing sans task hierarchy.
- **Do** preserve distinct Catholic and Evangelical routes and welcoming Christian home/giving contexts.
- **Do** use tactile product imagery and retain its conceptual-image disclosure.
- **Do** use flat product grids and tonal panels to distinguish reading from task areas.
- **Do** stack major task columns on mobile and retain a two-column product grid.
- **Do** place the product-detail category badge below the product title.
- **Do** preserve the reduced-motion override for transitions and animations.
- **Do** keep devotional feedback dismissible, pause timed dismissal during interaction and leave automatic 3D rotation off.
- **Do** retain local-demo disclosures, labeled prayer samples and explicit signup/post consent.

- **Do** preserve compact operational headings, written semantic status and linked shared records.
- **Do** contain wide tables and four-stage production inside their own horizontal scroll regions.

- **Do** preserve the explicit Essência selection and the sign-in field labels, visible test access and local-demo explanation.
- **Do** retain the mobile sign-in field size and suppress arrival motion after recent keyboard interaction.

### Don't:
- **Don't** use terracotta as the default primary purchase-action color.
- **Don't** replace the authored SVG stroke icons with font glyphs.
- **Don't** reintroduce the removed variant picker or treat its former utility styling as brand primitives.
- **Don't** apply the selected Essência home composition as a universal layout rule for operational or sign-in screens.

- **Don't** introduce automatic devotional or signup interruptions into administration or sign-in.
- **Don't** generalize tiny audit timestamps or local metadata sizes into the default reading ramp.

Source evidence for the extension: `dist/club-admin.css`, `dist/club.js`, `dist/admin.js`, with status mappings in `dist/ops-data.js` and route/feature suppression in `dist/app.js` and `dist/faith-features.js`. Sign-in evidence: `dist/auth.css`, `dist/auth.js`, and loading/routing in `dist/index.html` and `dist/app.js`. This merge preserves the incumbent world and records the user’s later explicit Essência selection and requested sign-in extension.

- **Don't** describe the public staff fixture or tab-local session as real authentication.

Not canonized or repaired: the removed prototype picker's former system typeface and glass pill remain excluded from the brand; unused source sand and the removed faith-clay/faith-green trial values are excluded from the token set; intermediate sans font-weight requests are documented as matching behavior rather than guaranteed distinct faces. Legacy home selectors in styles.css do not define the active faith home system. No application defects are repaired by this documentation pass. Close one-off warm-neutral/olive literals, older unused production selectors, tiny audit metadata and the informational priority fallback remain local implementation details rather than new global tokens. No eyebrow, glyph-icon or other craft defect is established as a reusable pattern.

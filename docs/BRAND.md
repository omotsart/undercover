# Brand

## Fonts

From Google Fonts:

- **Everything**: Outfit (weights 300, 400, 500)
- Use tabular figures (`font-variant-numeric: tabular-nums`) for amounts, IDs, dates and table columns.

### Type scale

Never set text smaller than 13px.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 56px | 400 | letter-spacing -0.02em |
| Big number (KPI) | 64px | 300 | letter-spacing -0.03em, line-height 1 |
| Card title | 24px | 400 | |
| Number inside a card (ring center, counts) | 40px | 300 | |
| Body, table cells | 15px | 400 | |
| Labels, chips, column headers | 13px | 500 | |

## Colors

- **Primary**: Graphite `#232323`, white text
- **Secondary**: Sunflower `#F8D45C`, Graphite text
- **Tertiary**: Stone `#8E8E8E`, white text
- **Ink on light backgrounds**: Graphite `#232323`
- **Muted ink**: Slate `#55585E`. This is the lightest color allowed for text on light backgrounds, including column headers, placeholders and legends.
- **Ink on dark panels**: white, with Fog `#B5B5B5` for secondary text

Use Graphite, Sunflower and Stone when three things sit side by side. Sunflower marks the one thing that needs attention now.

### Claim status colors

Every status is a filled chip. Never show a status as plain text.

| Status | Chip background | Text |
| --- | --- | --- |
| Waiting | Steel Grey `#A9AFB7` | Graphite |
| In progress | hatched (see Patterns), text on a small white inner pill | Graphite |
| Waiting for sign-off | Deep Sunflower `#F5C400` | Graphite |
| Decided | Graphite `#232323` | white |
| Left for a handler | Slate `#55585E` | white |

The agent's to-do items wear the status colors that mean the same thing: To do as Waiting, In progress as In progress, Done as Decided and Left for a handler as Left for a handler.

Use these exact status colors everywhere: the status bar, table chips, the ring chart and legends. Do not use lighter tints for statuses, they disappear on the cards.

### Decision colors

Use these only for outcomes. Each decision is a tinted chip with a solid round icon on the left. Never a dot with colored text.

| Decision | Icon circle | Icon | Chip tint | Label |
| --- | --- | --- | --- | --- |
| Approved | Green `#1F9D55` | ✓ | `#DCF3E4` | `#176B3A` |
| Referred | Orange `#F08A00` | → | `#FDEBD3` | `#9A4D00` |
| Declined | Red `#DC3B3B` | ✕ | `#FBDDDD` | `#A8232A` |

The icon is white on Green and Red and Graphite on Orange, where white would be only 2.5:1.

No decision yet: show a single en dash `–` in Slate. Do not use Sunflower for a decision.

## Surfaces

- **Page background is required**: set it on `body`, covering the full viewport (`min-height: 100vh`): `radial-gradient(120% 90% at 100% 100%, #FCE9A6 0%, #F6F0DA 40%, #ECEDEF 75%)`. Never use a plain white page. White cards only show on this background.
- **Panels and cards**: white at 60% opacity (`rgba(255,255,255,0.6)`), rounded at 32px, no outline, 24px padding. Every block on the page sits inside a card, including the table.
- **Inner controls**: solid white `#FFFFFF`, such as icon buttons and inactive filter pills
- **Dark panel**: Charcoal `#2B2B2B`, rounded at 28px, white text, for the one list that needs action. One per screen, no tab or shape above it.

## Layout

- Content is centered with `max-width: 1440px` and 32px padding on both sides (16px on phones).
- Nothing may extend past the right edge. Use `box-sizing: border-box` everywhere, and the page must never scroll sideways.
- Space between cards is 16px. Space between sections is 24px.
- A wide table scrolls inside its own card (`overflow-x: auto`), never the page.

## Patterns

- **Pills**: navigation, buttons, filters, chips and bar segments are fully rounded (`border-radius: 999px`). Chips are 26px tall with 12px side padding.
- **Active state**: Graphite pill with white text. Inactive: white pill with Graphite text.
- **Main action**: Sunflower pill with Graphite text, 48px tall.
- **Icon buttons**: 44px circles, solid white, 1.8px stroke icon.
- **Hatching**: `repeating-linear-gradient(120deg, #FFFFFF 0 6px, #6B7079 6px 10px)`. The stripes must be clearly visible.
- **Moving hatching**: the one place where work is happening right now has its stripes slide sideways (`.is-live`, 11.547px a second, which loops seamlessly). While a run works, that is the run's Working chip and the claim being worked; with claims in progress but no run, it is the status bar's In progress pill. Everything else, including the table, the legend and the ring chart, stays still, and nothing moves under `prefers-reduced-motion: reduce`.
- **Status bar (fixed size, decided)**: five pills of equal width in one row (`grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px`), 52px tall, always in the order Decided, Waiting for sign-off, Left for a handler, In progress, Waiting. The status name sits above each pill (13px, weight 500, Graphite). Inside the pill is "count · percent" (16px, weight 500), for example "19 · 76%". Fill each pill with its status color. Keep pills with zero claims and show "0 · 0%". **Widths never follow the data**: the ring chart shows the proportions.
- **Ring chart**: a thick rounded arc per status in the status colors, with the total in the center (40px, weight 300) and a legend below. A small share still shows as a short arc, never a dot.
- **Legends**: each count sits right after its chip, 8px away, not at the far edge.
- **Row separators**: 1px dashed `#CFCFCF` lines between table rows. Rows are 44px tall.
- **Row hover**: the row under the mouse turns solid white with 14px rounded corners and a soft shadow (`0 2px 10px rgba(35,35,35,0.08)`). Hide the dashed lines above and below that row. The cursor is a pointer, and the whole row opens the claim. The change fades in over 0.15s. Also show the same highlight when the row has keyboard focus. On the dark panel the highlight is white at 10% with no shadow.
- **Rows that open a claim** (the claims table, the run's claims, Next for sign-off) end with a › arrow in Slate (Fog on the dark panel). On hover and focus it turns Graphite (white on the dark panel) and moves 3px right. Keyboard focus also draws a 2px Graphite outline with a 2px offset around the whole row (white on the dark panel).
- **Buttons and pills** darken slightly on hover (`filter: brightness(0.94)`) and press to `scale(0.98)`.

## Screen recipe: Claims queue

1. **Header**: product name on the left, navigation pills (Queue, Instructions) and icon buttons on the right.
2. **Title row**: "Claims queue" and the claim count on the left, "Work the queue" Sunflower button on the right, with the "Claims to work" number field (a white pill) before it.
3. **Two columns** under the title row, 3:1, 16px apart. Every card sits in one of them.
   - **Left, top to bottom**: the status bar card, The agent's run, Claims.
   - **Right, top to bottom**: the dark Next for sign-off panel, Decisions, By status.
   - **The bottoms of the two columns always line up, and whichever is shorter stretches.** The table first takes as many 44px rows as fit down to the end of the right column's content (at least 8), and the Claims card absorbs the rest, with its footer pinned to the bottom. If the left column is still taller, By status stretches and centers its ring and legend in the extra height. While the whole table is open, the right column instead sticks 24px from the top and nothing on the right stretches.
   - **Below 1200px** there is one column, in this order: status bar, Next for sign-off, The agent's run, Claims, Decisions, By status. Nothing stretches, and the table shows 10 rows a page.
4. **Next for sign-off**: one row per claim on two lines, the ID on the left and the amount with a › arrow on the right, the customer below in Fog. With nothing waiting for sign-off the panel shrinks to one line, "Nothing is waiting for sign-off."
5. **The agent's run**:
   - A head with the run's status chip, "Run N" and "N of M claims".
   - Once the run ends, four numbers inside the card (40px, weight 300): Paid and Waiting for sign-off, each with its dollar total, then Declined and Back in the queue.
   - The run's claims in the order worked, one row each: the outcome's round icon, the claim ID, the type, the amount claimed, the outcome chip and a › arrow. The whole row opens the claim. Outcomes: Paid in the Approved colors, Declined and Referred in theirs, and Waiting for sign-off, Left for a handler and Back in the queue (Waiting) in their status colors.
   - The claim being worked has the moving In progress chip and the agent's last step in Slate after it, on a slightly darker row. It doesn't open.
   - While the run works, "Queued" rows (a Waiting chip, Slate text, not clickable) fill up to the cap with the rest of the agent's to-do list.
   - Below, two collapsed sections side by side: "The agent's plan", the full to-do list with status chips, and "Run summary".
6. **Claims**:
   - Above the table, filter pills (36px tall) for All, Waiting for sign-off, Waiting and Decided. The count sits 6px after the name, in Slate (white on the active pill). An empty pill is Slate but still works.
   - Cells stay on one line and end in an ellipsis. Customer and Type give way first; the other columns are sized to their longest content, so from 1201px up the table fits its column without scrolling sideways. Only narrower screens scroll it inside the card.
   - Below the table, a round Show all button on the left and the pager on the right: round ‹ › buttons and page-number pills, shortened as 1 … 4 5 6 … 12. With one page, neither shows.
   - The filter and the page live in the address, so Back from a claim returns to them.
7. **Decisions**: Paid in dollars as a number inside the card (40px, weight 300) with the label "Paid", then the Approved, Referred, Declined bar in decision colors.
8. **By status**: the ring chart with its legend.
9. **Empty states**: when a card has nothing to show, keep the card and write one short line, such as "Nothing is waiting for sign-off."

## Screen recipe: A claim

1. **Title row**: the claim ID, its status chip and the one-line summary.
2. **Two columns** under it, 3:1, 16px apart.
   - **Left, top to bottom**: The claim, Items claimed, Documents, Policy. Policy uses the same field grid as The claim: a Slate label above each value.
   - **Right, top to bottom**: Decision, the dark Sign off panel while the payout waits for it, Agent steps.
   - **The bottoms of the two columns line up while the steps are folded.** Agent steps stretches to the bottom of the left column, and its list fills the room, cut off with a fade at the bottom. If the left column is shorter than Decision plus room for two or three steps, the right column is simply taller and the left one doesn't stretch.
3. **Agent steps**: newest first, with the count on the right of the title ("34 steps"). Folded, each step shows at most three lines. At the bottom, the same round button that opens the claims table, labelled "Show all steps" / "Collapse", its arrow turning over when open. Open, every step shows in full and the right column grows on its own; folding scrolls back to the top of the card. A claim being worked stays folded as new steps arrive at the top. Steps are markdown, so bold and lists show as such.
4. **Below 1200px**: one column, in this order: Decision, Sign off, The claim, Items claimed, Documents, Policy, Agent steps. Nothing stretches, and folded steps show the newest five.

## Ready-to-use tokens

```css
:root {
  --graphite: #232323;
  --sunflower: #F8D45C;
  --stone: #8E8E8E;
  --slate: #55585E;

  --status-waiting: #A9AFB7;
  --status-progress-stripe: #6B7079;
  --status-signoff: #F5C400;
  --status-decided: #232323;
  --status-handler: #55585E;
  --charcoal: #2B2B2B;
  --fog: #B5B5B5;
  --card: rgba(255, 255, 255, 0.6);
  --page-bg: radial-gradient(120% 90% at 100% 100%, #FCE9A6 0%, #F6F0DA 40%, #ECEDEF 75%);

  --approved: #1F9D55;  --approved-tint: #DCF3E4;  --approved-ink: #176B3A;
  --referred: #F08A00;  --referred-tint: #FDEBD3;  --referred-ink: #9A4D00;
  --declined: #DC3B3B;  --declined-tint: #FBDDDD;  --declined-ink: #A8232A;

  --radius-card: 32px;
  --radius-pill: 999px;
  --gap: 16px;
  --white: #FFFFFF;
  --divider: #CFCFCF;
}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--page-bg);
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 15px;
  color: var(--graphite);
  overflow-x: hidden;
}
.page { max-width: 1440px; margin: 0 auto; padding: 24px 32px; }
.card { background: var(--card); border-radius: var(--radius-card); padding: 24px; }
.claim-row { border-top: 1px dashed #CFCFCF; border-radius: 14px; margin: 0 -12px; padding: 0 12px; cursor: pointer; transition: background-color .15s ease; }
.claim-row:hover, .claim-row:focus-within { background: #FFFFFF; border-top-color: transparent; box-shadow: 0 2px 10px rgba(35,35,35,0.08); }
.claim-row:hover + .claim-row, .claim-row:focus-within + .claim-row { border-top-color: transparent; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 12px; border-radius: var(--radius-pill); font-size: 13px; font-weight: 500; }
```

## Avoid

- A plain white page background
- Text lighter than Slate `#55585E` on light backgrounds
- Statuses or decisions shown as plain text or a dot
- Empty outlined pills, and status bar segments whose width follows the data
- Content wider than the screen
- Borders on one edge of a panel, and thin lines across the top of the page
- Outlines on cards, and any gradient other than the page background, the hatching and the fade that cuts off folded Agent steps

## Tone

Plain business English in US spelling. Short labels, no jargon and no exclamation marks. Money is in US dollars, such as $1,250.00. Claim IDs look like CLM-1001. Dates look like Jul 6, 2026.

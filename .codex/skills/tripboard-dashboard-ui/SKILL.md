---
name: tripboard-dashboard-ui
description: Use for TripBoard dashboard UI work, especially when auditing screenshots, refining spacing and hierarchy, preserving the current dark/red visual system, or extending the dashboard card patterns, status treatments, and navigation behavior introduced in src/components/dashboard/DashboardClient.tsx and src/components/Header.tsx.
---

# TripBoard Dashboard UI

- Default verification:

```bash
npm run lint
npm run build
```

## When To Use

- Use this skill when changing `src/components/dashboard/DashboardClient.tsx`.
- Use this skill when dashboard-adjacent pages should feel visually consistent with the dashboard.
- Use this skill when a request is about screenshot critique, spacing cleanup, hierarchy, density, tile layout, status chips, or accessibility in TripBoard's dashboard shell.

## Visual System To Preserve

- Keep the existing dark slate + red brand palette. Do not introduce a new theme.
- Prefer the shared surface classes already used in the dashboard:
  - `SURFACE_CARD_CLASS` for primary cards
  - `SUBCARD_CLASS` for nested tiles
  - `SUBDUED_BADGE_CLASS` for low-priority state badges
- Use green, orange, and red only for semantic status. Do not use extra accent colors without a product reason.
- Prefer bordered surfaces over flat blocks, but avoid stacking too many nested cards unless grouping materially improves scanning.

## Layout Rules

- Keep the page on a consistent vertical rhythm. Major dashboard sections should usually separate with `mb-6`; internal card spacing should usually use `gap-3`, `gap-4`, `gap-5`, `p-4`, or `p-6`.
- Avoid solving balance problems with arbitrary fixed heights unless the content is truly media-driven. Prefer flex distribution, grid alignment, and min-height only where necessary.
- For the top overview row:
  - `Vehicle details` and `Vehicle Location` should read as peers.
  - Let the row stretch naturally; make the map stage flex with the card instead of chasing exact pixel parity.
  - The left card should distribute content intentionally so the metadata strip does not float too far from the battery block.
- For lower sections, prefer full-width horizontal modules over fragmented half-width cards when the data is repetitive or status-heavy.

## Dashboard Component Patterns

### Header

- Keep the dashboard header lean:
  - vehicle name as the primary title
  - one state chip next to the title
  - freshness chip near the action area
  - refresh action on the right
- The vehicle selector lives in `src/components/Header.tsx`, after `Maintenance` and before `Settings`.
- Avoid repeating the same status in multiple places.

### Vehicle Details Card

- Structure:
  - title + temperature cluster
  - hero metric row with battery percent and range
  - battery bar with charge limit marker
  - subdued badges for charging state and charge limit
  - bottom metadata strip for odometer, security, and sentry mode
- Charging state badges should be visually quieter than primary status chips unless the vehicle is actively charging.
- If spacing feels off, adjust the internal flex distribution before changing card height.

### Vehicle Location Card

- Prioritize:
  - title
  - address
  - map
- Keep the map large enough to feel intentional, but avoid making it so tall that the left overview card must carry dead space.
- The address should stay actionable as a maps link.

### Doors & Openings

- Use one horizontal tile row for the openings summary rather than splitting doors, cargo, and windows into disconnected columns.
- Each tile should show:
  - icon
  - label
  - primary open/closed status
  - optional secondary window status for door tiles
- If a door is open:
  - use the open icon
  - use red status text
- If the door is closed but the window is open:
  - use an alert treatment
  - keep the primary row for door status
  - keep the secondary row for window status only

### Tire Pressure

- Use four horizontal tiles: front left, front right, rear left, rear right.
- Each tile should show:
  - label
  - top-right health dot
  - large PSI value
  - smaller `bar` value
- PSI is the hero value; `bar` is secondary metadata.
- If the tile feels empty, increase value emphasis before increasing tile height.

## Spacing Audit Checklist

- Check that card titles align on a common top rhythm.
- Check that badge rows are not visually heavier than the metrics they support.
- Check that repeated tiles share the same internal padding and label spacing.
- Check that the map card and vehicle-details card feel balanced without relying on hard-coded symmetry.
- Check that no section description repeats information already present in the title or badges.
- Check that the lower two sections use the same horizontal gap and internal tile density.

## Accessibility

- Preserve visible focus states with `FOCUS_RING_CLASS`.
- Normal text should maintain readable contrast against the dark surfaces.
- Do not rely on color alone for open/closed meaning; keep icon and text changes aligned with semantic state.
- Keep touch targets and buttons at the current dashboard size or larger.

## Files To Inspect

- `src/components/dashboard/DashboardClient.tsx`
- `src/components/Header.tsx`
- `src/components/VehicleMap.tsx`

## Documentation Rule

- If the dashboard UI system changes in a reusable, repo-wide way, update `AGENTS.md` so the skill list and local guidance stay current.

# Mobile Scanner UI Implementation Plan

**Goal:** Rework the mobile interface into a single-page-first scanner with a bottom tabbed tool shelf, swipeable pages, mobile page management, and quick import entry points.

**Architecture:** Keep the existing desktop layout and image-processing actions. Add mobile-only state for the bottom tab and make the preview canvas itself swipeable on mobile, reuse existing action handlers, and use CSS breakpoints so desktop remains the current three-column workstation.

**Tech Stack:** React 19, TypeScript, CSS media queries, Vite, Vitest.

---

### Task 1: Mobile State And Controls

**Files:**
- Modify: `src/App.tsx`

**Steps:**
1. Add `MobileToolTab` state with `quick`, `filters`, and `pages`.
2. Add mobile-only import buttons in the empty state.
3. Add mobile quick-add row with page count and continue import buttons.
4. Add bottom tabbed toolbar that reuses crop, frame, rotate, reset, filter, export, and page management handlers.

### Task 2: Swipeable Page Canvas

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Steps:**
1. Make the mobile preview canvas render every page as a snap-aligned slide.
2. Keep the selected desktop preview as-is.
3. Update selected page on horizontal scroll by nearest slide.
4. Add an import slide at the end for continued import.

### Task 3: Responsive Styling

**Files:**
- Modify: `src/App.css`

**Steps:**
1. Hide desktop side panels and desktop tool band on mobile.
2. Show mobile bottom toolbar only below the mobile breakpoint.
3. Make the preview area fill the main viewport between header and bottom controls.
4. Make the pages tab manage sorting and deletion in a bottom sheet style.

### Task 4: Validation

**Commands:**
- `npm run lint`
- `npm run build`
- `npm run test -- --run`

**Manual QA:**
- Desktop layout still shows the existing workstation.
- Mobile empty state shows upload and shoot import.
- Mobile with pages supports swiping directly on the preview canvas, page count, continue import, bottom tabs, basic filters, and page sorting.

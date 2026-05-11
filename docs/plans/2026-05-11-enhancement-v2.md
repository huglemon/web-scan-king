# Enhancement V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add browser-only document enhancement v2 with shadow reduction, background normalization, local contrast, sharpening, adaptive black-and-white mode, and a per-page strength slider.

**Architecture:** Keep the single render pipeline in `src/lib/image.ts` so preview, thumbnails, JPG export, and PDF export stay consistent. Implement the image processing as pure typed-array helpers that are testable without canvas, then call them after canvas draw inside `renderImageVariant()`.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Vitest, Vite.

---

### Task 1: Pixel Pipeline

**Files:**
- Modify: `src/lib/image.ts`
- Modify: `src/lib/testable.ts`
- Modify: `src/lib/image.test.ts`

**Steps:**
1. Extend `ScanFilterId` with `sharp` and `document`.
2. Add preset metadata for enhancement-capable filters.
3. Add strength normalization and typed-array pixel helpers.
4. Implement background normalization, local contrast, unsharp sharpening, and adaptive monochrome.
5. Add focused unit tests for strength clamping, background normalization, and adaptive monochrome behavior.

### Task 2: UI Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Steps:**
1. Add `enhanceStrength` to `ScanPage`.
2. Pass strength through `applyVariant()` and `renderImageVariant()`.
3. Add a range slider near filter tabs, visible for enhancement filters.
4. Preserve strength across crop/rotation and reset it when restoring original page if needed.
5. Keep mobile layout compact and avoid wrapping collisions.

### Task 3: Validation

**Commands:**
- `npm run lint`
- `npm run build`
- `npm run test -- --run`

**Manual QA:**
- Upload portrait and landscape document photos.
- Compare `清晰+` and `黑白文档` at low/high strengths.
- Confirm preview, thumbnails, current JPG export, and PDF export use the same enhanced result.


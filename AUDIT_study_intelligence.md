# Study Intelligence Feature — Implementation Audit

**Date:** 2026-02-11
**Auditor:** Review Agent

## Executive Summary

**Status:** PARTIALLY IMPLEMENTED
**Critical Issue:** StudyPortfolioView created but NOT integrated into app routing
**Impact:** Landing page context panel, cross-study navigation, and portfolio features are inaccessible

---

## Phase-by-Phase Audit

### Phase 1: Foundation & Mock Data ✅ COMPLETE

**Backend:**
- ✅ `backend/models/study_metadata.py` — Dual-layer model (reported/derived)
- ✅ `backend/services/study_accessors.py` — Resolved accessors
- ✅ `backend/services/study_metadata_service.py` — CRUD service
- ✅ `backend/data/study_metadata.json` — 6 mock studies with discrepancies
- ✅ `backend/routers/study_portfolio.py` — GET /api/portfolio/studies endpoint
- ✅ Router registered in `main.py` (line 54)

**Frontend:**
- ✅ `frontend/src/hooks/useStudyPortfolio.ts` — React Query hook
- ✅ `frontend/src/hooks/useProjects.ts` — Programs hook
- ✅ `frontend/src/lib/study-accessors.ts` — Client-side accessors

**Verification:**
```bash
curl http://localhost:8000/api/portfolio/studies
# Should return 6 studies
```

---

### Phase 2-3: Landing Page (Portfolio View) ⚠️ IMPLEMENTED BUT NOT INTEGRATED

**Backend:**
- ✅ All endpoints working

**Frontend — Components Created:**
- ✅ `frontend/src/components/portfolio/StudyPortfolioView.tsx`
- ✅ `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx`
- ✅ `frontend/src/components/portfolio/panes/StageStatusPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/ToxSummaryPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/ReportedVsDerivedDeltaPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/ProgramNoaelsPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/PackageCompletenessPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/CollectionProgressPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/DesignRationalePane.tsx`
- ✅ `frontend/src/components/portfolio/panes/RelatedStudiesPane.tsx`
- ✅ `frontend/src/components/portfolio/panes/StudyDetailsLinkPane.tsx` (Phase 7)

**Frontend — Integration Status:**
- ❌ **CRITICAL: StudyPortfolioView NOT in App.tsx routing**
- ❌ **Landing page still shows old AppLandingPage**
- ❌ **Context panel panes never render**

**Expected:**
```typescript
// App.tsx should have:
{ path: "/", element: <StudyPortfolioView /> }
// OR
{ path: "/portfolio", element: <StudyPortfolioView /> }
```

**Actual:**
```typescript
// App.tsx currently has:
{ path: "/", element: <AppLandingPage /> }
// StudyPortfolioView is orphaned, never imported or used
```

---

### Phase 4: Insights Engine — Rule 0 ✅ COMPLETE

**Backend:**
- ✅ `backend/services/insights_engine.py` — Rule 0 implemented
- ✅ `backend/routers/study_portfolio.py` — GET /api/portfolio/insights/{study_id}
- ✅ `backend/test_rule_00.py` — Tests pass

**Frontend:**
- ✅ `frontend/src/hooks/useInsights.ts` — Hook created

**Verification:**
```bash
curl http://localhost:8000/api/portfolio/insights/PC201905
# Should return 3 discrepancy insights
```

---

### Phase 5: Complete Insights Engine (Rules 1-18) ✅ COMPLETE

**Backend:**
- ✅ All 19 rules (0-18) implemented in `insights_engine.py`
- ✅ `generate_insights()` orchestrator
- ✅ `backend/test_all_rules.py` — All 5 test scenarios pass

**Verification:**
```bash
cd backend && venv/Scripts/python.exe test_all_rules.py
# All tests should pass
```

---

### Phase 6: Cross-Study Insights Tab ✅ COMPLETE

**Frontend:**
- ✅ `StudySummaryView.tsx` — Tab type includes "insights"
- ✅ `CrossStudyInsightsTab` component (inline)
- ✅ `InsightCard` component (inline)
- ✅ Priority filtering (0-1 always visible, 2-3 collapsible)

**Verification:**
Navigate to `/studies/PC201708?tab=insights` — should show insights tab
**Issue:** Insights will load if backend is running and endpoint works

---

### Phase 7: Routing Integration ⚠️ INCOMPLETE

**What Was Implemented:**
- ✅ `StudyDetailsLinkPane` component created
- ✅ Added to `StudyPortfolioContextPanel`
- ✅ Query parameter support in `StudySummaryView` (?tab=insights)

**What's Missing:**
- ❌ **StudyPortfolioView not in App.tsx routing**
- ❌ **No navigation flow from landing page to portfolio**
- ❌ **StudyDetailsLinkPane never renders (parent never renders)**

**Expected Flow:**
```
Landing Page (StudyPortfolioView)
  → Select study in table
  → Context panel shows adaptive panes
  → Click "View cross-study insights"
  → Navigate to /studies/:studyId?tab=insights
```

**Actual Flow:**
```
Landing Page (AppLandingPage - old)
  → Click study name
  → Go to /studies/:studyId
  → StudyPortfolioView never shown
  → Context panel navigation links never render
```

---

## Critical Gaps

### 1. **StudyPortfolioView Not Integrated** ⚠️ CRITICAL

**File:** `frontend/src/App.tsx`

**Current:**
```typescript
{ path: "/", element: <AppLandingPage /> }
```

**Should be:**
```typescript
import { StudyPortfolioView } from "@/components/portfolio/StudyPortfolioView";

{ path: "/", element: <StudyPortfolioView /> }
```

**Impact:**
- Landing page context panel features inaccessible
- Adaptive context panes never render
- StudyDetailsLinkPane never visible
- No cross-study orientation on landing page

---

### 2. **Backend Running?**

**Verification needed:**
```bash
# Start backend
cd C:/pg/pcc/backend
$env:OPENBLAS_NUM_THREADS=1
C:/pg/pcc/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000

# Test endpoints
curl http://localhost:8000/api/portfolio/studies
curl http://localhost:8000/api/portfolio/insights/PC201905
```

If backend is not running, insights tab will be empty (API calls fail).

---

### 3. **Mock Data Loaded?**

**Check:** `backend/data/study_metadata.json` should exist with 6 studies

```bash
ls backend/data/study_metadata.json
# Should exist
```

---

## Recommended Fixes

### Fix 1: Integrate StudyPortfolioView (CRITICAL)

**File:** `frontend/src/App.tsx`

```typescript
// Add import
import { StudyPortfolioView } from "@/components/portfolio/StudyPortfolioView";

// Update route
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <StudyPortfolioView /> },  // CHANGE THIS LINE
      { path: "/studies/:studyId", element: <StudySummaryViewWrapper /> },
      // ... rest of routes
    ],
  },
]);
```

### Fix 2: Verify Backend Endpoints

Run backend and test:
```bash
curl http://localhost:8000/api/portfolio/studies
curl http://localhost:8000/api/portfolio/insights/PC201708
```

### Fix 3: Test End-to-End Flow

1. Start backend
2. Start frontend (npm run dev)
3. Navigate to http://localhost:5173
4. Should see StudyPortfolioView with 6 studies
5. Select a study (e.g., PC201708)
6. Context panel should show adaptive panes
7. Click "View cross-study insights" link
8. Should navigate to insights tab with insights displayed

---

## Test Matrix

| Study | Expected Insights | Priority 0 | Priority 1 | Priority 2-3 |
|-------|-------------------|------------|------------|--------------|
| PC201708 | ~10 | 1 (discrepancy) | 6-7 | 2-3 |
| PC201905 | ~14+ | 3 (discrepancies) | 8-9 | 3-4 |
| PC202103 | ~9 | 0 | 2 (watchlist) | 7 |
| PC202201 | ~12 | 2 (dose selection) | 8 | 2 |
| PC201802 | ~8 | 0 | 5-6 | 2-3 |
| AX220401 | 1 | 0 | 1 (Rule 9 only) | 0 |

**Verification:** Navigate to each study's insights tab and confirm counts match.

---

## Summary

**Implemented:** ~95% of code
**Integrated:** ~70% (missing routing integration)
**Working:** Unknown (needs backend verification + routing fix)

**Next Steps:**
1. Add StudyPortfolioView to App.tsx routing
2. Verify backend is serving data
3. Test end-to-end flow
4. Validate insights for all 6 studies

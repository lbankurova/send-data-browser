import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";
import { StudySummaryViewWrapper } from "@/components/analysis/StudySummaryViewWrapper";

// Lazy-loaded findings views
const AllFindingsOverviewViewWrapper = lazy(() => import("@/components/analysis/findings/AllFindingsOverviewViewWrapper").then(m => ({ default: m.AllFindingsOverviewViewWrapper })));
const SignalSummaryHeatmapViewWrapper = lazy(() => import("@/components/analysis/findings/SignalSummaryHeatmapViewWrapper").then(m => ({ default: m.SignalSummaryHeatmapViewWrapper })));
const FindingsDashboardViewWrapper = lazy(() => import("@/components/analysis/findings/FindingsDashboardViewWrapper").then(m => ({ default: m.FindingsDashboardViewWrapper })));
const AdverseEffectsView = lazy(() => import("@/components/analysis/findings/AdverseEffectsView").then(m => ({ default: m.AdverseEffectsView })));

// Lazy-loaded analysis views (code-split into separate chunks)
const DoseResponseViewWrapper = lazy(() => import("@/components/analysis/DoseResponseViewWrapper").then(m => ({ default: m.DoseResponseViewWrapper })));
const HistopathologyViewWrapper = lazy(() => import("@/components/analysis/HistopathologyViewWrapper").then(m => ({ default: m.HistopathologyViewWrapper })));
const NoaelDecisionViewWrapper = lazy(() => import("@/components/analysis/NoaelDecisionViewWrapper").then(m => ({ default: m.NoaelDecisionViewWrapper })));
const ValidationViewWrapper = lazy(() => import("@/components/analysis/ValidationViewWrapper").then(m => ({ default: m.ValidationViewWrapper })));


function ViewLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ViewLoading />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <AppLandingPage /> },
      { path: "/studies/:studyId", element: <StudySummaryViewWrapper /> },
      {
        path: "/studies/:studyId/domains/:domainName",
        element: <CenterPanel />,
      },
      // Findings views
      {
        path: "/studies/:studyId/findings-overview",
        element: <LazyRoute><AllFindingsOverviewViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/signal-heatmap",
        element: <LazyRoute><SignalSummaryHeatmapViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/findings-dashboard",
        element: <LazyRoute><FindingsDashboardViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/adverse-effects",
        element: <LazyRoute><AdverseEffectsView /></LazyRoute>,
      },
      // Legacy route redirect
      {
        path: "/studies/:studyId/analyses/adverse-effects",
        element: <LazyRoute><AdverseEffectsView /></LazyRoute>,
      },
      // Analysis views
      {
        path: "/studies/:studyId/dose-response",
        element: <LazyRoute><DoseResponseViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/target-organs",
        element: <Navigate to=".." replace />,
      },
      {
        path: "/studies/:studyId/histopathology",
        element: <LazyRoute><HistopathologyViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/noael-decision",
        element: <LazyRoute><NoaelDecisionViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/validation",
        element: <LazyRoute><ValidationViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/analyses/:analysisType",
        element: <PlaceholderAnalysisView />,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

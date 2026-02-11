import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { CopyAdverseEffectsView } from "@/components/analysis/CopyAdverseEffectsView";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";
import { StudySummaryViewWrapper } from "@/components/analysis/StudySummaryViewWrapper";
import { CopyStudySummaryViewWrapper } from "@/components/analysis/CopyStudySummaryViewWrapper";

// Lazy-loaded findings views
const AllFindingsOverviewViewWrapper = lazy(() => import("@/components/analysis/findings/AllFindingsOverviewViewWrapper").then(m => ({ default: m.AllFindingsOverviewViewWrapper })));
const SignalSummaryHeatmapViewWrapper = lazy(() => import("@/components/analysis/findings/SignalSummaryHeatmapViewWrapper").then(m => ({ default: m.SignalSummaryHeatmapViewWrapper })));
const FindingsDashboardViewWrapper = lazy(() => import("@/components/analysis/findings/FindingsDashboardViewWrapper").then(m => ({ default: m.FindingsDashboardViewWrapper })));
const AdverseEffectsView = lazy(() => import("@/components/analysis/findings/AdverseEffectsView").then(m => ({ default: m.AdverseEffectsView })));

// Lazy-loaded analysis views (code-split into separate chunks)
const DoseResponseViewWrapper = lazy(() => import("@/components/analysis/DoseResponseViewWrapper").then(m => ({ default: m.DoseResponseViewWrapper })));
const TargetOrgansViewWrapper = lazy(() => import("@/components/analysis/TargetOrgansViewWrapper").then(m => ({ default: m.TargetOrgansViewWrapper })));
const HistopathologyViewWrapper = lazy(() => import("@/components/analysis/HistopathologyViewWrapper").then(m => ({ default: m.HistopathologyViewWrapper })));
const NoaelDecisionViewWrapper = lazy(() => import("@/components/analysis/NoaelDecisionViewWrapper").then(m => ({ default: m.NoaelDecisionViewWrapper })));
const ValidationViewWrapper = lazy(() => import("@/components/analysis/ValidationViewWrapper").then(m => ({ default: m.ValidationViewWrapper })));

// Lazy-loaded playground copies
const CopyDoseResponseViewWrapper = lazy(() => import("@/components/analysis/CopyDoseResponseViewWrapper").then(m => ({ default: m.CopyDoseResponseViewWrapper })));
const CopyTargetOrgansViewWrapper = lazy(() => import("@/components/analysis/CopyTargetOrgansViewWrapper").then(m => ({ default: m.CopyTargetOrgansViewWrapper })));
const CopyHistopathologyViewWrapper = lazy(() => import("@/components/analysis/CopyHistopathologyViewWrapper").then(m => ({ default: m.CopyHistopathologyViewWrapper })));
const CopyNoaelDecisionViewWrapper = lazy(() => import("@/components/analysis/CopyNoaelDecisionViewWrapper").then(m => ({ default: m.CopyNoaelDecisionViewWrapper })));
const CopyValidationViewWrapper = lazy(() => import("@/components/analysis/CopyValidationViewWrapper").then(m => ({ default: m.CopyValidationViewWrapper })));

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
        element: <LazyRoute><TargetOrgansViewWrapper /></LazyRoute>,
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
      // Playground copies
      { path: "/studies/:studyId/copy-study-summary", element: <CopyStudySummaryViewWrapper /> },
      {
        path: "/studies/:studyId/copy-adverse-effects",
        element: <CopyAdverseEffectsView />,
      },
      {
        path: "/studies/:studyId/copy-dose-response",
        element: <LazyRoute><CopyDoseResponseViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/copy-target-organs",
        element: <LazyRoute><CopyTargetOrgansViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/copy-histopathology",
        element: <LazyRoute><CopyHistopathologyViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/copy-noael-decision",
        element: <LazyRoute><CopyNoaelDecisionViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/copy-validation",
        element: <LazyRoute><CopyValidationViewWrapper /></LazyRoute>,
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

import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { AdverseEffectsView } from "@/components/analysis/AdverseEffectsView";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";
import { StudySummaryViewWrapper } from "@/components/analysis/StudySummaryViewWrapper";

// Lazy-loaded analysis views (code-split into separate chunks)
const DoseResponseViewWrapper = lazy(() => import("@/components/analysis/DoseResponseViewWrapper").then(m => ({ default: m.DoseResponseViewWrapper })));
const TargetOrgansViewWrapper = lazy(() => import("@/components/analysis/TargetOrgansViewWrapper").then(m => ({ default: m.TargetOrgansViewWrapper })));
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
      {
        path: "/studies/:studyId/analyses/adverse-effects",
        element: <AdverseEffectsView />,
      },
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

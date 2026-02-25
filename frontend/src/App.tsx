import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";
import { StudySummaryViewWrapper } from "@/components/analysis/StudySummaryViewWrapper";

const FindingsViewWrapper = lazy(() => import("@/components/analysis/findings/FindingsViewWrapper").then(m => ({ default: m.FindingsViewWrapper })));

// Lazy-loaded analysis views (code-split into separate chunks)
const DoseResponseViewWrapper = lazy(() => import("@/components/analysis/DoseResponseViewWrapper").then(m => ({ default: m.DoseResponseViewWrapper })));
const HistopathologyViewWrapper = lazy(() => import("@/components/analysis/HistopathologyViewWrapper").then(m => ({ default: m.HistopathologyViewWrapper })));
const NoaelDeterminationViewWrapper = lazy(() => import("@/components/analysis/NoaelDeterminationViewWrapper").then(m => ({ default: m.NoaelDeterminationViewWrapper })));
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
        path: "/studies/:studyId/findings",
        element: <LazyRoute><FindingsViewWrapper /></LazyRoute>,
      },
      // Legacy route redirects
      {
        path: "/studies/:studyId/adverse-effects",
        element: <Navigate to="../findings" replace />,
      },
      {
        path: "/studies/:studyId/analyses/adverse-effects",
        element: <Navigate to="../../findings" replace />,
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
        path: "/studies/:studyId/noael-determination",
        element: <LazyRoute><NoaelDeterminationViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/noael-decision",
        element: <Navigate to="../noael-determination" replace />,
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

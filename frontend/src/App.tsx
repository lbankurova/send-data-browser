import { lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";

const AppLandingPage = lazy(() => import("@/components/panels/AppLandingPage").then(m => ({ default: m.AppLandingPage })));
const CenterPanel = lazy(() => import("@/components/panels/CenterPanel").then(m => ({ default: m.CenterPanel })));
const StudySummaryViewWrapper = lazy(() => import("@/components/analysis/StudySummaryViewWrapper").then(m => ({ default: m.StudySummaryViewWrapper })));
const FindingsViewWrapper = lazy(() => import("@/components/analysis/findings/FindingsViewWrapper").then(m => ({ default: m.FindingsViewWrapper })));

// Lazy-loaded analysis views (code-split into separate chunks)
const ValidationViewWrapper = lazy(() => import("@/components/analysis/ValidationViewWrapper").then(m => ({ default: m.ValidationViewWrapper })));
const CohortViewWrapper = lazy(() => import("@/components/analysis/CohortViewWrapper").then(m => ({ default: m.CohortViewWrapper })));
const CurationDashboard = lazy(() => import("@/components/admin/CurationDashboard").then(m => ({ default: m.CurationDashboard })));


function ViewLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route chunk load failed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load view. The app may have updated.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<ViewLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <LazyRoute><AppLandingPage /></LazyRoute> },
      { path: "/studies/:studyId", element: <LazyRoute><StudySummaryViewWrapper /></LazyRoute> },
      {
        path: "/studies/:studyId/domains/:domainName",
        element: <LazyRoute><CenterPanel /></LazyRoute>,
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
        element: <Navigate to="../findings" replace />,
      },
      {
        path: "/studies/:studyId/target-organs",
        element: <Navigate to=".." replace />,
      },
      {
        path: "/studies/:studyId/histopathology",
        element: <Navigate to="../findings" replace />,
      },
      {
        path: "/studies/:studyId/noael-determination",
        element: <Navigate to="../findings" replace />,
      },
      {
        path: "/studies/:studyId/noael-decision",
        element: <Navigate to="../findings" replace />,
      },
      {
        path: "/studies/:studyId/validation",
        element: <LazyRoute><ValidationViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/cohort",
        element: <LazyRoute><CohortViewWrapper /></LazyRoute>,
      },
      {
        path: "/studies/:studyId/analyses/:analysisType",
        element: <PlaceholderAnalysisView />,
      },
      {
        path: "/admin/curation",
        element: <LazyRoute><CurationDashboard /></LazyRoute>,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

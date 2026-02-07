import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { AdverseEffectsView } from "@/components/analysis/AdverseEffectsView";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";
import { ValidationViewWrapper } from "@/components/analysis/ValidationViewWrapper";
import { StudySummaryViewWrapper } from "@/components/analysis/StudySummaryViewWrapper";
import { NoaelDecisionViewWrapper } from "@/components/analysis/NoaelDecisionViewWrapper";
import { TargetOrgansViewWrapper } from "@/components/analysis/TargetOrgansViewWrapper";
import { DoseResponseViewWrapper } from "@/components/analysis/DoseResponseViewWrapper";
import { HistopathologyViewWrapper } from "@/components/analysis/HistopathologyViewWrapper";
import { LoginPage } from "@/components/LoginPage";
import { useAuth } from "@/contexts/AuthContext";

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
        element: <DoseResponseViewWrapper />,
      },
      {
        path: "/studies/:studyId/target-organs",
        element: <TargetOrgansViewWrapper />,
      },
      {
        path: "/studies/:studyId/histopathology",
        element: <HistopathologyViewWrapper />,
      },
      {
        path: "/studies/:studyId/noael-decision",
        element: <NoaelDecisionViewWrapper />,
      },
      {
        path: "/studies/:studyId/validation",
        element: <ValidationViewWrapper />,
      },
      {
        path: "/studies/:studyId/analyses/:analysisType",
        element: <PlaceholderAnalysisView />,
      },
    ],
  },
]);

export default function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <RouterProvider router={router} />;
}

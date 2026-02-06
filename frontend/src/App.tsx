import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AppLandingPage } from "@/components/panels/AppLandingPage";
import { StudyLandingPage } from "@/components/panels/StudyLandingPage";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { AdverseEffectsView } from "@/components/analysis/AdverseEffectsView";
import { PlaceholderAnalysisView } from "@/components/analysis/PlaceholderAnalysisView";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <AppLandingPage /> },
      { path: "/studies/:studyId", element: <StudyLandingPage /> },
      {
        path: "/studies/:studyId/domains/:domainName",
        element: <CenterPanel />,
      },
      {
        path: "/studies/:studyId/analyses/adverse-effects",
        element: <AdverseEffectsView />,
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

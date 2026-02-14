import { DoseResponseView } from "./DoseResponseView";

export function DoseResponseViewWrapper() {
  // No rail mode preference — respects user's current mode
  return <DoseResponseView />;
}

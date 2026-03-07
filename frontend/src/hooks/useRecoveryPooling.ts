/**
 * Canonical recovery-pooling decision. All components that include/exclude
 * recovery-arm subjects must use this hook to stay in sync with the user's
 * Study Details setting.
 */
import { useParams } from "react-router-dom";
import { useStudyMetadata } from "./useStudyMetadata";
import { useSessionState, isOneOf } from "./useSessionState";
import { RECOVERY_POOLING_VALUES } from "@/contexts/StudySettingsContext";

export function useRecoveryPooling() {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: meta } = useStudyMetadata(studyId ?? "");
  const hasRecovery = meta?.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;
  const [recoveryPooling] = useSessionState(
    `pcc.${studyId}.recoveryPooling`, "pool", isOneOf(RECOVERY_POOLING_VALUES),
  );
  const includeRecovery = hasRecovery && recoveryPooling === "pool";
  return { hasRecovery, includeRecovery };
}

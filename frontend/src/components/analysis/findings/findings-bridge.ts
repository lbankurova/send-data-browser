/**
 * Cross-component callback bus for FindingsView ↔ ShellRailPanel.
 *
 * Extracted into its own module so ShellRailPanel can import these
 * lightweight setters/getters without pulling in the entire FindingsView
 * module (and transitively echarts), keeping FindingsView in its own
 * lazy-loaded chunk.
 */

import type { GroupingMode } from "@/lib/findings-rail-engine";
import type { RailVisibleState } from "./FindingsRail";

export interface FindingsCallbackState {
  activeEndpoint?: string | null;
  /** Domain of the clicked rail entry (for multi-domain endpoints like MI + MA). */
  activeDomain?: string;
  activeGrouping?: GroupingMode;
  visibleEndpoints?: RailVisibleState;
  restoreEndpoint?: string;
}

let _findingsRailCallback: ((state: FindingsCallbackState) => void) | null = null;
let _findingsClearScopeCallback: (() => void) | null = null;
let _findingsExcludedCallback: ((excluded: ReadonlySet<string>) => void) | null = null;

export function setFindingsRailCallback(cb: typeof _findingsRailCallback) {
  _findingsRailCallback = cb;
}
export function getFindingsRailCallback() {
  return _findingsRailCallback;
}
export function setFindingsClearScopeCallback(cb: typeof _findingsClearScopeCallback) {
  _findingsClearScopeCallback = cb;
}
export function getFindingsClearScopeCallback() {
  return _findingsClearScopeCallback;
}
export function setFindingsExcludedCallback(cb: typeof _findingsExcludedCallback) {
  _findingsExcludedCallback = cb;
}
export function getFindingsExcludedCallback() {
  return _findingsExcludedCallback;
}

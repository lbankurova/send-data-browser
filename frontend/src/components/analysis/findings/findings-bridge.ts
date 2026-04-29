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

export interface FindingsSetScope {
  type: GroupingMode;
  value: string;
}

let _findingsRailCallback: ((state: FindingsCallbackState) => void) | null = null;
let _findingsClearScopeCallback: (() => void) | null = null;
let _findingsExcludedCallback: ((excluded: ReadonlySet<string>) => void) | null = null;
let _findingsSetScopeCallback: ((scope: FindingsSetScope) => void) | null = null;
let _findingsToggleDomainFilterCallback: ((domain: string) => void) | null = null;

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
/**
 * View → rail scope push (cross-scope navigation, F8). View calls this to
 * switch the rail's active group scope (e.g., organ → syndrome) when a
 * within-pane row is clicked.
 */
export function setFindingsSetScopeCallback(cb: typeof _findingsSetScopeCallback) {
  _findingsSetScopeCallback = cb;
}
export function getFindingsSetScopeCallback() {
  return _findingsSetScopeCallback;
}
/**
 * View → rail domain filter toggle. View calls this when the user clicks a
 * Domain row in DomainDoseRollup. Toggles the domain in the rail's domains
 * filter set (additive); calling with an already-set domain removes it.
 */
export function setFindingsToggleDomainFilterCallback(cb: typeof _findingsToggleDomainFilterCallback) {
  _findingsToggleDomainFilterCallback = cb;
}
export function getFindingsToggleDomainFilterCallback() {
  return _findingsToggleDomainFilterCallback;
}

// LEVEL-4-REPORT-ONLY: the curation dashboard is the admin-only surface
// for pending synonym candidates. Nothing rendered here is written to
// unified_findings.json; accepted mappings become level-2 aliases on
// the next regen, not level 4.
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAdminTerms, useAcceptSynonym, useRejectSynonym } from "@/hooks/useAdminTerms";
import {
  type CollisionReport,
  type PutSynonymError,
  type SynonymMappingBody,
  type UnrecognizedTermItem,
  applyCurationFilters,
  deriveOrganOptions,
  extractImpactRetry,
  getAdminToken,
  isAcceptDisabled,
  setAdminToken,
  syntheticItemFromCollision,
} from "@/lib/admin-terms-api";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/FilterBar";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { PaneTable } from "@/components/analysis/panes/PaneTable";
import { CurationTermRow } from "./CurationTermRow";
import { CrossStudyTermCollisions } from "./CrossStudyTermCollisions";

const DOMAIN_OPTIONS = [
  { value: "", label: "All domains" },
  { value: "MI", label: "MI" },
  { value: "MA", label: "MA" },
  { value: "CL", label: "CL" },
];

type AcceptDraft = {
  item: UnrecognizedTermItem;
  canonicalOverride: string | null;
  fromCollision?: CollisionReport;
};

export function CurationDashboard() {
  const [token, setTokenState] = useState<string | null>(getAdminToken());
  const [tokenDraft, setTokenDraft] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<string>("");
  const [organ, setOrgan] = useState<string>("");
  const [filterState, setFilterState] = useState<"pending" | "rejected" | "all">("pending");
  const [accept, setAccept] = useState<AcceptDraft | null>(null);
  const [reject, setReject] = useState<UnrecognizedTermItem | null>(null);

  const includeRejected = filterState !== "pending";
  const query = useAdminTerms(
    {
      domain: domain || undefined,
      organ_system: organ || undefined,
      include_rejected: includeRejected,
    },
    !!token,
  );
  const acceptMutation = useAcceptSynonym();
  const rejectMutation = useRejectSynonym();

  const allItems = useMemo(() => query.data?.items ?? [], [query.data]);
  const organOptions = useMemo(() => deriveOrganOptions(allItems), [allItems]);
  const items = useMemo(
    () => applyCurationFilters(allItems, { search, organ, state: filterState }),
    [allItems, search, organ, filterState],
  );

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <form
          className="flex w-80 flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-sm"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const trimmed = tokenDraft.trim();
            if (!trimmed) return;
            setAdminToken(trimmed);
            setTokenState(trimmed);
          }}
        >
          <div className="text-base font-semibold">Admin token required</div>
          <div className="text-xs text-muted-foreground">
            Enter the X-Admin-Token configured on the server. The token is
            stored in sessionStorage only.
          </div>
          <input
            type="password"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="token"
          />
          <button
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </div>
    );
  }

  if (query.isError) {
    const status = (query.error as Error & { status?: number })?.status;
    if (status === 503) {
      return (
        <div className="p-4 text-xs text-muted-foreground">
          Admin endpoints not configured. Ask the operator to set ADMIN_TOKEN.
        </div>
      );
    }
    return (
      <div className="p-4 text-xs text-destructive">
        Failed to load admin terms. Confirm the token is correct.
      </div>
    );
  }

  const collisionStudyIds = Array.from(
    new Set(items.flatMap((i) => i.seen_in_studies)),
  ).slice(0, 16);

  return (
    <div className="flex flex-1 flex-col">
      <FilterBar>
        <FilterSearch value={search} onChange={setSearch} placeholder="Find term…" />
        <FilterSelect value={domain} onChange={(e) => setDomain(e.target.value)}>
          {DOMAIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={organ} onChange={(e) => setOrgan(e.target.value)}>
          <option value="">All organs</option>
          {organOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filterState}
          onChange={(e) => setFilterState(e.target.value as typeof filterState)}
        >
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </FilterSelect>
        <div className="ml-auto text-[11px] text-muted-foreground">
          {query.data
            ? `${items.length} shown / ${query.data.items.length} total — dict ${query.data.dictionary_version}`
            : "…"}
        </div>
      </FilterBar>
      <div className="flex-1 overflow-auto">
        {query.isLoading && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {!query.isLoading && items.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No pending terms at current filters.
          </div>
        )}
        {items.length > 0 && (
          <PaneTable className="border-collapse">
            <thead>
              <tr className="sticky top-0 border-b border-border bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <PaneTable.Th style={{ width: 24 }} />
                <PaneTable.Th absorber className="px-2">Term</PaneTable.Th>
                <PaneTable.Th style={{ width: 60 }} className="px-2">Domain</PaneTable.Th>
                <PaneTable.Th style={{ width: 120 }} className="px-2">Organ</PaneTable.Th>
                <PaneTable.Th numeric style={{ width: 56 }} className="px-2">Freq</PaneTable.Th>
                <PaneTable.Th style={{ width: 220 }} className="px-2">Top candidate</PaneTable.Th>
                <PaneTable.Th style={{ width: 160 }} className="px-2">Warning</PaneTable.Th>
                <PaneTable.Th style={{ width: 140 }} className="px-2">Actions</PaneTable.Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <CurationTermRow
                  key={item.id}
                  item={item}
                  onAccept={(i, canonicalOverride) =>
                    setAccept({ item: i, canonicalOverride: canonicalOverride ?? null })
                  }
                  onReject={(i) => setReject(i)}
                />
              ))}
            </tbody>
          </PaneTable>
        )}
      </div>

      {query.data && query.data.total_studies >= 2 && (
        <div className="border-t border-border">
          <CollapsiblePane title="Cross-study collisions" defaultOpen={false} sessionKey="admin.xstudyCollisions">
            <CrossStudyTermCollisions
              studyIds={collisionStudyIds}
              onResolveAsSynonym={(collision) => {
                setAccept({
                  item: syntheticItemFromCollision(collision),
                  canonicalOverride: collision.term_b,
                  fromCollision: collision,
                });
              }}
            />
          </CollapsiblePane>
        </div>
      )}

      {accept && (
        <AcceptModal
          draft={accept}
          onClose={() => {
            setAccept(null);
            acceptMutation.reset();
          }}
          onSubmit={async (body, confirmImpact, forceSequential) => {
            try {
              await acceptMutation.mutateAsync({ body, confirmImpact, forceSequential });
              setAccept(null);
              acceptMutation.reset();
            } catch {
              // Error details live on the mutation state; modal re-renders.
            }
          }}
          pending={acceptMutation.isPending}
          error={acceptMutation.error as PutSynonymError | null}
        />
      )}
      {reject && (
        <RejectModal
          item={reject}
          onClose={() => setReject(null)}
          onSubmit={async (reason, by) => {
            try {
              await rejectMutation.mutateAsync({ id: reject.id, rejected_by: by, reason });
              setReject(null);
            } catch (e) {
              alert((e as Error).message);
            }
          }}
          pending={rejectMutation.isPending}
        />
      )}
    </div>
  );
}


function AcceptModal({
  draft,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  draft: AcceptDraft;
  onClose: () => void;
  onSubmit: (
    body: SynonymMappingBody,
    confirmImpact?: boolean,
    forceSequential?: boolean,
  ) => void;
  pending: boolean;
  error: PutSynonymError | null;
}) {
  const { item, canonicalOverride } = draft;
  const top = item.candidates[0];
  const [canonical, setCanonical] = useState(canonicalOverride ?? top?.canonical ?? "");
  const [addedBy, setAddedBy] = useState("");
  const [justification, setJustification] = useState("");
  const [homonymAcknowledged, setHomonymAcknowledged] = useState(false);
  const homonym = item.promotion_signal.homonym_flag;

  // AC-4.3: when the server returns 409 with error="impact_threshold_exceeded",
  // surface the impact count and enable a "Confirm anyway" button that
  // re-submits with X-Confirm-Impact: 1.
  const retry = useMemo(() => extractImpactRetry(error), [error]);
  const retryBody: SynonymMappingBody | null = retry
    ? {
        domain: item.domain,
        canonical: canonical.trim().toUpperCase(),
        alias: item.raw_term,
        organ_scope: item.organ_system ? [item.organ_system] : null,
        added_by: addedBy.trim(),
        source_justification: justification.trim(),
      }
    : null;

  // Other 409 errors (e.g., alias_already_mapped) surface as a simple banner.
  const aliasConflict =
    error?.status === 409 && error.detail?.error === "alias_already_mapped";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex w-[32rem] flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-lg">
        <div className="text-base font-semibold">Accept synonym mapping</div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{item.raw_term}</span> → <span className="font-mono">{canonical}</span>
          <span className="ml-1 text-[10px]">({item.domain} / {item.organ_system ?? "all organs"})</span>
        </div>
        {homonym && (
          <div className="rounded border border-amber-600 bg-amber-50 p-2 text-[11px] text-amber-700">
            <div className="font-semibold">Homonym risk: {item.promotion_signal.homonym_evidence}</div>
            <label className="mt-1 flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={homonymAcknowledged}
                onChange={(e) => setHomonymAcknowledged(e.target.checked)}
              />
              I have reviewed the divergence evidence
            </label>
          </div>
        )}
        {aliasConflict && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            Alias already mapped to <span className="font-mono">{String(error?.detail?.existing_canonical ?? "")}</span>.
          </div>
        )}
        {retry && (
          <div className="rounded border border-amber-600 bg-amber-50 p-2 text-[11px] text-amber-700">
            <div className="font-semibold">Impact preview: {retry.impactCount} findings affected</div>
            <div className="mt-0.5">
              This exceeds the impact threshold. Review carefully before confirming.
            </div>
          </div>
        )}
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Canonical</span>
          <input
            className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Your name / identifier</span>
          <input
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={addedBy}
            onChange={(e) => setAddedBy(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Source justification (required)</span>
          <textarea
            className="min-h-[60px] rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          {retry && retryBody ? (
            <button
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              onClick={() => onSubmit(retryBody, true, false)}
              disabled={pending}
            >
              {pending ? "Submitting…" : "Confirm anyway"}
            </button>
          ) : (
            <button
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={() =>
                onSubmit(
                  {
                    domain: item.domain,
                    canonical: canonical.trim().toUpperCase(),
                    alias: item.raw_term,
                    organ_scope: item.organ_system ? [item.organ_system] : null,
                    added_by: addedBy.trim(),
                    source_justification: justification.trim(),
                  },
                  false,
                  false,
                )
              }
              disabled={isAcceptDisabled({
                pending,
                canonical,
                addedBy,
                justification,
                homonym,
                homonymAcknowledged,
              })}
            >
              {pending ? "Submitting…" : "Accept"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function RejectModal({
  item,
  onClose,
  onSubmit,
  pending,
}: {
  item: UnrecognizedTermItem;
  onClose: () => void;
  onSubmit: (reason: string, by: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [by, setBy] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex w-[28rem] flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-lg">
        <div className="text-base font-semibold">Reject term</div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{item.raw_term}</span> ({item.domain})
        </div>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Your name / identifier</span>
          <input
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={by}
            onChange={(e) => setBy(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">Reason (required)</span>
          <textarea
            className="min-h-[60px] rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            onClick={() => onSubmit(reason.trim(), by.trim())}
            disabled={pending || !reason.trim() || !by.trim()}
          >
            {pending ? "Submitting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

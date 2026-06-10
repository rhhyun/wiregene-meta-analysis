"use client";

import { AlertCircle, CheckCircle2, LibraryBig } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncState =
  | { status: "success"; title: string; detail: string }
  | { status: "error"; title: string; detail: string; action: string };

type ZoteroSyncPayload = {
  code?: string;
  error?: string;
  created?: number;
  skipped?: number;
  ignoredNonPapers?: number;
  collections?: number;
  details?: {
    missing?: string[];
    invalid?: string[];
  };
};

function toZoteroError(payload: ZoteroSyncPayload | undefined): SyncState {
  const message = payload?.error?.trim() || "Zotero sync failed.";

  if (payload?.code === "ZOTERO_NOT_CONFIGURED") {
    const missing = payload.details?.missing?.join(", ");
    return {
      status: "error",
      title: "Zotero is not configured",
      detail: missing ? `${message} Missing: ${missing}.` : message,
      action: "Set ZOTERO_API_KEY and ZOTERO_LIBRARY_ID in .env.local, then restart the local server.",
    };
  }

  if (
    payload?.code === "ZOTERO_COLLECTIONS_LOOKUP_FAILED" ||
    payload?.code === "ZOTERO_COLLECTION_CREATE_FAILED" ||
    payload?.code === "ZOTERO_ITEM_SYNC_FAILED"
  ) {
    return {
      status: "error",
      title: "Zotero rejected the sync request",
      detail: message,
      action: "Check the Zotero API key permissions, library type, library ID, and collection settings.",
    };
  }

  return {
    status: "error",
    title: "Zotero sync failed",
    detail: message,
    action: "Check the report paper items and Zotero environment variables, then try again.",
  };
}

export function ZoteroSyncButton({ reportId, paperCount }: { reportId: string; paperCount: number }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [state, setState] = useState<SyncState | null>(null);

  async function sync() {
    setIsSyncing(true);
    setState(null);
    try {
      const response = await fetch(`/api/reports/${reportId}/zotero`, { method: "POST" });
      const payload = (await response.json()) as ZoteroSyncPayload;

      if (!response.ok) {
        setState(toZoteroError(payload));
        return;
      }

      setState({
        status: "success",
        title: "Zotero sync complete",
        detail: `${payload.created ?? 0} paper items created, ${payload.skipped ?? 0} paper items skipped, ${payload.ignoredNonPapers ?? 0} non-paper items ignored, ${payload.collections ?? 0} topic collections used.`,
      });
      router.refresh();
    } catch (error) {
      setState(toZoteroError({ error: (error as Error).message }));
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={isSyncing || paperCount === 0}
        title="Add paper items only to Zotero"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        <LibraryBig className="h-4 w-4" aria-hidden />
        {isSyncing ? "Syncing..." : "Sync Papers to Zotero"}
      </button>
      {state ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm ${
            state.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-2">
            {state.status === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div>
              <p className="font-semibold">{state.title}</p>
              <p className="mt-1 leading-5">{state.detail}</p>
              {state.status === "error" ? (
                <p className="mt-1 leading-5 text-rose-800">{state.action}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

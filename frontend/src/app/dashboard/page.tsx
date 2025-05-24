"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSupabase } from "@/app/supabase-provider";
import PdfUploader from "@/components/documents/PdfUploader";
import { MoreVertical, Trash, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardDocument {
  document_db_id: string;
  original_file_name: string;
  status: string;
  summary_short?: string | null;
  key_findings?: string[] | null;
  error_message?: string | null;
  created_at?: string;
  isPolling?: boolean;
  pollingAttempts?: number;
}

const POLLING_INTERVAL = 5000;
const MAX_POLLING_ATTEMPTS = 24;

export default function DashboardPage() {
  const { session, supabase } = useSupabase();
  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  const [isLoadingInitialDocs, setIsLoadingInitialDocs] = useState(true);
  const [initialDocsError, setInitialDocsError] = useState<string | null>(null);
  const [freeUses, setFreeUses] = useState<number | null>(null);

  // Actions & Modal states
  const [showActionsIdx, setShowActionsIdx] = useState<number | null>(null);
  const [showRenameModalIdx, setShowRenameModalIdx] = useState<number | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showDeleteModalIdx, setShowDeleteModalIdx] = useState<number | null>(
    null
  );

  // Function to refresh free uses from database
  const refreshFreeUses = useCallback(async () => {
    if (!supabase || !session) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("free_uses")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!error && data) {
        setFreeUses(data.free_uses ?? 0);
      } else {
        setFreeUses(0);
      }
    } catch (error) {
      console.error("Error fetching free uses:", error);
      setFreeUses(0);
    }
  }, [session, supabase]);

  // --- Initial fetch
  useEffect(() => {
    if (supabase && session && isLoadingInitialDocs) {
      const fetchUserDocuments = async () => {
        try {
          const { data: userDocuments, error: docError } = await supabase
            .from("documents")
            .select("*")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false });
          if (docError) throw docError;

          const enrichedDocuments: DashboardDocument[] = await Promise.all(
            userDocuments.map(async (doc: any) => {
              let summary: string | null = null;
              if (doc.processing_status === "completed") {
                const { data: analysisData } = await supabase
                  .from("document_analyses")
                  .select("summary_short, key_findings")
                  .eq("document_id", doc.id)
                  .maybeSingle();
                summary = analysisData?.summary_short || null;
              }
              const needsPolling =
                doc.processing_status !== "completed" &&
                doc.processing_status !== "failed" &&
                doc.processing_status !== "error" && // Custom client error state
                doc.processing_status !== "timeout"; // Custom client timeout state

              return {
                document_db_id: doc.id,
                original_file_name: doc.file_name,
                status: doc.processing_status || "unknown",
                summary_short: summary,
                key_findings: null, // Populate this later
                error_message: doc.error_message,
                created_at: doc.created_at,
                isPolling: needsPolling,
                pollingAttempts: 0,
              };
            })
          );
          setDocuments(enrichedDocuments);
        } catch (error) {
          setInitialDocsError(
            "Failed to load your documents. Please try again."
          );
        } finally {
          setIsLoadingInitialDocs(false);
        }
      };
      fetchUserDocuments();
    }
  }, [session, supabase, isLoadingInitialDocs]);

  // --- Polling logic for "processing" documents ---
  const fetchAnalysisStatus = useCallback(
    async (docDbId: string, originalFileName: string) => {
      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL ||
          "http://127.0.0.1:8000";
        const response = await fetch(
          `${backendUrl}/analysis-status/${docDbId}`
        );
        if (!response.ok) return;
        const result = await response.json();
        
        // Check if document just completed processing
        const currentDoc = documents.find(d => d.document_db_id === docDbId);
        const wasProcessing = currentDoc?.status && !["completed", "failed", "error", "timeout"].includes(currentDoc.status);
        const isNowCompleted = result.status === "completed";
        
        setDocuments((prevDocs) =>
          prevDocs.map((d) =>
            d.document_db_id === docDbId
              ? {
                  ...d,
                  status: result.status,
                  summary_short: result.summary_short,
                  key_findings: result.key_findings,
                  error_message: result.error_message,
                  isPolling:
                    !["completed", "failed", "error", "timeout"].includes(
                      result.status
                    ) && (d.pollingAttempts || 0) < MAX_POLLING_ATTEMPTS,
                  pollingAttempts: (d.pollingAttempts || 0) + 1,
                }
              : d
          )
        );

        // If document just completed processing, refresh free uses
        if (wasProcessing && isNowCompleted) {
          await refreshFreeUses();
        }
      } catch (error) {
        // Optionally handle error
      }
    },
    [documents, refreshFreeUses]
  );

  useEffect(() => {
    const documentsToPoll = documents.filter(
      (doc) =>
        doc.isPolling &&
        !["completed", "failed", "error", "timeout"].includes(doc.status) &&
        (doc.pollingAttempts || 0) < MAX_POLLING_ATTEMPTS
    );

    if (documentsToPoll.length === 0) return;

    const intervalId = setInterval(() => {
      documentsToPoll.forEach((doc) => {
        fetchAnalysisStatus(doc.document_db_id, doc.original_file_name);
      });
    }, POLLING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [documents, fetchAnalysisStatus]);

  // Handler for processing start
  const handleProcessingStart = (data: any) => {
    const newDocument: DashboardDocument = {
      document_db_id: data.document_db_id,
      original_file_name: data.file_name,
      status: "uploaded",
      summary_short: null,
      key_findings: null,
      error_message: null,
      created_at: new Date().toISOString(),
      isPolling: true,
      pollingAttempts: 0,
    };
    setDocuments((prevDocs) => [newDocument, ...prevDocs]);
  };

  // Handler for upload success (called immediately after upload)
  const handleUploadSuccess = useCallback(() => {
    // Immediately decrement free uses optimistically
    setFreeUses(prev => prev !== null ? Math.max(0, prev - 1) : null);
    
    // Also refresh from database to ensure accuracy
    setTimeout(() => {
      refreshFreeUses();
    }, 1000);
  }, [refreshFreeUses]);

  // Quick actions: Rename
  const handleRename = async (idx: number) => {
    const doc = documents[idx];
    if (!renameValue.trim()) return;
    try {
      setShowRenameModalIdx(null);
      setNotification(null);
      const backendUrl =
        process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${backendUrl}/rename-document/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.document_db_id,
          new_name: renameValue,
          user_id: session?.user?.id,
        }),
      });
      if (!res.ok) throw new Error("Failed to rename document");
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === idx ? { ...d, original_file_name: renameValue } : d
        )
      );
      setNotification({ type: "success", message: "Document renamed!" });
    } catch {
      setNotification({ type: "error", message: "Rename failed." });
    }
  };

  // Quick actions: Delete
  const handleDelete = async (idx: number) => {
    const doc = documents[idx];
    setShowDeleteModalIdx(null);
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${backendUrl}/delete-document/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.document_db_id,
          user_id: session?.user.id,
        }),
      });
      if (!res.ok) throw new Error("Failed to delete document");
      setDocuments((prev) => prev.filter((_, i) => i !== idx));
      setNotification({ type: "success", message: "Document deleted!" });
    } catch {
      setNotification({ type: "error", message: "Delete failed." });
    }
  };

  // Initial fetch of free uses
  useEffect(() => {
    refreshFreeUses();
  }, [refreshFreeUses]);

  const NotificationCenter = () => (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          className="fixed left-1/2 top-6 z-[9999] -translate-x-1/2 px-6 py-4 rounded-2xl shadow-xl font-medium
            text-center text-white
            bg-success"
          style={{
            background:
              notification.type === "success"
                ? "linear-gradient(90deg,#22c55e 0%,#16a34a 100%)"
                : "linear-gradient(90deg,#ef4444 0%,#b91c1c 100%)",
          }}
        >
          {notification.message}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // --- Main render ---
  return (
    <>
      <div className="relative min-h-screen flex flex-col">
        <div className="container mx-auto p-4 md:p-8 flex-1 w-full z-10">
          <NotificationCenter />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-7 mt-5">
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary">
              Your Dashboard
            </h1>
          </div>

          {/* Usage Notification */}
          {freeUses !== null && (
            <div
              className={`
          relative w-fit items-center justify-center left-1/2 transform -translate-x-1/2 z-50 
          px-6 py-3 rounded-lg shadow-lg transition my-7 backdrop-blur-lg
          ${
            freeUses < 2
              ? "bg-accent-primary/90 text-black dark:text-white"
              : "bg-red-600/90 text-white"
          }
        `}
            >
              {freeUses < 2
                ? `You have ${2 - freeUses} free analyses remaining.`
                : "You've reached your free limit. Contact us for more access."}
            </div>
          )}

          <div className="mb-12">
            <PdfUploader
              onProcessingStart={handleProcessingStart}
              disableUpload={freeUses !== null && freeUses >= 2}
            />
          </div>
          {initialDocsError && (
            <div className="my-6 p-4 text-error bg-error/10 border border-error/30 rounded-lg">
              <strong>Error loading documents:</strong> {initialDocsError}
            </div>
          )}

          {/* Modals for Rename/Delete */}
          <AnimatePresence>
            {showRenameModalIdx !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.97 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.97 }}
                  className="bg-surface rounded-3xl p-8 shadow-2xl w-full max-w-sm"
                >
                  <h2 className="font-bold text-xl mb-4">Rename Document</h2>
                  <input
                    className="w-full p-3 rounded-xl border border-text-secondary/20 bg-surface-alt text-text-primary mb-4"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="New document name"
                  />
                  <div className="flex gap-4 justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setShowRenameModalIdx(null)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => handleRename(showRenameModalIdx!)}>
                      Save
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            {showDeleteModalIdx !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.97 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.97 }}
                  className="bg-surface rounded-3xl p-8 shadow-2xl w-full max-w-sm"
                >
                  <h2 className="font-bold text-xl mb-4">Delete Document</h2>
                  <p className="mb-4 text-text-secondary">
                    Are you sure you want to delete this document?
                  </p>
                  <div className="flex gap-4 justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setShowDeleteModalIdx(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(showDeleteModalIdx!)}
                    >
                      Delete
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cards in 2 columns on md+, 1 column on small */}
          {documents.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-semibold text-text-primary mb-6">
                My Documents
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {documents.map((doc, idx) => (
                  <motion.div
                    key={doc.document_db_id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.04 * idx,
                      duration: 0.33,
                      type: "spring",
                    }}
                    className="relative bg-gradient-to-br from-surface via-surface-alt to-surface-alt rounded-2xl shadow-xl border border-surface-alt hover:shadow-2xl hover:border-accent-primary hover:scale-[1.03] transition-all duration-300 cursor-pointer
                  flex flex-col min-h-[220px]"
                  >
                    {/* Actions menu */}
                    <div className="absolute right-4 top-4 z-10">
                      <div className="relative">
                        <button
                          className="p-2 rounded-full hover:bg-accent-primary/10 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowActionsIdx(
                              idx === showActionsIdx ? null : idx
                            );
                          }}
                          aria-label="Document actions"
                        >
                          <MoreVertical size={20} />
                        </button>
                        <AnimatePresence>
                          {showActionsIdx === idx && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.97, y: 8 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.97, y: 8 }}
                              className="absolute right-0 mt-2 bg-surface-alt rounded-xl shadow-lg border border-text-secondary/10 min-w-[140px] py-1 z-20"
                            >
                              <button
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent-primary/10 transition text-text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowRenameModalIdx(idx);
                                  setRenameValue(doc.original_file_name);
                                  setShowActionsIdx(null);
                                }}
                              >
                                <Pencil size={15} /> Rename
                              </button>
                              <button
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-error/10 transition text-error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDeleteModalIdx(idx);
                                  setShowActionsIdx(null);
                                }}
                              >
                                <Trash size={15} /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    {/* Card body */}
                    <Link
                      href={`/dashboard/document/${doc.document_db_id}`}
                      className="block p-6 pt-12 h-full"
                    >
                      <div className="flex flex-col h-full">
                        <h3
                          className="text-xl font-semibold text-accent-primary truncate"
                          title={doc.original_file_name || doc.document_db_id}
                        >
                          {doc.original_file_name || doc.document_db_id}
                        </h3>
                        <p className="text-xs text-text-secondary mb-1">
                          Uploaded:{" "}
                          {doc.created_at
                            ? new Date(doc.created_at).toLocaleString()
                            : "N/A"}
                        </p>
                        <span
                          className={`mt-1 px-3 py-1 text-xs font-bold rounded-full border w-fit
                          ${
                            doc.status === "completed"
                              ? "text-success bg-success/10 border-success/40"
                              : doc.status === "failed" ||
                                doc.status === "error" ||
                                doc.status === "timeout"
                              ? "text-error bg-error/10 border-error/40"
                              : "text-accent-primary bg-accent-primary/10 border-accent-primary/20 animate-pulse"
                          }`}
                        >
                          {doc.status
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (l) => l.toUpperCase())}
                          {doc.isPolling &&
                            ![
                              "completed",
                              "failed",
                              "error",
                              "timeout",
                            ].includes(doc.status) &&
                            "..."}
                        </span>
                        {doc.summary_short && (
                          <div className="mt-4 max-h-[120px] overflow-y-auto custom-scrollbar text-sm text-text-primary leading-relaxed prose prose-invert bg-surface-alt p-2 rounded-lg">
                            {doc.summary_short}
                          </div>
                        )}
                        {doc.error_message && (
                          <div className="mt-3 text-sm text-error bg-error/10 p-3 rounded-md border border-error/30">
                            <strong>Error:</strong> {doc.error_message}
                          </div>
                        )}
                        <div className="mt-3 text-right">
                          <span className="text-xs text-accent-primary hover:text-accent-secondary font-semibold">
                            View Details & Chat →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          {documents.length === 0 &&
            !isLoadingInitialDocs &&
            !initialDocsError && (
              <div className="text-center text-text-secondary mt-12 py-16 border-2 border-dashed border-surface-alt rounded-xl bg-surface shadow">
                <svg
                  className="mx-auto h-16 w-16 text-accent-primary/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-text-primary">
                  No documents uploaded yet
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Get started by uploading a PDF for analysis using the form
                  above.
                </p>
              </div>
            )}
        </div>
        {/* Light & Dark gradients, on lowest layer */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 60% 42%, var(--gradient-hero-start, #eceafe) 0%, var(--gradient-hero-end, #f8f9fb) 100%)",
          }}
        />
        <div
          className="absolute inset-0 z-0 pointer-events-none dark:block hidden"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 60% 42%, var(--gradient-hero-start-dark, #2c256f) 0%, var(--gradient-hero-end-dark, #10111a) 100%)",
          }}
        />
      </div>
    </>
  );
}
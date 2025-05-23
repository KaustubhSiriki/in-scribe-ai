"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/app/supabase-provider";
import PdfUploader from "@/components/documents/PdfUploader";
import { SupabaseClient, Session, PostgrestError } from "@supabase/supabase-js"; // Import types

// Matches ProcessInitiationResponse from backend
interface ProcessInitiationResponse {
  document_db_id: string;
  message: string;
  file_name: string;
  num_pages: number;
}

// Matches AnalysisResultResponse from backend for status polling
interface AnalysisPollResult {
  document_db_id: string;
  status: string;
  summary_short?: string | null;
  key_findings?: string[] | null;
  error_message?: string | null;
  original_file_name?: string; // Added by frontend for display
}

// Represents a document as stored in or retrieved from Supabase 'documents' table
interface DocumentFromDB {
  id: string; // This is document_db_id
  user_id: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  processing_status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Represents an analysis as stored in or retrieved from Supabase 'document_analyses' table
interface AnalysisFromDB {
  id: string;
  document_id: string;
  user_id: string;
  llm_model_used: string | null;
  summary_short: string | null;
  key_findings: any | null; // JSONB, can be array of strings or objects
  qna_ready: boolean;
  created_at: string;
}

// Extended state for documents on the dashboard
interface DashboardDocument {
  document_db_id: string; // from documents.id
  original_file_name: string; // from documents.file_name
  status: string; // from documents.processing_status or derived from polling
  summary_short?: string | null; // from document_analyses.summary_short
  key_findings?: string[] | null; // from document_analyses.key_findings (simplified)
  error_message?: string | null; // from documents.error_message or polling
  created_at?: string; // from documents.created_at
  isPolling?: boolean;
  pollingAttempts?: number;
}

const POLLING_INTERVAL = 5000;
const MAX_POLLING_ATTEMPTS = 24;

export default function DashboardPage() {
  const { session, supabase } = useSupabase() as {
    session: Session | null;
    supabase: SupabaseClient | null;
  };
  const router = useRouter();

  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  const [isLoadingInitialDocs, setIsLoadingInitialDocs] = useState(true);
  const [initialDocsError, setInitialDocsError] = useState<string | null>(null);

  // --- Effect for Initial Document Fetch ---
  useEffect(() => {
    console.log(
      "DashboardPage: Auth check & Initial Docs Fetch effect running. Session:",
      session ? "Exists" : "Null",
      "Supabase:",
      supabase ? "Exists" : "Null",
      "LoadingInitial:",
      isLoadingInitialDocs
    );

    if (supabase && !session && !isLoadingInitialDocs) {
      console.log(
        "DashboardPage: No session after initial load attempt, redirecting to /auth"
      );
      router.push("/auth");
      return; // Exit effect early
    }

    if (session && supabase && isLoadingInitialDocs) {
      console.log(
        "DashboardPage: Session available, fetching initial documents from Supabase."
      );

      const fetchUserDocuments = async () => {
        try {
          // Fetch documents for the current user, ordered by creation date
          const { data: userDocuments, error: docError } = await supabase
            .from("documents")
            .select("*") // Select all columns from documents table
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false });

          if (docError) {
            console.error("DashboardPage: Error fetching documents:", docError);
            setInitialDocsError(
              "Failed to load your documents. Please try again."
            );
            throw docError; // Propagate error to stop further processing in this try block
          }

          if (userDocuments) {
            console.log(
              "DashboardPage: Fetched documents from DB:",
              userDocuments
            );
            // Now, for each completed document, try to fetch its analysis
            const enrichedDocuments: DashboardDocument[] = await Promise.all(
              userDocuments.map(async (doc: DocumentFromDB) => {
                let summary: string | null = null;
                // let findings: string[] | null = null; // For later
                let analysisErrorMessage: string | null = null;

                if (doc.processing_status === "completed") {
                  const { data: analysisData, error: analysisError } =
                    await supabase
                      .from("document_analyses")
                      .select("summary_short, key_findings") // Add other fields as needed
                      .eq("document_id", doc.id)
                      .maybeSingle(); // Expect at most one analysis per document

                  if (analysisError) {
                    console.error(
                      `DashboardPage: Error fetching analysis for doc ${doc.id}:`,
                      analysisError
                    );
                    analysisErrorMessage = "Could not load analysis details.";
                  }
                  if (analysisData) {
                    summary = analysisData.summary_short;
                    // findings = analysisData.key_findings; // Process this if it's structured
                  }
                }

                // Determine if polling is needed for this existing document
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
                  error_message: doc.error_message || analysisErrorMessage,
                  created_at: doc.created_at,
                  isPolling: needsPolling,
                  pollingAttempts: 0, // Start fresh for polling on load if needed
                };
              })
            );
            setDocuments(enrichedDocuments);
            console.log(
              "DashboardPage: Initial documents state set with enriched data:",
              enrichedDocuments
            );
          } else {
            setDocuments([]); // No documents found for the user
          }
        } catch (error) {
          // Error already logged, state set by setInitialDocsError
          console.error(
            "DashboardPage: Catch all for fetchUserDocuments",
            error
          );
        } finally {
          setIsLoadingInitialDocs(false);
          console.log("DashboardPage: Initial documents loading finished.");
        }
      };

      fetchUserDocuments();
    } else if (!supabase && isLoadingInitialDocs) {
      // Still waiting for supabase client to be available from context
      console.log(
        "DashboardPage: Supabase client not yet available, cannot fetch initial docs."
      );
    }
  }, [session, router, supabase, isLoadingInitialDocs]); // Removed 'documents' from here to avoid loop on setDocuments

  // --- Polling Logic (fetchAnalysisStatus, handleProcessingStart, polling useEffect) ---
  // (This logic remains largely the same as the previous version)
  const fetchAnalysisStatus = useCallback(
    async (docDbId: string, originalFileName: string) => {
      console.log(
        `DashboardPage: fetchAnalysisStatus called for doc ID: ${docDbId} (${originalFileName})`
      );
      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL ||
          "http://127.0.0.1:8000";
        const response = await fetch(
          `${backendUrl}/analysis-status/${docDbId}`
        );

        if (!response.ok) {
          console.error(
            `DashboardPage: Error fetching status for ${docDbId}: ${response.status}`
          );
          const errorDetail =
            response.status === 404
              ? "Document not found on backend."
              : `Server error ${response.status}`;
          setDocuments((prevDocs) =>
            prevDocs.map((d) =>
              d.document_db_id === docDbId
                ? {
                    ...d,
                    status: "error",
                    error_message: errorDetail,
                    isPolling: false,
                  }
                : d
            )
          );
          return;
        }

        const result: AnalysisPollResult = await response.json(); // Use AnalysisPollResult type
        result.original_file_name = originalFileName;
        console.log(`DashboardPage: Received status for ${docDbId}:`, result);

        setDocuments((prevDocs) =>
          prevDocs.map((d) =>
            d.document_db_id === docDbId
              ? {
                  ...d, // Spread existing doc to keep created_at etc.
                  status: result.status, // Update status
                  summary_short: result.summary_short, // Update summary
                  key_findings: result.key_findings, // Update findings
                  error_message: result.error_message, // Update error
                  isPolling:
                    result.status !== "completed" &&
                    result.status !== "failed" &&
                    result.status !== "error",
                  pollingAttempts: (d.pollingAttempts || 0) + 1,
                }
              : d
          )
        );
      } catch (error) {
        console.error(
          `DashboardPage: Polling fetch failed for ${docDbId}:`,
          error
        );
        setDocuments((prevDocs) =>
          prevDocs.map((d) =>
            d.document_db_id === docDbId
              ? {
                  ...d,
                  status: "error",
                  error_message: "Polling network error.",
                  isPolling: false,
                }
              : d
          )
        );
      }
    },
    []
  );

  const handleProcessingStart = (data: ProcessInitiationResponse) => {
    console.log(
      "DashboardPage: handleProcessingStart triggered with data:",
      data
    );

    const newDocument: DashboardDocument = {
      document_db_id: data.document_db_id,
      original_file_name: data.file_name,
      status: "uploaded", // Initial status from backend's perspective
      summary_short: null,
      key_findings: null,
      error_message: null,
      created_at: new Date().toISOString(), // Set current time for new uploads
      isPolling: true,
      pollingAttempts: 0,
    };

    setDocuments((prevDocs) => [newDocument, ...prevDocs]);
    console.log(
      "DashboardPage: New document added to state. Initiating first status fetch for:",
      newDocument.document_db_id
    );
    fetchAnalysisStatus(data.document_db_id, data.file_name);
  };

  useEffect(() => {
    const documentsToPoll = documents.filter(
      (doc) =>
        doc.isPolling &&
        doc.status !== "completed" &&
        doc.status !== "failed" &&
        doc.status !== "error" &&
        (doc.pollingAttempts || 0) < MAX_POLLING_ATTEMPTS
    );

    if (documentsToPoll.length === 0) {
      return;
    }

    console.log(
      `DashboardPage: Polling useEffect - Setting up interval for ${documentsToPoll.length} document(s).`
    );
    const intervalId = setInterval(() => {
      const now = new Date().toLocaleTimeString();
      // console.log(`DashboardPage: Polling interval fired at ${now}. Polling ${documentsToPoll.length} docs.`);
      documentsToPoll.forEach((doc) => {
        // Fetch a fresh copy of the document from state within the interval to ensure conditions are current
        const currentDocState = documents.find(
          (d) => d.document_db_id === doc.document_db_id
        );
        if (
          currentDocState &&
          currentDocState.isPolling &&
          currentDocState.status !== "completed" &&
          currentDocState.status !== "failed" &&
          currentDocState.status !== "error" &&
          (currentDocState.pollingAttempts || 0) < MAX_POLLING_ATTEMPTS
        ) {
          // console.log(`DashboardPage: Interval - Fetching status for ${doc.document_db_id}`);
          fetchAnalysisStatus(doc.document_db_id, doc.original_file_name!);
        } else if (
          currentDocState &&
          currentDocState.isPolling &&
          (currentDocState.pollingAttempts || 0) >= MAX_POLLING_ATTEMPTS
        ) {
          console.warn(
            `DashboardPage: Interval - Max polling attempts reached for ${doc.document_db_id}. Stopping.`
          );
          setDocuments((prevDocs) =>
            prevDocs.map((d) =>
              d.document_db_id === doc.document_db_id
                ? {
                    ...d,
                    isPolling: false,
                    status: "timeout",
                    error_message: "Polling timed out.",
                  }
                : d
            )
          );
        }
      });
    }, POLLING_INTERVAL);

    return () => {
      console.log("DashboardPage: Polling useEffect - Clearing interval.");
      clearInterval(intervalId);
    };
  }, [documents, fetchAnalysisStatus]);

  // --- Loading and Auth Checks ---
  if (!supabase) {
    console.log("DashboardPage: Render - Supabase client not ready.");
    return (
      <div className="flex justify-center items-center min-h-screen">
        Initializing application...
      </div>
    );
  }
  if (!session && !isLoadingInitialDocs) {
    console.log(
      "DashboardPage: Render - No session, should be redirecting by effect."
    );
    return (
      <div className="flex justify-center items-center min-h-screen">
        Redirecting to login...
      </div>
    );
  }
  if (isLoadingInitialDocs) {
    // Covers both !session && isLoading, and session && isLoading
    console.log(
      "DashboardPage: Render - Loading initial documents / checking session."
    );
    return (
      <div className="flex justify-center items-center min-h-screen">
        Loading dashboard data...
      </div>
    );
  }
  // If here: supabase and session are loaded, and initial docs loading is complete.

  const getStatusColor = (status: string) => {
    if (status === "completed")
      return "text-green-700 bg-green-100 border-green-300";
    if (status === "failed" || status === "error" || status === "timeout")
      return "text-red-700 bg-red-100 border-red-300";
    if (
      status === "analyzing" ||
      status === "parsing" ||
      status === "uploaded" ||
      status === "pending_upload"
    )
      return "text-blue-700 bg-blue-100 border-blue-300 animate-pulse";
    return "text-gray-700 bg-gray-100 border-gray-300";
  };

  // --- Render JSX ---
  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800">
          Your Dashboard
        </h1>
      </div>

      <div className="mb-12">
        <PdfUploader onProcessingStart={handleProcessingStart} />
      </div>

      {initialDocsError && (
        <div className="my-6 p-4 text-red-700 bg-red-100 border border-red-300 rounded-lg">
          <strong>Error loading documents:</strong> {initialDocsError}
        </div>
      )}

      {documents.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-700 mb-6">
            My Documents
          </h2>
          <div className="space-y-6">
            {documents.map((doc) => (
              <Link
                href={`/dashboard/document/${doc.document_db_id}`}
                key={doc.document_db_id}
                className="block bg-white p-6 rounded-xl shadow-lg border border-gray-200 hover:shadow-2xl hover:border-indigo-300 transition-all duration-300 ease-in-out cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                  <h3
                    className="text-xl font-semibold text-indigo-700 mb-2 sm:mb-0 truncate"
                    title={doc.original_file_name || doc.document_db_id}
                  >
                    {doc.original_file_name || doc.document_db_id}
                  </h3>
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full border ${getStatusColor(
                      doc.status
                    )}`}
                  >
                    {doc.status
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                    {doc.isPolling &&
                      doc.status !== "completed" &&
                      doc.status !== "failed" &&
                      doc.status !== "error" &&
                      doc.status !== "timeout" &&
                      "..."}
                  </span>
                </div>
                {doc.created_at && (
                  <p className="text-xs text-gray-500 mb-2">
                    Uploaded: {new Date(doc.created_at).toLocaleString()}
                  </p>
                )}

                {doc.status === "completed" && doc.summary_short && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wider">
                      Summary:
                    </h4>
                    <p className="text-sm text-gray-800 bg-indigo-50 p-4 rounded-md max-h-48 overflow-y-auto leading-relaxed prose prose-sm">
                      {doc.summary_short}
                    </p>
                  </div>
                )}

                {doc.error_message && (
                  <div className="mt-3 text-sm text-red-800 bg-red-100 p-3 rounded-md border border-red-200">
                    <strong>Error:</strong> {doc.error_message}
                  </div>
                )}

                {doc.status !== "completed" &&
                  doc.status !== "failed" &&
                  doc.status !== "error" &&
                  doc.status !== "timeout" &&
                  !doc.isPolling &&
                  doc.document_db_id && (
                    <button
                      onClick={() => {
                        console.log(
                          `DashboardPage: Manually refreshing status for ${doc.document_db_id}`
                        );
                        setDocuments((prev) =>
                          prev.map((d) =>
                            d.document_db_id === doc.document_db_id
                              ? {
                                  ...d,
                                  isPolling: true,
                                  pollingAttempts: 0,
                                  status: "refreshing",
                                }
                              : d
                          )
                        );
                        fetchAnalysisStatus(
                          doc.document_db_id,
                          doc.original_file_name!
                        );
                      }}
                      className="mt-4 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1 px-3 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      Refresh Status
                    </button>
                  )}
                <div className="mt-4 text-right">
                  <span className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">
                    View Details & Chat →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {documents.length === 0 && !isLoadingInitialDocs && !initialDocsError && (
        <div className="text-center text-gray-500 mt-12 py-16 border-2 border-dashed border-gray-300 rounded-xl bg-white shadow">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
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
          <h3 className="mt-4 text-lg font-medium text-gray-800">
            No documents uploaded yet
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Get started by uploading a PDF for analysis using the form above.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSupabase } from "@/app/supabase-provider";
import { SupabaseClient, Session } from "@supabase/supabase-js";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

// Matches AnalysisStatusResponse from backend for initial load
interface DocumentAnalysisDetails {
  document_db_id: string;
  original_file_name?: string; // Will fetch this from 'documents' table
  status: string;
  summary_short?: string | null;
  key_findings?: string[] | null; // For future display
  error_message?: string | null;
  qna_ready: boolean;
  created_at?: string; // From 'documents' table
}

interface ChatMessage {
  id: string; // Unique ID for each message
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  relevant_chunks_preview?: string[] | null; // For AI messages from RAG
}

// Matches QueryResponse from backend
interface QueryServiceResponse {
  answer: string;
  relevant_chunks_preview?: string[] | null;
  error?: string | null;
}

export default function DocumentDetailPage() {
  const { session, supabase } = useSupabase() as {
    session: Session | null;
    supabase: SupabaseClient | null;
  };
  const router = useRouter();
  const params = useParams(); // Hook to get dynamic route parameters
  const docId = params.docId as string; // docId from the URL segment

  const [documentDetails, setDocumentDetails] =
    useState<DocumentAnalysisDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null); // For auto-scrolling chat

  // --- Fetch Initial Document Details and Analysis ---
  useEffect(() => {
    if (!supabase || !session) {
      // If supabase client not ready or no session, redirect (or handle appropriately)
      // This check might be redundant if layout/provider handles it, but good for direct navigation
      if (supabase && !session) router.push("/auth");
      return;
    }
    if (!docId) {
      setErrorDetails("Document ID is missing.");
      setIsLoadingDetails(false);
      return;
    }

    console.log(`DocumentDetailPage: Fetching details for docId: ${docId}`);
    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      setErrorDetails(null);
      try {
        // 1. Fetch basic document info (filename, created_at, current status)
        const { data: docData, error: docError } = await supabase
          .from("documents")
          .select("file_name, created_at, processing_status, error_message")
          .eq("id", docId)
          .eq("user_id", session.user.id) // Ensure user owns this document
          .single();

        if (docError || !docData) {
          throw new Error(
            docError?.message || "Document not found or access denied."
          );
        }

        // 2. Fetch analysis info (summary, qna_ready status)
        const { data: analysisData, error: analysisError } = await supabase
          .from("document_analyses")
          .select("summary_short, key_findings, qna_ready")
          .eq("document_id", docId)
          .maybeSingle(); // Use maybeSingle as analysis might not exist yet

        if (analysisError) {
          // Non-critical if analysis just isn't there yet, but log it
          console.warn(
            `Could not fetch analysis details for ${docId}:`,
            analysisError.message
          );
        }

        setDocumentDetails({
          document_db_id: docId,
          original_file_name: docData.file_name,
          status:
            analysisData && docData.processing_status === "completed"
              ? "completed"
              : docData.processing_status, // Use analysis status if available and primary doc complete
          summary_short: analysisData?.summary_short || null,
          key_findings: analysisData?.key_findings || null, // Process this if it's structured
          qna_ready: analysisData?.qna_ready || false,
          error_message:
            docData.error_message ||
            (analysisError ? "Error loading analysis details." : null),
          created_at: docData.created_at,
        });
        console.log("DocumentDetailPage: Details loaded:", {
          docData,
          analysisData,
        });
      } catch (err: any) {
        console.error(
          "DocumentDetailPage: Error fetching document details:",
          err
        );
        setErrorDetails(err.message || "Failed to load document information.");
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [docId, supabase, session, router]);

  // --- Auto-scroll chat ---
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // --- Handle Chat Query Submission ---
  const handleQuerySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userQuery.trim() || !documentDetails?.qna_ready || isQuerying) return;

    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userQuery,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setUserQuery(""); // Clear input
    setIsQuerying(true);
    setQueryError(null);

    // Add a thinking AI message
    const thinkingAiMessage: ChatMessage = {
      id: `ai-thinking-${Date.now()}`,
      sender: "ai",
      text: "Thinking...",
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, thinkingAiMessage]);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${backendUrl}/query-document/${docId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: newUserMessage.text }), // Send the user's query text
      });

      // Remove thinking message
      setChatMessages((prev) =>
        prev.filter((msg) => msg.id !== thinkingAiMessage.id)
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({
            detail: "Query failed with status: " + response.status,
          }));
        throw new Error(
          errorData.detail || errorData.error || `HTTP error ${response.status}`
        );
      }

      const result: QueryServiceResponse = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      const newAiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: result.answer,
        timestamp: new Date(),
        relevant_chunks_preview: result.relevant_chunks_preview,
      };
      setChatMessages((prev) => [...prev, newAiMessage]);
    } catch (err: any) {
      console.error("DocumentDetailPage: Query submit caught error object:", err); // Log the whole err object

      let errorMessage = "An unexpected error occurred while querying.";
      if (err instanceof Error) { // Standard JS Error
        errorMessage = err.message;
      } else if (err && typeof err.detail === 'string') { // FastAPI HTTPException style
        errorMessage = err.detail;
      } else if (err && typeof err.error === 'string') { // Our QueryResponse.error style, if it was thrown
        errorMessage = err.error;
      } else if (typeof err === 'string') { // Just a string was thrown
        errorMessage = err;
      }
      // If 'err' was a Supabase error object directly (less likely from fetch to FastAPI):
      // else if (err && err.message && err.details) { 
      //  errorMessage = `${err.message} ${err.details || ''}`;
      // }

      console.error("DocumentDetailPage: Parsed error message:", errorMessage);
      setQueryError(errorMessage);

      const errorAiMessage: ChatMessage = {
        id: `ai-error-${Date.now()}`,
        sender: 'ai',
        text: `Sorry, I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorAiMessage]);
    } finally {
      setIsQuerying(false);
    }
  };

  // --- Render Logic ---
  if (isLoadingDetails) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 text-gray-500">
        Loading document details...
      </div>
    );
  }
  if (errorDetails) {
    return (
      <div className="container mx-auto p-4 md:p-8 text-center">
        <p className="text-red-500 bg-red-100 p-4 rounded-md">{errorDetails}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-indigo-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }
  if (!documentDetails) {
    return (
      <div className="container mx-auto p-4 md:p-8 text-center">
        <p className="text-gray-500">Document information not available.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-indigo-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  // --- UI Styling for Chat (Basic) ---
  const chatBubbleBase = "px-4 py-2 rounded-lg max-w-[80%] break-words shadow";
  const userBubble = `${chatBubbleBase} bg-indigo-600 text-white self-end rounded-br-none`;
  const aiBubble = `${chatBubbleBase} bg-gray-200 text-gray-800 self-start rounded-bl-none`;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 mb-6 group"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:-translate-x-1" />
        Back to Dashboard
      </Link>

      <div className="bg-white shadow-xl rounded-lg p-6 md:p-8">
        <h1
          className="text-2xl md:text-3xl font-bold text-gray-800 mb-1 truncate"
          title={documentDetails.original_file_name}
        >
          {documentDetails.original_file_name}
        </h1>
        <p className="text-xs text-gray-500 mb-4">
          Uploaded:{" "}
          {documentDetails.created_at
            ? new Date(documentDetails.created_at).toLocaleString()
            : "N/A"}{" "}
          | Status:{" "}
          <span
            className={`font-medium ${
              documentDetails.status === "completed" ||
              documentDetails.status === "completed_no_qna"
                ? "text-green-600"
                : "text-orange-500"
            }`}
          >
            {documentDetails.status
              .replace(/_/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase())}
          </span>
        </p>

        {documentDetails.summary_short && (
          <div className="mb-8 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              Summary
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed prose prose-sm max-w-none">
              {documentDetails.summary_short}
            </p>
          </div>
        )}

        {documentDetails.error_message && (
          <div className="mb-6 p-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md">
            <strong>Processing Error:</strong> {documentDetails.error_message}
          </div>
        )}

        {/* --- Chat Interface --- */}
        {documentDetails.qna_ready ? (
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">
              Chat with this Document
            </h2>
            <div
              ref={chatContainerRef}
              className="h-80 overflow-y-auto p-4 mb-4 bg-gray-50 border border-gray-200 rounded-md flex flex-col space-y-3"
            >
              {chatMessages.length === 0 && (
                <p className="text-sm text-gray-500 text-center my-auto">
                  Ask a question about the document content...
                </p>
              )}
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={msg.sender === "user" ? userBubble : aiBubble}
                  >
                    {msg.text.split("\n").map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 px-1">
                    {msg.sender === "user" ? "You" : "InScribe AI"} -{" "}
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
            <form
              onSubmit={handleQuerySubmit}
              className="flex items-center space-x-3"
            >
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Ask a question..."
                className="flex-grow text-black p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                disabled={isQuerying || !documentDetails.qna_ready}
              />
              <button
                type="submit"
                disabled={
                  isQuerying || !userQuery.trim() || !documentDetails.qna_ready
                }
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isQuerying ? "Asking..." : "Ask"}
              </button>
            </form>
            {queryError && (
              <p className="text-sm text-red-600 mt-2">{queryError}</p>
            )}
          </div>
        ) : (
          documentDetails.status !== "failed" &&
          documentDetails.status !== "error" &&
          !documentDetails.error_message && ( // Only show if no major processing error
            <div className="mt-8 border-t border-gray-200 pt-6 text-center">
              <p className="text-sm text-gray-500">
                This document is still processing or not yet ready for Q&A.
                Please check back later or confirm status on the dashboard.
              </p>
              {documentDetails.status !== "completed" &&
                documentDetails.status !== "completed_no_qna" && (
                  <p className="text-xs text-orange-500 animate-pulse mt-1">
                    Current status: {documentDetails.status}
                  </p>
                )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

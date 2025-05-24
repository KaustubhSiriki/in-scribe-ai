"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSupabase } from "@/app/supabase-provider";
import { SupabaseClient, Session } from "@supabase/supabase-js";
import { ArrowLeftIcon, MoreVertical, Trash, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";

type DocumentAnalysisDetails = {
  document_db_id: string;
  original_file_name?: string;
  status: string;
  summary_short?: string | null;
  key_findings?: string[] | null;
  error_message?: string | null;
  qna_ready: boolean;
  created_at?: string;
};

type ChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  relevant_chunks_preview?: string[] | null;
};

type QueryServiceResponse = {
  answer: string;
  relevant_chunks_preview?: string[] | null;
  error?: string | null;
};

export default function DocumentDetailPage() {
  const { session, supabase } = useSupabase() as {
    session: Session | null;
    supabase: SupabaseClient | null;
  };
  const router = useRouter();
  const params = useParams();
  const docId = params.docId as string;

  const [documentDetails, setDocumentDetails] = useState<DocumentAnalysisDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch document details
  useEffect(() => {
    if (!supabase || !session) {
      if (supabase && !session) router.push("/auth");
      return;
    }
    if (!docId) {
      setErrorDetails("Document ID is missing.");
      setIsLoadingDetails(false);
      return;
    }
    setIsLoadingDetails(true);
    setErrorDetails(null);

    const fetchDetails = async () => {
      try {
        const { data: docData, error: docError } = await supabase
          .from("documents")
          .select("file_name, created_at, processing_status, error_message")
          .eq("id", docId)
          .eq("user_id", session.user.id)
          .single();

        if (docError || !docData) throw new Error(docError?.message || "Document not found or access denied.");

        const { data: analysisData, error: analysisError } = await supabase
          .from("document_analyses")
          .select("summary_short, key_findings, qna_ready")
          .eq("document_id", docId)
          .maybeSingle();

        setDocumentDetails({
          document_db_id: docId,
          original_file_name: docData.file_name,
          status: analysisData && docData.processing_status === "completed" ? "completed" : docData.processing_status,
          summary_short: analysisData?.summary_short || null,
          key_findings: analysisData?.key_findings || null,
          qna_ready: analysisData?.qna_ready || false,
          error_message: docData.error_message || (analysisError ? "Error loading analysis details." : null),
          created_at: docData.created_at,
        });
      } catch (err: any) {
        setErrorDetails(err.message || "Failed to load document information.");
      } finally {
        setIsLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [docId, supabase, session, router]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Chat submit
  const handleQuerySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userQuery.trim() || !documentDetails?.qna_ready || isQuerying) return;
    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userQuery,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setUserQuery("");
    setIsQuerying(true);
    setQueryError(null);

    const thinkingAiMessage: ChatMessage = {
      id: `ai-thinking-${Date.now()}`,
      sender: "ai",
      text: "Thinking...",
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, thinkingAiMessage]);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${backendUrl}/query-document/${docId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: newUserMessage.text }),
      });

      setChatMessages((prev) => prev.filter((msg) => msg.id !== thinkingAiMessage.id));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          detail: "Query failed with status: " + response.status,
        }));
        throw new Error(errorData.detail || errorData.error || `HTTP error ${response.status}`);
      }

      const result: QueryServiceResponse = await response.json();
      if (result.error) throw new Error(result.error);

      const newAiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: result.answer,
        timestamp: new Date(),
        relevant_chunks_preview: result.relevant_chunks_preview,
      };
      setChatMessages((prev) => [...prev, newAiMessage]);
    } catch (err: any) {
      let errorMessage = "An unexpected error occurred while querying.";
      if (err instanceof Error) errorMessage = err.message;
      setQueryError(errorMessage);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-error-${Date.now()}`,
          sender: "ai",
          text: `Sorry, I encountered an error: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Quick Actions
  const handleDelete = async () => {
    if (!supabase || !session || !docId) return;
    if (!confirm("Are you sure you want to delete this document?")) return;
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", docId)
      .eq("user_id", session.user.id);
    if (error) {
      setNotification({ type: "error", message: "Failed to delete document." });
    } else {
      setNotification({ type: "success", message: "Document deleted." });
      setTimeout(() => router.push("/dashboard"), 1200);
    }
  };

  const handleRename = async () => {
    if (!supabase || !session || !docId || !renameValue.trim()) return;
    const { error } = await supabase
      .from("documents")
      .update({ file_name: renameValue.trim() })
      .eq("id", docId)
      .eq("user_id", session.user.id);
    if (error) {
      setNotification({ type: "error", message: "Failed to rename document." });
    } else {
      setDocumentDetails((prev) => prev && { ...prev, original_file_name: renameValue.trim() });
      setNotification({ type: "success", message: "Document renamed!" });
      setShowRenameModal(false);
    }
  };

  // Loader/Empty SVGs
  const Loader = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[350px] w-full"
    >
      <svg className="h-16 w-16 animate-spin mb-4" viewBox="0 0 50 50">
        <circle className="opacity-25" cx="25" cy="25" r="20" stroke="#a78bfa" strokeWidth="5" fill="none" />
        <circle className="opacity-75" cx="25" cy="25" r="20" stroke="#6366f1" strokeWidth="5" fill="none" strokeDasharray="31.4" strokeDashoffset="15" />
      </svg>
      <span className="text-text-secondary text-lg">Loading document details…</span>
    </motion.div>
  );
  const EmptyChatSVG = () => (
    <div className="flex flex-col items-center justify-center h-full text-text-secondary">
      <svg className="h-14 w-14 mb-2" fill="none" viewBox="0 0 64 64">
        <rect x="8" y="16" width="48" height="32" rx="8" fill="currentColor" className="opacity-10"/>
        <rect x="16" y="24" width="32" height="6" rx="3" fill="currentColor" className="opacity-40"/>
        <rect x="16" y="34" width="20" height="6" rx="3" fill="currentColor" className="opacity-20"/>
      </svg>
      <span>Ask a question about the document content...</span>
    </div>
  );

  const chatBubbleBase = "px-4 py-2 rounded-xl max-w-[80%] break-words shadow";
  const userBubble = `${chatBubbleBase} bg-accent-primary/90 text-black dark:text-white self-end rounded-br-none`;
  const aiBubble = `${chatBubbleBase} bg-surface-alt text-text-primary self-start rounded-bl-none`;

  if (isLoadingDetails) return <Loader />;
  if (errorDetails)
    return (
      <div className="container mx-auto p-8 text-center">
        <p className="text-error bg-error/10 p-4 rounded-xl">{errorDetails}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent-primary hover:text-accent-secondary">
          ← Back to Dashboard
        </Link>
      </div>
    );
  if (!documentDetails)
    return (
      <div className="container mx-auto p-8 text-center">
        <EmptyChatSVG />
        <p className="text-text-secondary mt-4">Document information not available.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent-primary hover:text-accent-secondary">
          ← Back to Dashboard
        </Link>
      </div>
    );

  return (

      <div className="container mx-auto py-10 px-2 sm:px-4 max-w-5xl">
        {/* Notification Snackbar */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              className={`fixed left-1/2 top-6 z-[9999] transform -translate-x-1/2 px-6 py-4 rounded-2xl shadow-xl font-medium
              ${notification.type === "success" ? "bg-success text-white" : "bg-error text-white"}`}
            >
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rename Modal */}
        <AnimatePresence>
          {showRenameModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-surface rounded-3xl p-8 shadow-2xl w-full max-w-sm"
              >
                <h2 className="font-bold text-xl mb-4">Rename Document</h2>
                <input
                  className="w-full p-3 rounded-xl border border-text-secondary/20 bg-surface-alt text-text-primary mb-4"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  placeholder="New document name"
                />
                <div className="flex gap-4 justify-end">
                  <Button variant="secondary" onClick={() => setShowRenameModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleRename}>Save</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-accent-primary hover:text-accent-secondary mb-6 group transition"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Link>

        <div className="flex flex-col lg:flex-row gap-8 min-h-[450px]">
          {/* Left: Summary */}
          <motion.div
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, type: "spring" }}
            className="flex-1 min-w-[320px]"
          >
            <div
              className="relative bg-gradient-to-br from-surface via-surface-alt to-surface-alt shadow-xl rounded-3xl p-6 lg:p-8 transition-colors duration-300 flex flex-col"
              style={{
                boxShadow:
                  "0 4px 40px 0 rgba(80,80,180,0.14), 0 1.5px 6px 0 rgba(20,20,70,0.04)",
              }}
            >
              {/* Quick actions menu */}
              <div className="absolute right-5 top-5 z-10">
                <div className="relative">
                  <button
                    className="p-2 rounded-full hover:bg-accent-primary/10 transition"
                    onClick={() => setShowActions((v) => !v)}
                    aria-label="Document actions"
                  >
                    <MoreVertical size={20} />
                  </button>
                  <AnimatePresence>
                    {showActions && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        className="absolute right-0 mt-2 bg-surface-alt rounded-xl shadow-lg border border-text-secondary/10 min-w-[140px] py-1 z-20"
                      >
                        <button
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent-primary/10 transition text-text-primary"
                          onClick={() => {
                            setShowRenameModal(true);
                            setRenameValue(documentDetails.original_file_name ?? "");
                            setShowActions(false);
                          }}
                        >
                          <Pencil size={15} /> Rename
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-error/10 transition text-error"
                          onClick={() => {
                            setShowActions(false);
                            handleDelete();
                          }}
                        >
                          <Trash size={15} /> Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2 break-all pr-8">{documentDetails.original_file_name}</h1>
              <p className="text-xs text-text-secondary mb-2">
                Uploaded: {documentDetails.created_at ? new Date(documentDetails.created_at).toLocaleString() : "N/A"}
                <span className={`ml-2 font-medium
                  ${documentDetails.status === "completed"
                    ? "text-success"
                    : "text-accent-primary"}`}>
                  Status: {documentDetails.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </p>
              {/* SCROLLABLE SUMMARY */}
              {documentDetails.summary_short && (
                <div className="prose prose-invert max-w-none mb-6 bg-surface-alt rounded-2xl p-4 custom-scrollbar"
                    style={{overflowY: "auto", height: "45vh"}}>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Summary</h2>
                  <p>{documentDetails.summary_short}</p>
                </div>
              )}
              {documentDetails.error_message && (
                <div className="mb-6 p-3 text-sm text-error bg-error/10 border border-error/30 rounded-xl">
                  <strong>Processing Error:</strong> {documentDetails.error_message}
                </div>
              )}
            </div>
          </motion.div>

          {/* Right: Chat */}
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="flex-[1.3] min-w-[320px] max-w-xl flex flex-col"
          >
            <div
              className="bg-gradient-to-br from-surface-alt to-surface shadow-xl rounded-3xl p-6 flex-1 flex flex-col transition-colors duration-300"
              style={{
                boxShadow:
                  "0 4px 32px 0 rgba(80,80,180,0.12), 0 1.5px 4px 0 rgba(20,20,70,0.02)",
              }}
            >
              <h2 className="text-xl font-semibold mb-4 text-text-primary">Chat with this Document</h2>
              {/* Chat list area */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto custom-scrollbar mb-3 prose prose-invert"
                style={{ minHeight: 260, maxHeight: 380 }}
              >
                {chatMessages.length === 0 && <EmptyChatSVG />}
                {chatMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col my-1 ${msg.sender === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className={msg.sender === "user" ? userBubble : aiBubble}>
                      {msg.text.split("\n").map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                    <span className="text-xs text-text-secondary mt-1 px-1">
                      {msg.sender === "user" ? "You" : "InScribe AI"} – {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </motion.div>
                ))}
              </div>
              {/* Chat input is always pinned to bottom */}
              <form
                onSubmit={handleQuerySubmit}
                className="flex items-center gap-2 pt-2 border-t border-text-secondary/15 mt-auto"
              >
                <input
                  type="text"
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  placeholder="Ask a question…"
                  className="flex-grow px-4 py-3 bg-surface-alt rounded-xl border border-text-secondary/20 text-text-primary focus:ring-2 focus:ring-accent-primary outline-none"
                  disabled={isQuerying || !documentDetails.qna_ready}
                />
                <Button
                  type="submit"
                  disabled={isQuerying || !userQuery.trim() || !documentDetails.qna_ready}
                  className="px-6 py-3"
                >
                  {isQuerying ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="3" fill="none" />
                    </svg>
                  ) : "Ask"}
                </Button>
              </form>
              {queryError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-error mt-2"
                >
                  {queryError}
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
  );
}

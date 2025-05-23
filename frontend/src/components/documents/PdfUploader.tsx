"use client";

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useSupabase } from '@/app/supabase-provider';
import { Session } from '@supabase/supabase-js';

interface ProcessInitiationResponse {
  document_db_id: string;
  message: string;
  file_name: string;
  num_pages: number;
}

interface PdfUploaderProps {
  onProcessingStart: (data: ProcessInitiationResponse) => void;
}

export default function PdfUploader({ onProcessingStart }: PdfUploaderProps) {
  // Explicitly type useSupabase hook if needed, or ensure SupabaseProvider provides correct context type
  const { session } = useSupabase() as { session: Session | null }; // Ensure correct type for session
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    console.log("PdfUploader: handleFileChange triggered.");
    setError(null);
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        console.log("PdfUploader: PDF file selected:", file.name);
      } else {
        setSelectedFile(null);
        setError("Invalid file type. Please select a PDF.");
        console.log("PdfUploader: Invalid file type selected.");
      }
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLFormElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLFormElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    setError(null);
    console.log("PdfUploader: handleDrop triggered.");
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        setSelectedFile(file);
        console.log("PdfUploader: PDF file dropped:", file.name);
      } else {
        setSelectedFile(null);
        setError("Invalid file type. Please drop a PDF file.");
        console.log("PdfUploader: Invalid file type dropped.");
      }
    }
  };
  
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // This is crucial
    console.log("PdfUploader: handleSubmit triggered.");

    if (!selectedFile) {
      setError("Please select a PDF file to upload.");
      console.log("PdfUploader: No file selected for upload.");
      return;
    }
    if (!session || !session.user) {
      setError("You must be logged in to upload documents.");
      console.log("PdfUploader: User not logged in for upload.");
      return;
    }

    setIsUploading(true);
    setError(null);
    console.log("PdfUploader: Starting upload for file:", selectedFile.name, "by user:", session.user.id);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("user_id", session.user.id);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
      console.log("PdfUploader: Sending POST request to:", `${backendUrl}/upload-and-process-pdf/`);
      
      const response = await fetch(`${backendUrl}/upload-and-process-pdf/`, {
        method: 'POST',
        body: formData,
      });
      console.log("PdfUploader: Received response from backend. Status:", response.status);

      if (!response.ok) {
        let errorDetail = `HTTP error ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorDetail;
          console.error("PdfUploader: Backend error response data:", errorData);
        } catch (jsonError) {
          console.error("PdfUploader: Could not parse JSON from error response. Response text:", await response.text().catch(() => ""));
        }
        throw new Error(errorDetail);
      }

      const result: ProcessInitiationResponse = await response.json();
      console.log("PdfUploader: Successfully parsed backend response:", result);
      
      // Call the callback after everything successful from fetch
      onProcessingStart(result);
      console.log("PdfUploader: onProcessingStart callback executed.");

      setSelectedFile(null); 
      const fileInput = document.getElementById('pdf-upload-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
      console.log("PdfUploader: File selection cleared.");

    } catch (err: any) {
      console.error("PdfUploader: Upload failed with error:", err);
      setError(err.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploading(false);
      console.log("PdfUploader: Upload process finished (finally block).");
    }
  };

  return (
    <div className="w-full max-w-lg p-6 mx-auto bg-white rounded-xl shadow-xl">
      <h2 className="text-2xl font-semibold text-center text-gray-800 mb-6">Upload PDF for Analysis</h2>
      
      <form onSubmit={handleSubmit} onDragEnter={handleDrag} className="space-y-6">
        <div 
          className={`p-6 border-2 ${dragActive ? 'border-indigo-600 bg-indigo-50' : 'border-dashed border-gray-300'} rounded-lg text-center cursor-pointer transition-colors duration-200 ease-in-out`}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => {
            console.log("PdfUploader: Upload area clicked.");
            document.getElementById('pdf-upload-input')?.click();
          }}
        >
          <input
            type="file"
            id="pdf-upload-input"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            {dragActive ? "Drop the PDF here..." : "Drag & drop a PDF file here, or click to select"}
          </p>
          <p className="text-xs text-gray-500">PDF up to 10MB (example limit)</p>
        </div>

        {selectedFile && (
          <div className="text-sm text-gray-700">
            <p>Selected file: <span className="font-semibold">{selectedFile.name}</span> ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>
        )}

        <button
          type="submit" // Keep type="submit" to trigger form's onSubmit
          disabled={isUploading || !selectedFile}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 ease-in-out"
        >
          {isUploading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading & Processing...
            </>
          ) : (
            "Upload & Analyze PDF"
          )}
        </button>
      </form>
    </div>
  );
}
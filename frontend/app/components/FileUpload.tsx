"use client";

import React, { useRef, useState } from "react";
import { Upload, Loader2, Check, Sparkles, AlertCircle, ShieldAlert, RotateCw } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onDocumentReady?: (documentId: string, file: File) => void;
  onStatusChange?: (
    status: "idle" | "uploading" | "processing" | "ready" | "failed",
    message?: string
  ) => void;
}

export default function FileUpload({
  onFileSelect,
  onDocumentReady,
  onStatusChange,
}: FileUploadProps) {
  const { getToken, isSignedIn } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<
    "idle" | "uploading" | "processing" | "ready" | "failed"
  >("idle");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollDocumentStatus = (documentId: string, file: File) => {
    clearPolling();
    let attempts = 0;
    const maxAttempts = 90;

    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearPolling();
        setCurrentStatus("failed");
        setErrorMessage("Document processing timed out. Please try re-uploading.");
        onStatusChange?.("failed", "Processing timed out");
        return;
      }

      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/upload/status/${documentId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          if (res.status >= 500 && attempts < maxAttempts - 5) {
            return;
          }
          throw new Error(`Failed to check status (${res.status})`);
        }

        const data = await res.json();

        if (data.status === "queued") {
          setCurrentStatus("processing");
          setUploadProgress((prev) => Math.max(prev, 25));
          setStatusMessage(data.message || "Document queued for processing...");
          onStatusChange?.("processing");
        } else if (data.status === "processing") {
          setCurrentStatus("processing");
          const calcProgress = Math.min(92, Math.max(35, data.progress || 45));
          setUploadProgress(calcProgress);
          setStatusMessage(data.message || "Analyzing document and generating embeddings...");
          onStatusChange?.("processing");
        } else if (data.status === "ready") {
          clearPolling();
          setCurrentStatus("ready");
          setUploadProgress(100);
          setStatusMessage(data.message || `Ready! ${data.totalChunks || 0} chunks indexed.`);
          setErrorMessage(null);
          onStatusChange?.("ready");
          onDocumentReady?.(documentId, file);
        } else if (data.status === "failed") {
          clearPolling();
          setCurrentStatus("failed");
          setErrorMessage(data.error || data.message || "Document processing failed.");
          onStatusChange?.("failed", data.error || data.message);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[UploadPoll] Status check:", msg);
      }
    }, 1500);
  };

  const uploadPdf = async (file: File) => {
    if (!isSignedIn) {
      setErrorMessage("Please sign in with Clerk before uploading a PDF.");
      return;
    }

    setErrorMessage(null);
    setCurrentStatus("uploading");
    setUploadProgress(20);
    setStatusMessage("Uploading document to secure server...");
    onStatusChange?.("uploading");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("pdf", file);

      const res = await fetch(`${API_BASE_URL}/upload/pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed with status ${res.status}`);
      }

      const result = await res.json();
      setUploadProgress(35);
      setCurrentStatus("processing");
      setStatusMessage("Document received. Processing embeddings...");
      onStatusChange?.("processing");

      pollDocumentStatus(result.documentId, file);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      clearPolling();
      setCurrentStatus("failed");
      const errorMsg =
        err instanceof Error && err.name === "AbortError"
          ? "Upload request timed out. The backend might be cold-starting — click Retry to send again."
          : err instanceof Error
          ? err.message
          : "Failed to upload document.";
      setErrorMessage(errorMsg);
      onStatusChange?.("failed", errorMsg);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const validateAndProcessFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setErrorMessage("Please upload a valid PDF document (.pdf extension).");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("File exceeds the maximum allowed size of 50MB.");
      return;
    }

    setPdfFile(file);
    onFileSelect(file);
    await uploadPdf(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  };

  return (
    <div>
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (!isSignedIn) {
            setErrorMessage("Please sign in using the button in the top right before uploading.");
            return;
          }
          fileInputRef.current?.click();
        }}
        className={`flex flex-col justify-center items-center border-2 border-dashed rounded-2xl cursor-pointer transition-all p-8 ${
          isDragging
            ? "border-accent-primary bg-surface shadow-md scale-[1.01]"
            : "border-border-theme hover:border-accent-primary/70 bg-surface/50 hover:bg-surface"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="p-3.5 rounded-2xl bg-surface border border-border-theme text-accent-primary mb-3 shadow-xs">
          <Upload className="w-7 h-7" />
        </div>
        <p className="font-semibold text-sm text-text-primary text-center">
          {isDragging ? "Drop your PDF here" : "Drop PDF or click to browse"}
        </p>
        <p className="text-xs text-text-muted mt-1">PDF documents up to 50MB</p>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-4 p-3.5 bg-[#E47777]/10 border border-[#E47777]/30 rounded-xl flex items-start justify-between gap-2 text-[#E47777] text-xs">
          <div className="flex items-start gap-2 flex-1">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="flex-1 font-medium">{errorMessage}</p>
          </div>
          {pdfFile && currentStatus === "failed" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (pdfFile) uploadPdf(pdfFile);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#E47777]/20 hover:bg-[#E47777]/30 text-[#E47777] rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Unauthenticated Hint */}
      {!isSignedIn && (
        <div className="mt-4 p-3 bg-[#E5B95C]/10 border border-[#E5B95C]/30 rounded-xl flex items-center gap-2.5 text-[#E5B95C] text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <p className="font-medium">Authentication required. Please sign in to securely analyze documents.</p>
        </div>
      )}

      {/* File Status & Progress */}
      {pdfFile && (
        <div className="mt-5 p-4 border border-border-theme rounded-2xl bg-surface shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="max-w-[80%]">
              <p className="font-semibold text-xs text-text-primary truncate">{pdfFile.name}</p>
              <p className="text-[11px] text-text-muted mt-0.5">{formatFileSize(pdfFile.size)}</p>
            </div>
            {currentStatus === "ready" ? (
              <div className="p-1 rounded-full bg-[#79C98A]/20 text-[#79C98A]">
                <Check className="w-4 h-4" />
              </div>
            ) : currentStatus === "failed" ? (
              <div className="p-1 rounded-full bg-[#E47777]/20 text-[#E47777]">
                <AlertCircle className="w-4 h-4" />
              </div>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />
            )}
          </div>

          <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                currentStatus === "failed"
                  ? "bg-[#E47777]"
                  : currentStatus === "ready"
                  ? "bg-accent-primary"
                  : "bg-accent-primary"
              }`}
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>

          {currentStatus === "ready" && (
            <p className="text-xs text-accent-primary font-medium mt-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {statusMessage || "Ready to answer your questions!"}
            </p>
          )}

          {(currentStatus === "uploading" || currentStatus === "processing") && (
            <p className="text-xs text-text-secondary mt-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-accent-primary" />
              {statusMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

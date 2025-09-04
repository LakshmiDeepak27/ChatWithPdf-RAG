"use client";

import React, { useRef, useState } from "react";
import { Upload, Loader2, Check, Sparkles } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export default function FileUpload({ onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      console.log(file);
      const formData=new FormData();
      formData.append('pdf' , file);
      
      await fetch('http://localhost:8000/upload/pdf' , {
        method: 'POST',
        body:formData,
      });
      console.log('File uploaded');
      simulateUpload();
      onFileSelect(file);
    }
  };

  const simulateUpload = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 100);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      
      simulateUpload();
      onFileSelect(file);
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
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col justify-center items-center border-2 border-dashed rounded-xl cursor-pointer transition p-8 ${
          isDragging
            ? "border-indigo-400 bg-gray-700"
            : "border-gray-600 hover:border-indigo-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <Upload className="w-10 h-10 text-indigo-400 mb-3" />
        <p className="font-medium">
          {isDragging ? "Drop your PDF here" : "Drop PDF or click to upload"}
        </p>
        <p className="text-xs text-gray-500 mt-1">Maximum file size: 50MB</p>
      </div>

      {/* File Status */}
      {pdfFile && (
        <div className="mt-6 p-4 border rounded-xl bg-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-sm">{pdfFile.name}</p>
              <p className="text-xs text-gray-400">
                {formatFileSize(pdfFile.size)}
              </p>
            </div>
            {uploadProgress === 100 ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            )}
          </div>
          <div className="w-full h-2 bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          {uploadProgress === 100 && (
            <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Ready to answer your questions!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

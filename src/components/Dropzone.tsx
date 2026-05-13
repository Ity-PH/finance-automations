"use client";

import { useCallback } from "react";
import { useDropzone, Accept } from "react-dropzone";

interface DropzoneProps {
  label: string;
  accept: Accept;
  file: File | null;
  onFileAccepted: (file: File) => void;
}

export default function Dropzone({
  label,
  accept,
  file,
  onFileAccepted,
}: DropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {label}
      </label>
      <div
        {...getRootProps()}
        className={`flex min-h-[140px] cursor-pointer items-center justify-center border-2 border-dashed p-6 transition-colors ${
          isDragActive
            ? "border-black bg-gray-100"
            : file
            ? "border-black bg-gray-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-black">{file.name}</p>
            <p className="mt-1 text-xs text-gray-400">
              {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {isDragActive
              ? "Drop file here..."
              : "Drag & drop or click to select"}
          </p>
        )}
      </div>
    </div>
  );
}

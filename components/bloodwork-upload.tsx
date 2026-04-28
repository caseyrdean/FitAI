"use client";

import { useCallback, useRef, useState } from "react";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type BloodWorkMarker = {
  id: string;
  recordId: string;
  category?: string;
  name: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  /** Lab Flag column (H, L, …) when captured from the report or entered manually. */
  labFlag?: string | null;
  flagged: boolean;
};

export type BloodWorkRecord = {
  id: string;
  userId: string;
  uploadedAt: string;
  filePath: string;
  rawText: string;
  parsedAt: string | null;
  markers: BloodWorkMarker[];
};

type BloodworkUploadProps = {
  onUploadComplete?: (record: BloodWorkRecord) => void;
};

function formatRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} – ${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return "—";
}

function flagLabel(flagged: boolean): string {
  return flagged ? "Flagged" : "OK";
}

export function BloodworkUpload({ onUploadComplete }: BloodworkUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [latestRecord, setLatestRecord] = useState<BloodWorkRecord | null>(null);

  const postFile = useCallback(
    (file: File) => {
      setError(null);
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/bloodwork");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        setUploading(false);
        setUploadProgress(100);
        try {
          const data = JSON.parse(xhr.responseText) as
            | BloodWorkRecord
            | { error?: string };
          if (xhr.status >= 400) {
            setError(
              "error" in data && data.error
                ? data.error
                : `Upload failed (${xhr.status})`
            );
            return;
          }
          const record = data as BloodWorkRecord;
          setLatestRecord(record);
          dispatchFitaiRefresh({ source: "bloodwork", scopes: ["bloodwork", "dashboard"] });
          onUploadComplete?.(record);
        } catch {
          setError("Invalid response from server");
        }
      });

      xhr.addEventListener("error", () => {
        setUploading(false);
        setError("Network error during upload");
      });

      xhr.send(formData);
    },
    [onUploadComplete]
  );

  const onPickFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) postFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    onPickFiles(e.dataTransfer.files);
  };

  const markers = latestRecord?.markers ?? [];

  return (
    <Card className="border-surface-border bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-white">
          Upload lab results{" "}
          <span className="text-[#00ff88]">PDF or image</span>
        </CardTitle>
        <CardDescription>
          Drag and drop a file or choose one. We extract markers automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragActive(false);
            }
          }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragActive
              ? "border-[#00aaff] bg-[#00aaff]/10"
              : "border-gray-600 bg-surface-dark/50 hover:border-[#00ff88]/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <p className="text-sm text-gray-300">
            Drop blood work PDF or photo here, or{" "}
            <span className="text-[#00aaff]">browse</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Images and PDF only
          </p>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Uploading &amp; parsing…</span>
              <span className="text-[#00ff88]">{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-dark">
              <div
                className="h-full bg-[#00ff88] transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {markers.length > 0 && (
          <div className="rounded-md border border-surface-border">
            <Table>
              <TableHeader>
                <TableRow className="border-surface-border hover:bg-transparent">
                  <TableHead className="text-[#00aaff]">Panel</TableHead>
                  <TableHead className="text-[#00aaff]">Analyte</TableHead>
                  <TableHead className="text-[#00aaff]">Value</TableHead>
                  <TableHead className="text-[#00aaff]">Unit</TableHead>
                  <TableHead className="text-[#00aaff]">Reference</TableHead>
                  <TableHead className="text-[#00aaff]">Flag</TableHead>
                  <TableHead className="text-[#00aaff]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markers.map((m) => (
                  <TableRow
                    key={m.id}
                    className="border-surface-border"
                  >
                    <TableCell className="max-w-[140px] truncate text-xs text-gray-400">
                      {m.category?.trim() || "—"}
                    </TableCell>
                    <TableCell
                      className={
                        m.flagged
                          ? "font-medium text-amber-400"
                          : "text-gray-200"
                      }
                    >
                      {m.name}
                    </TableCell>
                    <TableCell
                      className={
                        m.flagged ? "font-semibold text-red-400" : "text-white"
                      }
                    >
                      {m.value}
                    </TableCell>
                    <TableCell className="text-gray-400">{m.unit}</TableCell>
                    <TableCell className="text-gray-400">
                      {formatRange(m.referenceMin, m.referenceMax)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-300">
                      {m.labFlag?.trim() ? m.labFlag.trim() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.flagged ? "destructive" : "secondary"}
                        className={
                          m.flagged
                            ? "border-red-500/50 bg-red-950/40 text-red-300"
                            : "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]"
                        }
                      >
                        {flagLabel(m.flagged)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Props {
  jobNumber: string;
  projectId: string;
  cachedBoardUrl?: string;
}

export function MondayButton({ jobNumber, projectId, cachedBoardUrl }: Props) {
  const [boardUrl, setBoardUrl] = useState<string | null>(cachedBoardUrl || null);
  const [loading, setLoading] = useState(!cachedBoardUrl);

  useEffect(() => {
    if (cachedBoardUrl) return; // already have it
    fetch(`/api/monday?jobNumber=${encodeURIComponent(jobNumber)}&projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.boardUrl) setBoardUrl(d.boardUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobNumber, projectId, cachedBoardUrl]);

  if (loading) {
    return (
      <div className="w-5 h-5 rounded bg-muted animate-pulse" title="Looking up Monday board..." />
    );
  }

  if (!boardUrl) return null;

  return (
    <a
      href={boardUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Monday.com"
      className="inline-flex items-center justify-center w-6 h-6 rounded hover:opacity-80 transition-opacity"
    >
      {/* Monday.com logo — inline SVG to avoid external image issues */}
      <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
        <circle cx="4.5" cy="17" r="4.5" fill="#FF3D57" />
        <circle cx="12" cy="17" r="4.5" fill="#FFCB00" />
        <circle cx="19.5" cy="17" r="4.5" fill="#00CA72" />
      </svg>
    </a>
  );
}

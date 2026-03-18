"use client";

import Link from "next/link";

interface ProjectLinkIconsProps {
  hubspotUrl?: string | null;
  qboUrl?: string | null;
  className?: string;
}

function HubSpotIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.164 7.93V6.054a1.72 1.72 0 0 0 .992-1.554V4.46a1.72 1.72 0 0 0-1.72-1.72h-.04a1.72 1.72 0 0 0-1.72 1.72v.04c0 .7.419 1.305 1.024 1.575V7.93a4.876 4.876 0 0 0-2.32.906L8.2 4.61a1.92 1.92 0 1 0-.91.99l5.788 4.148a4.9 4.9 0 0 0-.766 2.64 4.9 4.9 0 0 0 .793 2.676l-1.76 1.76a1.56 1.56 0 0 0-.434-.067 1.582 1.582 0 1 0 1.582 1.582 1.56 1.56 0 0 0-.067-.434l1.737-1.737a4.92 4.92 0 1 0 3.998-7.977zm-.726 7.4a2.674 2.674 0 1 1 0-5.348 2.674 2.674 0 0 1 0 5.348z" fill="#FF7A59"/>
    </svg>
  );
}

function QBOIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#2CA01C"/>
      <path d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12S7.86 19.5 12 19.5 19.5 16.14 19.5 12 16.14 4.5 12 4.5zm0 2.25a5.25 5.25 0 0 1 4.907 7.125l-1.657-1.657A3 3 0 0 0 12 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 2.122-.878l1.658 1.658A5.25 5.25 0 0 1 12 17.25 5.25 5.25 0 0 1 6.75 12 5.25 5.25 0 0 1 12 6.75zm0 3a2.25 2.25 0 0 1 2.25 2.25A2.25 2.25 0 0 1 12 14.25 2.25 2.25 0 0 1 9.75 12 2.25 2.25 0 0 1 12 9.75z" fill="white"/>
    </svg>
  );
}

function LinkIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}

export function ProjectLinkIcons({
  hubspotUrl,
  qboUrl,
  className = "",
}: ProjectLinkIconsProps) {
  if (!hubspotUrl && !qboUrl) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {hubspotUrl ? (
        <LinkIcon href={hubspotUrl} label="Open in HubSpot">
          <HubSpotIcon />
        </LinkIcon>
      ) : null}
      {qboUrl ? (
        <LinkIcon href={qboUrl} label="Open in QuickBooks">
          <QBOIcon />
        </LinkIcon>
      ) : null}
    </div>
  );
}

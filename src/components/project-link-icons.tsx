"use client";

import Link from "next/link";

interface ProjectLinkIconsProps {
  hubspotUrl?: string | null;
  qboUrl?: string | null;
  className?: string;
}

function HubSpotIcon() {
  return (
    <svg viewBox="6.20856283 .64498824 244.26943717 251.24701176" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
      <path d="m191.385 85.694v-29.506a22.722 22.722 0 0 0 13.101-20.48v-.677c0-12.549-10.173-22.722-22.721-22.722h-.678c-12.549 0-22.722 10.173-22.722 22.722v.677a22.722 22.722 0 0 0 13.101 20.48v29.506a64.342 64.342 0 0 0 -30.594 13.47l-80.922-63.03c.577-2.083.878-4.225.912-6.375a25.6 25.6 0 1 0 -25.633 25.55 25.323 25.323 0 0 0 12.607-3.43l79.685 62.007c-14.65 22.131-14.258 50.974.987 72.7l-24.236 24.243c-1.96-.626-4-.959-6.057-.987-11.607.01-21.01 9.423-21.007 21.03.003 11.606 9.412 21.014 21.018 21.017 11.607.003 21.02-9.4 21.03-21.007a20.747 20.747 0 0 0 -.988-6.056l23.976-23.985c21.423 16.492 50.846 17.913 73.759 3.562 22.912-14.352 34.475-41.446 28.985-67.918-5.49-26.473-26.873-46.734-53.603-50.792m-9.938 97.044a33.17 33.17 0 1 1 0-66.316c17.85.625 32 15.272 32.01 33.134.008 17.86-14.127 32.522-31.977 33.165" fill="#ff7a59"/>
    </svg>
  );
}

function QBOIcon() {
  return (
    <svg viewBox="0 0 128 128" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M64 128c35.346 0 64-28.654 64-64S99.346 0 64 0 0 28.654 0 64s28.654 64 64 64z" fill="#2ca01c"/>
      <path d="M17.778 64a24.889 24.889 0 0 0 24.889 24.889h3.555v-9.245h-3.555a15.645 15.645 0 1 1 0-31.289H51.2v48.356a9.248 9.248 0 0 0 9.244 9.245V39.111H42.667A24.889 24.889 0 0 0 17.777 64zm67.555-24.889h-3.555v9.245h3.555a15.645 15.645 0 0 1 0 31.288H76.8V31.29a9.244 9.244 0 0 0-9.244-9.245V88.89h17.777a24.888 24.888 0 0 0 0-49.778z" fill="#fff"/>
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

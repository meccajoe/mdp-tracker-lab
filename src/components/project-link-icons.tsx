import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";

interface ProjectLinkIconsProps {
  hubspotUrl?: string | null;
  qboUrl?: string | null;
  className?: string;
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        <LinkIcon href={hubspotUrl} label="Open HubSpot deal">
          <ExternalLink className="h-3.5 w-3.5" />
        </LinkIcon>
      ) : null}
      {qboUrl ? (
        <LinkIcon href={qboUrl} label="Open QBO project">
          <Building2 className="h-3.5 w-3.5" />
        </LinkIcon>
      ) : null}
    </div>
  );
}

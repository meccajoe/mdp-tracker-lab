'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {FIND_SECTIONS,findSectionForPath} from '@/lib/lab-tracker-ui';
export default function LabFindNavigation(){
 const active=findSectionForPath(usePathname());if(!active)return null;
 return <nav aria-label="Find sections" className="mb-8 flex flex-wrap gap-1 border-b border-border pb-2">{FIND_SECTIONS.map(section=><Link key={section.key} href={section.href} aria-current={active===section.key?'page':undefined} className={`inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${active===section.key?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>{section.label}</Link>)}</nav>;
}

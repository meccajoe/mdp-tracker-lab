'use client';
import Link from 'next/link';
import {QuoteWorkbook} from './quote-workbook';
export function PrequoteEditor({id}:{id:string}){return <><Link className="m-4 inline-block underline" href="/prequote-items">Back to Prequote items</Link><QuoteWorkbook workspaceId={id} libraryItem onDirtyChange={()=>{}}/></>;}

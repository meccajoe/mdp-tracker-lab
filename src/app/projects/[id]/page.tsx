'use client';
import { useParams } from 'next/navigation';
import { LabProjectDetail } from '@/components/lab-project-detail';
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return <LabProjectDetail projectId={id} />;
}

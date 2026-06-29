import type { Metadata } from "next";
import MaterialDetailClient from "../MaterialDetailClient";

export const metadata: Metadata = {
  title: "Material Detail | MDP Tracker",
};

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialDetailClient mode="edit" materialId={id} />;
}

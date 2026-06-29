import type { Metadata } from "next";
import MaterialDetailClient from "../MaterialDetailClient";

export const metadata: Metadata = {
  title: "New Material | MDP Tracker",
};

export default function NewMaterialPage() {
  return <MaterialDetailClient mode="create" />;
}

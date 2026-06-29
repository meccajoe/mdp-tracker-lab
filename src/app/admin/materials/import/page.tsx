import type { Metadata } from "next";
import MaterialsImportClient from "./MaterialsImportClient";

export const metadata: Metadata = {
  title: "Import Materials Workbook | MDP Tracker",
};

export default function MaterialsImportPage() {
  return <MaterialsImportClient />;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Import Materials Workbook | MDP Tracker",
};

export default function MaterialsImportPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Import Workbook</h1>
      <p className="text-sm text-muted-foreground">
        Materials workbook preview/commit flow lands in Phase 3. This route is reserved as the admin import entry point.
      </p>
    </div>
  );
}

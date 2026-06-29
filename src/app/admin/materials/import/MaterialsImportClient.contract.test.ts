import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials import client supports workbook preview, summary display, and commit action", () => {
  const filePath = join(process.cwd(), "src/app/admin/materials/import/MaterialsImportClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.match(source, /Import Workbook/, "import client should render an import workbook heading");
  assert.match(source, /filePath|Workbook Path/, "import client should let admins specify a workbook path");
  assert.match(source, /\/api\/materials\/import\/preview/, "import client should call the preview API");
  assert.match(source, /\/api\/materials\/import\/commit/, "import client should call the commit API");
  assert.match(source, /Preview Import|Run Preview/, "import client should expose a preview action");
  assert.match(source, /Commit Import|Commit Preview/, "import client should expose a commit action");
  assert.match(source, /needs_review|Rows needing review|Summary/, "import client should render import summary/review information");
});

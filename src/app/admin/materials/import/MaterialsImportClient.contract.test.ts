import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials import client supports preview review filtering commit gating and batch history", () => {
  const filePath = join(process.cwd(), "src/app/admin/materials/import/MaterialsImportClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.match(source, /Import Workbook/, "import client should render an import workbook heading");
  assert.match(source, /filePath|Workbook Path/, "import client should let admins specify a workbook path");
  assert.match(source, /\/api\/materials\/import\/preview/, "import client should call the preview API");
  assert.match(source, /\/api\/materials\/import\/commit/, "import client should call the commit API");
  assert.match(source, /\/api\/materials\/import\/batches/, "import client should load import batch history");
  assert.match(source, /Preview Import|Run Preview/, "import client should expose a preview action");
  assert.match(source, /Commit Import|Commit Preview/, "import client should expose a commit action");
  assert.match(source, /needs review|Resolve or skip|Review Queue/i, "import client should render review workflow guidance");
  assert.match(source, /Filter by status|Needs Review|Approve Row|Skip Row/, "import client should expose review filters and row actions");
  assert.match(source, /Import Batch History|Open Batch|Reload Batch/, "import client should expose prior batch history and reload actions");
  assert.match(source, /Show More History|Cutover Readiness|Commit Counters/, "import client should expose history pagination and cutover-readiness polish");
  assert.match(source, /Show More Rows|loaded \/ \{rowTotal\} total|rowTotal/, "import client should support paging through large review queues");
});

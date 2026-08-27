type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPostmortemSourceRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
) {
  const rows: T[] = [];
  let pageCount = 0;
  while (true) {
    const from = pageCount * pageSize;
    const page = await loadPage(from, from + pageSize - 1);
    if (page.error) throw new Error(page.error.message);
    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    pageCount += 1;
    if (pageRows.length < pageSize) break;
  }
  return { rows, pageCount, complete: true as const };
}

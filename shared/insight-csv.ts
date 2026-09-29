/** Quoting alone does not stop spreadsheet formula execution. Keep exported text inert. */
export function insightCsv(
  rows: (string | number | null | undefined)[][]
): string {
  return (
    "\uFEFF" +
    rows
      .map(row =>
        row
          .map(value => {
            let text = String(value ?? "");
            if (
              typeof value === "string" &&
              /^[\s\u0000-\u001f]*[=+\-@]/.test(text)
            )
              text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
          })
          .join(",")
      )
      .join("\r\n")
  );
}

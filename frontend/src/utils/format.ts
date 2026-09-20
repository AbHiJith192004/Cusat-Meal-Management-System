/**
 * Formatting and export helpers shared by the finance screens.
 *
 * Billing, Ledger and Payments each carried their own byte-identical copy of
 * these two. They are here so a change to the currency format or the CSV
 * encoding reaches every screen at once, rather than fixing one export and
 * leaving the others behind.
 *
 * Note that `inr` (plain grouped number, no symbol) is deliberately NOT here:
 * Billing and the student bill format it differently on purpose -- Billing
 * drops trailing zeros, the student bill always shows two decimals -- and
 * merging them would silently change what a student sees on their bill.
 */

/** Rupee amount with the symbol, e.g. ₹1,234.5 */
export const money = (value: string | number) =>
  Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });

/**
 * Offer `rows` to the browser as a CSV download.
 *
 * Every cell is quoted and internal quotes doubled, so a name or a note
 * containing a comma cannot shift the columns. The leading BOM is what makes
 * Excel read the file as UTF-8 -- without it the rupee sign and Malayalam
 * names arrive as mojibake, which is how this was first noticed.
 */
export const downloadCsv = (filename: string, rows: string[][]) => {
  const escape = (cell: string) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

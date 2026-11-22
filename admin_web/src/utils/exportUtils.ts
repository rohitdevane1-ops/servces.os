/**
 * Universal CSV & Data Export Utility for ServicePro OS
 * Generates and triggers browser download of clean, formatted CSV spreadsheets.
 * Supports both:
 * 1. downloadCSV(filename, arrayOfObjects)
 * 2. downloadCSV(filename, headers, rows)
 */

export function downloadCSV(
  filename: string,
  headersOrObjects: string[] | Record<string, any>[],
  maybeRows?: (string | number | boolean | null | undefined)[][]
): void {
  // Format each cell with proper escaping for quotes, commas, line breaks, and CSV formula injection
  const formatCell = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[\s]*[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  let headers: string[] = [];
  let rows: (string | number | boolean | null | undefined)[][] = [];

  if (Array.isArray(headersOrObjects) && headersOrObjects.length > 0 && headersOrObjects[0] !== null && typeof headersOrObjects[0] === 'object' && !Array.isArray(headersOrObjects[0])) {
    const objectList = (headersOrObjects as Record<string, any>[]).filter(Boolean);
    const headerSet = new Set<string>();
    for (const obj of objectList) {
      for (const k of Object.keys(obj)) headerSet.add(k);
    }
    headers = Array.from(headerSet);
    rows = objectList.map(obj => headers.map(h => obj[h]));
  } else if (Array.isArray(headersOrObjects) && maybeRows) {
    headers = headersOrObjects as string[];
    rows = maybeRows;
  } else {
    headers = Array.isArray(headersOrObjects) ? (headersOrObjects as string[]) : [];
    rows = [];
  }

  const headerLine = headers.map(formatCell).join(',');
  const rowLines = rows.map(row => row.map(formatCell).join(','));
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n'); // UTF-8 BOM for Excel compatibility

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanFilename = filename.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${cleanFilename}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

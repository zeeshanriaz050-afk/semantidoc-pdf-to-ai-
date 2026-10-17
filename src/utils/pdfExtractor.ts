import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Use local bundler worker to guarantee 100% exact version match
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ExtractedPDFResult {
  text: string;
  totalPages: number;
  metadata: Record<string, any>;
}

export async function extractTextFromPDFFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedPDFResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  let fullText = '';

  let meta: any = {};
  try {
    const metaData = await pdf.getMetadata();
    meta = metaData?.info || {};
  } catch (e) {
    // metadata is optional
  }

  // Parse up to 260 pages to cover full textbooks without browser crash
  const maxPagesToParse = Math.min(totalPages, 260);

  for (let pageNum = 1; pageNum <= maxPagesToParse; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, maxPagesToParse);
    }
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      let pageText = '';
      let lastY: number | null = null;

      for (const item of content.items as any[]) {
        if ('str' in item && item.str.trim().length > 0) {
          const currentY = item.transform ? item.transform[5] : null;
          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 6) {
            pageText += '\n';
          } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
            pageText += ' ';
          }
          pageText += item.str;
          lastY = currentY;
        }
      }

      if (pageText.trim().length > 0) {
        fullText += `\n\n--- [Page ${pageNum}] ---\n` + pageText.trim() + '\n';
      }
    } catch (err) {
      console.warn(`Error reading page ${pageNum}:`, err);
    }
  }

  return {
    text: fullText.trim(),
    totalPages,
    metadata: meta,
  };
}

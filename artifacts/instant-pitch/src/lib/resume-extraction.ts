import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a resume smaller than 10 MB, or paste its text instead.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt') return file.text();
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (extension === 'pdf') {
    const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > 30) throw new Error('Choose a resume with 30 pages or fewer, or paste the relevant text.');
      const pages = await Promise.all(
        Array.from({ length: document.numPages }, async (_, index) => {
        const page = await document.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        }),
      );
      return pages.join('\n');
    } finally {
      await loadingTask.destroy();
    }
  }
  throw new Error('Choose a PDF, DOCX, or TXT file to continue.');
}

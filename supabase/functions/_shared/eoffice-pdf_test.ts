import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { newOfficeHashId, prepareOfficePdf } from './eoffice-pdf.ts';

Deno.test('PDF preparation fills required fields and retains every page', async () => {
  const source = await PDFDocument.create();
  const page = source.addPage(); source.addPage();
  source.getForm().createTextField('employee').addToPage(page, { x: 50, y: 500, width: 200, height: 20 });
  const id = newOfficeHashId();
  const result = await prepareOfficePdf(await source.save(), [{ name: 'employee', required: true }], { employee: 'Test Employee' }, id);
  const output = await PDFDocument.load(result.bytes);
  if (output.getPageCount() !== 2 || output.getForm().getFields().length !== 0 || result.sha256.length !== 64 || result.hashId !== id) throw new Error('Invalid prepared PDF.');
});

Deno.test('PDF preparation rejects missing mandatory values', async () => {
  const source = await PDFDocument.create(); source.addPage();
  let rejected = false;
  try { await prepareOfficePdf(await source.save(), [{ name: 'employee', required: true }], {}, newOfficeHashId()); }
  catch { rejected = true; }
  if (!rejected) throw new Error('Missing required field was accepted.');
});

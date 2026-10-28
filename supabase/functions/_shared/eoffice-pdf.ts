import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

export type DocumentField = { name: string; required: boolean };

export async function prepareOfficePdf(source: Uint8Array, fields: DocumentField[], values: Record<string, string>, hashId: string) {
  if (!/^EO-[A-F0-9]{32}$/.test(hashId)) throw new Error('Invalid document hashID.');
  const pdf = await PDFDocument.load(source);
  const form = pdf.getForm();
  for (const field of fields) {
    const value = (values[field.name] || '').trim();
    if (field.required && !value) throw new Error(`Required field: ${field.name}`);
    form.getTextField(field.name).setText(value);
  }
  form.flatten();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { x, y } = page.getCropBox();
    page.drawText(`hashID: ${hashId}`, { x: x + 8, y: y + 6, size: 5, font, color: rgb(.38, .38, .38) });
  }
  const bytes = await pdf.save();
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return { bytes, hashId, sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
}

export function newOfficeHashId() {
  return `EO-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
}

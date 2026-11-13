import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { HttpError } from "./supabase/server";
import { cleanExtractedText } from "./clean-text";

const MAX = 6 * 1024 * 1024;

/** Extrait le texte d'un CV (PDF, Word .docx ou .txt). */
export async function fileToText(file: File): Promise<string> {
  if (file.size > MAX) throw new HttpError(413, `${file.name} dépasse 6 Mo.`);
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const t = cleanExtractedText(String(text)).replace(/[ \t]+\n/g, "\n").trim();
    if (t.length < 100) throw new HttpError(422, `${file.name} : le PDF ne contient pas de texte lisible (CV scanné ou image). Exporte-le depuis Word/Canva en PDF texte, ou colle le texte.`);
    return t;
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return cleanExtractedText(value).trim();
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) return cleanExtractedText(new TextDecoder().decode(buf));
  throw new HttpError(415, `${file.name} : format non pris en charge (PDF, .docx ou .txt).`);
}

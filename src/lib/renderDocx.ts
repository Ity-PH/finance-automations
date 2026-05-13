import Docxtemplater from "docxtemplater";
import { preprocessMergeFields } from "./preprocessDocx";

export interface TemplateData {
  Unit_No: string;
  Unit_Owner: string;
  AD: string;
  WA: string;
  EL: string;
  OT: string;
  Notice_Date: string;
  As_Of_Date: string;
  Due_Date: string;
}

/**
 * Takes a .docx file buffer and a data object,
 * pre-processes Mail Merge XML into {Tag} text nodes,
 * then renders via docxtemplater. Returns populated .docx buffer.
 */
export function renderDocx(
  templateBuffer: ArrayBuffer,
  data: TemplateData
): Uint8Array {
  // Step 1: Convert Mail Merge fields → {Tag} curly-brace text
  const zip = preprocessMergeFields(templateBuffer);

  // Step 2: Render data into the cleaned template
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const output = doc.getZip().generate({
    type: "uint8array",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return output;
}

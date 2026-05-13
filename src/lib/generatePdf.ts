import mammoth from "mammoth";

/**
 * Converts a .docx buffer to styled HTML using mammoth.js,
 * then replaces template variables via string substitution.
 *
 * Supports: {Tag}, «Tag», and Mail Merge MERGEFIELD tags
 * (mammoth strips XML, so merge field display text like «Tag» comes through as-is).
 */

/** Inline styles applied to the wrapper div for letter-style PDF output */
const WRAPPER_STYLE = [
  "font-family: Arial, sans-serif",
  "font-size: 14px",
  "line-height: 1.5",
  "color: #000",
  "padding: 40px 50px",
  "width: 8.5in",
  "min-height: 11in",
  "background: white",
  "box-sizing: border-box",
].join(";");

/** Additional CSS rules injected via a <style> tag inside the wrapper */
const INNER_STYLES = `
  table { border-collapse: collapse; width: 100%; }
  td, th { padding: 4px 8px; text-align: left; }
  p { margin-bottom: 6px; }
  img { max-width: 100%; }
`;

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
 * Step 1: Convert .docx buffer → base HTML string via mammoth.
 * This is called ONCE per generation run — the returned HTML is reused per row.
 */
export async function docxToBaseHtml(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      // Preserve images as inline base64
      convertImage: mammoth.images.imgElement(async (image) => {
        const imageBuffer = await image.read("base64");
        return { src: `data:${image.contentType};base64,${imageBuffer}` };
      }),
    }
  );
  return result.value;
}

/**
 * Step 2 + 3: Wrap base HTML in styled container, then inject row data.
 * Returns a complete HTML document string ready for html2pdf.
 */
export function injectData(baseHtml: string, data: TemplateData): string {
  let html = baseHtml;

  // Replace both {Tag} and «Tag» patterns for each field
  for (const [key, value] of Object.entries(data)) {
    // {Tag} pattern
    html = html.replaceAll(`{${key}}`, value);
    // «Tag» pattern (chevron delimiters)
    html = html.replaceAll(`«${key}»`, value);
    // Sometimes mammoth converts « » to &laquo; &raquo;
    html = html.replaceAll(`&laquo;${key}&raquo;`, value);
  }

  // Wrap in a styled div (NOT a full HTML document — innerHTML can't parse DOCTYPE)
  return `<style>${INNER_STYLES}</style><div style="${WRAPPER_STYLE}">${html}</div>`;
}

/**
 * Step 4: Render a populated HTML string to a PDF Blob using html2pdf.js.
 * Must be called in the browser (requires DOM).
 *
 * The container must be on-screen (not left:-9999px) for html2canvas to work.
 * We use opacity:0 + fixed positioning instead to hide it visually.
 *
 * @param container - The visually-hidden DOM element to render into
 * @param htmlString - The fully populated styled HTML fragment
 * @returns PDF as Blob
 */
export async function htmlToPdfBlob(
  container: HTMLElement,
  htmlString: string
): Promise<Blob> {
  // Dynamic import — html2pdf.js requires window/document
  const html2pdf = (await import("html2pdf.js")).default;

  // Inject content into container
  container.innerHTML = htmlString;

  // Target the inner styled div for capture (skip the <style> tag)
  const target = container.querySelector("div") || container;

  const blob: Blob = await html2pdf()
    .from(target)
    .set({
      margin: 0,
      filename: "temp.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        // Critical: tell html2canvas to capture from element position,
        // not viewport scroll position
        scrollX: 0,
        scrollY: 0,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
      },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    })
    .output("blob");

  // Clean up
  container.innerHTML = "";

  return blob;
}

import PizZip from "pizzip";

/**
 * Pre-processes a .docx buffer to convert Microsoft Word Mail Merge fields
 * into standard docxtemplater {Tag} text nodes.
 *
 * Handles:
 *   - Pattern 1: <w:fldSimple w:instr="MERGEFIELD Name \* MERGEFORMAT">...</w:fldSimple>
 *   - Pattern 2: Complex field with begin/instrText/separate/end fldChar sequence
 *   - Chevron delimiters: «Tag» → {Tag}
 *
 * Returns a mutated PizZip instance ready for `new Docxtemplater(zip)`.
 */
export function preprocessMergeFields(buffer: ArrayBuffer): PizZip {
  const zip = new PizZip(buffer);

  // Process all XML parts that may contain merge fields
  const xmlParts = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/header3.xml",
    "word/footer1.xml",
    "word/footer2.xml",
    "word/footer3.xml",
  ];

  for (const partName of xmlParts) {
    const file = zip.file(partName);
    if (!file) continue;

    let xml = file.asText();
    xml = replaceSimpleFields(xml);
    xml = replaceComplexFields(xml);
    xml = replaceChevronDelimiters(xml);

    zip.file(partName, xml);
  }

  return zip;
}

/**
 * Pattern 1 — Simple merge fields:
 * <w:fldSimple w:instr=" MERGEFIELD  Unit_Owner  \* MERGEFORMAT ">
 *   <w:r>...<w:t>«Unit_Owner»</w:t></w:r>
 * </w:fldSimple>
 *
 * Strategy: Replace entire <w:fldSimple> block with a single <w:r><w:t>{Tag}</w:t></w:r>,
 * preserving any <w:rPr> (run properties = bold/italic/font) from the first run inside.
 */
function replaceSimpleFields(xml: string): string {
  // Match <w:fldSimple ...MERGEFIELD..>...</w:fldSimple>
  // Using [\s\S] instead of . to match across newlines
  const fldSimpleRegex =
    /<w:fldSimple\s[^>]*w:instr="[^"]*MERGEFIELD\s+([\w]+)[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/gi;

  return xml.replace(fldSimpleRegex, (_match, fieldName: string, innerContent: string) => {
    const name = fieldName.trim();

    // Try to extract <w:rPr>...</w:rPr> from inner content to preserve formatting
    const rPrMatch = innerContent.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    const rPr = rPrMatch ? `<w:rPr>${rPrMatch[1]}</w:rPr>` : "";

    return `<w:r>${rPr}<w:t>{${name}}</w:t></w:r>`;
  });
}

/**
 * Pattern 2 — Complex merge fields (split across multiple <w:r> nodes):
 *
 * <w:r>[rPr]<w:fldChar w:fldCharType="begin"/></w:r>
 * <w:r>[rPr]<w:instrText ...> MERGEFIELD  Unit_Owner  \* MERGEFORMAT </w:instrText></w:r>
 * [possibly more instrText runs]
 * <w:r>[rPr]<w:fldChar w:fldCharType="separate"/></w:r>
 * <w:r>[rPr]<w:t>«Unit_Owner»</w:t></w:r>
 * [possibly more display runs]
 * <w:r>[rPr]<w:fldChar w:fldCharType="end"/></w:r>
 *
 * Strategy: Match the entire begin→end sequence. Extract field name from instrText.
 * Replace entire sequence with single <w:r><w:t>{Tag}</w:t></w:r>, preserving rPr
 * from the instrText run.
 *
 * Note: instrText content may be split across multiple <w:r> nodes in very dirty
 * Word XML, so we concatenate all instrText values before extracting the field name.
 */
function replaceComplexFields(xml: string): string {
  // This regex matches the entire begin...end fldChar sequence.
  // It's intentionally broad — we parse the internals after matching.
  //
  // Pattern: <w:r>...<w:fldChar w:fldCharType="begin"/>...</w:r>
  //          [middle content with instrText, separate, display text]
  //          <w:r>...<w:fldChar w:fldCharType="end"/>...</w:r>
  const complexFieldRegex =
    /<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar\s+w:fldCharType="begin"\s*\/>[\s\S]*?<\/w:r>([\s\S]*?)<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar\s+w:fldCharType="end"\s*\/>[\s\S]*?<\/w:r>/gi;

  return xml.replace(complexFieldRegex, (match, middleContent: string) => {
    // Extract all instrText content (may span multiple runs)
    const instrParts: string[] = [];
    const instrRegex = /<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/gi;
    let instrMatch: RegExpExecArray | null;
    while ((instrMatch = instrRegex.exec(middleContent)) !== null) {
      instrParts.push(instrMatch[1]);
    }
    const fullInstr = instrParts.join("").trim();

    // Check if this is actually a MERGEFIELD
    const mergeMatch = fullInstr.match(/MERGEFIELD\s+([\w]+)/i);
    if (!mergeMatch) {
      // Not a merge field — leave untouched
      return match;
    }

    const fieldName = mergeMatch[1].trim();

    // Try to extract <w:rPr> from the instrText run for formatting preservation
    const rPrMatch = middleContent.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    const rPr = rPrMatch ? `<w:rPr>${rPrMatch[1]}</w:rPr>` : "";

    return `<w:r>${rPr}<w:t>{${fieldName}}</w:t></w:r>`;
  });
}

/**
 * Chevron delimiter cleanup:
 * Replaces «TagName» with {TagName} inside <w:t> nodes.
 * Handles cases where admins typed chevrons directly instead of using Insert Merge Field.
 */
function replaceChevronDelimiters(xml: string): string {
  return xml.replace(
    /«(\w+)»/g,
    (_match, name: string) => `{${name}}`
  );
}

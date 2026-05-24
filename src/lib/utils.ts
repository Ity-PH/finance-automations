/**
 * Converts unit strings like "123A" or "A123" into "A-0123"
 */
export function formatUnitFilename(rawUnit: string): string {
  // Extract all alphabetical characters and make them uppercase
  const letters = rawUnit.replace(/[^a-zA-Z]/g, "").toUpperCase();
  // Extract all digits
  const numbers = rawUnit.replace(/[^0-9]/g, "");

  // If the unit has both letters and numbers, format it properly
  if (letters && numbers) {
    // Pad the extracted numbers to ensure it is always at least 4 digits
    const paddedNumber = numbers.padStart(4, "0");
    return `${letters}-${paddedNumber}`;
  }

  // Fallback: If it's a weird format (e.g. only numbers), just make it URL safe
  return rawUnit.replace(/[^a-zA-Z0-9_-]/g, "_");
}

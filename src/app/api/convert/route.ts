import { NextRequest, NextResponse } from "next/server";

const GOTENBERG_URL =
  process.env.GOTENBERG_URL ||
  "http://localhost:3000/forms/libreoffice/convert";

/**
 * POST /api/convert
 * Accepts a .docx file as multipart/form-data (field: "file"),
 * forwards to Gotenberg for PDF conversion, returns PDF buffer.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing 'file' field in form data" },
        { status: 400 }
      );
    }

    // Build multipart payload for Gotenberg
    const gotenbergForm = new FormData();
    gotenbergForm.append("files", file, "document.docx");

    const gotenbergResponse = await fetch(GOTENBERG_URL, {
      method: "POST",
      body: gotenbergForm,
    });

    if (!gotenbergResponse.ok) {
      const errText = await gotenbergResponse.text();
      console.error("Gotenberg error:", gotenbergResponse.status, errText);
      return NextResponse.json(
        { error: `Gotenberg conversion failed: ${gotenbergResponse.status}` },
        { status: 502 }
      );
    }

    const pdfBuffer = await gotenbergResponse.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=output.pdf",
      },
    });
  } catch (err) {
    console.error("Convert API error:", err);
    return NextResponse.json(
      { error: "Internal server error during conversion" },
      { status: 500 }
    );
  }
}

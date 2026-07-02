import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { storePdfDocument } from "@/app/lib/pdf-store";

export const runtime = "nodejs";

PDFParse.setWorker(
  pathToFileURL(
    path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs"),
  ).href,
);

type UploadSuccessResponse = {
  document: {
    id: string;
    fileName: string;
    pageCount: number;
    textLength: number;
    preview: string;
  };
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Bitte lade eine PDF-Datei hoch." }, { status: 400 });
    }

    if (!isPdf(file)) {
      return NextResponse.json({ error: "Nur PDF-Dateien sind erlaubt." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    await parser.destroy();

    const text = result.text.trim();
    const storedDocument = storePdfDocument({
      fileName: file.name,
      pageCount: result.total,
      text,
    });

    const response: UploadSuccessResponse = {
      document: {
        id: storedDocument.id,
        fileName: storedDocument.fileName,
        pageCount: storedDocument.pageCount,
        textLength: storedDocument.text.length,
        preview: storedDocument.text.slice(0, 240),
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("PDF upload failed:", error);

    const message = error instanceof Error ? error.message : "Die PDF-Verarbeitung ist fehlgeschlagen.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
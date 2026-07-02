export type StoredPdfDocument = {
  id: string;
  fileName: string;
  pageCount: number;
  text: string;
  uploadedAt: number;
};

const pdfDocuments = new Map<string, StoredPdfDocument>();

export function storePdfDocument(document: Omit<StoredPdfDocument, "id" | "uploadedAt">) {
  const storedDocument: StoredPdfDocument = {
    id: crypto.randomUUID(),
    uploadedAt: Date.now(),
    ...document,
  };

  pdfDocuments.set(storedDocument.id, storedDocument);

  return storedDocument;
}

export function getPdfDocuments(documentIds: string[]) {
  return documentIds
    .map((documentId) => pdfDocuments.get(documentId))
    .filter((document): document is StoredPdfDocument => Boolean(document));
}

export function buildPdfContext(documentIds?: string[], fallbackContext?: string) {
  const resolvedDocuments = documentIds && documentIds.length > 0 ? getPdfDocuments(documentIds) : [];

  if (resolvedDocuments.length > 0) {
    return resolvedDocuments
      .map(
        (document, index) =>
          `Dokument ${index + 1}: ${document.fileName}\nSeiten: ${document.pageCount}\nText:\n${document.text}`,
      )
      .join("\n\n---\n\n");
  }

  return fallbackContext?.trim() ?? "";
}
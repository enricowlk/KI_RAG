"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

type UploadedDocument = {
  id: string;
  fileName: string;
  pageCount: number;
  textLength: number;
  preview: string;
};

type ToastMessage = {
  id: string;
  title: string;
  description: string;
};

const ACCEPTED_MIME_TYPES = ["application/pdf"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export default function Home() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const documentIds = useMemo(() => documents.map((document) => document.id), [documents]);

  const addToast = useCallback((title: string, description: string) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, description }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  // Transport wird neu erzeugt, sobald sich die Liste der hochgeladenen
  // Dokument-IDs ändert -> kein Ref-Zugriff während des Renderns nötig.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { documentIds },
      }),
    [documentIds],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onError(requestError) {
      const message = requestError.message || "Fehler: Verbindung zur lokalen KI fehlgeschlagen. Bitte prüfe, ob Ollama läuft.";
      setChatError(message);
      addToast("Lokale KI nicht erreichbar", message);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const canChat = documents.length > 0 && !isUploading;

  // Hinweis: Der frühere separate useEffect, der `error` nach chatError
  // synchronisiert hat, wurde entfernt - onError oben deckt denselben Fall
  // bereits ab und vermeidet damit unnötiges setState im Effect.

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const uploadFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | { document?: UploadedDocument; error?: string }
        | { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Die PDF-Verarbeitung ist fehlgeschlagen.");
      }

      if (!("document" in payload) || !payload.document) {
        throw new Error("Die PDF-Verarbeitung hat keine Daten geliefert.");
      }

      setDocuments((current) => [payload.document as UploadedDocument, ...current]);
      setChatError(null);
      addToast("PDF verarbeitet", `${file.name} wurde extrahiert und steht jetzt im Chat bereit.`);
    },
    [addToast],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const selectedFiles = Array.from(files);

      if (selectedFiles.length === 0) {
        return;
      }

      const validFiles = selectedFiles.filter((file) => {
        const isPdf = ACCEPTED_MIME_TYPES.includes(file.type) || file.name.toLowerCase().endsWith(".pdf");

        if (!isPdf) {
          addToast("Ungültiges Dateiformat", `${file.name} ist kein PDF und wurde übersprungen.`);
        }

        return isPdf;
      });

      if (validFiles.length === 0) {
        return;
      }

      setIsUploading(true);

      try {
        for (const file of validFiles) {
          await uploadFile(file);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Die PDF-Verarbeitung ist fehlgeschlagen.";
        setChatError(message);
        addToast("Upload fehlgeschlagen", message);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [addToast, uploadFile],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      await handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const submitMessage = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = input.trim();
      if (!trimmed || !canChat || isLoading) {
        return;
      }

      setChatError(null);
      sendMessage({ text: trimmed });
      setInput("");
    },
    [canChat, input, isLoading, sendMessage],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_30%),linear-gradient(135deg,#07111f_0%,#091927_45%,#050b13_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-size-[72px_72px] opacity-15" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">         
        <div className="grid flex-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="rounded-3xl border border-dashed border-cyan-400/35 bg-cyan-400/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-100">PDF Upload</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Nur PDFs werden akzeptiert. Mehrere Dateien kannst du nacheinander hochladen.</p>
                </div>
                <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                  {isUploading ? "Verarbeite…" : `${documents.length} Datei${documents.length === 1 ? "" : "en"}`}
                </div>
              </div>

              <label
                className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-white/10 bg-slate-950/80 px-4 text-center transition hover:border-cyan-300/50 hover:bg-slate-900/90"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => handleFiles(event.target.files ?? [])}
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-lg font-semibold text-cyan-100">
                  PDF
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">Drag & Drop oder klicken</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
                  Ziehe eine oder mehrere PDF-Dateien hier hinein oder öffne den Dateidialog.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white">
                  {isUploading ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-cyan-300" />
                      Extrahiere Text …
                    </>
                  ) : (
                    <>
                      <span className="text-cyan-200">+</span>
                      PDF auswählen
                    </>
                  )}
                </div>
              </label>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>Validierung: nur .pdf</span>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1.5 text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                  onClick={handleUploadClick}
                >
                  Datei hinzufügen
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Hochgeladene Dokumente</h3>
                  <p className="mt-1 text-xs text-slate-400">Der extrahierte Text bleibt temporär im Server-Speicher.</p>
                </div>
                {isUploading ? <span className="text-xs text-cyan-200">Verarbeitung läuft</span> : null}
              </div>

              <div className="mt-4 space-y-3">
                {documents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-400">
                    Noch keine PDFs hochgeladen.
                  </div>
                ) : (
                  documents.map((document) => (
                    <article key={document.id} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-medium text-white">{document.fileName}</h4>
                          <p className="mt-1 text-xs text-slate-400">{document.pageCount} Seiten · {formatFileSize(document.textLength)} extrahierter Text</p>
                        </div>
                        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">bereit</span>
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-300">{document.preview || "Kein Preview verfügbar."}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-[70vh] flex-col rounded-3xl border border-white/10 bg-slate-950/70 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">Chat Interface</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {documents.length > 0
                    ? "Antworten basieren ausschließlich auf den hochgeladenen PDFs."
                    : "Lade zuerst ein PDF hoch, um eine Konversation zu starten."}
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {canChat ? `${documents.length} Kontextdatei${documents.length === 1 ? "" : "en"}` : "Kein Kontext"}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {chatError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {chatError}
                </div>
              ) : null}

              {messages.length === 0 ? (
                <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/50 px-6 text-center">
                  <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.28em] text-cyan-100">
                    ChatGPT-Stil · lokal
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-white">Stelle Fragen zu deinen PDFs</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                    Zum Beispiel: Welche Kündigungsfrist wird genannt, welche Laufzeit gilt oder welche Pflichten sind beschrieben?
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isUser = message.role === "user";

                    return (
                      <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-lg ${
                            isUser
                              ? "bg-cyan-400 text-slate-950"
                              : "border border-white/10 bg-slate-900/90 text-slate-100"
                          }`}
                        >
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">
                            {isUser ? "Du" : "Assistent"}
                          </div>
                          <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div ref={endOfMessagesRef} />
            </div>

            <form onSubmit={submitMessage} className="border-t border-white/10 px-5 py-4">
              <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-3">
                <label className="sr-only" htmlFor="chat-input">
                  Frage an die PDFs
                </label>
                <textarea
                  id="chat-input"
                  value={input}
                  disabled={!canChat}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setChatError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={canChat ? "Frage zu deinem PDF stellen …" : "Lade zuerst ein PDF hoch …"}
                  rows={3}
                  className="w-full resize-none rounded-[18px] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    {canChat ? "Antworten werden gestreamt und direkt im Verlauf angezeigt." : "Die Chat-Funktion wartet auf mindestens ein PDF."}
                  </div>
                  <button
                    type="submit"
                    disabled={!canChat || isLoading || input.trim().length === 0}
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {isLoading ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                        Antworte …
                      </>
                    ) : (
                      "Frage senden"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-[0_14px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="text-sm font-semibold text-white">{toast.title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">{toast.description}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
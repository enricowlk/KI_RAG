import { NextResponse } from "next/server";

import { buildPdfContext } from "@/app/lib/pdf-store";

export const runtime = "nodejs";

const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/api";
const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2";

const systemPrompt =
  "Du bist ein präziser Assistenz-Bot. Beantworte die Frage des Nutzers AUSSCHLIESSLICH auf Basis des folgenden bereitgestellten PDF-Kontexts. Wenn die Antwort im Text nicht zu finden ist, sage höflich, dass du es nicht weißt.";

type ChatRequestBody = {
  messages?: unknown;
  documentIds?: string[];
  pdfContext?: string;
};

type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function normalizeMessageContent(message: Record<string, unknown>): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  const parts = message.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const typedPart = part as { type?: unknown; text?: unknown; content?: unknown };
      if (typedPart.type === "text" && typeof typedPart.text === "string") {
        return typedPart.text;
      }

      if (typeof typedPart.content === "string") {
        return typedPart.content;
      }

      return "";
    })
    .join("")
    .trim();
}

function normalizeMessages(messages: unknown): OllamaChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message): OllamaChatMessage | null => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const typedMessage = message as Record<string, unknown>;
      const role = typedMessage.role;

      if (role !== "user" && role !== "assistant") {
        return null;
      }

      const content = normalizeMessageContent(typedMessage);
      if (!content) {
        return null;
      }

      return {
        role,
        content,
      };
    })
    .filter((message): message is OllamaChatMessage => message !== null);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const pdfContext = buildPdfContext(body.documentIds, body.pdfContext);
    const messages = normalizeMessages(body.messages);

    if (!pdfContext) {
      return NextResponse.json(
        { error: "Bitte lade zuerst mindestens ein PDF hoch." },
        { status: 400 },
      );
    }

    const response = await fetch(`${ollamaBaseUrl.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ollamaModel,
        stream: true,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nKontext:\n${pdfContext}`,
          },
          ...messages,
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(errorText || `Ollama request failed with status ${response.status}.`);
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              if (line) {
                try {
                  const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
                  const text = chunk.message?.content ?? "";

                  if (text) {
                    controller.enqueue(encoder.encode(text));
                  }

                  if (chunk.done) {
                    controller.close();
                    return;
                  }
                } catch {
                  // Ignore malformed keep-alive lines.
                }
              }

              newlineIndex = buffer.indexOf("\n");
            }
          }

          const remaining = buffer.trim();
          if (remaining) {
            const chunk = JSON.parse(remaining) as { message?: { content?: string } };
            if (chunk.message?.content) {
              controller.enqueue(encoder.encode(chunk.message.content));
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("Chat route failed:", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Fehler: Verbindung zur lokalen KI fehlgeschlagen. Bitte prüfe, ob Ollama läuft.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 503 },
    );
  }
}
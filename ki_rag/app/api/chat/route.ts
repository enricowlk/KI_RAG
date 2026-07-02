import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { buildPdfContext } from "@/app/lib/pdf-store";

export const runtime = "nodejs";

const ollamaBaseUrl = process.env.OLLAMA_BASE_URL
  ? process.env.OLLAMA_BASE_URL.replace("/api", "/v1")
  : "http://127.0.0.1:11434/v1";

const ollama = createOpenAI({
  baseURL: ollamaBaseUrl,
  apiKey: "ollama",
});

const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2";

const systemPrompt =
  "Du bist ein präziser Assistenz-Bot. Beantworte die Frage des Nutzers AUSSCHLIESSLICH auf Basis des folgenden bereitgestellten PDF-Kontexts. Wenn die Antwort im Text nicht zu finden ist, sage höflich, dass du es nicht weißt.";

type ChatRequestBody = {
  messages: UIMessage[];
  documentIds?: string[];
  pdfContext?: string;
};

export async function POST(request: Request) {
  try {
    const body: ChatRequestBody = await request.json();

    const pdfContext = buildPdfContext(body.documentIds, body.pdfContext);

    if (!pdfContext) {
      return NextResponse.json(
        { error: "Bitte lade zuerst mindestens ein PDF hoch." },
        { status: 400 }
      );
    }

    // WICHTIG: in dieser SDK-Version ist convertToModelMessages async -> await nicht vergessen
    const modelMessages = await convertToModelMessages(body.messages);

    const result = streamText({
      model: ollama(ollamaModel),
      system: `${systemPrompt}\n\nKontext:\n${pdfContext}`,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat route failed:", error);
    return NextResponse.json(
      { error: "Fehler: Verbindung zur lokalen KI fehlgeschlagen." },
      { status: 503 }
    );
  }
}
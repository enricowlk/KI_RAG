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

// Unser eigener, kugelsicherer Typ für Ollama
type CleanMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

    // 1. Offizielle Vercel-Umwandlung
    const modelMessages = await convertToModelMessages(body.messages);

    // 2. Der "Ollama-Filter" baut strikt unser CleanMessage-Format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanMessages: CleanMessage[] = modelMessages.map((msg: any) => {
      let textContent = "";
      
      // Wenn es schon ein String ist, super
      if (typeof msg.content === "string") {
        textContent = msg.content;
      } 
      // Wenn es ein Array mit nervigen Vercel-Metadaten ist, extrahieren wir nur den Text
      else if (Array.isArray(msg.content)) {
        textContent = msg.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((part: any) => part.type === "text")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((part: any) => part.text)
          .join("\n");
      }
      
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: textContent,
      };
    });

    const result = await streamText({
      model: ollama(ollamaModel),
      system: `${systemPrompt}\n\nKontext:\n${pdfContext}`,
      messages: cleanMessages,
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
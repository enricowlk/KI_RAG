import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { buildPdfContext } from "@/app/lib/pdf-store";

export const runtime = "nodejs";

// Wir nutzen den offiziellen OpenAI Provider, leiten ihn aber auf deinen lokalen Mac um!
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL 
  ? process.env.OLLAMA_BASE_URL.replace('/api', '/v1') // Wandelt /api in /v1 um
  : "http://127.0.0.1:11434/v1";

const ollama = createOpenAI({
  baseURL: ollamaBaseUrl,
  apiKey: "ollama", // Ollama braucht eigentlich keinen API-Key, aber das Paket erwartet einen Platzhalter
});

const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2";

const systemPrompt =
  "Du bist ein präziser Assistenz-Bot. Beantworte die Frage des Nutzers AUSSCHLIESSLICH auf Basis des folgenden bereitgestellten PDF-Kontexts. Wenn die Antwort im Text nicht zu finden ist, sage höflich, dass du es nicht weißt.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const pdfContext = buildPdfContext(body.documentIds, body.pdfContext);

    if (!pdfContext) {
      return NextResponse.json(
        { error: "Bitte lade zuerst mindestens ein PDF hoch." },
        { status: 400 }
      );
    }

    const result = await streamText({
      // Da wir jetzt den offiziellen Provider nutzen, gibt es keine Typ-Fehler mehr!
      model: ollama(ollamaModel),
      
      system: `${systemPrompt}\n\nKontext:\n${pdfContext}`,
      messages: body.messages, 
    });

    return result.toTextStreamResponse();

  } catch (error) {
    console.error("Chat route failed:", error);
    return NextResponse.json(
      { error: "Fehler: Verbindung zur lokalen KI fehlgeschlagen." },
      { status: 503 }
    );
  }
}
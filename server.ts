import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

type SupportedLanguage = "en-US" | "ar-LB" | "fr-FR" | "kn-IN";

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

interface ProxyRequestBody {
  query: string;
  language: SupportedLanguage;
  history?: HistoryMessage[];
}

const SYSTEM_MESSAGES: Record<SupportedLanguage, string> = {
  "kn-IN":
    "ನೀವು ನೋವಾ (Nova) ಎಂಬ ಬುದ್ಧಿವಂತ AI ಧ್ವನಿ ಸಹಾಯಕ. ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳಿಗೆ ಸರಳ, ನಿಖರ ಮತ್ತು ಸ್ಪಷ್ಟ ಕನ್ನಡದಲ್ಲಿ ನೇರವಾಗಿ ಉತ್ತರಿಸಿ. ಯಾವುದೇ ಮುನ್ನುಡಿ ಅಥವಾ ಅನಗತ್ಯ ಪೀಠಿಕೆ ನೀಡಬೇಡಿ. ಸಂಕ್ಷಿಪ್ತ ಹಾಗೂ ನಿಖರ ಮಾಹಿತಿ ಮಾತ್ರ ನೀಡಿ.",
  "ar-LB":
    "أنت مساعد شخصي ذكي اسمه نوفا. أجب بشكل مباشر على الأسئلة بدون مقدمات أو أسئلة توضيحية. قدم معلومات مختصرة ودقيقة فقط.",
  "fr-FR":
    "Vous êtes un assistant personnel intelligent nommé Nova. Répondez directement aux questions sans introduction et sans poser de questions de clarification. Soyez concis et précis.",
  "en-US":
    "You are an intelligent personal assistant named Nova. Answer questions directly without introductions or asking clarifying questions back. Be concise and accurate. If the user writes or asks in Kannada (ಕನ್ನಡ), reply in fluent, natural Kannada script.",
};

function getLocalizedErrorMessage(language: SupportedLanguage): string {
  switch (language) {
    case "kn-IN":
      return "ಕ್ಷಮಿಸಿ, ಸಿಸ್ಟಮ್ ಪ್ರಸ್ತುತ ಕಾರ್ಯನಿರತವಾಗಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.";
    case "ar-LB":
      return "عذراً، النظام مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
    case "fr-FR":
      return "Désolé, le système est actuellement occupé. Veuillez réessayer dans un moment.";
    default:
      return "Sorry, the system is currently busy. Please try again in a moment.";
  }
}

// In-memory rate limiting
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let timestamps = requestLog.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

let lastCleanup = Date.now();
function cleanupRateLimit(): void {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) return;
  lastCleanup = now;
  for (const [ip, timestamps] of requestLog) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) requestLog.delete(ip);
    else requestLog.set(ip, recent);
  }
}

// Lazy Gemini client helper
function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function buildContents(query: string, history?: HistoryMessage[]) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(history)) {
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      if (
        msg &&
        typeof msg.text === "string" &&
        msg.text.length > 0 &&
        (msg.role === "user" || msg.role === "assistant")
      ) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text }],
        });
      }
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: query }],
  });
  return contents;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Streaming AI endpoint
  app.post("/api/ai-stream", async (req: Request, res: Response) => {
    cleanupRateLimit();

    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please slow down." });
      return;
    }

    const body = req.body as ProxyRequestBody;
    const query = body?.query?.trim();
    const language = body?.language || "en-US";
    const history = body?.history;

    if (!query) {
      res.status(400).json({ error: "Missing required query" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY environment variable is not set" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const systemInstruction = SYSTEM_MESSAGES[language] || SYSTEM_MESSAGES["en-US"];
    const contents = buildContents(query, history);

    try {
      const ai = getAIClient();
      const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("[AI Stream] Error:", error);
      const fallbackText = getLocalizedErrorMessage(language);
      res.write(`data: ${JSON.stringify({ text: fallbackText })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  // Non-streaming endpoint (supports both /.netlify/functions/ai and /api/ai)
  const handleNonStreaming = async (req: Request, res: Response) => {
    cleanupRateLimit();

    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please slow down." });
      return;
    }

    const body = req.body as ProxyRequestBody;
    const query = body?.query?.trim();
    const language = body?.language || "en-US";
    const history = body?.history;

    if (!query) {
      res.status(400).json({ error: "Missing required query" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: true,
        responseText: "GEMINI_API_KEY environment variable is not set",
        language,
      });
      return;
    }

    const systemInstruction = SYSTEM_MESSAGES[language] || SYSTEM_MESSAGES["en-US"];
    const contents = buildContents(query, history);

    try {
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const responseText = response.text?.trim() || "";
      res.json({
        responseText,
        language,
      });
    } catch (error) {
      console.error("[AI] Error:", error);
      res.status(502).json({
        error: true,
        responseText: getLocalizedErrorMessage(language),
        language,
      });
    }
  };

  app.post("/api/ai", handleNonStreaming);
  app.post("/.netlify/functions/ai", handleNonStreaming);

  // Vite middleware in development vs static file serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nova server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

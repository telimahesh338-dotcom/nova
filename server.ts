import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
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

const STRICT_KANNADA_SYSTEM_PROMPT =
  "ನೀವು ನೋವಾ (Nova) ಎಂಬ ಅತ್ಯಂತ ಬುದ್ಧಿವಂತ ಮತ್ತು ವೇಗದ AI ಧ್ವನಿ ಸಹಾಯಕ.\n" +
  "ಅತ್ಯುನ್ನತ ಕಡ್ಡಾಯ ನಿಯಮ (Strict Mandatory Rule): ನೀವು ಯಾವಾಗಲೂ ಮತ್ತು ಪ್ರತಿಯೊಂದು ಪ್ರಶ್ನೆಗೂ ಕೇವಲ ಕನ್ನಡದಲ್ಲೇ (ಕನ್ನಡ ಲಿಪಿಯಲ್ಲಿ) ಉತ್ತರಿಸಬೇಕು (ONLY KANNADA REPLIES).\n" +
  "ಧ್ವನಿ ಸಂಭಾಷಣೆಗೆ ಸೂಕ್ತವಾಗುವಂತೆ ಉತ್ತರಗಳು ನೇರವಾಗಿ, ಸಂಕ್ಷಿಪ್ತವಾಗಿ (ಸಾಮಾನ್ಯವಾಗಿ 1-3 ವಾಕ್ಯಗಳಲ್ಲಿ), ಹಾಗೂ ಸ್ಪಷ್ಟವಾದ ಸುಲಭ ಕನ್ನಡದಲ್ಲಿರಬೇಕು. ಯಾವುದೇ ಮುನ್ನುಡಿ, ಅತಿ ಉದ್ದದ ಪಟ್ಟಿ ಅಥವಾ ಅನಗತ್ಯ ಪೀಠಿಕೆ ನೀಡಬೇಡಿ.\n" +
  "ಬಳಕೆದಾರರು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಕೇಳಲಿ, ಕಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಬರೆದಿರಲಿ, ಅಥವಾ ಬೇರೆ ಯಾವುದೇ ಭಾಷೆಯಲ್ಲಿ ಕೇಳಿದರೂ ಸರಿ — ನಿಮ್ಮ ಪ್ರತ್ಯುತ್ತರವು 100% ಕಡ್ಡಾಯವಾಗಿ ಕನ್ನಡ ಲಿಪಿ ಮತ್ತು ನೈಸರ್ಗಿಕ ಕನ್ನಡ ಭಾಷೆಯಲ್ಲೇ ಇರಬೇಕು.";

const SYSTEM_MESSAGES: Record<SupportedLanguage, string> = {
  "kn-IN": STRICT_KANNADA_SYSTEM_PROMPT,
  "en-US": STRICT_KANNADA_SYSTEM_PROMPT,
  "ar-LB": STRICT_KANNADA_SYSTEM_PROMPT,
  "fr-FR": STRICT_KANNADA_SYSTEM_PROMPT,
};

function getLocalizedErrorMessage(language?: SupportedLanguage): string {
  if (language === "ar-LB") {
    return "عذراً، النظام مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
  }
  if (language === "fr-FR") {
    return "Désolé, le système est actuellement occupé. Veuillez réessayer dans un moment.";
  }
  // Default to Kannada
  return "ಕ್ಷಮಿಸಿ, ಸಿಸ್ಟಮ್ ಪ್ರಸ್ತುತ ಕಾರ್ಯನಿರತವಾಗಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.";
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

// Candidate models in order of priority:
// 1. "gemini-3.8-flash" (preferred model requested by user)
// 2. "gemini-2.5-flash" (resilient fallback if 3.8-flash experiences temporary 503 spikes)
// 3. "gemini-flash-latest" (additional fallback)
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

async function streamWithModelFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  onChunk: (text: string) => void
): Promise<void> {
  let lastError: unknown;

  for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
    const model = CANDIDATE_MODELS[i];
    let chunkCount = 0;
    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          chunkCount++;
          onChunk(text);
        }
      }
      return;
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Stream] Model ${model} encountered an issue (chunks sent: ${chunkCount}):`, errMsg);

      // If text has already been emitted to the client, we cannot seamlessly restart
      // without duplicating content, so rethrow.
      if (chunkCount > 0) {
        throw err;
      }

      // If initial connection failed (e.g. 503 high demand), wait briefly and try next model
      if (i < CANDIDATE_MODELS.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  throw lastError;
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string
): Promise<string> {
  let lastError: unknown;

  for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
    const model = CANDIDATE_MODELS[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const responseText = response.text?.trim() || "";
      if (responseText) {
        return responseText;
      }
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI] Model ${model} encountered an issue:`, errMsg);

      if (i < CANDIDATE_MODELS.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  throw lastError;
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
    const language = body?.language || "kn-IN";
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
      await streamWithModelFallback(ai, contents, systemInstruction, (text) => {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      });

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("[AI Stream] All candidate models failed:", error);
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
    const language = body?.language || "kn-IN";
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
      const responseText = await generateWithModelFallback(ai, contents, systemInstruction);

      res.json({
        responseText,
        language,
      });
    } catch (error) {
      console.error("[AI] All candidate models failed:", error);
      res.status(502).json({
        error: true,
        responseText: getLocalizedErrorMessage(language),
        language,
      });
    }
  };

  app.post("/api/ai", handleNonStreaming);
  app.post("/.netlify/functions/ai", handleNonStreaming);

  // --- Workspace Files API ---
  app.get("/api/workspace/files", (_req: Request, res: Response) => {
    try {
      const rootDir = process.cwd();
      const ignoredDirs = new Set(["node_modules", "dist", ".git", ".next", ".cache"]);
      const ignoredFiles = new Set(["bun.lock", "package-lock.json", ".DS_Store"]);

      interface FileEntry {
        path: string;
        name: string;
        isDirectory: boolean;
        size: number;
        modified: number;
        extension: string;
      }

      const results: FileEntry[] = [];

      function scanDir(currentDir: string, depth = 0) {
        if (depth > 5) return;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(rootDir, fullPath);

          if (entry.isDirectory()) {
            if (ignoredDirs.has(entry.name)) continue;
            results.push({
              path: relativePath,
              name: entry.name,
              isDirectory: true,
              size: 0,
              modified: 0,
              extension: "",
            });
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            if (ignoredFiles.has(entry.name)) continue;
            try {
              const stat = fs.statSync(fullPath);
              const ext = path.extname(entry.name).replace(".", "").toLowerCase();
              results.push({
                path: relativePath,
                name: entry.name,
                isDirectory: false,
                size: stat.size,
                modified: stat.mtimeMs,
                extension: ext,
              });
            } catch {
              // skip unreadable file
            }
          }
        }
      }

      scanDir(rootDir);
      results.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.path.localeCompare(b.path);
      });

      res.json({ files: results });
    } catch (err) {
      console.error("[Workspace API] Error listing files:", err);
      res.status(500).json({ error: "Failed to list workspace files" });
    }
  });

  app.get("/api/workspace/file", (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      const rootDir = process.cwd();
      const resolved = path.resolve(rootDir, filePath);
      if (!resolved.startsWith(rootDir)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Read max 2MB
      const stat = fs.statSync(resolved);
      if (stat.size > 2 * 1024 * 1024) {
        res.status(413).json({ error: "File too large (max 2MB)" });
        return;
      }

      const content = fs.readFileSync(resolved, "utf-8");
      res.json({
        path: filePath,
        name: path.basename(filePath),
        content,
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch (err) {
      console.error("[Workspace API] Error reading file:", err);
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  app.post("/api/workspace/file", (req: Request, res: Response) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || typeof content !== "string") {
        res.status(400).json({ error: "Valid path and content required" });
        return;
      }

      const rootDir = process.cwd();
      const resolved = path.resolve(rootDir, filePath);
      if (!resolved.startsWith(rootDir)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolved, content, "utf-8");
      const stat = fs.statSync(resolved);

      res.json({
        success: true,
        path: filePath,
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch (err) {
      console.error("[Workspace API] Error saving file:", err);
      res.status(500).json({ error: "Failed to save file" });
    }
  });

  // --- Terminal Command Execution API ---
  app.post("/api/terminal/exec", (req: Request, res: Response) => {
    const { command } = req.body;
    if (!command || typeof command !== "string" || !command.trim()) {
      res.status(400).json({ error: "Command required" });
      return;
    }

    const trimmed = command.trim();
    // Safety filter: prevent destructive recursive deletions or fork bombs
    if (trimmed.includes("rm -rf /") || trimmed.includes(":(){ :|:& };:")) {
      res.json({
        stdout: "",
        stderr: "ಆಜ್ಞೆಯನ್ನು ನಿಷೇಧಿಸಲಾಗಿದೆ (Command blocked for safety reasons).",
        exitCode: 1,
      });
      return;
    }

    const startTime = Date.now();
    exec(
      trimmed,
      {
        cwd: process.cwd(),
        timeout: 15000,
        maxBuffer: 1024 * 512,
      },
      (error, stdout, stderr) => {
        const executionTime = Date.now() - startTime;
        res.json({
          stdout: stdout || "",
          stderr: stderr || (error ? error.message : ""),
          exitCode: error ? (error.code ?? 1) : 0,
          executionTime,
        });
      }
    );
  });

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

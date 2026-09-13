export type ActiveTab = "home" | "files" | "editing" | "terminal";

export interface WorkspaceFile {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
  extension: string;
}

export interface TerminalEntry {
  id: string;
  command: string;
  timestamp: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTime?: number;
  status: "running" | "completed" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  isStreaming?: boolean;
}

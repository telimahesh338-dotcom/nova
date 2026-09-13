import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  CornerDownLeft,
  Info
} from 'lucide-react';
import { TerminalEntry } from '../types';

export const TerminalView: React.FC = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<TerminalEntry[]>([
    {
      id: 'init-1',
      command: 'echo "ನೋವಾ ಸಿಸ್ಟಮ್ ಟರ್ಮಿನಲ್ ಸಿದ್ಧವಾಗಿದೆ (Nova System Terminal Ready)"',
      timestamp: new Date().toLocaleTimeString(),
      stdout: 'ನೋವಾ ಸಿಸ್ಟಮ್ ಟರ್ಮಿನಲ್ ಸಿದ್ಧವಾಗಿದೆ (Nova System Terminal Ready)\nWorkspace: /app/applet\nNode: v22.x • Ready for commands.',
      exitCode: 0,
      executionTime: 12,
      status: 'completed',
    },
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([
    'ls -la',
    'node -v',
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const quickCommands = [
    { cmd: 'ls -la', label: 'ಫೈಲ್‌ಗಳ ಪಟ್ಟಿ (ls)' },
    { cmd: 'node -v && npm -v', label: 'Node & NPM ಆವೃತ್ತಿ' },
    { cmd: 'git status', label: 'Git ಸ್ಥಿತಿ' },
    { cmd: 'cat package.json', label: 'package.json' },
    { cmd: 'npm list --depth=0', label: 'ಪ್ಯಾಕೇಜುಗಳು' },
    { cmd: 'uname -a', label: 'OS ವಿವರ' },
    { cmd: 'clear', label: 'ತೆರವು (Clear)' },
  ];

  const executeCommand = async (cmdToRun: string) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed) return;

    if (trimmed === 'clear') {
      setHistory([]);
      setCommand('');
      return;
    }

    if (trimmed === 'help') {
      const newEntry: TerminalEntry = {
        id: String(Date.now()),
        command: 'help',
        timestamp: new Date().toLocaleTimeString(),
        stdout:
          'ಲಭ್ಯವಿರುವ ಆಜ್ಞೆಗಳು (Available Commands):\n' +
          '• ls, ls -la      : ಫೈಲ್‌ಗಳ ವಿವರವಾದ ಪಟ್ಟಿ\n' +
          '• cat <file>      : ಫೈಲ್ ಓದಿ\n' +
          '• node -v, npm -v : ರನ್‌ಟೈಮ್ ಆವೃತ್ತಿಗಳು\n' +
          '• git status      : ಗಿಟ್ ಸ್ಥಿತಿ\n' +
          '• clear           : ಸ್ಕ್ರೀನ್ ತೆರವುಗೊಳಿಸಿ\n' +
          '• echo <text>     : ಪಠ್ಯ ಮುದ್ರಿಸಿ',
        exitCode: 0,
        status: 'completed',
      };
      setHistory((prev) => [...prev, newEntry]);
      setCommand('');
      return;
    }

    const entryId = String(Date.now());
    const newEntry: TerminalEntry = {
      id: entryId,
      command: trimmed,
      timestamp: new Date().toLocaleTimeString(),
      status: 'running',
    };

    setHistory((prev) => [...prev, newEntry]);
    setCommandHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
    setHistoryIndex(-1);
    setCommand('');
    setIsRunning(true);

    try {
      const res = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });

      const data = await res.json();
      setHistory((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                stdout: data.stdout,
                stderr: data.stderr,
                exitCode: data.exitCode,
                executionTime: data.executionTime,
                status: data.exitCode === 0 ? 'completed' : 'error',
              }
            : item
        )
      );
    } catch (err) {
      setHistory((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                stderr: 'ಸರ್ವರ್ ಆಜ್ಞೆ ನಿರ್ವಹಣೆಯಲ್ಲಿ ದೋಷ ಸಂಭವಿಸಿದೆ: ' + String(err),
                exitCode: 1,
                status: 'error',
              }
            : item
        )
      );
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIdx);
      setCommand(commandHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = Math.max(historyIndex - 1, -1);
      setHistoryIndex(nextIdx);
      setCommand(nextIdx === -1 ? '' : commandHistory[nextIdx]);
    }
  };

  const handleCopyOutput = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-6 pb-28 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <TerminalIcon size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">
              ಟರ್ಮಿನಲ್ ಕನ್ಸೋಲ್ (Interactive Terminal)
            </h1>
            <p className="text-xs text-gray-400">
              ಶೆಲ್ ಆಜ್ಞೆಗಳನ್ನು ಚಲಾಯಿಸಿ ಮತ್ತು ಔಟ್‌ಪುಟ್ ವೀಕ್ಷಿಸಿ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistory([])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs transition-colors"
          >
            <Trash2 size={14} />
            <span>ತೆರವು (Clear)</span>
          </button>
        </div>
      </div>

      {/* Quick Command Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-thin">
        <span className="text-[11px] text-gray-400 shrink-0 mr-1 flex items-center gap-1">
          <Info size={12} />
          ತ್ವರಿತ ಆಜ್ಞೆಗಳು:
        </span>
        {quickCommands.map((q) => (
          <button
            key={q.cmd}
            type="button"
            onClick={() => executeCommand(q.cmd)}
            disabled={isRunning}
            className="px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-purple-600/20 text-purple-300 hover:text-white border border-gray-800 hover:border-purple-500/40 text-[11px] font-mono shrink-0 transition-all"
          >
            {q.cmd}
          </button>
        ))}
      </div>

      {/* Terminal Window Container */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[500px]">
        {/* Terminal Title Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
            </div>
            <span className="text-xs text-gray-400 font-mono ml-2">
              bash • nova@workspace: ~
            </span>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            Enter ಕೀಲಿಯನ್ನು ಒತ್ತಿ
          </span>
        </div>

        {/* Output Area */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-4 max-h-[58vh]">
          {history.length === 0 && (
            <div className="text-gray-400 text-center py-10">
              ಟರ್ಮಿನಲ್ ತೆರವುಗೊಂಡಿದೆ. ಕೆಳಗೆ ಆಜ್ಞೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮೇಲಿನ ತ್ವರಿತ ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡಿ.
            </div>
          )}

          {history.map((entry) => (
            <div key={entry.id} className="space-y-1.5 group">
              {/* Command Prompt Line */}
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-purple-400 font-semibold">nova@workspace</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-cyan-400">~</span>
                  <span className="text-purple-300 font-bold">$</span>
                  <span className="text-white font-medium">{entry.command}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {entry.executionTime !== undefined && (
                    <span className="text-[10px] text-gray-400 font-mono">
                      {entry.executionTime}ms
                    </span>
                  )}
                  {entry.exitCode !== undefined && (
                    <span
                      className={`text-[10px] px-1 rounded ${
                        entry.exitCode === 0
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {entry.exitCode === 0 ? '✓ 0' : `code ${entry.exitCode}`}
                    </span>
                  )}
                  {(entry.stdout || entry.stderr) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyOutput(entry.id, entry.stdout || entry.stderr || '')
                      }
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-white transition-opacity"
                      title="ಔಟ್‌ಪುಟ್ ನಕಲಿಸಿ"
                    >
                      {copiedId === entry.id ? (
                        <Check size={12} className="text-green-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Running Spinner */}
              {entry.status === 'running' && (
                <div className="flex items-center gap-2 text-purple-300 pl-4 py-1">
                  <RefreshCw size={13} className="animate-spin" />
                  <span className="text-xs">ಆಜ್ಞೆ ಚಾಲನೆಯಲ್ಲಿದೆ (Executing)...</span>
                </div>
              )}

              {/* Stdout */}
              {entry.stdout && (
                <div className="text-emerald-300/90 whitespace-pre-wrap pl-4 leading-relaxed bg-black/30 p-2 rounded-lg border border-gray-900">
                  {entry.stdout}
                </div>
              )}

              {/* Stderr */}
              {entry.stderr && (
                <div className="text-red-400/95 whitespace-pre-wrap pl-4 leading-relaxed bg-red-950/20 p-2 rounded-lg border border-red-900/30">
                  {entry.stderr}
                </div>
              )}
            </div>
          ))}

          <div ref={terminalEndRef} />
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-900/95 border-t border-gray-800">
          <span className="text-purple-400 font-mono font-semibold text-xs shrink-0">
            nova@workspace:~$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder="ಆಜ್ಞೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ (e.g. ls, git status, help)..."
            className="flex-1 bg-transparent text-white font-mono text-xs outline-none placeholder-gray-600 focus:ring-0"
            autoFocus
          />
          <button
            type="button"
            onClick={() => executeCommand(command)}
            disabled={isRunning || !command.trim()}
            className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all shadow"
            title="ಚಲಾಯಿಸಿ (Run)"
          >
            {isRunning ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <CornerDownLeft size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TerminalView;

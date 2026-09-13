import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Save,
  Copy,
  Check,
  RotateCcw,
  Download,
  FileCode,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Code2,
  AlertCircle
} from 'lucide-react';
import { WorkspaceFile } from '../types';

interface EditingViewProps {
  initialFilePath?: string;
}

export const EditingView: React.FC<EditingViewProps> = ({ initialFilePath }) => {
  const [filePath, setFilePath] = useState<string>(initialFilePath || 'src/App.tsx');
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [availableFiles, setAvailableFiles] = useState<WorkspaceFile[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available workspace files list
  useEffect(() => {
    fetch('/api/workspace/files')
      .then((res) => res.json())
      .then((data) => {
        if (data.files) {
          const codeFiles = (data.files as WorkspaceFile[]).filter((f) => !f.isDirectory);
          setAvailableFiles(codeFiles);
        }
      })
      .catch(() => {});
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setIsLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Failed to load file');
      const data = await res.json();
      setContent(data.content ?? '');
      setOriginalContent(data.content ?? '');
    } catch {
      setContent('// ಹೊಸ ಫೈಲ್ ಅಥವಾ ಖಾಲಿ ದಾಖಲೆ\n');
      setOriginalContent('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // When initialFilePath changes
  useEffect(() => {
    if (initialFilePath) {
      setFilePath(initialFilePath);
      loadFile(initialFilePath);
    } else {
      loadFile(filePath);
    }
  }, [initialFilePath, filePath, loadFile]);

  const handleSave = async () => {
    if (!filePath.trim()) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/workspace/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });
      if (!res.ok) throw new Error('Save failed');
      setOriginalContent(content);
      setSaveStatus('ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ (Saved successfully)!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('ಉಳಿಸಲು ವಿಫಲವಾಗಿದೆ (Failed to save).');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (window.confirm('ಬದಲಾವಣೆಗಳನ್ನು ರದ್ದುಗೊಳಿಸಿ ಮೂಲ ಕಂಟೆಂಟ್‌ಗೆ ಮರಳಬೇಕೆ?')) {
      setContent(originalContent);
    }
  };

  const handleDownload = () => {
    const fileName = filePath.split('/').pop() || 'code.txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard shortcut Ctrl+S
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Tab key indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Ask AI about this code
  const handleAskAi = async () => {
    if (!aiPrompt.trim() && !content.trim()) return;
    setIsAiLoading(true);
    setAiFeedback(null);
    try {
      const userPrompt = `ಇಲ್ಲಿರುವ ಕೋಡ್ ಪರಿಶೀಲಿಸಿ:\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\`\nಬಳಕೆದಾರರ ಪ್ರಶ್ನೆ: ${aiPrompt || 'ಈ ಕೋಡ್‌ನ ಕಾರ್ಯವನ್ನು ಸರಳ ಕನ್ನಡದಲ್ಲಿ ವಿವರಿಸಿ ಮತ್ತು ಸುಧಾರಣೆಗಳನ್ನು ತಿಳಿಸಿ.'}`;
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userPrompt, language: 'kn-IN' }),
      });
      const data = await res.json();
      setAiFeedback(data.responseText || 'AI ಪ್ರತ್ಯುತ್ತರ ನೀಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
    } catch {
      setAiFeedback('AI ಸಂಪರ್ಕದಲ್ಲಿ ತೊಂದರೆ ಉಂಟಾಗಿದೆ.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const isDirty = content !== originalContent;
  const lineCount = content ? content.split('\n').length : 1;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-6 pb-28 text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Code2 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-wide">
                ಕೋಡ್ ಎಡಿಟಿಂಗ್ (Code Editor)
              </h1>
              {isDirty && (
                <span className="flex items-center gap-1 text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  ಬದಲಾವಣೆಗಳು ಉಳಿದಿವೆ (Unsaved)
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              ಫೈಲ್‌ಗಳನ್ನು ಸಂಪಾದಿಸಿ, ಉಳಿಸಿ ಮತ್ತು ನಿರ್ವಹಿಸಿ
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md transition-all"
          >
            <Sparkles size={14} />
            <span>AI ಸಹಾಯಕ (AI Assist)</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            <span>{copied ? 'ನಕಲಿಸಲಾಗಿದೆ' : 'ನಕಲಿಸಿ'}</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 text-xs disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="ಬದಲಾವಣೆ ರದ್ದು (Reset)"
          >
            <RotateCcw size={16} />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 text-xs transition-colors"
            title="ಡೌನ್‌ಲೋಡ್ (Download)"
          >
            <Download size={16} />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow transition-all ${
              isDirty
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            {isSaving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>{isSaving ? 'ಉಳಿಸಲಾಗುತ್ತಿದೆ...' : 'ಉಳಿಸಿ (Save)'}</span>
          </button>
        </div>
      </div>

      {/* File Selector Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3 bg-gray-900/90 border border-gray-800 p-2 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FolderOpen size={16} className="text-purple-400 shrink-0 ml-1" />
          <div className="relative flex-1">
            <select
              value={filePath}
              onChange={(e) => {
                setFilePath(e.target.value);
                loadFile(e.target.value);
              }}
              className="w-full bg-gray-950 border border-gray-700/80 rounded-lg px-3 py-1.5 text-xs text-purple-200 font-mono focus:border-purple-500 outline-none"
            >
              {availableFiles.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadFile(filePath)}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs border border-gray-700"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>ರೀಲೋಡ್</span>
          </button>
        </div>
      </div>

      {/* Save Status Notification */}
      {saveStatus && (
        <div
          className={`mb-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            saveStatus.includes('ಯಶಸ್ವಿಯಾಗಿ')
              ? 'bg-emerald-950/60 border border-emerald-700/60 text-emerald-300'
              : 'bg-red-950/60 border border-red-700/60 text-red-300'
          }`}
        >
          {saveStatus.includes('ಯಶಸ್ವಿಯಾಗಿ') ? (
            <Check size={14} className="shrink-0" />
          ) : (
            <AlertCircle size={14} className="shrink-0" />
          )}
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Code Editor Container */}
      <div className="relative bg-gray-950 border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[480px]">
        {/* Editor Tab Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-800 text-xs text-gray-400">
          <div className="flex items-center gap-2 font-mono text-purple-300">
            <FileCode size={14} />
            <span>{filePath}</span>
          </div>
          <div className="text-[11px] text-gray-400 font-mono">
            UTF-8 • Ctrl+S ಉಳಿಸಲು
          </div>
        </div>

        {/* Main Editor Textarea with Line Numbers */}
        <div className="relative flex-1 flex overflow-hidden">
          {/* Line Numbers Gutter */}
          <div className="hidden sm:block select-none bg-gray-950/90 border-r border-gray-800/80 py-3 px-2 text-right font-mono text-[12px] text-gray-400 leading-[1.625rem] min-w-[3rem]">
            {Array.from({ length: Math.min(lineCount, 500) }, (_, i) => (
              <div key={i + 1}>{i + 1}</div>
            ))}
          </div>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 w-full bg-transparent text-gray-200 font-mono text-[13px] leading-[1.625rem] p-3 outline-none resize-none focus:ring-0 selection:bg-purple-600/40"
            placeholder="// ಕೋಡ್ ಅಥವಾ ಟೆಕ್ಸ್ಟ್ ಇಲ್ಲಿ ಬರೆಯಿರಿ..."
            style={{ tabSize: 2 }}
          />
        </div>

        {/* Editor Footer Status Bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/90 border-t border-gray-800 text-[11px] font-mono text-gray-400">
          <div className="flex items-center gap-3">
            <span>ಸಾಲುಗಳು (Lines): {lineCount}</span>
            <span>ಪದಗಳು (Words): {wordCount}</span>
            <span>ಅಕ್ಷರಗಳು (Chars): {charCount}</span>
          </div>
          <div>{isDirty ? '● ಮಾರ್ಪಡಿಸಲಾಗಿದೆ' : '✓ ಸಿಂಕ್ ಆಗಿದೆ'}</div>
        </div>
      </div>

      {/* AI Assistance Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-purple-500/40 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-950/80">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  AI ಕೋಡ್ ಸಹಾಯಕ (Gemini Code Assistant)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-purple-300 mb-1.5">
                  AI ಗೆ ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಅಥವಾ ಸೂಚನೆ (ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ):
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="ಉದಾಹರಣೆಗೆ: ಈ ಕೋಡ್‌ನಲ್ಲಿ ಯಾವುದೇ ದೋಷಗಳಿವೆಯೇ? ಇದನ್ನು ಹೇಗೆ ಆಪ್ಟಿಮೈಜ್ ಮಾಡಬಹುದು? ವಿವರಿಸಿ..."
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAskAi}
                  disabled={isAiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  <span>{isAiLoading ? 'ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ...' : 'ವಿಶ್ಲೇಷಿಸಿ (Analyze)'}</span>
                </button>
              </div>

              {aiFeedback && (
                <div className="mt-3 p-3.5 rounded-xl bg-gray-950 border border-purple-500/30 text-xs leading-relaxed text-gray-200">
                  <div className="flex items-center gap-1 text-purple-300 font-semibold mb-1.5">
                    <Sparkles size={13} />
                    <span>AI ಸಲಹೆ ಮತ್ತು ವಿವರಣೆ:</span>
                  </div>
                  <div className="whitespace-pre-wrap">{aiFeedback}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditingView;

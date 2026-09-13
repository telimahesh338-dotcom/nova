import React, { useEffect, useState } from 'react';
import {
  Folder,
  FileCode,
  FileText,
  Search,
  RefreshCw,
  Edit3,
  Eye,
  Download,
  Check,
  Copy,
  X,
  Layers,
  FolderOpen
} from 'lucide-react';
import { WorkspaceFile } from '../types';

interface FilesViewProps {
  onOpenFileInEditor: (filePath: string) => void;
}

export const FilesView: React.FC<FilesViewProps> = ({ onOpenFileInEditor }) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick preview modal
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/files');
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error(err);
      setError('ಫೈಲ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handlePreview = async (filePath: string) => {
    setIsPreviewLoading(true);
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error('Failed to read file');
      const data = await res.json();
      setPreviewFile({ path: filePath, content: data.content });
    } catch (err) {
      console.error(err);
      alert('ಫೈಲ್ ಓದಲು ವಿಫಲವಾಗಿದೆ.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDownload = (filePath: string, content?: string) => {
    const fileName = filePath.split('/').pop() || 'download.txt';
    if (content !== undefined) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`)
        .then((res) => res.json())
        .then((data) => {
          const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(() => alert('ಡೌನ್‌ಲೋಡ್ ವಿಫಲವಾಗಿದೆ.'));
    }
  };

  const handleCopyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getExtBadge = (ext: string) => {
    const colors: Record<string, string> = {
      ts: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      tsx: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      js: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      json: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      css: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      html: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      md: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    };
    return colors[ext] || 'bg-gray-700/40 text-gray-300 border-gray-600/30';
  };

  const filteredFiles = files.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fileCount = files.filter((f) => !f.isDirectory).length;
  const dirCount = files.filter((f) => f.isDirectory).length;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 pb-28 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <FolderOpen size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                ಪ್ರಾಜೆಕ್ಟ್ ಫೈಲ್ಸ್ (Project Files)
              </h1>
              <p className="text-xs text-gray-400">
                ಒಟ್ಟು {fileCount} ಫೈಲ್‌ಗಳು • {dirCount} ಫೋಲ್ಡರ್‌ಗಳು
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFiles}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>ಮರುಹೊಂದಿಸಿ (Refresh)</span>
          </button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ಫೈಲ್ ಹೆಸರು ಅಥವಾ ಪಾತ್ ಹುಡುಕಿ (Search files e.g. App.tsx, server.ts)..."
          className="w-full bg-gray-900/80 border border-gray-700/70 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-500/70 transition-all shadow-inner"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* File List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <RefreshCw size={28} className="animate-spin text-purple-400" />
          <p className="text-sm">ಫೈಲ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm text-center">
          {error}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Layers size={36} className="mx-auto text-gray-600 mb-2" />
          <p className="text-sm font-medium">ಯಾವುದೇ ಫೈಲ್ ಕಂಡುಬಂದಿಲ್ಲ</p>
          <p className="text-xs text-gray-400 mt-1">ಬೇರೆ ಹುಡುಕಾಟದ ಪದವನ್ನು ಪ್ರಯತ್ನಿಸಿ</p>
        </div>
      ) : (
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-xl divide-y divide-gray-800/50 overflow-hidden shadow-xl">
          {filteredFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center justify-between p-3 sm:px-4 hover:bg-gray-800/40 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                {file.isDirectory ? (
                  <Folder size={18} className="text-amber-400 shrink-0" />
                ) : (
                  <FileCode size={18} className="text-purple-400 shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate group-hover:text-purple-300 transition-colors">
                      {file.name}
                    </span>
                    {!file.isDirectory && file.extension && (
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${getExtBadge(
                          file.extension
                        )}`}
                      >
                        {file.extension}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 truncate block font-mono">
                    {file.path}
                  </span>
                </div>
              </div>

              {/* Actions & Meta */}
              <div className="flex items-center gap-2 shrink-0">
                {!file.isDirectory && (
                  <>
                    <span className="text-xs text-gray-400 font-mono hidden sm:inline mr-1">
                      {formatSize(file.size)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handlePreview(file.path)}
                      title="ತ್ವರಿತ ಪೂರ್ವವೀಕ್ಷಣೆ (Quick Preview)"
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs flex items-center gap-1 transition-colors"
                    >
                      <Eye size={14} />
                      <span className="hidden md:inline">ವೀಕ್ಷಿಸಿ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenFileInEditor(file.path)}
                      title="ಎಡಿಟ್ ಮಾಡಿ (Open in Editor)"
                      className="p-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-white border border-purple-500/40 text-xs flex items-center gap-1 transition-colors"
                    >
                      <Edit3 size={14} />
                      <span className="hidden md:inline">ಎಡಿಟಿಂಗ್</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading overlay for file preview */}
      {isPreviewLoading && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-purple-500/50 rounded-xl px-5 py-3 flex items-center gap-3 text-purple-300 text-sm shadow-2xl">
            <RefreshCw size={18} className="animate-spin text-purple-400" />
            <span>ಫೈಲ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ... (Loading preview)</span>
          </div>
        </div>
      )}

      {/* Quick Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/80">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={18} className="text-purple-400 shrink-0" />
                <span className="text-sm font-mono font-medium text-white truncate">
                  {previewFile.path}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyContent(previewFile.content)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors"
                >
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  <span>{copied ? 'ನಕಲಿಸಲಾಗಿದೆ!' : 'ನಕಲಿಸಿ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(previewFile.path, previewFile.content)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors"
                >
                  <Download size={13} />
                  <span>ಡೌನ್‌ಲೋಡ್</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = previewFile.path;
                    setPreviewFile(null);
                    onOpenFileInEditor(p);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs text-white font-medium transition-colors"
                >
                  <Edit3 size={13} />
                  <span>ಎಡಿಟ್ ಮಾಡಿ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-950 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre selection:bg-purple-600/40">
              {previewFile.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilesView;

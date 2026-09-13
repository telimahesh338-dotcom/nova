import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  Sparkles,
  X,
  GitBranch,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'github' | 'pwa' | 'capacitor' | 'accessibility'>('github');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Check if running as installed PWA (standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert(
        'ನಿಮ್ಮ ಬ್ರೌಸರ್ ಮೆನುವಿನಲ್ಲಿ (Chrome / Edge / Safari) "Add to Home screen" ಅಥವಾ "Install App" ಆಯ್ಕೆಯನ್ನು ಕ್ಲಿಕ್ ಮಾಡಿ.'
      );
    }
  };

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-gray-900 border border-purple-500/40 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gray-950/80 px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-600/30">
              <Smartphone size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <span>ಮೊಬೈಲ್ ಆ್ಯಪ್ & APK ಪರಿಹಾರ</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30">
                  Android & Web
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                ಫೋನ್‌ನಲ್ಲಿ ನೇರ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಹಾಗೂ APK ಬಿಲ್ಡ್ ಮಾರ್ಗದರ್ಶಿ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-gray-950/60 p-1 border-b border-gray-800 text-xs gap-1">
          <button
            onClick={() => setActiveTab('github')}
            className={`py-2 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'github'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <GitBranch size={14} />
            <span className="truncate">1. GitHub APK ಬಿಲ್ಡ್</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`py-2 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'pwa'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Download size={14} />
            <span className="truncate">2. ನೇರ ಇನ್‌ಸ್ಟಾಲ್ (PWA)</span>
          </button>
          <button
            onClick={() => setActiveTab('capacitor')}
            className={`py-2 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'capacitor'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cpu size={14} />
            <span className="truncate">3. ಕಮಾಂಡ್ ಬಿಲ್ಡ್</span>
          </button>
          <button
            onClick={() => setActiveTab('accessibility')}
            className={`py-2 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'accessibility'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldCheck size={14} />
            <span className="truncate">4. ಫೋನ್ ಕಂಟ್ರೋಲ್</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm leading-relaxed">
          {/* TAB 0: GitHub Actions APK Build */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-purple-950/60 via-indigo-950/50 to-gray-950/60 border border-purple-500/40 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-purple-300 font-semibold text-sm">
                    <GitBranch size={18} className="text-purple-400" />
                    <span>GitHub Actions ಮೂಲಕ ಆಟೋಮ್ಯಾಟಿಕ್ APK ಬಿಲ್ಡ್</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-950/80 text-green-300 border border-green-500/30 flex items-center gap-1 font-mono">
                    <CheckCircle2 size={11} /> workflow ready
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-relaxed">
                  ನಿಮ್ಮ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲಿ Android Studio ಅಥವಾ Java ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡುವ ಅಗತ್ಯವಿಲ್ಲ! ಈ ಪ್ರಾಜೆಕ್ಟ್‌ನಲ್ಲಿ ಈಗಾಗಲೇ <code className="text-purple-300 bg-gray-900 px-1 py-0.5 rounded font-mono">.github/workflows/build-apk.yml</code> ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ. ನೀವು GitHub ಗೆ ಕೋಡ್ ಪುಶ್ ಮಾಡಿದ ಕೂಡಲೇ GitHub ಕ್ಲೌಡ್ ಸರ್ವರ್‌ಗಳು ಸ್ವಯಂಚಾಲಿತವಾಗಿ <strong>Android APK</strong> ಅನ್ನು ಬಿಲ್ಡ್ ಮಾಡುತ್ತವೆ!
                </p>
              </div>

              {/* Steps to generate APK via GitHub */}
              <div className="space-y-3">
                {/* Step 1 */}
                <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-600/30 border border-purple-500/50 text-purple-300 font-bold flex items-center justify-center text-[11px]">
                        1
                      </span>
                      <h4 className="font-semibold text-white text-xs">
                        ಪ್ರಾಜೆಕ್ಟ್ ಅನ್ನು ನಿಮ್ಮ GitHub ಖಾತೆಗೆ ಪುಶ್ ಮಾಡಿ (Push to GitHub)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyCode(
                          `git init\ngit add .\ngit commit -m "Add Nova AI with Android APK Workflow"\ngit branch -M main\ngit remote add origin https://github.com/YOUR_USERNAME/nova-ai.git\ngit push -u origin main`,
                          101
                        )
                      }
                      className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                    >
                      {copiedIndex === 101 ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      <span>Git ಕಮಾಂಡ್ ಕಾಪಿ</span>
                    </button>
                  </div>

                  <p className="text-xs text-gray-400">
                    Google AI Studio ಮೆನುವಿನಿಂದ <strong>&quot;Export to GitHub&quot;</strong> ಮಾಡಬಹುದು ಅಥವಾ ಟರ್ಮಿನಲ್‌ನಲ್ಲಿ ಈ ಕೆಳಗಿನ Git ಕಮಾಂಡ್‌ಗಳನ್ನು ರನ್ ಮಾಡಿ:
                  </p>

                  <pre className="bg-black/90 border border-gray-800 p-2.5 rounded-lg text-[11px] font-mono text-purple-200 overflow-x-auto">
{`git init
git add .
git commit -m "Add Nova AI with Android APK Workflow"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nova-ai.git
git push -u origin main`}
                  </pre>
                </div>

                {/* Step 2 */}
                <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/60 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 font-bold flex items-center justify-center text-[11px]">
                      2
                    </span>
                    <h4 className="font-semibold text-white text-xs">
                      GitHub Actions ನಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತ ಬಿಲ್ಡ್ (Automatic Cloud Build)
                    </h4>
                  </div>
                  <p className="text-xs text-gray-300">
                    ನೀವು ಕೋಡ್ ಪುಶ್ ಮಾಡಿದ ಕೂಡಲೇ ಅಥವಾ GitHub Repository ನ <strong>&quot;Actions&quot;</strong> ಟ್ಯಾಬ್‌ಗೆ ಹೋಗಿ <strong>&quot;Build Android APK&quot;</strong> ರನ್ ಆಗುವುದನ್ನು ನೋಡಬಹುದು (ಅಥವಾ <em>Run workflow</em> ಒತ್ತಿ). ಇದು 2-3 ನಿಮಿಷಗಳಲ್ಲಿ ಸಂಪೂರ್ಣ APK ಯನ್ನು ಕಾಂಪೈಲ್ ಮಾಡುತ್ತದೆ.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/60 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold flex items-center justify-center text-[11px]">
                      3
                    </span>
                    <h4 className="font-semibold text-white text-xs">
                      Artifacts ನಿಂದ APK ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಮೊಬೈಲ್‌ನಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ
                    </h4>
                  </div>
                  <ol className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                    <li>
                      GitHub Actions ನಲ್ಲಿ ಬಿಲ್ಡ್ ಮುಗಿದಾಗ ಹಸಿರು ಮಾರ್ಕ್ (✔️) ಕಾಣಿಸುತ್ತದೆ. ಆ ರನ್ ಮೇಲೆ ಕ್ಲಿಕ್ ಮಾಡಿ.
                    </li>
                    <li>
                      ಪುಟದ ಕೆಳಭಾಗದಲ್ಲಿರುವ <strong>Artifacts</strong> ವಿಭಾಗದಲ್ಲಿ <code className="text-purple-300 bg-gray-900 px-1 py-0.5 rounded font-mono">Nova-AI-Voice-Assistant-Debug-APK</code> ಲಿಂಕ್ ಒತ್ತಿ ಜಿಪ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ.
                    </li>
                    <li>
                      ಜಿಪ್‌ನಲ್ಲಿರುವ <code className="text-emerald-300 bg-gray-900 px-1 py-0.5 rounded font-mono">app-debug.apk</code> ಫೈಲ್ ಅನ್ನು ನಿಮ್ಮ Android ಮೊಬೈಲ್‌ನಲ್ಲಿ ನೇರವಾಗಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ ಆನಂದಿಸಿ!
                    </li>
                  </ol>
                </div>
              </div>

              {/* Note on permissions */}
              <div className="p-3 bg-gray-950 border border-gray-800/80 rounded-xl text-[11px] text-gray-400 space-y-1">
                <span className="text-purple-300 font-semibold flex items-center gap-1">
                  <ShieldCheck size={14} /> ಗಮನಿಸಿ (Notice):
                </span>
                <p>
                  ಮೈಕ್ರೊಫೋನ್ (Voice recognition) ಮತ್ತು ಇಂಟರ್ನೆಟ್ ಅನುಮತಿಗಳನ್ನು GitHub Actions ಬಿಲ್ಡ್ ಸ್ಕ್ರಿಪ್ಟ್‌ನಲ್ಲಿ ಈಗಾಗಲೇ ಕಾನ್ಫಿಗರ್ ಮಾಡಲಾಗಿದೆ. ಮೊಬೈಲ್‌ನಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡುವಾಗ <em>&quot;Install from unknown sources&quot;</em> ಅನುಮತಿ ನೀಡಿ.
                </p>
              </div>
            </div>
          )}

          {/* TAB 1: Instant PWA Install */}
          {activeTab === 'pwa' && (
            <div className="space-y-4">
              <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-purple-300 font-semibold text-sm">
                  <Sparkles size={16} />
                  <span>ತಕ್ಷಣದ ಮೊಬೈಲ್ ಇನ್‌ಸ್ಟಾಲೇಶನ್ (No App Store Needed)</span>
                </div>
                <p className="text-gray-300 text-xs leading-relaxed">
                  ಈ ಆ್ಯಪ್ ಈಗಾಗಲೇ ಅಧಿಕೃತ <strong>PWA (Progressive Web App)</strong> ಮಾನ್ಯತೆ ಪಡೆದಿದೆ. ಯಾವುದೇ APK ಡೌನ್‌ಲೋಡ್ ಇಲ್ಲದೆಯೇ ನಿಮ್ಮ ಮೊಬೈಲ್ ಹೋಮ್‌ಸ್ಕ್ರೀನ್‌ಗೆ ನೇರವಾಗಿ ಫುಲ್-ಸ್ಕ್ರೀನ್ ನೇಟಿವ್ ಆ್ಯಪ್ ರೀತಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿಕೊಳ್ಳಬಹುದು!
                </p>

                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    onClick={handleInstallPwa}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-transform active:scale-95"
                  >
                    <Download size={16} />
                    <span>{isInstalled ? 'ಆ್ಯಪ್ ಈಗಾಗಲೇ ಇನ್‌ಸ್ಟಾಲ್ ಆಗಿದೆ' : 'ಮೊಬೈಲ್‌ನಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ (Install App)'}</span>
                  </button>
                </div>
              </div>

              {/* Instructions per browser */}
              <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/40 space-y-2.5">
                <h4 className="font-semibold text-white text-xs">
                  ಮೊಬೈಲ್‌ನಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡುವ ಸರಳ ಹಂತಗಳು:
                </h4>
                <ol className="space-y-2 text-xs text-gray-300 list-decimal list-inside">
                  <li>
                    <span className="font-medium text-purple-300">ಆಂಡ್ರಾಯ್ಡ್ (Chrome / Brave / Edge):</span> ಬ್ರೌಸರ್ ಮೇಲಿನ ಮೂರು ಚುಕ್ಕೆಗಳ ಮೆನು (⋮) ಒತ್ತಿ, <strong>&quot;Install app&quot;</strong> ಅಥವಾ <strong>&quot;Add to Home screen&quot;</strong> ಆಯ್ಕೆಮಾಡಿ.
                  </li>
                  <li>
                    <span className="font-medium text-purple-300">ಐಫೋನ್ (Safari):</span> ಶೇರ್ (Share) ಐಕಾನ್ ಒತ್ತಿ <strong>&quot;Add to Home Screen&quot;</strong> ಕ್ಲಿಕ್ ಮಾಡಿ.
                  </li>
                  <li>
                    ತಕ್ಷಣವೇ ನಿಮ್ಮ ಮೊಬೈಲ್ ಅಪ್ಲಿಕೇಶನ್ ಲಿಸ್ಟ್‌ನಲ್ಲಿ <strong>&quot;Nova AI&quot;</strong> ಐಕಾನ್ ಸೇರ್ಪಡೆಯಾಗುತ್ತದೆ ಮತ್ತು ಬ್ರೌಸರ್ ಅಡಚಣೆಯಿಲ್ಲದೆ ಆ್ಯಪ್ ರೀತಿಯೇ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: Standalone APK Build */}
          {activeTab === 'capacitor' && (
            <div className="space-y-3">
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                  <AlertCircle size={15} />
                  <span>ಸ್ವತಂತ್ರ .APK ಫೈಲ್ ತಯಾರಿಸುವುದು ಹೇಗೆ?</span>
                </div>
                <p className="text-xs text-gray-300">
                  ವೆಬ್ ಅಪ್ಲಿಕೇಶನ್ ಅನ್ನು <strong>.apk</strong> ರೂಪಕ್ಕೆ ಪರಿವರ್ತಿಸಲು <strong>Capacitor</strong> ಅಥವಾ <strong>PWABuilder</strong> ಅತ್ಯಂತ ಸುಲಭ ಮತ್ತು ಪರಿಣಾಮಕಾರಿ ಮಾರ್ಗವಾಗಿದೆ:
                </p>
              </div>

              {/* Method A: PWABuilder */}
              <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs">
                    ವಿಧಾನ 1: ಕೋಡಿಂಗ್ ಇಲ್ಲದೆ 1-ಕ್ಲಿಕ್ APK (PWABuilder)
                  </span>
                  <a
                    href="https://www.pwabuilder.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-purple-400 hover:underline flex items-center gap-1"
                  >
                    <span>pwabuilder.com</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
                <p className="text-xs text-gray-400">
                  1. <code className="text-purple-300 bg-gray-900 px-1 py-0.5 rounded">pwabuilder.com</code> ಗೆ ಹೋಗಿ ನಿಮ್ಮ ಆ್ಯಪ್‌ನ ಲಿಂಕ್ ನಮೂದಿಸಿ.<br />
                  2. &quot;Generate Android APK&quot; ಕ್ಲಿಕ್ ಮಾಡಿ. ಸಿಸ್ಟಮ್ ತಕ್ಷಣವೇ ನಿಮ್ಮ ಮೊಬೈಲ್‌ಗಾಗಿ ರೆಡಿ .apk ಫೈಲ್ ಸಿದ್ಧಪಡಿಸುತ್ತದೆ!
                </p>
              </div>

              {/* Method B: Capacitor CLI */}
              <div className="border border-gray-800 rounded-xl p-3 bg-gray-950/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs">
                    ವಿಧಾನ 2: Capacitor ಬಳಸಿ ಆಂಡ್ರಾಯ್ಡ್ ಸ್ಟುಡಿಯೋ APK
                  </span>
                  <button
                    onClick={() =>
                      copyCode(
                        `npm i -D @capacitor/cli @capacitor/core @capacitor/android\nnpx cap init "Nova AI" "com.nova.ai"\nnpm run build\nnpx cap add android\nnpx cap open android`,
                        1
                      )
                    }
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    {copiedIndex === 1 ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    <span>ಕಮಾಂಡ್ ಕಾಪಿ</span>
                  </button>
                </div>
                <pre className="bg-black/80 border border-gray-800 p-2 rounded text-[11px] font-mono text-purple-200 overflow-x-auto">
{`# 1. Capacitor ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ
npm i -D @capacitor/cli @capacitor/core @capacitor/android

# 2. ಆಂಡ್ರಾಯ್ಡ್ ಪ್ರಾಜೆಕ್ಟ್ ಸಿದ್ಧಪಡಿಸಿ
npx cap init "Nova AI" "com.nova.ai"
npm run build
npx cap add android
npx cap open android`}
                </pre>
                <p className="text-[11px] text-gray-400">
                  ಆಂಡ್ರಾಯ್ಡ್ ಸ್ಟುಡಿಯೋದಲ್ಲಿ <strong>Build &gt; Build Bundle(s) / APK(s) &gt; Build APK</strong> ಒತ್ತಿದರೆ ರೆಡಿ APK ಸಿಗುತ್ತದೆ.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Device Control & Accessibility Constraints */}
          {activeTab === 'accessibility' && (
            <div className="space-y-3">
              <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-blue-300 font-semibold text-xs">
                  <ShieldCheck size={16} />
                  <span>ಇತರ ಆ್ಯಪ್‌ಗಳನ್ನು ಕಂಟ್ರೋಲ್ ಮಾಡಲು ಏನೆಲ್ಲಾ ಬೇಕು? (Android Policy)</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  ನೀವು ಕೇಳಿದಂತೆ WhatsApp ನಂತಹ ಇತರ ಆ್ಯಪ್‌ಗಳನ್ನು ತೆರೆದು, ಸ್ಕ್ರೀನ್ ನೋಡಿ ಸ್ವತಃ ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡುವ &quot;Autonomous Mobile Agent&quot; ಕೆಲಸ ಮಾಡಲು ಗೂಗಲ್ ಆಂಡ್ರಾಯ್ಡ್‌ನಲ್ಲಿ ಈ ಕೆಳಗಿನ ನೇಟಿವ್ ಅನುಮತಿಗಳು ಕಡ್ಡಾಯವಾಗಿರಬೇಕು:
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">1. Accessibility Service (ಆಕ್ಸೆಸಿಬಿಲಿಟಿ ಸರ್ವಿಸ್):</strong>
                    <p className="text-gray-400 mt-0.5">
                      ಇದು ಸ್ಕ್ರೀನ್ ಮೇಲಿರುವ ಬಟನ್‌ಗಳನ್ನು ಪತ್ತೆಹಚ್ಚಿ ಕ್ಲಿಕ್ ಮಾಡಲು ಅಥವಾ ಸ್ಕ್ರಾಲ್ ಮಾಡಲು ಬೇಕಾಗುತ್ತದೆ. ಇದನ್ನು ಮೊಬೈಲ್‌ನ <em>Settings &gt; Accessibility</em> ಗೆ ಹೋಗಿ ಬಳಕೆದಾರರು ಕೈಯಾರೆ ಆನ್ ಮಾಡಬೇಕು.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">2. MediaProjection (ಸ್ಕ್ರೀನ್ ರೆಕಾರ್ಡಿಂಗ್ & ವಿಷನ್):</strong>
                    <p className="text-gray-400 mt-0.5">
                      ಸ್ಕ್ರೀನ್‌ನಲ್ಲಿ ಏನಿದೆ ಎಂದು ಎಐ ಮಾದರಿ (Gemini Vision) ನೋಡಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಸ್ಕ್ರೀನ್ ಕ್ಯಾಪ್ಚರ್ ಅನುಮತಿ ಬೇಕಾಗುತ್ತದೆ.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-gray-950 border border-gray-800 flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">3. ವೆಬ್ ಬ್ರೌಸರ್ ಮಿತಿ (Sandbox):</strong>
                    <p className="text-gray-400 mt-0.5">
                      ಯಾವುದೇ ವೆಬ್‌ಸೈಟ್‌ಗೆ ನಿಮ್ಮ ಫೋನ್‌ನ ಇತರ ಆ್ಯಪ್‌ಗಳನ್ನು ಹ್ಯಾಕ್ ಅಥವಾ ಕಂಟ್ರೋಲ್ ಮಾಡಲು ಆಂಡ್ರಾಯ್ಡ್ ಅನುಮತಿಸುವುದಿಲ್ಲ (ಭದ್ರತೆಯ ದೃಷ್ಟಿಯಿಂದ). ಆದ್ದರಿಂದ ಇದು ಪೂರ್ಣ ಪ್ರಮಾಣದ <strong>Kotlin/Android Native APK</strong> ಮೂಲಕವೇ ರನ್ ಆಗಬೇಕು.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-950/90 px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            Nova AI • PWA & APK Suite
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            ಮುಚ್ಚಿ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};

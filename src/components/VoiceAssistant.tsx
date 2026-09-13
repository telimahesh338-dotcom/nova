import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Trash2,
  Sparkles,
  Bot,
  User,
  Radio,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import BlobVisualization, { BlobState } from './BlobVisualization';
import OfflineBanner from './OfflineBanner';
import { ApkDownloadModal } from './ApkDownloadModal';
import { useMicrophonePermission } from '../hooks/useMicrophonePermission';
import SpeechService, { SupportedLanguage } from '../services/SpeechService';
import { handleAIRequest, handleAIRequestStream, HistoryMessage } from '../services/AIProxyService';
import {
  loadMessages,
  saveMessages,
  clearMessages as clearStoredMessages,
  loadLanguage,
  saveLanguage,
  VoicePersona,
} from '../services/StorageService';
import FaviconService from '../services/FaviconService';
import AnalyticsService from '../services/AnalyticsService';
import useOnlineStatus from '../hooks/useOnlineStatus';
import useNetworkQuality from '../hooks/useNetworkQuality';

// Language display names and flags
const LANGUAGE_DISPLAY: Record<SupportedLanguage, { name: string; flag: string }> = {
  'kn-IN': { name: 'ಕನ್ನಡ (Kannada)', flag: '🇮🇳' },
  'en-US': { name: 'English', flag: '🇺🇸' },
  'ar-LB': { name: 'Arabic', flag: '🇱🇧' },
  'fr-FR': { name: 'French', flag: '🇫🇷' },
};

// Shared error messages (used by both voice and text paths)
const ERROR_MESSAGES: Record<SupportedLanguage, string> = {
  'kn-IN': 'ಕ್ಷಮಿಸಿ, ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  'ar-LB': 'عذراً، حصل خطأ في المعالجة. الرجاء المحاولة مرة أخرى.',
  'fr-FR': "Désolé, une erreur s'est produite. Veuillez réessayer.",
  'en-US': 'Sorry, there was an error. Please try again.',
};

// Time-appropriate greeting (text only, no auto-speak)
function getTimeBasedGreeting(lang: SupportedLanguage = 'kn-IN'): string {
  const hour = new Date().getHours();
  if (lang === 'kn-IN') {
    if (hour >= 5 && hour < 12) return "ಶುಭೋದಯ. ನಾನು ನೋವಾ, ನಿಮ್ಮ ಧ್ವನಿ ಸಹಾಯಕ.";
    if (hour >= 12 && hour < 17) return "ಶುಭ ಅಪರಾಹ್ನ. ನಾನು ನೋವಾ, ನಿಮ್ಮ ಧ್ವನಿ ಸಹಾಯಕ.";
    return "ಶುಭ ಸಂಜೆ. ನಾನು ನೋವಾ, ನಿಮ್ಮ ಧ್ವನಿ ಸಹಾಯಕ.";
  }
  if (lang === 'ar-LB') {
    if (hour >= 5 && hour < 12) return "صباح الخير. أنا نوفا، مساعدك الصوتي.";
    return "مساء الخير. أنا نوفا، مساعدك الصوتي.";
  }
  if (lang === 'fr-FR') {
    if (hour >= 5 && hour < 18) return "Bonjour. Je suis Nova, votre assistant vocal.";
    return "Bonsoir. Je suis Nova, votre assistant vocal.";
  }
  if (hour >= 5 && hour < 12) return "Good morning. I'm Nova, your voice assistant.";
  if (hour >= 12 && hour < 17) return "Good afternoon. I'm Nova, your voice assistant.";
  return "Good evening. I'm Nova, your voice assistant.";
}

export interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const CONTEXT_WINDOW = 10; // Number of messages to send as conversation context

const VoiceAssistant: React.FC = () => {
  const [blobState, setBlobState] = useState<BlobState>('idle');
  const [amplitude, setAmplitude] = useState<number>(0.5);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() => loadLanguage());
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages());
  const [greetingText, setGreetingText] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(false);
  const [voicePersona, setVoicePersona] = useState<VoicePersona>(() => SpeechService.getVoicePersona());
  const [voiceSpeed, setVoiceSpeed] = useState<number>(() => SpeechService.getVoiceSpeed());
  const [showVoiceMenu, setShowVoiceMenu] = useState<boolean>(false);
  const [showApkModal, setShowApkModal] = useState<boolean>(false);
  const [micWarningDismissed, setMicWarningDismissed] = useState<boolean>(false);
  const hasGreeted = useRef<boolean>(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  const lastClickTime = useRef<number>(0);
  const hasInteractedRef = useRef<boolean>(false);

  const isOnline = useOnlineStatus();
  const { shouldPreferNonStreaming, isSlowNetwork } = useNetworkQuality();
  const {
    permissionState: micPermissionState,
    errorMessage: micErrorMessage,
    isLoading: isMicValidating,
    requestAndValidatePermission,
    clearError: clearMicError,
  } = useMicrophonePermission();

  // Ref for stable access inside callbacks
  const preferNonStreamingRef = useRef(shouldPreferNonStreaming);

  // Refs for stable callback references (prevents useEffect churn)
  const isProcessingRef = useRef(isProcessing);
  const currentLanguageRef = useRef(currentLanguage);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  // Keep refs in sync with state
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { currentLanguageRef.current = currentLanguage; }, [currentLanguage]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { preferNonStreamingRef.current = shouldPreferNonStreaming; }, [shouldPreferNonStreaming]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Update favicon when blob state changes
  const updateBlobState = useCallback((newState: BlobState) => {
    setBlobState(newState);
    FaviconService.updateState(newState);
  }, []);

  // Cancel any in-flight AI request
  const cancelPendingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Handle blob click with debounce and robust mic validation
  const handleBlobClick = useCallback(async () => {
    const now = Date.now();
    if (now - lastClickTime.current < 400) return; // debounce
    lastClickTime.current = now;
    hasInteractedRef.current = true;

    if (blobState === 'listening') {
      updateBlobState('idle');
      SpeechService.stopListening();
      setIsProcessing(false);
      return;
    }

    // Don't start listening while an AI request is in-flight
    if (isProcessingRef.current) {
      cancelPendingRequest();
      SpeechService.stopSpeaking();
      setIsProcessing(false);
      updateBlobState('idle');
      return;
    }

    // Validate and acquire microphone permission before engaging voice engine
    const hasMic = await requestAndValidatePermission();
    if (!hasMic) {
      updateBlobState('idle');
      setIsProcessing(false);
      return;
    }

    setMicWarningDismissed(false);
    SpeechService.stopSpeaking();
    SpeechService.stopWakeWordListening();
    setIsProcessing(false);
    updateBlobState('listening');
    SpeechService.startListening();
  }, [blobState, updateBlobState, cancelPendingRequest, requestAndValidatePermission]);

  // Shared AI query logic — tries streaming first, falls back to non-streaming
  const processQuery = useCallback(
    async (query: string) => {
      const lang = currentLanguageRef.current;

      cancelPendingRequest();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build conversation context from last N messages
      const history: HistoryMessage[] = messagesRef.current
        .slice(-CONTEXT_WINDOW)
        .map((m) => ({ role: m.role, text: m.text }));

      try {
        updateBlobState('responding');

        // On slow networks, skip streaming entirely — use single-shot request
        if (preferNonStreamingRef.current) {
          try {
            const aiResponse = await handleAIRequest(
              { query, language: lang, history },
              controller.signal,
            );

            if (controller.signal.aborted) return;

            if (aiResponse?.responseText) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
              ]);
              await SpeechService.speak(aiResponse.responseText, lang);
            }
          } catch (nonStreamError) {
            if (controller.signal.aborted) return;
            console.error('Non-streaming request failed:', nonStreamError);
            const errorMsg = ERROR_MESSAGES[lang];
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: errorMsg, timestamp: Date.now() },
            ]);
            SpeechService.speak(errorMsg, lang);
          }
          return; // done — skip streaming path
        }

        // --- Try streaming first ---
        // Add a placeholder assistant message that gets updated progressively
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '', timestamp: Date.now() },
        ]);

        const speaker = SpeechService.createStreamingSpeaker(lang);

        await handleAIRequestStream(
          { query, language: lang, history },
          (chunk) => {
            if (controller.signal.aborted) {
              speaker.cancel();
              return;
            }
            speaker.pushChunk(chunk);
            // Update the last (streaming) message with new chunk
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, text: last.text + chunk };
              }
              return updated;
            });
          },
          controller.signal,
        );

        if (controller.signal.aborted) {
          speaker.cancel();
          return;
        }

        await speaker.finish();
      } catch (streamError) {
        speaker.cancel();
        if (controller.signal.aborted) return;
        console.warn('Streaming failed, falling back to non-streaming:', streamError);

        // Remove failed streaming placeholder (regardless of partial text)
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated.pop();
          }
          return updated;
        });

        // --- Non-streaming fallback ---
        try {
          const aiResponse = await handleAIRequest(
            { query, language: lang, history },
            controller.signal,
          );

          if (controller.signal.aborted) return;

          if (aiResponse?.responseText) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
            ]);
            await SpeechService.speak(aiResponse.responseText, lang);
          }
        } catch (fallbackError) {
          if (controller.signal.aborted) return;
          console.error('Fallback also failed:', fallbackError);

          const errorMsg = ERROR_MESSAGES[lang];
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: errorMsg, timestamp: Date.now() },
          ]);
          SpeechService.speak(errorMsg, lang);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsProcessing(false);
          updateBlobState('idle');
        }
        abortControllerRef.current = null;
      }
    },
    [updateBlobState, cancelPendingRequest],
  );

  // --- Initialize speech service, analytics, and favicon (runs ONCE) ---
  useEffect(() => {
    FaviconService.initialize();
    AnalyticsService.init();

    SpeechService.onSpeechStart(() => {
      setBlobState((prev) => {
        if (prev === 'responding') return prev;
        FaviconService.updateState('speaking');
        return 'speaking';
      });
      setAmplitude(0.8);
    });

    SpeechService.onSpeechEnd(() => {
      setBlobState((prev) => {
        if (prev === 'responding') return prev;
        FaviconService.updateState('idle');
        return 'idle';
      });
      setAmplitude(0.5);
      setTimeout(() => setIsProcessing(false), 300);
    });

    SpeechService.onResult(({ text, language }) => {
      if (isProcessingRef.current) return;
      setIsProcessing(true);

      if (text.trim().length < 2) {
        setIsProcessing(false);
        return;
      }

      // Check for language switch command
      const lower = text.toLowerCase();
      const commands: Array<{ match: () => boolean; target: SupportedLanguage; confirm: string }> = [
        { match: () => language === 'en-US' && (lower.includes('speak arabic') || lower.includes('switch to arabic')), target: 'ar-LB', confirm: 'تم التحويل إلى اللغة العربية' },
        { match: () => language === 'ar-LB' && (lower.includes('تكلم انجليزي') || lower.includes('speak english')), target: 'en-US', confirm: 'Switched to English' },
        { match: () => language === 'fr-FR' && (lower.includes('parle anglais') || lower.includes("passer à l'anglais") || lower.includes('speak english')), target: 'en-US', confirm: 'Switched to English' },
        { match: () => language === 'en-US' && (lower.includes('speak french') || lower.includes('switch to french')), target: 'fr-FR', confirm: 'Passé au français' },
      ];
      const cmd = commands.find((c) => c.match());
      if (cmd) {
        SpeechService.setLanguage(cmd.target);
        SpeechService.speak(cmd.confirm, cmd.target);
        setIsProcessing(false);
        return;
      }

      // Add user message and process with streaming + context
      setMessages((prev) => [...prev, { role: 'user', text, timestamp: Date.now() }]);

      const lang = currentLanguageRef.current;

      // Cancel any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build conversation context
      const history: HistoryMessage[] = messagesRef.current
        .slice(-CONTEXT_WINDOW)
        .map((m) => ({ role: m.role, text: m.text }));

      setBlobState('responding');
      FaviconService.updateState('responding');

      // On slow networks, use single-shot request instead of streaming
      if (preferNonStreamingRef.current) {
        handleAIRequest({ query: text, language: lang, history }, controller.signal)
          .then((aiResponse) => {
            if (controller.signal.aborted) return;
            if (aiResponse?.responseText) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
              ]);
              return SpeechService.speak(aiResponse.responseText, lang);
            }
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            console.error('Voice non-streaming failed:', err);
            const errorMsg = ERROR_MESSAGES[lang];
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: errorMsg, timestamp: Date.now() },
            ]);
            SpeechService.speak(errorMsg, lang);
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setIsProcessing(false);
              setBlobState('idle');
              FaviconService.updateState('idle');
            }
            abortControllerRef.current = null;
          });
        return;
      }

      // Add streaming placeholder
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '', timestamp: Date.now() },
      ]);

      const speaker = SpeechService.createStreamingSpeaker(lang);

      handleAIRequestStream(
        { query: text, language: lang, history },
        (chunk) => {
          if (controller.signal.aborted) {
            speaker.cancel();
            return;
          }
          speaker.pushChunk(chunk);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, text: last.text + chunk };
            }
            return updated;
          });
        },
        controller.signal,
      )
        .then(async () => {
          if (controller.signal.aborted) {
            speaker.cancel();
            return;
          }
          await speaker.finish();
        })
        .catch((streamError) => {
          speaker.cancel();
          if (controller.signal.aborted) return;
          console.warn('Voice streaming failed, trying fallback:', streamError);

          // Remove failed streaming placeholder (regardless of partial text)
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') updated.pop();
            return updated;
          });

          return handleAIRequest({ query: text, language: lang, history }, controller.signal)
            .then((aiResponse) => {
              if (controller.signal.aborted) return;
              if (aiResponse?.responseText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                ]);
                return SpeechService.speak(aiResponse.responseText, lang);
              }
            })
            .catch((fallbackError) => {
              if (controller.signal.aborted) return;
              console.error('Voice fallback also failed:', fallbackError);
              const errorMsg = ERROR_MESSAGES[lang];
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: errorMsg, timestamp: Date.now() },
              ]);
              SpeechService.speak(errorMsg, lang);
            });
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsProcessing(false);
            setBlobState('idle');
            FaviconService.updateState('idle');
          }
          abortControllerRef.current = null;
        });
    });

    SpeechService.onError(() => {
      setBlobState('idle');
      FaviconService.updateState('idle');
      setIsProcessing(false);
    });

    // --- Wake word handler ---
    SpeechService.onWakeWord((query) => {
      if (isProcessingRef.current) return;

      if (query) {
        // User said "Hey Nova, <query>" — process the query directly
        setIsProcessing(true);
        setMessages((prev) => [...prev, { role: 'user', text: query, timestamp: Date.now() }]);

        const lang = currentLanguageRef.current;

        // Cancel any previous in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const history: HistoryMessage[] = messagesRef.current
          .slice(-CONTEXT_WINDOW)
          .map((m) => ({ role: m.role, text: m.text }));

        setBlobState('responding');
        FaviconService.updateState('responding');

        // On slow networks, use single-shot request instead of streaming
        if (preferNonStreamingRef.current) {
          handleAIRequest({ query, language: lang, history }, controller.signal)
            .then((aiResponse) => {
              if (controller.signal.aborted) return;
              if (aiResponse?.responseText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                ]);
                return SpeechService.speak(aiResponse.responseText, lang);
              }
            })
            .catch((err) => {
              if (controller.signal.aborted) return;
              console.error('Wake word non-streaming failed:', err);
              const errorMsg = ERROR_MESSAGES[lang];
              setMessages((prev) => [...prev, { role: 'assistant', text: errorMsg, timestamp: Date.now() }]);
              SpeechService.speak(errorMsg, lang);
            })
            .finally(() => {
              if (!controller.signal.aborted) {
                setIsProcessing(false);
                setBlobState('idle');
                FaviconService.updateState('idle');
              }
              abortControllerRef.current = null;
            });
          return;
        }

        setMessages((prev) => [...prev, { role: 'assistant', text: '', timestamp: Date.now() }]);

        const speaker = SpeechService.createStreamingSpeaker(lang);

        handleAIRequestStream(
          { query, language: lang, history },
          (chunk) => {
            if (controller.signal.aborted) {
              speaker.cancel();
              return;
            }
            speaker.pushChunk(chunk);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, text: last.text + chunk };
              }
              return updated;
            });
          },
          controller.signal,
        )
          .then(async () => {
            if (controller.signal.aborted) {
              speaker.cancel();
              return;
            }
            await speaker.finish();
          })
          .catch((streamError) => {
            speaker.cancel();
            if (controller.signal.aborted) return;
            console.warn('Wake word streaming failed, trying fallback:', streamError);

            // Remove failed streaming placeholder
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') updated.pop();
              return updated;
            });

            return handleAIRequest({ query, language: lang, history }, controller.signal)
              .then((aiResponse) => {
                if (controller.signal.aborted) return;
                if (aiResponse?.responseText) {
                  setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                  ]);
                  return SpeechService.speak(aiResponse.responseText, lang);
                }
              })
              .catch((fallbackError) => {
                if (controller.signal.aborted) return;
                console.error('Wake word fallback also failed:', fallbackError);
                const errorMsg = ERROR_MESSAGES[lang];
                setMessages((prev) => [...prev, { role: 'assistant', text: errorMsg, timestamp: Date.now() }]);
                SpeechService.speak(errorMsg, lang);
              });
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setIsProcessing(false);
              setBlobState('idle');
              FaviconService.updateState('idle');
            }
            abortControllerRef.current = null;
            // Wake word restart is handled by the wakeWordEnabled effect
          });
      } else {
        // User just said "Hey Nova" — start normal listening
        setBlobState('listening');
        FaviconService.updateState('listening');
        SpeechService.startListening();
      }
    });

    // Show greeting text (no auto-speak — browsers block it)
    // Only if there are no persisted messages
    if (!hasGreeted.current) {
      const greeting = getTimeBasedGreeting(loadLanguage());
      setGreetingText(greeting);
      setMessages((prev) => {
        if (prev.length === 0) {
          return [{ role: 'assistant', text: greeting, timestamp: Date.now() }];
        }
        return prev;
      });
      hasGreeted.current = true;
    }

    return () => {
      SpeechService.stopListening();
      SpeechService.stopSpeaking();
      SpeechService.stopWakeWordListening();
    };
  }, []); // mount-only — uses refs for mutable values

  // Subscribe to language changes via event (no monkey-patching)
  useEffect(() => {
    const unsubscribe = SpeechService.onLanguageChange((lang) => {
      setCurrentLanguage(lang);
      saveLanguage(lang);
    });

    // Ensure language matches persisted choice (defaults to kn-IN)
    const initialLang = loadLanguage();
    SpeechService.setLanguage(initialLang);
    setCurrentLanguage(initialLang);

    return unsubscribe;
  }, []);

  // Close language menu on outside click
  useEffect(() => {
    if (!showLanguageMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLanguageMenu]);

  // Close voice settings menu on outside click
  useEffect(() => {
    if (!showVoiceMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setShowVoiceMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showVoiceMenu]);

  // Subscribe to voice settings changes
  useEffect(() => {
    return SpeechService.onVoiceSettingsChange(() => {
      setVoicePersona(SpeechService.getVoicePersona());
      setVoiceSpeed(SpeechService.getVoiceSpeed());
    });
  }, []);

  const handleVoicePersonaChange = useCallback((persona: VoicePersona) => {
    SpeechService.setVoicePersona(persona);
    setVoicePersona(persona);
    const testGreeting = persona === 'female'
      ? 'ನಮಸ್ಕಾರ, ನಾನು ನೋವಾ. ಇದು ಸ್ತ್ರೀ ಧ್ವನಿ.'
      : 'ನಮಸ್ಕಾರ, ನಾನು ನೋವಾ. ಇದು ಪುರುಷ ಧ್ವನಿ.';
    SpeechService.speak(testGreeting, currentLanguageRef.current);
  }, []);

  const handleVoiceSpeedChange = useCallback((speed: number) => {
    SpeechService.setVoiceSpeed(speed);
    setVoiceSpeed(speed);
  }, []);

  // Wake word toggle — start/stop listening when toggle changes
  // Only start wake word after user has interacted (user gesture required for mic)
  useEffect(() => {
    if (wakeWordEnabled && hasInteractedRef.current) {
      if (blobState === 'idle' && !isProcessing) {
        SpeechService.startWakeWordListening();
      }
    } else if (!wakeWordEnabled) {
      SpeechService.stopWakeWordListening();
    }
    return () => {
      // Don't stop on cleanup if component unmounts — the mount cleanup handles it
    };
  }, [wakeWordEnabled, blobState, isProcessing]);

  // Restart wake word listening after processing completes (if enabled)
  useEffect(() => {
    if (wakeWordEnabled && hasInteractedRef.current && !isProcessing && blobState === 'idle' && !SpeechService.isWakeWordActive()) {
      const timer = setTimeout(() => {
        SpeechService.startWakeWordListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [wakeWordEnabled, isProcessing, blobState]);

  // Handle clear history
  const handleClearHistory = useCallback(() => {
    clearStoredMessages();
    const greeting = getTimeBasedGreeting(currentLanguageRef.current);
    setMessages([{ role: 'assistant', text: greeting, timestamp: Date.now() }]);
    setShowHistory(false);
  }, []);

  const handleLanguageSelect = useCallback((language: SupportedLanguage) => {
    SpeechService.setLanguage(language);
    setCurrentLanguage(language);
    saveLanguage(language);
    setShowLanguageMenu(false);

    const newGreeting = getTimeBasedGreeting(language);
    setGreetingText(newGreeting);

    const confirmations: Record<SupportedLanguage, string> = {
      'kn-IN': 'ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ',
      'en-US': 'Switched to English',
      'ar-LB': 'تم التحويل إلى اللغة العربية',
      'fr-FR': 'Passé au français',
    };
    SpeechService.speak(confirmations[language], language);
  }, []);

  // Handle text input submission
  const handleTextSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const query = textInput.trim();
      if (!query || isProcessing) return;

      setTextInput('');
      setIsProcessing(true);

      // Stop any ongoing voice activity
      SpeechService.stopListening();
      SpeechService.stopSpeaking();

      setMessages((prev) => [...prev, { role: 'user', text: query, timestamp: Date.now() }]);
      await processQuery(query);
    },
    [textInput, isProcessing, processQuery],
  );

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activePlayingIndex, setActivePlayingIndex] = useState<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat on messages change or active streaming
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const quickSuggestions = [
    '🌤️ ಇಂದಿನ ಹವಾಮಾನ ಮತ್ತು ದಿನಚರಿ ಹೇಗಿದೆ?',
    '📖 ಒಂದು ಸುಂದರವಾದ ಕನ್ನಡ ಕಥೆ ಅಥವಾ ಗಾದೆ ಹೇಳು',
    '🚀 ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ (AI) ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?',
    '💡 ಕೋಡಿಂಗ್ ಮತ್ತು ಅಪ್ಲಿಕೇಶನ್ ಅಭಿವೃದ್ಧಿಗೆ ಸಲಹೆ ನೀಡು',
  ];

  const handleSuggestionClick = (query: string) => {
    if (isProcessing) return;
    setTextInput('');
    setIsProcessing(true);
    SpeechService.stopListening();
    SpeechService.stopSpeaking();
    setMessages((prev) => [...prev, { role: 'user', text: query, timestamp: Date.now() }]);
    processQuery(query);
  };

  const handleToggleMic = () => {
    if (blobState === 'listening') {
      SpeechService.stopListening();
      updateBlobState('idle');
    } else {
      handleBlobClick();
    }
  };

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSpeakMessage = (text: string, index: number) => {
    if (activePlayingIndex === index) {
      SpeechService.stopSpeaking();
      setActivePlayingIndex(null);
    } else {
      SpeechService.stopSpeaking();
      setActivePlayingIndex(index);
      SpeechService.speak(text, currentLanguageRef.current);
      const estDuration = Math.max(2500, (text.length / 14) * 1000);
      setTimeout(() => {
        setActivePlayingIndex(null);
      }, estDuration);
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-gradient-to-b from-gray-950 via-[#0d0718] to-black text-white flex flex-col pb-36">
      {/* Offline banner */}
      {!isOnline && <OfflineBanner language={currentLanguage} />}

      {/* Slow network indicator */}
      {isOnline && isSlowNetwork && (
        <div
          role="status"
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-orange-800/80 text-white text-xs py-1.5 px-4 backdrop-blur-sm animate-slide-down"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Slow connection detected — using compact responses</span>
        </div>
      )}

      {/* Microphone Permission Warning Banner */}
      {micErrorMessage && !micWarningDismissed && (
        <div
          role="alert"
          className="sticky top-0 z-40 bg-gradient-to-r from-red-950/95 via-rose-950/95 to-gray-950/95 border-b border-red-500/40 text-white px-3 sm:px-4 py-2.5 shadow-lg backdrop-blur-md flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={18} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-200 leading-tight truncate sm:whitespace-normal">
              {micErrorMessage}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                const granted = await requestAndValidatePermission();
                if (granted) {
                  setMicWarningDismissed(true);
                }
              }}
              disabled={isMicValidating}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-all"
            >
              {isMicValidating ? 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...' : 'ಮೈಕ್ ಅನುಮತಿಸಿ (Allow)'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMicWarningDismissed(true);
                clearMicError();
              }}
              className="p-1 text-gray-400 hover:text-white rounded"
              aria-label="Dismiss warning"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation & Status Bar */}
      <header className="sticky top-0 z-30 w-full bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80 px-4 py-2.5 flex items-center justify-between shadow-lg">
        {/* Brand & Live State */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-purple-600/30 shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-white">ನೋವಾ AI</span>
              <span className="text-[10px] text-purple-300 font-medium px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-500/30 hidden sm:inline">
                Gemini 3.8 Flash
              </span>
            </div>
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 text-[11px]">
              {blobState === 'listening' ? (
                <span className="flex items-center gap-1 text-cyan-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                  <span>ಆಲಿಸಲಾಗುತ್ತಿದೆ... (Listening)</span>
                </span>
              ) : blobState === 'responding' ? (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                  <span>ಯೋಚಿಸುತ್ತಿದೆ... (Thinking)</span>
                </span>
              ) : blobState === 'speaking' ? (
                <span className="flex items-center gap-1 text-purple-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping inline-block" />
                  <span>ಉತ್ತರಿಸುತ್ತಿದೆ... (Speaking)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  <span>ಸಿದ್ಧವಾಗಿದೆ (Ready)</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile / APK Button */}
          <button
            type="button"
            onClick={() => setShowApkModal(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white shadow-sm border border-purple-400/30 transition-all active:scale-95"
            title="ಮೊಬೈಲ್ ಆ್ಯಪ್ & APK ಡೌನ್‌ಲೋಡ್ (Mobile APK)"
          >
            <Smartphone size={13} />
            <span>APK / App</span>
          </button>

          {/* Clear chat history */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              title="ಸಂಭಾಷಣೆ ತೆರವುಗೊಳಿಸಿ (Clear Chat)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-red-400 border border-gray-800 text-xs transition-colors"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">ತೆರವು</span>
            </button>
          )}

          {/* Wake word toggle */}
          <button
            type="button"
            onClick={async () => {
              if (!wakeWordEnabled) {
                const granted = await requestAndValidatePermission();
                if (!granted) return;
                setMicWarningDismissed(false);
                hasInteractedRef.current = true;
                setWakeWordEnabled(true);
              } else {
                setWakeWordEnabled(false);
              }
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              wakeWordEnabled
                ? 'bg-purple-600/80 border-purple-400 text-white'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
            aria-label={wakeWordEnabled ? 'Disable "Hey Nova" wake word' : 'Enable "Hey Nova" wake word'}
            title={wakeWordEnabled ? '"Hey Nova" ಸಕ್ರಿಯವಾಗಿದೆ' : 'Hey Nova ಆನ್ ಮಾಡಿ'}
          >
            <Radio size={13} />
            <span className="hidden sm:inline">Hey Nova</span>
            {wakeWordEnabled && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-400"></span>
              </span>
            )}
          </button>

          {/* Voice Persona / Customizer Toggle */}
          <div ref={voiceMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowVoiceMenu((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-gray-900 border-gray-800 hover:border-purple-500/50 text-purple-200 hover:text-white transition-colors"
              aria-label={`ಧ್ವನಿ ಆಯ್ಕೆ: ${voicePersona === 'female' ? 'ಸ್ತ್ರೀ' : 'ಪುರುಷ'}`}
              title="ಧ್ವನಿ ಮತ್ತು ವೇಗ ಆಯ್ಕೆ"
            >
              <Volume2 size={14} />
              <span className="hidden md:inline font-sans">
                {voicePersona === 'female' ? 'ಸ್ತ್ರೀ ಧ್ವನಿ' : 'ಪುರುಷ ಧ್ವನಿ'}
              </span>
            </button>

            {showVoiceMenu && (
              <div
                className="absolute top-full mt-2 right-0 w-64 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-2xl p-3 border border-purple-500/40 text-white z-40 space-y-3"
                role="dialog"
                aria-label="ಧ್ವನಿ ಆಯ್ಕೆಗಳು"
              >
                <div className="flex items-center justify-between border-b border-gray-700/60 pb-2">
                  <span className="text-xs font-semibold tracking-wide text-purple-300 uppercase">ಧ್ವನಿ ಸೆಟ್ಟಿಂಗ್ಸ್</span>
                  <span className="text-[10px] text-gray-400">Google TTS</span>
                </div>

                {/* Persona Options */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleVoicePersonaChange('female')}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs font-medium border transition-all ${
                      voicePersona === 'female'
                        ? 'bg-purple-600/40 border-purple-400 text-white shadow-sm'
                        : 'bg-gray-800/60 border-gray-700 text-gray-300 hover:bg-gray-700/60'
                    }`}
                  >
                    <span className="text-base mb-0.5">🌸</span>
                    <span>ಸ್ತ್ರೀ ಧ್ವನಿ</span>
                    <span className="text-[10px] text-purple-200/70">Sapna</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoicePersonaChange('male')}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs font-medium border transition-all ${
                      voicePersona === 'male'
                        ? 'bg-purple-600/40 border-purple-400 text-white shadow-sm'
                        : 'bg-gray-800/60 border-gray-700 text-gray-300 hover:bg-gray-700/60'
                    }`}
                  >
                    <span className="text-base mb-0.5">🎙️</span>
                    <span>ಪುರುಷ ಧ್ವನಿ</span>
                    <span className="text-[10px] text-purple-200/70">Gagan</span>
                  </button>
                </div>

                {/* Speed Options */}
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-medium text-gray-400">ಮಾತಿನ ವೇಗ</span>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {[
                      { label: 'ಸಾಮಾನ್ಯ', speed: 1.0 },
                      { label: 'ವೇಗ', speed: 1.1 },
                      { label: 'ಅತಿ ವೇಗ', speed: 1.2 },
                    ].map((s) => (
                      <button
                        key={s.speed}
                        type="button"
                        onClick={() => handleVoiceSpeedChange(s.speed)}
                        className={`py-1 px-1.5 rounded text-center transition-all ${
                          Math.abs(voiceSpeed - s.speed) < 0.05
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview Button */}
                <button
                  type="button"
                  onClick={() => {
                    SpeechService.speak(
                      'ನಮಸ್ಕಾರ! ನಾನು ನೋವಾ, ನಿಮ್ಮ ಕನ್ನಡ ಧ್ವನಿ ಸಹಾಯಕ.',
                      currentLanguageRef.current,
                    );
                  }}
                  className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-purple-300 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors border border-gray-700"
                >
                  <Volume2 size={13} />
                  <span>ಧ್ವನಿ ಪರೀಕ್ಷಿಸಿ (Test)</span>
                </button>
              </div>
            )}
          </div>

          {/* Language selector */}
          <div ref={langMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowLanguageMenu((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-gray-900 border border-gray-800 hover:border-purple-500/50 text-white transition-colors"
              aria-label={`Current language: ${LANGUAGE_DISPLAY[currentLanguage].name}. Click to change.`}
            >
              <span>{LANGUAGE_DISPLAY[currentLanguage].flag}</span>
              <span className="hidden sm:inline">{LANGUAGE_DISPLAY[currentLanguage].name.split(' ')[0]}</span>
            </button>

            {showLanguageMenu && (
              <div
                className="absolute top-full mt-2 right-0 bg-gray-900/95 backdrop-blur-md rounded-xl shadow-xl overflow-hidden border border-gray-700/60 transition-all z-40 min-w-[170px]"
                role="listbox"
              >
                {(Object.entries(LANGUAGE_DISPLAY) as [SupportedLanguage, { name: string; flag: string }][]).map(
                  ([langCode, langInfo]) => (
                    <button
                      key={langCode}
                      role="option"
                      aria-selected={currentLanguage === langCode}
                      onClick={() => handleLanguageSelect(langCode)}
                      className={`flex items-center w-full px-3 py-2 text-left text-xs text-white hover:bg-purple-600/30 transition-all ${
                        currentLanguage === langCode ? 'bg-purple-950/60 font-semibold text-purple-300 border-l-2 border-purple-400' : ''
                      }`}
                    >
                      <span className="mr-2 text-base">{langInfo.flag}</span>
                      <span>{langInfo.name}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Visual Voice Orb Hero Area (Compact) */}
      <div className="relative w-full h-40 sm:h-48 shrink-0 flex items-center justify-center overflow-hidden border-b border-gray-800/40 bg-gradient-to-b from-purple-950/20 to-transparent">
        <BlobVisualization
          state={blobState}
          amplitude={amplitude}
          onClick={handleBlobClick}
        />
        <div className="absolute bottom-2 text-center pointer-events-none">
          <p className="text-[11px] text-gray-400 font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-gray-800">
            {blobState === 'listening'
              ? '🎙️ ನಿಮ್ಮ ಧ್ವನಿ ಆಲಿಸಲಾಗುತ್ತಿದೆ... (Listening)'
              : blobState === 'responding'
              ? '⚡ ನೋವಾ ಯೋಚಿಸುತ್ತಿದೆ... (Thinking)'
              : blobState === 'speaking'
              ? '🔊 ನೋವಾ ಉತ್ತರಿಸುತ್ತಿದೆ... (Speaking)'
              : greetingText || 'ಧ್ವನಿ ಮೂಲಕ ಮಾತನಾಡಲು ಆರ್ಬ್ ಅಥವಾ ಕೆಳಗಿನ ಮೈಕ್ ಒತ್ತಿ'}
          </p>
        </div>
      </div>

      {/* Live Conversation Area (ನಾನು ಕಳಿಸಿರುವ ಮೆಸೇಜು ಮತ್ತು AI ರೆಸ್ಪಾನ್ಸ್ ಟೆಕ್ಸ್ಟ್) */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 overflow-y-auto space-y-4">
        {/* Welcome state when no messages */}
        {messages.length === 0 && (
          <div className="py-6 sm:py-8 px-4 rounded-2xl bg-gray-900/50 border border-gray-800 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto">
              <Bot size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                ನಮಸ್ಕಾರ! ನೋವಾ AI ಗೆ ಸ್ವಾಗತ
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto mt-1 leading-relaxed">
                ನೀವು ಕಳಿಸಿದ ಸಂದೇಶಗಳು ಮತ್ತು ನೋವಾ ನೀಡುವ ಪ್ರತ್ಯುತ್ತರಗಳು ನೇರವಾಗಿ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ. ಕೆಳಗಿನ ಮೈಕ್ ಒತ್ತಿ ಮಾತನಾಡಿ ಅಥವಾ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.
              </p>
            </div>

            {/* Quick Suggestions */}
            <div className="pt-2">
              <span className="text-[11px] text-gray-400 block mb-2 font-medium">
                ತಕ್ಷಣ ಕೇಳಬಹುದಾದ ಪ್ರಶ್ನೆಗಳು (Quick Prompts):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                {quickSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleSuggestionClick(sug)}
                    className="p-2.5 rounded-xl bg-gray-950/80 hover:bg-purple-950/50 border border-gray-800 hover:border-purple-500/40 text-left text-xs text-purple-200 hover:text-white transition-all shadow"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation Messages */}
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isLast = index === messages.length - 1;
          const isActivelyStreaming = isLast && !isUser && isProcessing;

          return (
            <div
              key={index}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group animate-fade-in`}
            >
              {/* Sender Header */}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1 px-1">
                {isUser ? (
                  <>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-semibold text-purple-300">ನೀವು (You)</span>
                    <User size={13} className="text-purple-400" />
                  </>
                ) : (
                  <>
                    <Bot size={13} className="text-cyan-400" />
                    <span className="font-semibold text-cyan-300">ನೋವಾ AI (Nova)</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                )}
              </div>

              {/* Message Content Bubble */}
              <div
                className={`relative max-w-[88%] sm:max-w-[80%] p-3.5 sm:p-4 rounded-2xl shadow-xl leading-relaxed text-sm ${
                  isUser
                    ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-tr-sm'
                    : 'bg-gray-900/90 border border-purple-500/30 text-gray-100 rounded-tl-sm backdrop-blur-md'
                }`}
              >
                <div className="whitespace-pre-wrap select-text break-words">
                  {msg.text || (isActivelyStreaming ? '' : '...')}
                  {isActivelyStreaming && (
                    <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1 align-middle" />
                  )}
                </div>

                {isActivelyStreaming && (
                  <div className="flex items-center gap-1.5 text-[10px] text-purple-300/80 mt-2 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                    <span>ಲೈವ್ ರೆಸ್ಪಾನ್ಸ್ ಸ್ಟ್ರೀಮಿಂಗ್ (Streaming live)...</span>
                  </div>
                )}

                {/* Message Actions */}
                {!isUser && msg.text && !isActivelyStreaming && (
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-800/80 text-xs">
                    {/* Speak Button */}
                    <button
                      type="button"
                      onClick={() => handleSpeakMessage(msg.text, index)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                        activePlayingIndex === index
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white'
                      }`}
                      title={activePlayingIndex === index ? 'ನಿಲ್ಲಿಸಿ' : 'ಧ್ವನಿ ಆಲಿಸಿ'}
                    >
                      {activePlayingIndex === index ? (
                        <>
                          <VolumeX size={13} />
                          <span className="text-[11px]">ನಿಲ್ಲಿಸಿ</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={13} />
                          <span className="text-[11px]">ಧ್ವನಿ ಆಲಿಸಿ</span>
                        </>
                      )}
                    </button>

                    {/* Copy Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.text, index)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                      title="ಪಠ್ಯ ನಕಲಿಸಿ"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check size={13} className="text-green-400" />
                          <span className="text-[11px] text-green-400">ನಕಲಿಸಲಾಗಿದೆ</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span className="text-[11px]">ನಕಲಿಸಿ</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isUser && (
                  <div className="flex items-center justify-end gap-1 mt-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.text, index)}
                      className="p-1 rounded hover:bg-purple-800/50 text-white/80"
                      title="ನಕಲಿಸಿ"
                    >
                      {copiedIndex === index ? <Check size={12} className="text-green-300" /> : <Copy size={12} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={chatScrollRef} />
      </main>

      {/* Floating Input Dock (above bottom navigation) */}
      <div className="fixed bottom-16 sm:bottom-18 left-0 right-0 z-30 px-3 py-2 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <form
            onSubmit={handleTextSubmit}
            className="flex items-center gap-2 bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-purple-500/40 p-1.5 sm:p-2 shadow-2xl focus-within:border-purple-400 transition-all"
          >
            {/* Mic Button with permission awareness */}
            <button
              type="button"
              onClick={handleToggleMic}
              title={
                blobState === 'listening'
                  ? 'ಆಲಿಸುವಿಕೆ ನಿಲ್ಲಿಸಿ (Stop Listening)'
                  : micPermissionState === 'denied'
                  ? 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ - ಕ್ಲಿಕ್ ಮಾಡಿ (Mic Denied)'
                  : 'ಧ್ವನಿ ಮೂಲಕ ಮಾತನಾಡಿ (Tap to Speak)'
              }
              aria-label={blobState === 'listening' ? 'Stop Listening' : 'Start Voice Input'}
              className={`p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0 ${
                blobState === 'listening'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 animate-pulse ring-2 ring-red-400'
                  : micPermissionState === 'denied'
                  ? 'bg-red-950/60 hover:bg-red-900/80 text-red-400 border border-red-500/50'
                  : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-white border border-purple-500/40'
              }`}
            >
              {blobState === 'listening' ? (
                <MicOff size={18} />
              ) : micPermissionState === 'denied' ? (
                <MicOff size={18} className="text-red-400" />
              ) : (
                <Mic size={18} />
              )}
            </button>

            {/* Input Text Field */}
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                currentLanguage === 'kn-IN'
                  ? 'ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಅಥವಾ ಸಂದೇಶವನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ...'
                  : currentLanguage === 'ar-LB'
                  ? 'اكتب رسالتك هنا...'
                  : currentLanguage === 'fr-FR'
                  ? 'Tapez votre message ici...'
                  : 'Type your message here...'
              }
              className="flex-1 bg-transparent text-white text-xs sm:text-sm placeholder-gray-500 outline-none px-2"
              disabled={isProcessing}
              dir={currentLanguage === 'ar-LB' ? 'rtl' : 'ltr'}
              aria-label="ಸಂದೇಶ ಇನ್‌ಪುಟ್"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={isProcessing || !textInput.trim()}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-md shadow-purple-600/30 transition-all shrink-0"
              aria-label="ಕಳುಹಿಸಿ"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* APK & Mobile Installation Modal */}
      <ApkDownloadModal
        isOpen={showApkModal}
        onClose={() => setShowApkModal(false)}
      />
    </div>
  );
};

export default VoiceAssistant;

import {
  loadLanguage,
  loadVoicePersona,
  saveVoicePersona,
  loadVoiceSpeed,
  saveVoiceSpeed,
  VoicePersona,
} from './StorageService';

export type SupportedLanguage = 'en-US' | 'ar-LB' | 'fr-FR' | 'kn-IN';

export interface StreamingSpeaker {
  pushChunk: (chunk: string) => void;
  finish: () => Promise<void>;
  cancel: () => void;
}

interface SpeechRecognitionResult {
  text: string;
  language: SupportedLanguage;
}

interface SpeechServiceState {
  isListening: boolean;
  recognizedLanguage: SupportedLanguage;
}

type LanguageChangeListener = (lang: SupportedLanguage) => void;

class SpeechService {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis;
  private state: SpeechServiceState = {
    isListening: false,
    recognizedLanguage: typeof window !== 'undefined' ? loadLanguage() : 'kn-IN',
  };

  private voicePersona: VoicePersona = typeof window !== 'undefined' ? loadVoicePersona() : 'female';
  private voiceSpeed: number = typeof window !== 'undefined' ? loadVoiceSpeed() : 1.08;
  private voiceSettingsListeners: Array<() => void> = [];

  // Event callbacks
  private onSpeechStartCallback: (() => void) | null = null;
  private onSpeechEndCallback: (() => void) | null = null;
  private onResultCallback: ((result: SpeechRecognitionResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private startListeningTimeout: ReturnType<typeof setTimeout> | null = null;
  private languageChangeListeners: LanguageChangeListener[] = [];

  // Fast interim silence detection
  private interimSilenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInterimTranscript: string | null = null;

  // Active streaming speaker tracking
  private activeStreamingSpeaker: StreamingSpeaker | null = null;

  // Wake word detection
  private isWakeWordMode = false;
  private onWakeWordCallback: ((query: string | null) => void) | null = null;
  private wakeWordRestartTimer: ReturnType<typeof setTimeout> | null = null;

  // Chrome 15s TTS workaround — keep-alive interval
  private ttsKeepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // Cancellation flag for sentence-queue TTS
  private speakCancelled = false;

  // Wake word retry limit
  private static readonly MAX_WAKE_RETRIES = 5;
  private wakeWordRetryCount = 0;

  constructor() {
    this.synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : (null as unknown as SpeechSynthesis);

    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      console.error('Speech recognition not supported by this browser');
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = this.state.recognizedLanguage;

    this.setupRecognitionEvents();
  }

  private setupRecognitionEvents(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.state.isListening = true;
    };

    this.recognition.onend = () => {
      this.state.isListening = false;
      this.clearListeningTimeout();
      if (this.interimSilenceTimer) {
        clearTimeout(this.interimSilenceTimer);
        this.interimSilenceTimer = null;
      }

      // Auto-restart in wake word mode
      if (this.isWakeWordMode) {
        this.wakeWordRestartTimer = setTimeout(() => {
          this.startWakeWordListeningInternal();
        }, 300);
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim();

      // --- Wake word mode: look for "Nova" keyword ---
      if (this.isWakeWordMode && result.isFinal) {
        const lower = transcript.toLowerCase();
        const novaIdx = lower.indexOf('nova');
        const knNovaIdx = transcript.indexOf('ನೋವಾ');
        if (novaIdx !== -1 || knNovaIdx !== -1) {
          // Stop wake word listening — main flow takes over
          this.stopWakeWordListening();

          // Extract anything after "nova" or "ನೋವಾ" as the query
          let afterNova = '';
          if (novaIdx !== -1) {
            afterNova = transcript.slice(novaIdx + 4).replace(/^[\s,.:]+/, '').trim();
          } else {
            afterNova = transcript.slice(knNovaIdx + 4).replace(/^[\s,.:]+/, '').trim();
          }
          this.onWakeWordCallback?.(afterNova.length >= 2 ? afterNova : null);
        }
        return;
      }

      // --- Normal mode ---
      if (!result.isFinal) {
        this.onSpeechStartCallback?.();

        // Fast voice-to-text response: If user pauses speaking for 600ms on a meaningful phrase,
        // finish recognition immediately without waiting for browser's 2-second timeout
        if (this.interimSilenceTimer) {
          clearTimeout(this.interimSilenceTimer);
        }

        if (transcript.length >= 2) {
          this.lastInterimTranscript = transcript;
          this.interimSilenceTimer = setTimeout(() => {
            if (this.state.isListening && !this.isWakeWordMode && this.lastInterimTranscript) {
              const textToSend = this.lastInterimTranscript;
              this.lastInterimTranscript = null;
              this.stopListening();
              this.onSpeechEndCallback?.();
              this.onResultCallback?.({
                text: textToSend,
                language: this.state.recognizedLanguage,
              });
            }
          }, 600);
        }
      } else {
        if (this.interimSilenceTimer) {
          clearTimeout(this.interimSilenceTimer);
          this.interimSilenceTimer = null;
        }
        this.lastInterimTranscript = null;
        this.onSpeechEndCallback?.();
        this.onResultCallback?.({
          text: transcript,
          language: this.state.recognizedLanguage,
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (this.interimSilenceTimer) {
        clearTimeout(this.interimSilenceTimer);
        this.interimSilenceTimer = null;
      }

      // In wake word mode, "no-speech" is expected — just restart
      if (this.isWakeWordMode && event.error === 'no-speech') {
        return; // onend will restart
      }

      // In wake word mode, count audio-capture / not-allowed toward retries
      if (this.isWakeWordMode && (event.error === 'audio-capture' || event.error === 'not-allowed')) {
        this.wakeWordRetryCount++;
        console.warn(`Wake word mic error (${event.error}), retry ${this.wakeWordRetryCount}/${SpeechService.MAX_WAKE_RETRIES}`);
        if (this.wakeWordRetryCount >= SpeechService.MAX_WAKE_RETRIES) {
          console.error('Max wake word retries reached — mic unavailable, stopping');
          this.isWakeWordMode = false;
          if (this.wakeWordRestartTimer) {
            clearTimeout(this.wakeWordRestartTimer);
            this.wakeWordRestartTimer = null;
          }
        }
        this.state.isListening = false;
        return; // onend will handle restart (if retries remain)
      }

      console.error('Recognition error:', event.error);
      this.onErrorCallback?.(event.error);
      this.state.isListening = false;
      this.clearListeningTimeout();
    };
  }

  private clearListeningTimeout(): void {
    if (this.startListeningTimeout) {
      clearTimeout(this.startListeningTimeout);
      this.startListeningTimeout = null;
    }
  }

  public startListening(): void {
    if (!this.recognition) return;

    // Stop wake word mode first — they share the same recognition instance
    if (this.isWakeWordMode) {
      this.stopWakeWordListening();
    }

    this.clearListeningTimeout();

    if (this.state.isListening) {
      this.stopListening();
      this.startListeningTimeout = setTimeout(() => {
        this.startListeningInternal();
      }, 50);
      return;
    }

    // Instant start — no artificial delay
    this.startListeningInternal();
  }

  private startListeningInternal(): void {
    if (!this.recognition || this.state.isListening) return;

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.state.isListening = false;
      this.onErrorCallback?.('Failed to start recognition');
    }
  }

  public stopListening(): void {
    if (!this.recognition) return;

    this.clearListeningTimeout();
    if (this.interimSilenceTimer) {
      clearTimeout(this.interimSilenceTimer);
      this.interimSilenceTimer = null;
    }

    try {
      if (this.state.isListening) {
        this.recognition.stop();
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
      this.state.isListening = false;
    }
  }

  /**
   * Progressive streaming speaker: synthesizes sentences as chunks arrive from Gemini 3.8 Flash.
   * Starts speaking immediately instead of waiting for the full response.
   */
  public createStreamingSpeaker(language: SupportedLanguage): StreamingSpeaker {
    if (!this.synthesis) {
      return {
        pushChunk: () => {},
        finish: async () => {},
        cancel: () => {},
      };
    }

    if (this.activeStreamingSpeaker) {
      this.activeStreamingSpeaker.cancel();
      this.activeStreamingSpeaker = null;
    }

    this.synthesis.cancel();
    this.clearTTSKeepAlive();
    this.speakCancelled = false;

    let buffer = '';
    let isCancelled = false;
    const queue: string[] = [];
    let isPlaying = false;
    let finishSignalReceived = false;
    let completionResolve: (() => void) | null = null;

    const playNext = async () => {
      if (isCancelled || this.speakCancelled) {
        if (completionResolve) completionResolve();
        return;
      }

      if (queue.length === 0) {
        if (finishSignalReceived) {
          isPlaying = false;
          if (completionResolve) completionResolve();
        } else {
          isPlaying = false;
        }
        return;
      }

      isPlaying = true;
      const textToSpeak = queue.shift()!;
      try {
        await this.speakSingle(textToSpeak, language);
      } catch (err) {
        if (!isCancelled && !this.speakCancelled) {
          console.warn('Streaming sentence playback:', err);
        }
      }
      playNext();
    };

    const pushSentence = (sentence: string) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      queue.push(trimmed);
      if (!isPlaying) {
        playNext();
      }
    };

    const speaker: StreamingSpeaker = {
      pushChunk: (chunk: string) => {
        if (isCancelled || this.speakCancelled) return;
        buffer += chunk;

        // Split on sentence terminals (period, exclamation, question, Kannada/Hindi danda, newline)
        const sentenceRegex = /([^.!?؟।॥\n]+[.!?؟।॥\n]+[\s]*)/g;
        let match: RegExpExecArray | null;
        let lastIndex = 0;

        while ((match = sentenceRegex.exec(buffer)) !== null) {
          pushSentence(match[1]);
          lastIndex = sentenceRegex.lastIndex;
        }

        if (lastIndex > 0) {
          buffer = buffer.slice(lastIndex);
        } else if (buffer.length > 50) {
          // If a sentence is long without punctuation, break on comma/clause for fast speech
          const commaIdx = buffer.search(/[,،،؛;][\s]*/);
          if (commaIdx >= 18) {
            const clause = buffer.slice(0, commaIdx + 1);
            buffer = buffer.slice(commaIdx + 1);
            pushSentence(clause);
          }
        }
      },
      finish: () => {
        return new Promise<void>((resolve) => {
          if (isCancelled || this.speakCancelled) {
            resolve();
            return;
          }
          finishSignalReceived = true;
          completionResolve = resolve;

          if (buffer.trim()) {
            pushSentence(buffer.trim());
            buffer = '';
          } else if (!isPlaying) {
            resolve();
          }
        });
      },
      cancel: () => {
        isCancelled = true;
        this.speakCancelled = true;
        this.stopSpeaking();
        if (completionResolve) completionResolve();
      },
    };

    this.activeStreamingSpeaker = speaker;
    return speaker;
  }

  /**
   * Speaks text aloud. Long text is automatically split into sentences
   * to work around Chrome's ~15-second SpeechSynthesis cutoff.
   */
  public async speak(text: string, language: SupportedLanguage): Promise<void> {
    if (!this.synthesis) return;

    this.synthesis.cancel();
    this.clearTTSKeepAlive();
    this.speakCancelled = false;

    const sentences = this.splitIntoSentences(text);
    if (sentences.length <= 1) {
      return this.speakSingle(text, language);
    }

    // Speak sentence by sentence to avoid the 15s cutoff
    for (const sentence of sentences) {
      if (this.speakCancelled) break;
      await this.speakSingle(sentence, language);
    }
  }

  /** Speak a single utterance (no splitting). */
  private speakSingle(text: string, language: SupportedLanguage): Promise<void> {
    if (!this.synthesis) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;

      const finishUp = () => {
        if (settled) return;
        settled = true;
        this.clearTTSKeepAlive();
        this.onSpeechEndCallback?.();
        resolve();
      };

      utterance.onstart = () => {
        this.onSpeechStartCallback?.();
        this.startTTSKeepAlive();
      };

      utterance.onend = () => finishUp();

      utterance.onerror = (event) => {
        // 'interrupted' and 'canceled' occur when speech is stopped or superseded by cancel()
        // (e.g. user clicked mic, new speech input, or utterance cancellation).
        // They are intentional browser lifecycle events, not audio or system errors.
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.warn('Speech synthesis notice:', event.error);
        }
        finishUp();
      };

      // Select voice immediately
      let voices = this.synthesis.getVoices();
      if (voices.length === 0) {
        const onVoicesChanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          if (!this.synthesis) {
            finishUp();
            return;
          }
          voices = this.synthesis.getVoices();
          this.applyVoice(utterance, voices, language);
          try {
            if (this.synthesis.paused) this.synthesis.resume();
            this.synthesis.speak(utterance);
          } catch {
            finishUp();
          }
        };
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      } else {
        this.applyVoice(utterance, voices, language);
        try {
          if (this.synthesis.paused) this.synthesis.resume();
          this.synthesis.speak(utterance);
        } catch {
          finishUp();
        }
      }
    });
  }

  /**
   * Split text into sentence-sized chunks.
   */
  private splitIntoSentences(text: string): string[] {
    const sentences = text.match(/[^.!?؟।॥\n]+[.!?؟।॥\n]+[\s]*/g);
    if (!sentences) return [text];

    const joined = sentences.join('');
    if (joined.length < text.length) {
      sentences.push(text.slice(joined.length));
    }

    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  private startTTSKeepAlive(): void {
    this.clearTTSKeepAlive();
    // Only invoke keepalive after 12s if a single utterance is still playing,
    // to avoid interrupting short sentence utterances with unneeded pause/resume.
    this.ttsKeepAliveInterval = setInterval(() => {
      try {
        if (this.synthesis && this.synthesis.speaking && !this.synthesis.paused) {
          this.synthesis.pause();
          this.synthesis.resume();
        }
      } catch {
        // Ignore any browser TTS state errors
      }
    }, 12000);
  }

  private clearTTSKeepAlive(): void {
    if (this.ttsKeepAliveInterval) {
      clearInterval(this.ttsKeepAliveInterval);
      this.ttsKeepAliveInterval = null;
    }
  }

  /** Selects the best voice and configures pitch/rate on the utterance */
  private applyVoice(
    utterance: SpeechSynthesisUtterance,
    voices: SpeechSynthesisVoice[],
    language: SupportedLanguage,
  ): void {
    const isFemale = this.voicePersona === 'female';

    const preferredVoices: Record<SupportedLanguage, string[]> = {
      'en-US': isFemale
        ? ['Samantha', 'Google US English Female', 'Microsoft Zira', 'en-US-Standard-F', 'Victoria']
        : ['David', 'Microsoft David', 'Google US English Male', 'en-US-Standard-B', 'Alex'],
      'ar-LB': isFemale
        ? ['Laila', 'Microsoft Hoda', 'Google العربية', 'Fatima', 'Amina', 'Salma']
        : ['Microsoft Naayf', 'Microsoft Ali', 'Tariq'],
      'fr-FR': isFemale
        ? ['Amélie', 'Google français Female', 'Microsoft Julie', 'Audrey', 'Marie']
        : ['Thomas', 'Microsoft Paul', 'Google français Male', 'Nicolas'],
      'kn-IN': isFemale
        ? [
            'Microsoft Sapna',
            'Sapna',
            'Google ಕನ್ನಡ',
            'kn-IN-Standard-A',
            'kn-IN-Wavenet-A',
            'kn-IN',
            'Kannada India',
            'Kannada',
            'kn',
            'hi-IN',
          ]
        : [
            'Microsoft Gagan',
            'Gagan',
            'kn-IN-Standard-B',
            'kn-IN-Wavenet-B',
            'Google ಕನ್ನಡ',
            'Kannada India',
            'Kannada',
            'kn',
          ],
    };

    const languageFallbacks: Record<SupportedLanguage, string[]> = {
      'ar-LB': ['ar', 'ar-SA', 'ar-EG'],
      'fr-FR': ['fr-CA', 'fr'],
      'en-US': ['en-GB', 'en'],
      'kn-IN': ['kn', 'kn-IN', 'hi-IN', 'hi', 'en-IN'],
    };

    const matchesLang = (voice: SpeechSynthesisVoice, code: string): boolean =>
      voice.lang === code || voice.lang.startsWith(code + '-');

    // 1. Preferred name match based on persona
    let selected = voices.find((v) =>
      preferredVoices[language].some((pref) => v.name.toLowerCase().includes(pref.toLowerCase())),
    ) ?? null;

    // 2. Exact language match
    if (!selected) selected = voices.find((v) => matchesLang(v, language)) ?? null;

    // 3. Fallback languages
    if (!selected) {
      for (const fb of languageFallbacks[language]) {
        selected = voices.find((v) => matchesLang(v, fb)) ?? null;
        if (selected) break;
      }
    }

    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang;
    } else {
      utterance.lang = language.split('-')[0];
    }

    // Pitch & rate adjusted for natural fast speech
    switch (language) {
      case 'kn-IN':
        utterance.pitch = isFemale ? 1.08 : 0.95;
        utterance.rate = this.voiceSpeed;
        break;
      case 'ar-LB':
        utterance.pitch = isFemale ? 1.15 : 0.98;
        utterance.rate = this.voiceSpeed;
        break;
      case 'fr-FR':
        utterance.pitch = isFemale ? 1.12 : 0.96;
        utterance.rate = this.voiceSpeed;
        break;
      default:
        utterance.pitch = isFemale ? 1.06 : 0.96;
        utterance.rate = this.voiceSpeed;
    }
  }

  // --- Voice Persona & Speed Controls ---

  public getVoicePersona(): VoicePersona {
    return this.voicePersona;
  }

  public setVoicePersona(persona: VoicePersona): void {
    this.voicePersona = persona;
    saveVoicePersona(persona);
    this.voiceSettingsListeners.forEach((fn) => fn());
  }

  public getVoiceSpeed(): number {
    return this.voiceSpeed;
  }

  public setVoiceSpeed(speed: number): void {
    this.voiceSpeed = speed;
    saveVoiceSpeed(speed);
    this.voiceSettingsListeners.forEach((fn) => fn());
  }

  public onVoiceSettingsChange(listener: () => void): () => void {
    this.voiceSettingsListeners.push(listener);
    return () => {
      this.voiceSettingsListeners = this.voiceSettingsListeners.filter((l) => l !== listener);
    };
  }

  // --- Public event subscriptions ---

  public onSpeechStart(callback: () => void): void {
    this.onSpeechStartCallback = callback;
  }

  public onSpeechEnd(callback: () => void): void {
    this.onSpeechEndCallback = callback;
  }

  public onResult(callback: (result: SpeechRecognitionResult) => void): void {
    this.onResultCallback = callback;
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  public onLanguageChange(listener: LanguageChangeListener): () => void {
    this.languageChangeListeners.push(listener);
    return () => {
      this.languageChangeListeners = this.languageChangeListeners.filter((l) => l !== listener);
    };
  }

  public setLanguage(language: SupportedLanguage): void {
    this.state.recognizedLanguage = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
    this.languageChangeListeners.forEach((fn) => fn(language));
  }

  public getCurrentLanguage(): SupportedLanguage {
    return this.state.recognizedLanguage;
  }

  public stopSpeaking(): void {
    if (this.activeStreamingSpeaker) {
      this.activeStreamingSpeaker.cancel();
      this.activeStreamingSpeaker = null;
    }
    if (!this.synthesis) return;
    this.speakCancelled = true;
    this.clearTTSKeepAlive();
    this.synthesis.cancel();
  }

  // --- Wake word detection ---

  public onWakeWord(callback: (query: string | null) => void): void {
    this.onWakeWordCallback = callback;
  }

  public startWakeWordListening(): void {
    if (!this.recognition || this.isWakeWordMode) return;

    this.stopListening();
    this.isWakeWordMode = true;
    this.wakeWordRetryCount = 0;
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = this.state.recognizedLanguage;

    this.startWakeWordListeningInternal();
  }

  private startWakeWordListeningInternal(): void {
    if (!this.recognition || !this.isWakeWordMode) return;

    try {
      if (!this.state.isListening) {
        this.recognition.start();
        this.wakeWordRetryCount = 0;
      }
    } catch (error) {
      console.error('Error starting wake word listening:', error);
      this.wakeWordRetryCount++;
      if (this.wakeWordRetryCount >= SpeechService.MAX_WAKE_RETRIES) {
        console.error('Max wake word retries reached — stopping');
        this.isWakeWordMode = false;
        return;
      }
      this.wakeWordRestartTimer = setTimeout(() => {
        this.startWakeWordListeningInternal();
      }, 1000);
    }
  }

  public stopWakeWordListening(): void {
    if (!this.recognition) return;

    this.isWakeWordMode = false;
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    if (this.wakeWordRestartTimer) {
      clearTimeout(this.wakeWordRestartTimer);
      this.wakeWordRestartTimer = null;
    }

    try {
      if (this.state.isListening) {
        this.recognition.stop();
      }
    } catch {
      // Ignore
    }
  }

  public isWakeWordActive(): boolean {
    return this.isWakeWordMode;
  }
}

export default new SpeechService();

import { useState, useEffect, useCallback, useRef } from 'react';

export type MicrophonePermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface MicrophoneValidationResult {
  hasAccess: boolean;
  state: MicrophonePermissionState;
  error?: string;
  stream?: MediaStream;
}

export interface UseMicrophonePermissionOptions {
  autoCheckOnMount?: boolean;
}

export interface UseMicrophonePermissionReturn {
  permissionState: MicrophonePermissionState;
  hasPermission: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  audioInputDevices: MediaDeviceInfo[];
  requestAndValidatePermission: () => Promise<boolean>;
  checkPermissionQuery: () => Promise<MicrophonePermissionState>;
  clearError: () => void;
}

/**
 * Robust React Hook to check, query, request, and validate microphone access
 * before initializing the Web Speech API or voice engines.
 */
export function useMicrophonePermission(
  options: UseMicrophonePermissionOptions = { autoCheckOnMount: true }
): UseMicrophonePermissionReturn {
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>('prompt');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Helper to enumerate available audio inputs
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioInputDevices(audioInputs);
    } catch (e) {
      console.warn('Failed to enumerate audio devices:', e);
    }
  }, []);

  // Safe query using navigator.permissions API
  const checkPermissionQuery = useCallback(async (): Promise<MicrophonePermissionState> => {
    if (typeof navigator === 'undefined') {
      return 'unsupported';
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unsupported');
      setErrorMessage('ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಸೌಲಭ್ಯ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ (Microphone unsupported).');
      return 'unsupported';
    }

    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        const mapState = (state: PermissionState): MicrophonePermissionState => {
          if (state === 'granted') return 'granted';
          if (state === 'denied') return 'denied';
          return 'prompt';
        };

        const current = mapState(status.state);
        setPermissionState(current);

        // Listen for live permission revoking or granting in browser settings
        status.onchange = () => {
          const updated = mapState(status.state);
          setPermissionState(updated);
          if (updated === 'granted') {
            setErrorMessage(null);
            refreshDevices();
          } else if (updated === 'denied') {
            setErrorMessage(
              'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಮೈಕ್ ಆನ್ ಮಾಡಿ (Microphone permission denied).'
            );
          }
        };

        return current;
      } catch {
        // Some browsers don't support query({ name: 'microphone' })
        // Fall back to prompt state
        return 'prompt';
      }
    }

    return 'prompt';
  }, [refreshDevices]);

  // Request & actually validate with getUserMedia test
  const requestAndValidatePermission = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setErrorMessage(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setIsLoading(false);
      setPermissionState('unsupported');
      setErrorMessage('ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಆಡಿಯೋ ಸೌಲಭ್ಯ ಲಭ್ಯವಿಲ್ಲ.');
      return false;
    }

    try {
      // Release any previously opened stream track
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }

      // Request actual microphone stream to validate hardware access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Verify audio track exists and is active
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0 || !audioTracks[0].enabled) {
        throw new Error('ಸಕ್ರಿಯ ಮೈಕ್ರೊಫೋನ್ ಟ್ರ್ಯಾಕ್ ಪತ್ತೆಯಾಗಿಲ್ಲ (No active audio track found).');
      }

      // Clean up the probe test stream immediately so Web Speech API can claim the mic
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      activeStreamRef.current = null;

      setPermissionState('granted');
      setErrorMessage(null);
      await refreshDevices();
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      setIsLoading(false);
      const errorObj = err as { name?: string; message?: string };
      console.warn('Microphone permission or validation failed:', errorObj);

      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage(
          'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿಯನ್ನು ನಿರಾಕರಿಸಲಾಗಿದೆ. ಧ್ವನಿ ಸಹಾಯಕ ಬಳಸಲು ಬ್ರೌಸರ್ URL ಬಾರ್‌ನಲ್ಲಿರುವ ಲಾಕ್ (🔒) ಐಕಾನ್ ಒತ್ತಿ ಮೈಕ್ ಆನ್ (Allow) ಮಾಡಿ.'
        );
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        setPermissionState('unsupported');
        setErrorMessage(
          'ಯಾವುದೇ ಮೈಕ್ರೊಫೋನ್ ಹಾರ್ಡ್‌ವೇರ್ ಪತ್ತೆಯಾಗಿಲ್ಲ (No microphone hardware detected). ದಯವಿಟ್ಟು ಮೈಕ್ ಅಥವಾ ಇಯರ್‌ಫೋನ್ ಕನೆಕ್ಟ್ ಮಾಡಿ.'
        );
      } else if (errorObj?.name === 'NotReadableError' || errorObj?.name === 'TrackStartError') {
        setPermissionState('denied');
        setErrorMessage(
          'ಮೈಕ್ರೊಫೋನ್ ಬೇರೊಂದು ಅಪ್ಲಿಕೇಶನ್‌ನಲ್ಲಿ ಬಳಕೆಯಲ್ಲಿದೆ (Microphone busy or in use by another app).'
        );
      } else {
        setPermissionState('denied');
        setErrorMessage(
          `ಮೈಕ್ರೊಫೋನ್ ದೋಷ: ${errorObj?.message || 'ಅಜ್ಞಾತ ದೋಷ ಸಂಭವಿಸಿದೆ'}. ದಯವಿಟ್ಟು ಮೈಕ್ ಪರಿಶೀಲಿಸಿ.`
        );
      }

      return false;
    }
  }, [refreshDevices]);

  // Initial mount check
  useEffect(() => {
    if (options.autoCheckOnMount) {
      checkPermissionQuery();
      refreshDevices();
    }

    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, [options.autoCheckOnMount, checkPermissionQuery, refreshDevices]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    permissionState,
    hasPermission: permissionState === 'granted',
    isLoading,
    errorMessage,
    audioInputDevices,
    requestAndValidatePermission,
    checkPermissionQuery,
    clearError,
  };
}

export default useMicrophonePermission;

import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Radio, Square, Video, X } from 'lucide-react';

interface LiveCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapturedFile: (file: File) => void;
}

export const LiveCaptureModal: React.FC<LiveCaptureModalProps> = ({ isOpen, onClose, onCapturedFile }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [captureMode, setCaptureMode] = useState<'screen' | 'camera'>('screen');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!isOpen) {
      cleanupStreams();
    }
  }, [isOpen]);

  const cleanupStreams = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setElapsedSec(0);
  };

  const startLiveCapture = async () => {
    setErrorMsg(null);
    chunksRef.current = [];
    try {
      let stream: MediaStream;
      if (captureMode === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size > 0) {
          const file = new File([blob], `live-capture-${Date.now()}.webm`, { type: 'video/webm' });
          onCapturedFile(file);
          onClose();
        }
      };

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
          setIsRecording(false);
        }
      });

      recorder.start(250);
      setElapsedSec(0);
      setIsRecording(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Permission denied or capture device unavailable.');
    }
  };

  const stopLiveCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-capture-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-xl bg-[#0D0D10] border border-white/[0.1] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-amber-400" />
            <h2 id="live-capture-title" className="text-base font-semibold text-white">
              Capture Live Stream or Broadcast
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              cleanupStreams();
              onClose();
            }}
            aria-label="Close live capture modal"
            className="p-2 text-neutral-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2 p-1 bg-black border border-white/[0.08] rounded-xl">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => setCaptureMode('screen')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                captureMode === 'screen' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Livestream / Tab Capture</span>
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => setCaptureMode('camera')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                captureMode === 'camera' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Studio Camera + Mic</span>
            </button>
          </div>

          <div className="relative aspect-video bg-black border border-white/[0.08] rounded-xl overflow-hidden flex items-center justify-center">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            {!isRecording && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <p className="text-sm text-neutral-300 font-medium">
                  {captureMode === 'screen'
                    ? 'Select a live YouTube stream tab, OBS window, or browser broadcast to record.'
                    : 'Record directly from your webcam and studio microphone.'}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  Captured live footage is immediately analyzed into multiple 9:16 Reels and Shorts.
                </p>
              </div>
            )}
            {isRecording && (
              <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/80 border border-white/15 rounded-md text-xs font-mono-tabular text-amber-400">
                REC · {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:{String(elapsedSec % 60).padStart(2, '0')}
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                cleanupStreams();
                onClose();
              }}
              className="px-4 py-2.5 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            {!isRecording ? (
              <button
                type="button"
                onClick={startLiveCapture}
                className="px-5 py-2.5 text-xs font-semibold text-black bg-white rounded-full hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                Start Live Capture
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLiveCapture}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-black bg-amber-400 rounded-full hover:bg-amber-300 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-black" />
                <span>Stop & Generate Clips</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

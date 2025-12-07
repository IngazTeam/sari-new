import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, X, Send } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onCancel?: () => void;
  maxDuration?: number; // بالثواني، افتراضي 120 ثانية (2 دقيقة)
}

export function VoiceRecorder({ 
  onRecordingComplete, 
  onCancel,
  maxDuration = 120 
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // تنظيف عند إلغاء التحميل
  useEffect(() => {
    return () => {
      stopRecording();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // بدء التسجيل
  const startRecording = async () => {
    try {
      // طلب إذن الميكروفون
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });

      // إنشاء MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // حفظ البيانات
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // عند انتهاء التسجيل
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        
        // إيقاف جميع المسارات
        stream.getTracks().forEach(track => track.stop());
      };

      // بدء التسجيل
      mediaRecorder.start(100); // حفظ كل 100ms
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // بدء المؤقت
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // إيقاف تلقائي عند الوصول للحد الأقصى
        if (elapsed >= maxDuration) {
          stopRecording();
          toast.warning(`تم إيقاف التسجيل تلقائياً بعد ${maxDuration} ثانية`);
        }
      }, 100);

    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('فشل الوصول إلى الميكروفون. تأكد من منح الإذن.');
    }
  };

  // إيقاف التسجيل
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // إلغاء التسجيل
  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setDuration(0);
    chunksRef.current = [];
    onCancel?.();
  };

  // إرسال التسجيل
  const sendRecording = () => {
    if (audioBlob && duration > 0) {
      onRecordingComplete(audioBlob, duration);
      // إعادة تعيين
      setAudioBlob(null);
      setDuration(0);
      chunksRef.current = [];
    }
  };

  // تنسيق الوقت (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // حساب النسبة المئوية للوقت
  const progressPercentage = (duration / maxDuration) * 100;

  return (
    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
      {!isRecording && !audioBlob && (
        <>
          <Button
            onClick={startRecording}
            size="icon"
            variant="default"
            className="rounded-full h-12 w-12"
          >
            <Mic className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">
            اضغط لبدء التسجيل
          </span>
        </>
      )}

      {isRecording && (
        <>
          {/* مؤشر التسجيل */}
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">جاري التسجيل...</span>
            </div>
            
            {/* المؤقت */}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-100"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <span className="text-sm font-mono min-w-[3rem] text-right">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* أزرار التحكم */}
          <div className="flex gap-2">
            <Button
              onClick={cancelRecording}
              size="icon"
              variant="ghost"
              className="h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              onClick={stopRecording}
              size="icon"
              variant="destructive"
              className="h-10 w-10"
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {audioBlob && !isRecording && (
        <>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-green-500 rounded-full" />
              <span className="text-sm font-medium">تسجيل جاهز</span>
            </div>
            <span className="text-sm text-muted-foreground">
              ({formatTime(duration)})
            </span>
          </div>

          {/* أزرار الإرسال/الإلغاء */}
          <div className="flex gap-2">
            <Button
              onClick={cancelRecording}
              size="icon"
              variant="ghost"
              className="h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              onClick={sendRecording}
              size="icon"
              variant="default"
              className="h-10 w-10"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

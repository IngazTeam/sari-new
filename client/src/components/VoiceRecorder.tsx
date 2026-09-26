import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface VoiceRecorderProps {
  onRecordingComplete: (audio: Blob, duration: number) => Promise<boolean>;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
  maxDuration?: number;
  disabled?: boolean;
}
export function VoiceRecorder({onRecordingComplete,onCancel,onBusyChange,maxDuration=120,disabled=false}:VoiceRecorderProps){
  const {t}=useTranslation();
  const [phase,setPhase]=useState<'idle'|'permission'|'recording'|'draft'|'sending'>('idle');
  const [duration,setDuration]=useState(0),[audio,setAudio]=useState<Blob|null>(null),[preview,setPreview]=useState(''),[attempted,setAttempted]=useState(false);
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null);
  const mounted=useRef(false),generation=useRef(0),locked=useRef(false),started=useRef(0),chunks=useRef<Blob[]>([]);
  const busyCallback=useRef(onBusyChange);busyCallback.current=onBusyChange;
  const clearTimer=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;};
  const stopTracks=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
  const discard=()=>{
    generation.current++;clearTimer();const active=recorder.current;recorder.current=null;
    if(active){active.ondataavailable=null;active.onstop=null;active.onerror=null;if(active.state!=='inactive')active.stop();}
    stopTracks();chunks.current=[];locked.current=false;
  };
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;discard();busyCallback.current?.(false);};},[]);
  useEffect(()=>{if(!audio){setPreview('');return;}const url=URL.createObjectURL(audio);setPreview(url);return()=>URL.revokeObjectURL(url);},[audio]);
  const reset=()=>{discard();setAudio(null);setDuration(0);setAttempted(false);setPhase('idle');busyCallback.current?.(false);};
  const stop=()=>{const active=recorder.current;if(active&&active.state!=='inactive'){clearTimer();setDuration(Math.max(0.001,Math.min(maxDuration,(Date.now()-started.current)/1000)));active.stop();}};
  const start=async()=>{
    if(disabled||locked.current||phase!=='idle')return;locked.current=true;setPhase('permission');busyCallback.current?.(true);const own=++generation.current;
    try{
      const captured=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(!mounted.current||own!==generation.current){captured.getTracks().forEach(track=>track.stop());return;}stream.current=captured;
      const mimeType=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType)throw Error('Unsupported recorder');
      const active=new MediaRecorder(captured,{mimeType});recorder.current=active;chunks.current=[];
      active.ondataavailable=event=>{if(mounted.current&&own===generation.current&&event.data.size)chunks.current.push(event.data);};
      active.onstop=()=>{stopTracks();clearTimer();if(!mounted.current||own!==generation.current)return;
        const blob=new Blob(chunks.current,{type:mimeType});locked.current=false;
        if(!blob.size||blob.size>16*1024*1024){reset();toast.error(t('staffVoice.unavailable'),{position:'top-center'});return;}
        setAudio(blob);setPhase('draft');
      };
      active.onerror=()=>{if(mounted.current&&own===generation.current){reset();toast.error(t('staffVoice.unavailable'),{position:'top-center'});}};
      started.current=Date.now();active.start(100);setPhase('recording');setDuration(0);
      timer.current=setInterval(()=>{const elapsed=(Date.now()-started.current)/1000;setDuration(Math.min(maxDuration,elapsed));if(elapsed>=maxDuration)stop();},100);
    }catch{if(mounted.current&&own===generation.current){reset();toast.error(t('staffVoice.microphoneError'),{position:'top-center'});}}
  };
  const send=async()=>{
    if(disabled||locked.current||!audio||phase!=='draft')return;locked.current=true;setPhase('sending');setAttempted(true);
    try{if(await onRecordingComplete(audio,duration)){if(mounted.current)reset();return;}}
    catch{if(mounted.current)toast.error(t('staffVoice.unavailable'),{position:'top-center'});}
    if(mounted.current){locked.current=false;setPhase('draft');}
  };
  const cancel=()=>{if(disabled||phase==='sending')return;reset();onCancel?.();};
  const time=`${Math.floor(duration/60).toString().padStart(2,'0')}:${Math.floor(duration%60).toString().padStart(2,'0')}`;
  return <section data-voice-recorder data-voice-phase={phase} className="min-w-0 space-y-2 rounded-lg bg-muted p-3" aria-label={t('staffVoice.title')}>
    <div className="flex flex-wrap items-center gap-2">
      {phase==='idle'&&<Button type="button" data-voice-start size="icon" disabled={disabled} onClick={start} style={{minWidth:44,minHeight:44}} aria-label={t('staffVoice.start')}><Mic className="h-5 w-5"/></Button>}
      {phase==='permission'&&<Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true"/>}
      <span className={`min-w-0 text-sm ${phase==='draft'||phase==='sending'?'basis-full':'flex-1'}`} role="status">{phase==='idle'?t('staffVoice.start'):phase==='permission'?t('staffVoice.permission'):phase==='recording'?t('staffVoice.recording'):phase==='sending'?t('staffVoice.sending'):t('staffVoice.review')}</span>
      {phase!=='idle'&&phase!=='permission'&&<span className="font-mono text-sm" dir="ltr">{time}</span>}
      {phase!=='idle'&&<Button type="button" data-voice-cancel size="icon" variant="ghost" disabled={disabled||phase==='sending'} onClick={cancel} style={{minWidth:44,minHeight:44}} aria-label={t('staffVoice.cancel')}><X className="h-5 w-5"/></Button>}
      {phase==='recording'&&<Button type="button" data-voice-stop size="icon" variant="destructive" onClick={stop} style={{minWidth:44,minHeight:44}} aria-label={t('staffVoice.stop')}><Square className="h-4 w-4"/></Button>}
      {(phase==='draft'||phase==='sending')&&<Button type="button" data-voice-send disabled={disabled||phase==='sending'} onClick={send} style={{minHeight:44}} className="gap-2 whitespace-normal">
        {phase==='sending'?<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"/>:<Send className="h-4 w-4"/>}{attempted?t('staffVoice.check'):t('staffVoice.send')}
      </Button>}
    </div>
    {preview&&<audio data-voice-preview controls src={preview} className="w-full min-w-0" preload="metadata"/>}
    {audio&&<p className="text-xs leading-relaxed text-muted-foreground">{t('staffVoice.retained')}</p>}
  </section>;
}

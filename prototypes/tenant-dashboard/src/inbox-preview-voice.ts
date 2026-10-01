/** A silent local WAV, never microphone capture. Used only by the preview build. */
export function silentWav(){const bytes=new Uint8Array(16044),view=new DataView(bytes.buffer);const ascii=(at:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};ascii(0,'RIFF');view.setUint32(4,16036,true);ascii(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,16000,true);return bytes;}
class SyntheticRecorder {
  state='inactive';ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([silentWav()],{type:'audio/wav'})});this.onstop?.();}
}
export const voiceRecording={capture:async()=>({getTracks:()=>[{stop(){}}]}) as unknown as MediaStream,supports:(mime:string)=>mime==='audio/wav',create:()=>new SyntheticRecorder() as unknown as MediaRecorder};

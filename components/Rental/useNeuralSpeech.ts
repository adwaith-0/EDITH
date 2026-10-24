'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {API_BASE_URL as API} from '@/services/apiBase';
export function useNeuralSpeech(){
  const audioRef=useRef<HTMLAudioElement>(null),request=useRef<AbortController|null>(null),objectUrl=useRef('');
  const [loading,setLoading]=useState(false),[url,setUrl]=useState(''),[notice,setNotice]=useState('');
  const stop=useCallback(()=>{request.current?.abort();request.current=null;audioRef.current?.pause();setLoading(false);},[]);
  const clear=useCallback(()=>{stop();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current='';setUrl('');setNotice('');},[stop]);
  const play=useCallback(async(text:string)=>{
    stop();setNotice('');setLoading(true);const controller=new AbortController();request.current=controller;
    try{
      const token=localStorage.getItem('userToken');
      const response=await fetch(`${API}/api/concierge/speech`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({text:text.slice(0,900)})});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Voice unavailable. Retry Listen to reply.');}
      const blob=await response.blob();if(controller.signal.aborted)return;
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=URL.createObjectURL(blob);setUrl(objectUrl.current);
      if(audioRef.current){audioRef.current.src=objectUrl.current;audioRef.current.playbackRate=1;await audioRef.current.play().catch(()=>setNotice('Your reply is ready. Press play to listen.'));}
    }catch(e){if(!controller.signal.aborted)setNotice((e as Error).message);}
    finally{if(request.current===controller){request.current=null;setLoading(false);}}
  },[stop]);
  useEffect(()=>()=>{request.current?.abort();audioRef.current?.pause();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  return {audioRef,loading,url,notice,play,stop,clear};
}

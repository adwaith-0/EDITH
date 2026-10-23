'use client';
import {useEffect,useRef,useState} from 'react';
type Result={isFinal:boolean;0:{transcript:string}};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:{length:number;[key:number]:Result}})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;onstart:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type RecognitionConstructor=new()=>Recognition;
type VoiceWindow=Window&{SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
export function useVoiceInput({onTranscript,onFinal,onError}:{onTranscript:(text:string)=>void;onFinal:(text:string)=>void;onError:(message:string)=>void}){
  const [supported,setSupported]=useState(false),[listening,setListening]=useState(false);
  const active=useRef<Recognition|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),callbacks=useRef({onTranscript,onFinal,onError});callbacks.current={onTranscript,onFinal,onError};
  useEffect(()=>{const w=window as VoiceWindow;setSupported(!!(w.SpeechRecognition||w.webkitSpeechRecognition)&&window.isSecureContext);return()=>{if(timer.current)clearTimeout(timer.current);if(active.current){active.current.onend=null;active.current.onresult=null;active.current.onerror=null;active.current.onstart=null;active.current.abort();active.current=null;}};},[]);
  function start(language:string){
    if(active.current)return;
    const w=window as VoiceWindow,Constructor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Constructor){callbacks.current.onError('Voice recognition is unavailable in this browser. Try Chrome or Edge, or type your request.');return;}
    window.speechSynthesis?.cancel();
    const recognition=new Constructor();let finalText='',failed=false,ended=false;
    active.current=recognition;recognition.lang=language;recognition.continuous=false;recognition.interimResults=true;
    recognition.onstart=()=>setListening(true);
    recognition.onresult=event=>{let final='',interim='';for(let i=0;i<event.results.length;i++){const r=event.results[i];if(r.isFinal)final+=r[0].transcript+' ';else interim+=r[0].transcript+' ';}finalText=final.trim();callbacks.current.onTranscript((final+interim).trim().slice(0,1500));};
    recognition.onerror=event=>{failed=true;const errors:Record<string,string>={'not-allowed':'Microphone permission was denied. Allow it in your browser settings, or type your request.','service-not-allowed':'This browser cannot use its speech service. Try Chrome or Edge, or type your request.','audio-capture':'No usable microphone was found. Connect a microphone or type your request.','network':'The browser speech service could not connect. Retry in Chrome or Edge, or type your request.','no-speech':'No speech was detected. Try again or type your request.','language-not-supported':'The speech service does not support that language. Try English or type your request.'};if(event.error!=='aborted')callbacks.current.onError(errors[event.error]||'Voice recognition stopped. You can edit the transcript or type your request.');};
    recognition.onend=()=>{if(ended)return;ended=true;if(timer.current)clearTimeout(timer.current);timer.current=null;active.current=null;setListening(false);if(!failed&&finalText)callbacks.current.onFinal(finalText.slice(0,1500));};
    try{recognition.start();timer.current=setTimeout(()=>recognition.stop(),30000);}catch{active.current=null;setListening(false);callbacks.current.onError('Microphone could not start. Check browser permissions or type your request.');}
  }
  return {supported,listening,start,stop:()=>active.current?.stop()};
}

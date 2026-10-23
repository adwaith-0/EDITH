const path=require('node:path');
const fs=require('node:fs');
const {fail}=require('./rentalShared');
let modelPromise,ready=false,working=false,lastError=null;
const MODEL='onnx-community/Kokoro-82M-v1.0-ONNX';
function status(){return {engine:'Kokoro neural voice',voice:'af_heart',language:'English',ready,loading:!!modelPromise&&!ready,working,error:lastError};}
async function prepare(){
  if(!modelPromise){
    modelPromise=(async()=>{
      const {env,StyleTextToSpeech2Model,AutoTokenizer}=require('@huggingface/transformers');
      const {KokoroTTS}=require('kokoro-js');
      env.cacheDir=path.resolve(__dirname,'../../.local/kokoro');fs.mkdirSync(env.cacheDir,{recursive:true});
      const [model,tokenizer]=await Promise.all([
        StyleTextToSpeech2Model.from_pretrained(MODEL,{dtype:'q8',device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}}),
        AutoTokenizer.from_pretrained(MODEL),
      ]);
      ready=true;lastError=null;return new KokoroTTS(model,tokenizer);
    })().catch(error=>{modelPromise=null;ready=false;lastError='Neural voice is temporarily unavailable. Retry playback.';throw error;});
  }
  return modelPromise;
}
function spokenText(value){
  if(typeof value!=='string'||!value.trim()||value.length>900)fail('Voice text must contain 1–900 characters.',400,'INVALID_SPEECH_TEXT');
  return value.replace(/https?:\/\/\S+/g,'').replace(/₹\s*([\d,.]+)/g,'$1 rupees').replace(/\bCCS2\b/g,'C C S two').replace(/\bEV\b/g,'E V').replace(/\bIST\b/g,'India time').replace(/[·•]/g,',').replace(/[*#_]/g,'').trim();
}
async function speak(value){
  const input=spokenText(value);
  if(working)fail('The neural voice is finishing another reply. Retry playback in a moment.',429,'VOICE_BUSY');
  working=true;
  try{
    const tts=await prepare();
    // Generate sentence by sentence to avoid tokenizer truncation of long replies.
    const sentences=input.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks=sentences.flatMap(sentence=>sentence.match(/.{1,260}(?:\s|$)|\S{1,260}/g)||[]),waveforms=[];
    for(const chunk of chunks){const audio=await tts.generate(chunk.trim(),{voice:'af_heart',speed:1});waveforms.push(audio.audio);}
    const samples=waveforms.reduce((n,a)=>n+a.length,0),wav=Buffer.alloc(44+samples*2);
    wav.write('RIFF');wav.writeUInt32LE(36+samples*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
    let peak=0;for(const audio of waveforms)for(const sample of audio)peak=Math.max(peak,Math.abs(sample));
    const gain=peak?Math.min(3,0.9/peak):1;
    let i=44;for(const audio of waveforms)for(const sample of audio){wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample*gain))*32767),i);i+=2;}
    return wav;
  }catch(error){if(error.code==='VOICE_BUSY')throw error;fail('Neural voice could not generate this reply. Retry playback; your booking is unchanged.',503,'VOICE_UNAVAILABLE');}
  finally{working=false;}
}
module.exports={prepare,speak,status,spokenText};

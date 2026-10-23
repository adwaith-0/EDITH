const fs=require('node:fs'),path=require('node:path');
const voice=require('../server/services/neuralVoice');
(async()=>{
  console.log('Preparing local Kokoro neural voice (one-time model download).');
  await voice.prepare();
  const audio=await voice.speak('Your demo slot is booked for your Tata Nexon E V. The total is one hundred and twenty rupees. This is a demo reservation only. No money was collected.');
  const target=path.resolve(__dirname,'../test-results/edith-neural-voice.wav');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,audio);
  console.log(JSON.stringify({engine:voice.status().engine,file:target,bytes:audio.length,seconds:(audio.length-44)/48000}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});

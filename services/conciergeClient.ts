import {rentalFetch} from './rentalClient';
import {ConciergeResults,ConciergeRecovery,AgentResponse,DemoVehiclePreset} from '@/types/concierge';
const post=(body:unknown)=>({method:'POST',body:JSON.stringify(body)});
export const conciergeClient={
  vehicles:()=>rentalFetch<{vehicles:DemoVehiclePreset[];demoEnabled:boolean;defaults:{area:string;durationMinutes:number;budgetRupees:number}}>('/concierge/vehicles'),
  agentTurn:(body:unknown)=>rentalFetch<AgentResponse>('/concierge/agent/turn',post(body)),
  agentRecovery:(id:string)=>rentalFetch<AgentResponse>(`/concierge/agent/recovery/${encodeURIComponent(id)}`),
  status:()=>rentalFetch<{configured:boolean;provider:string;model:string}>('/concierge/status'),
  understand:(message:string)=>rentalFetch<{provider:string;model:string;needs:{origin:string|null;destination:string|null;batteryPercent:number|null;budgetRupees:number|null};questions:string[];notice:string}>('/concierge/understand',post({message})),
  search:(needs:unknown)=>rentalFetch<ConciergeResults>('/concierge/search',post(needs)),
  recovery:(id:string)=>rentalFetch<ConciergeRecovery>(`/concierge/recovery/${encodeURIComponent(id)}`),
};

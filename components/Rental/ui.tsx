'use client';
import { useEffect, useRef } from 'react';
import { RentalListing, RentalStatus } from '@/types/rental';

const paths: Record<string,string> = {
  mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
  bolt:'m13 2-9 12h7l-1 8 10-12h-7l1-8Z',
  plug:'M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v4',
  search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  arrow:'M4 12h16m-6-6 6 6-6 6',
  route:'M7 4h10a4 4 0 0 1 0 8H7a4 4 0 0 0 0 8h10M7 1v6m10 10v6',
  calendar:'M7 2v4m10-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 10h3m4 0h3m-10 3h3',
  grid:'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  car:'m5 7 2-4h10l2 4M3 7h18v12H3V7Zm3 5h2m8 0h2M5 19v3m14-3v3',
  check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',
  plus:'M12 4v16M4 12h16', external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  leaf:'M20 3S3 1 3 13a7 7 0 0 0 14 0c0-3 3-10 3-10ZM5 20 16 9',
  shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Zm-4 10 3 3 5-6',
  home:'m2 10 10-8 10 8M4 9v13h16V9M9 22v-8h6v8',
  refresh:'M20 7a9 9 0 1 0 1 10M20 2v6h-6',
  wallet:'M21 7H3V3h15v4M3 7v14h18V7Zm13 6h5v4h-5v-4',
};
export function Icon({name, size=20, ...props}: {name:string;size?:number;className?:string}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.bolt}/></svg>; }
export function Modal({title,onClose,children,wide=false}: {title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  const dialog = useRef<HTMLDivElement>(null);const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(() => { const previous=document.activeElement as HTMLElement; const old=document.body.style.overflow; document.body.style.overflow='hidden'; dialog.current?.focus(); const key=(e:KeyboardEvent)=>{const openDialogs=document.querySelectorAll('[role="dialog"]');if(openDialogs[openDialogs.length-1]!==dialog.current)return;if(e.key==='Escape')closeRef.current(); if(e.key==='Tab'&&dialog.current){const items=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]'));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);previous?.focus();}; },[]);
  return <div className="ed-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`ed-modal ${wide?'ed-modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialog}><div className="ed-modal-heading"><h2>{title}</h2><button className="ed-icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{children}</div></div>;
}
export const money = (paise:number=0) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:paise%100?2:0}).format(paise/100);
export const dateTime = (value:string) => new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
export const dateOnly = (value:string) => new Date(value).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'});
export const toInput = (value:string|Date) => new Date(new Date(value).getTime()+330*60000).toISOString().slice(0,16);
export const fromInput = (value:string) => new Date(`${value}:00+05:30`).toISOString();
export const tomorrowStart = () => {const d=new Date(Date.now()+86400000);return `${toInput(d).slice(0,10)}T10:00`;};
export function Status({status}: {status:RentalStatus|string}) {return <span className={`ed-status ed-status-${status.toLowerCase()}`}><span/>{({REQUESTED:'Awaiting host',CONFIRMED:'Confirmed',IN_PROGRESS:'In progress',COMPLETED:'Completed',DECLINED:'Declined',CANCELLED:'Cancelled',EXPIRED:'Expired'} as Record<string,string>)[status]||status}</span>;}
export function ErrorBox({message}: {message:string}) {return message ? <div className="ed-error" role="alert">{message}</div>:null;}
export function Empty({title,text,action}: {title:string;text:string;action?:React.ReactNode}) {return <div className="ed-empty"><div className="ed-empty-icon"><Icon name="plug" size={28}/></div><h3>{title}</h3><p>{text}</p>{action}</div>;}
export function ChargerArt({listing,index=0}: {listing?:RentalListing;index?:number}) {return <div className={`ed-charger-art ed-art-${index%3}`}>
  {listing?.imageUrl ? <img src={listing.imageUrl} alt={`${listing.name} — host provided photo`} onError={e=>{e.currentTarget.style.display='none';}}/> : null}
  <svg viewBox="0 0 400 220" role="img" aria-label="Illustration of a private EV charging space"><path d="M0 170h400v50H0z" fill="currentColor" opacity=".07"/><path d="m237 75 75-48 75 48v97H237Z" fill="currentColor" opacity=".08"/><path d="m222 78 90-58 90 58" fill="none" stroke="currentColor" opacity=".15" strokeWidth="5"/><path d="M30 174c0-27 11-43 25-43s26 16 26 43m-42-14c-17-27-14-50-2-53s28 17 29 44" fill="currentColor" opacity=".12"/><rect x="110" y="35" width="66" height="143" rx="17" fill="#263d35"/><rect x="117" y="42" width="52" height="90" rx="11" fill="#f1f6ef"/><rect x="126" y="53" width="34" height="31" rx="5" fill="#d2e7b5"/><path d="m145 57-10 13h8l-2 9 11-14h-8z" fill="#334d3c"/><rect x="129" y="98" width="28" height="4" rx="2" fill="#bdd0be"/><rect x="134" y="109" width="18" height="4" rx="2" fill="#d7e1d5"/><circle cx="143" cy="151" r="6" fill="#c2e991"/><path d="M177 70h9a8 8 0 0 1 8 8v58c0 34 33 34 33 8v-30" fill="none" stroke="#263d35" strokeWidth="7"/><rect x="219" y="94" width="16" height="28" rx="5" fill="#263d35"/><path d="M225 94v-7m5 7v-7" stroke="#263d35" strokeWidth="3"/><ellipse cx="144" cy="183" rx="57" ry="7" fill="#263d35" opacity=".1"/><path d="m274 169 7-47h57l12 47m-83-18h91v31h-91Z" fill="#f5f6ee" stroke="currentColor" opacity=".5"/><path d="M284 151h53l-6-23h-43Z" fill="currentColor" opacity=".15"/><circle cx="283" cy="181" r="9" fill="#40564a"/><circle cx="341" cy="181" r="9" fill="#40564a"/></svg>
  <span className="ed-art-caption">{listing?.imageUrl?'Host photo':'Listing illustration'}</span></div>;}

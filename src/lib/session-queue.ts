import type { Rating } from './types';

export function retryGap(rating: Rating): number|null {
  if(rating==='again')return 5;
  if(rating==='hard')return 15;
  return null;
}

export function pickQueueIndex<T extends {id:string}>(queue:T[],position:number,retryAt:Map<string,number>):number {
  return queue.findIndex(item=>(retryAt.get(item.id)??0)<=position);
}

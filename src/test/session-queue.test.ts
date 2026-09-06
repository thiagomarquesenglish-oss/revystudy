import { describe,expect,it } from 'vitest';
import { pickQueueIndex,retryGap } from '@/lib/session-queue';

describe('position based study queue',()=>{
  it('places mistakes five exercises later and difficult answers fifteen later',()=>{
    expect(retryGap('again')).toBe(5);
    expect(retryGap('hard')).toBe(15);
    expect(retryGap('good')).toBeNull();
    expect(retryGap('easy')).toBeNull();
  });

  it('does not immediately repeat a blocked card',()=>{
    const queue=[{id:'failed'},{id:'next'}];
    const retryAt=new Map([['failed',6]]);
    expect(pickQueueIndex(queue,1,retryAt)).toBe(1);
    expect(pickQueueIndex([{id:'failed'}],1,retryAt)).toBe(-1);
    expect(pickQueueIndex([{id:'failed'}],6,retryAt)).toBe(0);
  });
});

import { SlidingWindowLimiter } from './sliding-window.limiter';

describe('SlidingWindowLimiter', () => {
  it('allows up to the max then blocks within the window', () => {
    const limiter = new SlidingWindowLimiter(2, 1_000);

    expect(limiter.tryConsume('a', 0)).toBe(true);
    expect(limiter.tryConsume('a', 100)).toBe(true);
    expect(limiter.tryConsume('a', 200)).toBe(false);
  });

  it('frees capacity once hits age out of the window', () => {
    const limiter = new SlidingWindowLimiter(1, 1_000);

    expect(limiter.tryConsume('a', 0)).toBe(true);
    expect(limiter.tryConsume('a', 999)).toBe(false);
    expect(limiter.tryConsume('a', 1_001)).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new SlidingWindowLimiter(1, 1_000);

    expect(limiter.tryConsume('a', 0)).toBe(true);
    expect(limiter.tryConsume('b', 0)).toBe(true);
    expect(limiter.tryConsume('a', 1)).toBe(false);
  });
});

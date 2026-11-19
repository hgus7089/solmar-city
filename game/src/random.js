// A small seeded random number generator (xorshift32 with a string-free integer seed):
// the same seed gives the same city, traffic and missions, which is what makes the
// screenshot scenes repeatable. Written from the xorshift recipe, not copied.

export function createRandom(seed) {
  let state = (seed | 0) || 0x9e3779b9;
  if (state === 0) state = 0x2545f491;
  function next() {
    state ^= (state << 13) | 0;
    state ^= state >>> 17;
    state ^= (state << 5) | 0;
    return ((state >>> 0) / 4294967296);
  }
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One item from an array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}

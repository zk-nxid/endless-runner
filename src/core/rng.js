export class SeededRng {
  constructor(seed = 123456789) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(minInclusive, maxInclusive) {
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.next() * span);
  }
}

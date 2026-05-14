const STORAGE_KEY = "endless_runner_leaderboard";

export class LeaderboardAdapter {
  async submit(entry) {
    const current = this.#read();
    current.push(entry);
    current.sort((a, b) => b.score - a.score);
    const top = current.slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(top));
    return top;
  }

  async getTop() {
    return this.#read();
  }

  #read() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
}

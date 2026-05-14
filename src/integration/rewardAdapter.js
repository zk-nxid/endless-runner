export class RewardAdapter {
  evaluate(score) {
    if (score >= 2500) return { reward: "LegendDrop", granted: true };
    if (score >= 1000) return { reward: "EpicDrop", granted: true };
    if (score >= 500) return { reward: "RareDrop", granted: true };
    return { reward: null, granted: false };
  }
}

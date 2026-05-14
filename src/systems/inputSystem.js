export class InputSystem {
  constructor(canvas, onUserPointer) {
    this.commandQueue = [];
    this.lastTouch = null;

    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        this.enqueue("laneLeft");
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        this.enqueue("laneRight");
      }
      if (event.key === "ArrowUp" || event.key === " " || event.key.toLowerCase() === "w") {
        this.enqueue("jump");
      }
    });

    canvas.addEventListener(
      "pointerdown",
      (event) => {
        onUserPointer?.();
        this.lastTouch = { x: event.clientX, y: event.clientY };
      },
      { passive: true }
    );

    canvas.addEventListener("pointerup", (event) => {
      if (!this.lastTouch) return;
      const dx = event.clientX - this.lastTouch.x;
      const dy = event.clientY - this.lastTouch.y;
      const deadzone = 24;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > deadzone) {
        this.enqueue(dx < 0 ? "laneLeft" : "laneRight");
      } else if (Math.abs(dy) > deadzone && dy < 0) {
        this.enqueue("jump");
      }
      this.lastTouch = null;
    });
  }

  enqueue(command) {
    this.commandQueue.push(command);
  }

  consume() {
    const copy = this.commandQueue;
    this.commandQueue = [];
    return copy;
  }
}

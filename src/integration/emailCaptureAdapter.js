export class EmailCaptureAdapter {
  async capture(email, metadata) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      ok: true,
      email,
      metadata,
      capturedAt: Date.now(),
    };
  }
}

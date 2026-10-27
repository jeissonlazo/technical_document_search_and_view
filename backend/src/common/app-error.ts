export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly retryable: boolean = false,
    public readonly params?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const cancellationController = new AbortController();
let cancellationInitialized = false;
let forcedExitTimer: NodeJS.Timeout | undefined;

function configuredTimeoutMs(): number {
  const raw = process.env["ARENA_REQUEST_TIMEOUT_MS"];
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.floor(parsed);
}

export function initCancellationHandling(): void {
  if (cancellationInitialized) return;
  cancellationInitialized = true;

  process.on("SIGINT", () => {
    if (cancellationController.signal.aborted) {
      process.exit(130);
      return;
    }

    process.exitCode = 130;
    cancellationController.abort(new Error("Operation cancelled by user"));
    forcedExitTimer = setTimeout(() => process.exit(130), 500);
    forcedExitTimer.unref();
  });
}

export function cancellationSignal(): AbortSignal {
  return cancellationController.signal;
}

export function withRequestSignal(
  inputSignal?: AbortSignal,
  timeoutMs = configuredTimeoutMs(),
): AbortSignal {
  const signals: AbortSignal[] = [cancellationSignal()];
  if (inputSignal) signals.push(inputSignal);
  if (timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
  return AbortSignal.any(signals);
}

function timeoutError(timeoutMs: number): Error {
  return new Error(`Request timed out after ${timeoutMs}ms`);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = configuredTimeoutMs(),
): Promise<Response> {
  const timeoutSignal =
    timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signal = AbortSignal.any(
    [cancellationSignal(), init?.signal, timeoutSignal].filter(
      (candidate): candidate is AbortSignal => Boolean(candidate),
    ),
  );

  try {
    return await fetch(input, { ...init, signal });
  } catch (err: unknown) {
    if (!signal.aborted) throw err;
    if (timeoutSignal?.aborted) {
      throw timeoutError(timeoutMs);
    }
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    throw new Error("Operation cancelled by user");
  }
}

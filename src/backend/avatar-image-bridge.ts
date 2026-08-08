type AvatarImagePayload = {
  data: string;
  mimeType: string;
};

type PendingAvatarImage = {
  resolve(value: AvatarImagePayload): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
};

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const pending = new Map<string, PendingAvatarImage>();
const MAX_BASE64_LENGTH = 12_000_000;

function finish(requestId: string): PendingAvatarImage | null {
  const entry = pending.get(requestId);
  if (!entry) return null;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  if (entry.signal && entry.abort) entry.signal.removeEventListener("abort", entry.abort);
  return entry;
}

export async function requestAvatarImage(
  imageId: string,
  chatId: string,
  userId?: string,
  signal?: AbortSignal,
  timeoutMs = 8_000
): Promise<AvatarImagePayload> {
  const image = await spindle.images.get(imageId, { specificity: "lg", userId });
  if (!image?.url) throw new Error("Character avatar image is unavailable.");
  if (signal?.aborted) throw new DOMException("Avatar request aborted.", "AbortError");

  const requestId = crypto.randomUUID();
  const response = new Promise<AvatarImagePayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = finish(requestId);
      entry?.reject(new Error("Timed out waiting for the character avatar."));
    }, timeoutMs);
    const entry: PendingAvatarImage = { resolve, reject, timer, signal };
    if (signal) {
      entry.abort = () => {
        const current = finish(requestId);
        current?.reject(new DOMException("Avatar request aborted.", "AbortError"));
      };
      signal.addEventListener("abort", entry.abort, { once: true });
    }
    pending.set(requestId, entry);
  });

  spindle.sendToFrontend({
    type: "avatar_image_request",
    chatId,
    requestId,
    imageUrl: image.url
  }, userId);
  return response;
}

export function acceptAvatarImageResponse(message: Record<string, unknown>): boolean {
  if (message.type !== "avatar_image_response") return false;
  const requestId = String(message.requestId || "");
  const entry = finish(requestId);
  if (!entry) return true;
  const error = String(message.error || "").trim();
  if (error) {
    entry.reject(new Error(error));
    return true;
  }
  const data = String(message.data || "").trim();
  const mimeType = String(message.mimeType || "").trim().toLowerCase();
  if (!data || data.length > MAX_BASE64_LENGTH || !/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType)) {
    entry.reject(new Error("The frontend returned an invalid avatar image."));
    return true;
  }
  entry.resolve({ data, mimeType });
  return true;
}

export function pendingAvatarImageRequests(): number {
  return pending.size;
}

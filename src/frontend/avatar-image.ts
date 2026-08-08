const MAX_AVATAR_BYTES = 8_000_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function respondToAvatarImageRequest(
  message: Record<string, unknown>,
  sendToBackend: (payload: unknown) => void,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const requestId = String(message.requestId || "");
  const imageUrl = String(message.imageUrl || "");
  const chatId = String(message.chatId || "");
  const respond = (payload: Record<string, unknown>): void => sendToBackend({
    type: "avatar_image_response",
    requestId,
    chatId,
    ...payload
  });
  if (!requestId || !/^\/api\/v1\/images\//.test(imageUrl)) {
    respond({ error: "Invalid avatar image request." });
    return;
  }
  try {
    const response = await fetchFn(imageUrl, { credentials: "include", headers: { Accept: "image/*" } });
    if (!response.ok) throw new Error(`Avatar fetch failed (${response.status}).`);
    const blob = await response.blob();
    const mimeType = String(blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType)) throw new Error("Avatar response was not a supported image.");
    if (blob.size <= 0 || blob.size > MAX_AVATAR_BYTES) throw new Error("Avatar image is empty or too large.");
    const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    respond({ data, mimeType });
  } catch (error) {
    respond({ error: error instanceof Error ? error.message.slice(0, 300) : "Avatar fetch failed." });
  }
}

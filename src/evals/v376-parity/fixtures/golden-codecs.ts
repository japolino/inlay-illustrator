/**
 * Golden Codec Vectors for V3.7.6 Parity Testing.
 *
 * Covers all four source encoding modes:
 * - Plaintext (toggle_Card.Encode = 0)
 * - Placeholder (toggle_Card.Encode = 1)
 * - Base64 (toggle_Card.Encode = 2)
 * - Atbash (toggle_Card.Encode = 3)
 *
 * Traced to trigger_runtime.lua:
 * - Base64 lines 16-77
 * - Atbash lines 178-213
 * - Placeholder lines 215-240
 * - Codec dispatch lines 242-260
 */

import type { GoldenCodecVector } from "../types.js";

export const GOLDEN_CODEC_VECTORS: readonly GoldenCodecVector[] = Object.freeze([
  {
    id: "codec-placeholder-anatomy",
    name: "Placeholder Decoding - Body Parts & Scene Tokens",
    encodingMode: "placeholder",
    originalText: "1girl, solo, BP1, BP2, BP3, BP4, BP5, BP6, BP7, BP8, BP9, BP10, SE1",
    encodedText: "1girl, solo, BP1, BP2, BP3, BP4, BP5, BP6, BP7, BP8, BP9, BP10, SE1",
    decodedText: "1girl, solo, nipples, areola, pussy, penis, anus, testicles, clitoris, pubic hair, urethra, foreskin, nsfw",
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "215-240",
      description: "Replaces BP1-BP10 and SE1 placeholder tokens with explicit anatomical terms",
    },
  },
  {
    id: "codec-atbash-latin-text",
    name: "Atbash Cipher - Symmetric Latin Character Inversion",
    encodingMode: "atbash",
    originalText: "The Quick Brown Fox Jumps Over 13 Lazy Dogs!",
    encodedText: "Gsv Jfrxp Yildm Ulc Qfnkh Levi 13 Ozab Wlth!",
    decodedText: "The Quick Brown Fox Jumps Over 13 Lazy Dogs!",
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "178-213",
      description: "Symmetric character substitution: A<->Z, a<->z, preserving punctuation and non-alpha",
    },
  },
  {
    id: "codec-base64-payload-block",
    name: "Base64 Encoding - Standard Transport Packaging",
    encodingMode: "base64",
    originalText: '{"scenes":[{"place":"greenhouse","shots":[]}]}',
    encodedText: "eyJzY2VuZXMiOlt7InBsYWNlIjoiZ3JlZW5ob3VzZSIsInNob3RzIjpbXX1dfQ==",
    decodedText: '{"scenes":[{"place":"greenhouse","shots":[]}]}',
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "16-77",
      description: "Standard RFC 4648 Base64 encoding/decoding for LLM prompt hiding",
    },
  },
]);

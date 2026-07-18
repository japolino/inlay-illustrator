import type { Config, PerspectiveMode } from "../shared/config.js";
import type { CameraJson, ParsedPayload, ShotJson } from "./types.js";
import { asRecord, cleanString } from "./utils.js";

export const CAMERA_FRAMING_VALUES = [
  "portrait", "close-up", "medium close-up", "upper body", "medium shot", "cowboy shot", "feet out of frame",
  "full body", "wide shot", "lower body", "head out of frame", "eyes out of frame", "body-part focus"
] as const;
export const CAMERA_ANGLE_VALUES = ["eye level", "low angle", "high angle", "dutch angle"] as const;
export const CAMERA_PERSPECTIVE_VALUES = [
  "straight-on", "from above", "from behind", "from below", "from side", "sideways", "three-quarter view", "pov"
] as const;
export const CAMERA_FOCUS_VALUES = [
  "shallow depth of field", "deep focus", "background blur", "foreground blur", "motion blur", "fisheye",
  "wide-angle lens", "telephoto lens"
] as const;

const CAMERA_FRAMING = new Set<string>(CAMERA_FRAMING_VALUES);
const CAMERA_ANGLE = new Set<string>(CAMERA_ANGLE_VALUES);
const CAMERA_PERSPECTIVE = new Set<string>(CAMERA_PERSPECTIVE_VALUES);
const CAMERA_FOCUS = new Set<string>(CAMERA_FOCUS_VALUES);

type OrderedShot = {
  shot: ShotJson;
  paragraph: number;
  index: number;
};

export type CameraCollision = {
  signature: string;
  firstIndex: number;
  duplicateIndex: number;
  firstParagraph: number;
  duplicateParagraph: number;
};

export type CameraPairRepetition = {
  signature: string;
  indexes: number[];
  paragraphs: number[];
};

export type CameraDiversityAudit = {
  dynamicShotCount: number;
  signatures: Array<{ index: number; paragraph: number; signature: string }>;
  exactCollisions: CameraCollision[];
  pairRepetitions: CameraPairRepetition[];
};

function orderedShots(payload: ParsedPayload): OrderedShot[] {
  const output: OrderedShot[] = [];
  for (const scene of Array.isArray(payload.scenes) ? payload.scenes : []) {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    for (const shot of shots) {
      const paragraph = Number(shot.paragraph ?? scene.paragraph);
      output.push({ shot, paragraph: Number.isFinite(paragraph) ? paragraph : 0, index: output.length });
    }
  }
  return output;
}

function effectivePerspective(shot: ShotJson, config: Config): PerspectiveMode {
  if (!config.adaptiveMode) return config.perspectiveMode;
  const requested = cleanString(shot.perspectiveMode).toLowerCase();
  return requested === "creative" || requested === "static" || requested === "dynamic" ? requested : "dynamic";
}

function normalizedCamera(camera: unknown): { framing: string; angle: string; perspective: string } {
  const record = asRecord(camera);
  return {
    framing: cleanString(record.framing).toLowerCase(),
    angle: cleanString(record.angle).toLowerCase(),
    perspective: cleanString(record.perspective).toLowerCase()
  };
}

function fullSignature(camera: ReturnType<typeof normalizedCamera>): string {
  return [camera.framing, camera.angle, camera.perspective].join(" | ");
}

function pairSignature(camera: ReturnType<typeof normalizedCamera>): string {
  return camera.angle && camera.perspective ? `${camera.angle} | ${camera.perspective}` : "";
}

export function auditDynamicCameraDiversity(payload: ParsedPayload, config: Config): CameraDiversityAudit {
  if (config.promptStyle !== "anima") {
    return { dynamicShotCount: 0, signatures: [], exactCollisions: [], pairRepetitions: [] };
  }
  const dynamic = orderedShots(payload).filter(({ shot }) => effectivePerspective(shot, config) === "dynamic");
  const signatures: CameraDiversityAudit["signatures"] = [];
  const exactCollisions: CameraCollision[] = [];
  const seenFull = new Map<string, OrderedShot>();
  const seenPairs = new Map<string, OrderedShot[]>();

  for (const entry of dynamic) {
    const camera = normalizedCamera(entry.shot.camera);
    const signature = fullSignature(camera);
    const populated = [camera.framing, camera.angle, camera.perspective].filter(Boolean).length;
    signatures.push({ index: entry.index, paragraph: entry.paragraph, signature });
    if (populated >= 2) {
      const first = seenFull.get(signature);
      if (first) {
        exactCollisions.push({
          signature,
          firstIndex: first.index,
          duplicateIndex: entry.index,
          firstParagraph: first.paragraph,
          duplicateParagraph: entry.paragraph
        });
      } else {
        seenFull.set(signature, entry);
      }
    }
    const pair = pairSignature(camera);
    if (pair) seenPairs.set(pair, [...(seenPairs.get(pair) || []), entry]);
  }

  const pairRepetitions = [...seenPairs.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([signature, entries]) => ({
      signature,
      indexes: entries.map((entry) => entry.index),
      paragraphs: entries.map((entry) => entry.paragraph)
    }));
  return { dynamicShotCount: dynamic.length, signatures, exactCollisions, pairRepetitions };
}

function stringValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(cleanString).map((entry) => entry.toLowerCase()).filter(Boolean);
}

function validCamera(camera: unknown): camera is CameraJson {
  const record = asRecord(camera);
  if (Object.keys(record).some((key) => !["framing", "angle", "perspective", "focus"].includes(key))) return false;
  const framing = stringValues(record.framing);
  const angle = stringValues(record.angle);
  const perspective = stringValues(record.perspective);
  const focus = stringValues(record.focus);
  return framing.length <= 1 && angle.length <= 1 && perspective.length <= 1 && focus.length <= 2
    && framing.every((value) => CAMERA_FRAMING.has(value))
    && angle.every((value) => CAMERA_ANGLE.has(value))
    && perspective.every((value) => CAMERA_PERSPECTIVE.has(value))
    && focus.every((value) => CAMERA_FOCUS.has(value));
}

function clonePayload(payload: ParsedPayload): ParsedPayload {
  return JSON.parse(JSON.stringify(payload)) as ParsedPayload;
}

/** Copies only collided Dynamic camera objects from a structurally matching repair. */
export function mergeDynamicCameraRepair(
  original: ParsedPayload,
  repaired: ParsedPayload,
  config: Config,
  audit = auditDynamicCameraDiversity(original, config)
): ParsedPayload | null {
  if (audit.exactCollisions.length === 0) return original;
  const originalShots = orderedShots(original);
  const repairedShots = orderedShots(repaired);
  if (originalShots.length !== repairedShots.length) return null;
  if (originalShots.some((entry, index) => entry.paragraph !== repairedShots[index]?.paragraph)) return null;

  const replacementIndexes = new Set(audit.exactCollisions.map((collision) => collision.duplicateIndex));
  const replacementCameras = new Map<number, CameraJson>();
  for (const index of replacementIndexes) {
    const candidate = repairedShots[index]?.shot.camera;
    if (!validCamera(candidate)) return null;
    replacementCameras.set(index, candidate);
  }

  const merged = clonePayload(original);
  for (const entry of orderedShots(merged)) {
    const replacement = replacementCameras.get(entry.index);
    if (replacement) entry.shot.camera = replacement;
  }
  return auditDynamicCameraDiversity(merged, config).exactCollisions.length < audit.exactCollisions.length ? merged : null;
}

export function cameraRepairInstruction(audit: CameraDiversityAudit): string {
  const collisions = audit.exactCollisions.map((collision) =>
    `shot ${collision.duplicateIndex + 1} (P${collision.duplicateParagraph}) repeats shot ${collision.firstIndex + 1} (P${collision.firstParagraph}): ${collision.signature}`
  );
  return [
    "Repair only the repeated Dynamic camera objects in this valid illustration JSON. Return one raw JSON object and no other text.",
    "Keep scene order, shot order, paragraph references, perspectiveMode, characters, composition, action, environment, and every non-camera value unchanged.",
    "For each listed later duplicate, choose a source-faithful camera that contains its complete focal action and avoids the repeated framing + angle + perspective tuple.",
    "Do not force an extreme or unsuitable angle merely for variety. Sharing one camera value is allowed. Sharing angle + perspective is allowed when framing genuinely differs.",
    "If the numbered source explicitly establishes a continuous camera or POV, preserve that camera instead of manufacturing variation.",
    `framing: ${CAMERA_FRAMING_VALUES.join(", ")}`,
    `angle: ${CAMERA_ANGLE_VALUES.join(", ")}`,
    `perspective: ${CAMERA_PERSPECTIVE_VALUES.join(", ")}`,
    `focus (maximum two): ${CAMERA_FOCUS_VALUES.join(", ")}`,
    `Repeated Dynamic cameras:\n- ${collisions.join("\n- ")}`
  ].join("\n");
}

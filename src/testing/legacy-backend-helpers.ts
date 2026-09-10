/** Retired ANIMA test fixtures. Not imported by the production backend. */
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { prepareAndDispatchImageJobs, rerollImageParameters } from "../backend/images.js";
import { stripInlayContent, stripInlayFromMessages } from "../backend/inlay-content.js";
import {
  continuityReference, formatTargetParagraphs, parserInstruction, parserMessages,
  parserUserRequest, preprocessTargetParagraphs, preprocessingInstruction,
  preprocessingUserRequest, validatePreprocessedTarget
} from "../backend/parser.js";
import { activePromptPreset, assemblePrompt, renderPrompt } from "../backend/prompt.js";
import { exactVisualKey, selectPromptEntries } from "../backend/scenes.js";

export const __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
  continuityReference,
  exactVisualKey,
  formatTargetParagraphs,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction,
  preprocessingUserRequest,
  prepareAndDispatchImageJobs,
  rerollImageParameters,
  normalizeConfig,
  renderPrompt,
  selectPromptEntries,
  stripInlayContent,
  stripInlayFromMessages,
  validatePreprocessedTarget
};

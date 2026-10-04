/** Shared hook giving every workspace component the stores and derived data it needs. */
import { useMemo } from "preact/hooks";
import { useApp, useAppState, type AppController } from "../../state/app-state.js";
import type { WorkspaceSnapshot } from "../../../shared/contract/rpc.js";
import { useSourceUi, useWorkspaceUiStore, type SourceUi, type WorkspaceUiStore } from "../workspace-ui.js";
import { draftStoreFor, type FormDraftStore } from "./drafts.js";
import { providerInfo, type ProviderInfo } from "./model.js";
import { sessionStoreFor, useSourceSession, type SourceSession, type WorkspaceSessionStore } from "./session.js";

export interface WorkspaceCtx {
  app: AppController;
  characterId: string | null;
  workspace: WorkspaceSnapshot | null;
  ui: WorkspaceUiStore;
  sourceUi: SourceUi;
  sessions: WorkspaceSessionStore;
  session: SourceSession;
  drafts: FormDraftStore;
  provider: ProviderInfo;
}

export function useWorkspaceCtx(): WorkspaceCtx {
  const app = useApp();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const workspaceRaw = useAppState((s) => s.workspace);
  const workspace = workspaceRaw && workspaceRaw.characterId === characterId ? workspaceRaw : null;
  const config = useAppState((s) => s.config);
  const status = useAppState((s) => s.status);
  const ui = useWorkspaceUiStore();
  const sourceUi = useSourceUi(characterId);
  const sessions = sessionStoreFor(app);
  const session = useSourceSession(sessions, characterId);
  const drafts = draftStoreFor(app);
  const provider = useMemo(() => providerInfo(config, status), [config, status]);
  return { app, characterId, workspace, ui, sourceUi, sessions, session, drafts, provider };
}

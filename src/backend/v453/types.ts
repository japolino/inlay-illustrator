/*! Lightboard 4.5.3 adaptation. Copyright (c) 2026 amonamona. CC BY-NC-SA 4.0. See references/v453/README.md and THIRD_PARTY_NOTICES.md. */
export interface LightboardCharacter {
  name: string;
  positive: string;
  negative?: string;
  description: string;
}

export interface LightboardPanel {
  scene: string;
  characters: LightboardCharacter[];
}

export interface LightboardDescriptor {
  slot?: number;
  camera?: string;
  cast: string;
  scene?: string;
  characters?: LightboardCharacter[];
  panels?: LightboardPanel[];
}

export interface LightboardResponse {
  scenes: LightboardDescriptor[];
  keyvis?: LightboardDescriptor;
}

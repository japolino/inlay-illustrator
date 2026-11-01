export const NOVELAI_SAMPLERS = [
  { value: "k_euler_ancestral", label: "Euler Ancestral" },
  { value: "k_euler", label: "Euler" },
  { value: "k_dpmpp_2m", label: "DPM++ 2M" },
  { value: "k_dpmpp_2m_sde", label: "DPM++ 2M SDE" },
  { value: "k_dpmpp_sde", label: "DPM++ SDE" },
  { value: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
  { value: "ddim_v3", label: "DDIM v3" },
] as const;
export const NOVELAI_NOISE_SCHEDULES = ["karras", "native", "exponential", "polyexponential"] as const;
/** Sampling controls exposed by the selected NovelAI model. V5 fixes the schedule to Karras. */
export function novelAISamplingOptions(model: string) {
  const modern = /^nai-diffusion-(?:4|5)(?:-|$)/u.test(model);
  return {
    samplers: NOVELAI_SAMPLERS.filter((s) => modern ? s.value !== "ddim_v3" : s.value !== "k_dpmpp_2m_sde"),
    noiseSchedules: /^nai-diffusion-5(?:-|$)/u.test(model) ? ["karras"] as const : NOVELAI_NOISE_SCHEDULES,
  };
}

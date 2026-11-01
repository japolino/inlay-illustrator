/**
 * Analysis settings page. Asset Maid 0.9.90 moved the scene direction and image ratio guides into the Maid Atelier
 * ("생성지침"); this page now points there (the old preset editors were retired with that move).
 */
import { useAtelierLauncher } from "../atelier/launcher.js";
import { Button } from "../ui/index.js";
import { ANALYSIS_LABELS as A, PAGE_TITLES } from "./labels.js";
import { SettingsFrame } from "./parts.js";

export function AnalysisProfilePage() {
  const openAtelier = useAtelierLauncher();
  return (
    <SettingsFrame section="analysis-profile" title={PAGE_TITLES["analysis-profile"]} className="gap-8">
      <section class="grid gap-3 rounded-lg bg-surface-workbench p-4" data-guidelines-moved="">
        <h2 class="text-sm font-extrabold">{A.movedTitle}</h2>
        <p class="text-xs leading-relaxed text-muted-foreground">{A.movedDescription}</p>
        {openAtelier ? (
          <div><Button size="sm" onClick={openAtelier} data-open-atelier-guidelines="">{A.openAtelier}</Button></div>
        ) : null}
      </section>
    </SettingsFrame>
  );
}

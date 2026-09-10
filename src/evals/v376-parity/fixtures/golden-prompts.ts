/**
 * Golden Compiled Prompt Expectations for V3.7.6 Parity Verification.
 *
 * Each expectation pairs a frozen fixture with exact compiler configuration
 * and asserts 100% byte-for-byte fidelity with the decompiled Lua pipeline logic.
 */

import type { GoldenPromptExpectation } from "../types.js";

export const GOLDEN_PROMPT_EXPECTATIONS: readonly GoldenPromptExpectation[] = Object.freeze([
  {
    fixtureId: "illustration-single-char",
    options: {
      mode: "illustration",
      separator: "pipe",
      syntax: "nai",
      supplement: true,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  cowboy shot, straight-on, sunlit garden, stone path, blooming flowers, standing amidst colorful blossoms | 1girl, young adult, long blonde hair, blue eyes, gentle smile, white sundress, straw hat, smiling pleasantly, holding a wicker basket, standing gracefully with slight tilt, softly grasping basket handle",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1597-1687, 1689-1850",
      description: "NAI syntax escaping parens, pipe delimiter between setup and character, supplement tags appended",
    },
  },
  {
    fixtureId: "illustration-single-char",
    options: {
      mode: "illustration",
      separator: "newline",
      syntax: "nai",
      supplement: true,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,\n\ncowboy shot, straight-on, sunlit garden, stone path, blooming flowers, standing amidst colorful blossoms,\n\n1girl, young adult, long blonde hair, blue eyes, gentle smile, white sundress, straw hat, smiling pleasantly, holding a wicker basket, standing gracefully with slight tilt, softly grasping basket handle",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1611-1613, 1630-1635",
      description: "Newline separator joins preset and setup with double-newline and comma (',\\n\\n')",
    },
  },
  {
    fixtureId: "illustration-single-char",
    options: {
      mode: "illustration",
      separator: "native",
      syntax: "nai",
      supplement: true,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  cowboy shot, straight-on, sunlit garden, stone path, blooming flowers, standing amidst colorful blossoms",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
      nativeCharacters: [
        {
          name: "Alice",
          prompt: "1girl, young adult, long blonde hair, blue eyes, gentle smile, white sundress, straw hat, smiling pleasantly, holding a wicker basket, standing gracefully with slight tilt, softly grasping basket handle",
        },
      ],
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1720-1760",
      description: "Native NAI V4 separator isolates characters into dedicated nativeChannels",
    },
  },
  {
    fixtureId: "illustration-multi-char",
    options: {
      mode: "illustration",
      separator: "pipe",
      syntax: "comfyui",
      supplement: false,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku (ahemaru)::,1.3::artist:teshima nari::,1.25::artist:noco (adamas)::,  1.2::artist:bekotarou::,  1.2::artist:kat (bu-kunn)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  medium shot, eye level, cozy coffee shop, wooden tables, warm sunlight, enjoying afternoon tea together, Alice on the left, Bob on the right | 1girl, young woman, blonde ponytail, bright blue eyes, beige cardigan, brown skirt, laughing cheerful, sipping hot tea | 1boy, young man, short dark hair, glasses, navy blue sweater, grey trousers, friendly smile, reading an open book",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1645-1655",
      description: "ComfyUI mode converts newlines in preset to commas and keeps unescaped parens",
    },
  },
  {
    fixtureId: "asset-mode-character",
    options: {
      mode: "asset",
      separator: "pipe",
      syntax: "nai",
      supplement: false,
      nsfw: false,
    },
    expected: {
      prompt: "portrait, cowboy shot, white background, simple background, 1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  straight-on, studio background, standing still | 1girl, young adult, silver twin tails, green eyes, futuristic jacket, black shorts, confident smirk, arms crossed, looking at viewer",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1795-1801",
      description: "Asset mode tag injection: white background, portrait, cowboy shot, looking at viewer",
    },
  },
  {
    fixtureId: "comic-mode-panels",
    options: {
      mode: "comic",
      separator: "pipe",
      syntax: "nai",
      supplement: false,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  city rooftop at sunset, Dave standing near the safety railing, comic panel, manga panel, ultra complexity | 1boy, teen, messy brown hair, athletic build, hoodie, denim jeans, determined gaze, leaning forward against rail | panel 1, establishing shot, wide panoramic view of twilight horizon, The sun is finally going down. | panel 2, close-up on Dave's face, wind blowing hair, Tomorrow begins the real test.",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1700-1725, 1785-1793",
      description: "Comic mode page composition with formatted panel sequences and speech bubble dialogue",
    },
  },
  {
    fixtureId: "nai-mismatched-negatives",
    options: {
      mode: "illustration",
      separator: "native",
      syntax: "nai",
      supplement: false,
      nsfw: false,
    },
    expected: {
      prompt: "1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  wide shot, straight-on, city street, crosswalk, waiting at traffic light",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji, hat",
      nativeCharacters: [
        {
          name: "Alice",
          prompt: "girl, young adult, blonde hair, blue eyes, sundress",
        },
        {
          name: "Bob",
          prompt: "boy, young adult, black hair, brown eyes, t-shirt, jeans",
        },
      ],
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1883-1893",
      description: "Mismatched character negatives fall back to baseNeg, leaving character channels unpolluted",
    },
  },
  {
    fixtureId: "custom-affix-ordering",
    options: {
      mode: "illustration",
      separator: "pipe",
      syntax: "nai",
      supplement: false,
      nsfw: false,
      customPos: "masterpiece, highly detailed",
      customNeg: "vibrant colors",
      customNegative: "blurry background, deformed limbs",
    },
    expected: {
      prompt: "masterpiece, highly detailed, 1.35::henriiku \\(ahemaru\\)::,1.3::artist:teshima nari::,1.25::artist:noco \\(adamas\\)::,\n1.2::artist:bekotarou::,\n1.2::artist:kat \\(bu-kunn\\)::, 0.7::mika_pikazo::, 0.7::artist:qiandaiyiyu::, 0.4::artist:mx2j::, 0.4::artist:hwansang::, 0.6::artist:kim hyung tae::, year 2025,  close-up, sunny meadow, relaxing on the grass | girl, young adult, blonde hair, blue eyes, white sundress, vibrant colors",
      negative: "censored, logo, watermark, too many watermarks, blank page, reference inset, username, signature, artist collaboration, variant set, large variant set, 4koma, toon (style), oekaki, chibi, turnaround, film grain, monochrome, dithering, halftone, screentones, dated, old, 1990s (style), mutation, deformed, distorted, disfigured, artistic error, distorted anatomy, anatomical structure error, asymmetrical face, unnatural hair, bad eyes, cloudy eyes, pointy ears, bad fingers, bad proportions, bad limb, bad hands, extra hands, bad hand structure, extra digits, fewer digits, bad legs, extra legs, amputee, distorted composition, bad perspective, ::multiple views::, negative space, animation error, chromatic aberration, disorganized colors, scan artifacts, jpeg artifacts, vertical lines, vertical banding, worst quality, bad quality, lowres, blurry, upscaled, fewer details, unfinished, incomplete, amateur, cheesy, unsatisfactory, inadequate, deficient, poor, displeasing, very displeasing, bad illustration, bad portrait, big head, monochrome, abstract, dissolving, earrings, character doll, colored inner hair, emoji, blurry background, deformed limbs",
    },
    provenance: {
      file: "references/v376/trigger_runtime.lua",
      lines: "1845-1847, 1876-1878",
      description: "CustomPos prepended to positive, CustomNeg appended to positive as quality suffix, customNegative appended to negative",
    },
  },
]);

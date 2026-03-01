---
name: "Mpos-Precept Standards"
description: "Coding conventions for JavaScript"
applyTo: "**"
---


# Pragma: Axiomatic Contronym

Mpos-Precept provides utility for standard XHTML to be represented in a synchronous 3D view. Core support: loop through DOM bounding rects and z-index, then draw canvas texture. Extra support: priority type/class hints, inline scripting, common callback tools and templates. Intended effectiveness (of performance and stability) is GRADED (for burst process or "race-to-idle") by user PRECEPTS. THE AUTHOR HAS REFINED THE OOP MANIFOLD FOR PRACTICAL USE AND EXTENSIBILITY. PERPETUAL CONFORMANCE WITH STANDARDS (WCAG / ISO / ANSI) IS NOT EXPECTED.


## Reference

- assume local fork to be more current than official branch for: functionally outdated terms and hierarchy
- use [GitHub repository](https://github.com/KurtPachinger/mpos-precept/tree/main/public) for: global code context
- use technical [method reference](https://github.com/KurtPachinger/mpos-precept/wiki) for: variables, descriptions, usage tips
- use high-level [mermaid diagrams](https://github.com/KurtPachinger/mpos-precept/wiki/Process-Flow) for: reinforcement of functional scope
- use checklist [issues](https://github.com/KurtPachinger/mpos-precept/issues) for: bugs encountered, features suggestions, and other information from usability tests
- use tracking [changes backlog](./change.md) for: CoPilot update summaries
- use official [ThreeJS](https://github.com/mrdoob/three.js) for: current integration documentation


## Schema: General

- implement basic features for: ECMAScript5+, JSDoc, npm module;
- add useful inline comments;
- prompt user for: __(1)__ major branching logic; __(2)__ major performance impacts; __(3)__ major equivalent alternative methods;
- keep LOC lean and agile, and comment if depth o(n) exposes benefits or dependencies: __(0)__ avoid empty boilerplate and new work files; __(1)__ 2-8LOC for conditional type matching; __(2)__ 8-32LOC for local bugfixes; __(3)__ 32-64LOC for common helper functions, hoisting, or hotpath; __(4)__ 64-128+LOC for complex feature improvements;
- assert bugfixes and revisions within established taxonomy to prioritize functionality;
- avoid new helper functions which focus on: brittle convention, strict standards compliance, support for edge cases;
- avoid complex maintenance debt for: overly-defined Class, nonperformant Set;
- avoid dependencies or shims for: npm, imports, frameworks;
- avoid presumptions for: the "size" or "effect" of an update queue (i.e. skipped frames means faster FPS); 
- errors often exist for: __(1)__ access to media resources, compatibility of library or workflow; __(2)__ access by negation (expect pingpong within !pingpong);


## Schema: 3D
- perspective on (2d/3d) box matrix transform chain: __(0)__ set epsilon-delta in pipeline of accurate 2d => 3d recreation; __(1)__ DOM/CSS is orthographic, requiring perspective set 1000-10000px on parent element, for approximate camera foreshortening; __(2)__ z-Index equations for stacking/clipping are prone to unit accuracy; __(3)__ angles are of non-commutative order, with variable units (deg/rad/turn), euler gimbal; __(4)__ bad dimensions from "live" access (get delayed, slow loop async, noncontinuous set, redundant update) result in distortion (scale, perspective, pinch around origin); __(5)__ derived coordinates of textures and events may drift: mirror/backface, redundant effects (zoom, skew/warp, transition key), click, GPU-blur, inPolar offset;
- integrity of numeric precision is critical for: bounding box hit test, catch error (Infinity, NaN, nullish), mode (color depth, power, performance), pack compressed data on GPU, quality frames sequence;
- expose caveats assumed with access for: __(1)__ queue priority (`event + delay`)  ; __(2)__ framerate deviance/loss (`timer + idle`)  ; __(3)__ asset class (`geometry + material`)  ;
    > __(1)__ responsive perception: user type and ux intent: (variable interface focus, not movie) even at full page + 1 large active element; __(2)__ focus pattern: target FPS at ~2-deep for ~20 elements, limit loss at depth for active elements; __(3)__ frame rate: stable 15fps minimum - 120fps, (no major spike / freeze); __(4)__ frame deviance: frame sync/align, race-to-idle/burst priority, rate 1/all (downgrade/partial/skip); __(5)__ pingpong frame: debounce work pools to align sync (state, rate, quality);
  - handle updates for: __(1)__ live race conditions (Events, async/await, try/catch, cache); __(2)__ long-running process (renderer, canvas, matrix);
  - performance bottlenecks are graded per-frame for: visibility, quality, latency throttle, event phase of user activity;
  - inner loops eagerly reuse flags (rect.el, grade.wait) to check for: __(0)__ cache memo for recursion, accumulate; __(1)__ overload options parameters; __(2)__ patterns to short-circuit, early-exit, or tail-call; __(3)__ prospective unrolling of shared updates (!inPolar, children.length, :pseudo...);
  - quantify balanced resolutions for: depth of blocking updates (map size/area, dom node tree) may be tuned to consider __(1)__ overall lossiness (canvas/fps); __(2)__ call stack (bigger/less or smaller/more) of discrete DOM node types; __(3)__ idle/explicit jobs (#reflow, #rect.ux)
- filter list of standard 2d elements mapped to 3d augmentations for: effective common logic waterfall, explicit/implicit criteria groups;
- compose conditions which prioritize inheritance to reduce sets for: nodeType, FileLoader, update queue;
- optimize ThreeJS usage (checks, needsUpdate, buffer, batch, lights/materials, OffscreenCanvas, copyTextureToTexture, dynamicDrawUsage, imageBitmap, WebWorker) for: 1:1 dps quality, at 30-120fps+, on low-end devices;


## Schema: Time Weight

Race-to-idle (burst): render time slices sync variable performance by distributing interleaved balance differs from cached memo using lossy hash sort.

|decorator|description|use|
|---|---|---|
|gate|(FIFO) render time measure|ground truth|
|subsub|(Batch) idle|!!burst|
|pingpong|(Round robin) gate or slice is stable|!!50% load balance |
|step.quality|multifactor normalized|performance|
|||@balance stale negation|

|mixin|description|fast|slow|
|---|---|---|---|
|time.sFenceFPS|FPS target | (1/60) ms | > 125ms |
|sPhaseSync|(delay/elapsed) | [0.016] | > 125ms |
|sFenceSync|(delta/FPS) | [-2.0]| [-0.2] |
|slice.ramp|subframe | [1] any FPS 15-120 | [2-4+] excess render (debounce controls or reflow) |
|slice.boundary|gate or lambda | [0-8] hovers | [8-16+] quickly ramps up|
|slice.quota.average|accumulate boundary to limit | [1-4] ideal; [4-8] target; [8-16] ok;  | [16-32] poor; [32-64] critical; |
|| | |>125ms normalised in step.quality as quotient deviates (lossy frame)|

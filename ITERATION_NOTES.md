# Iteration handoff — 2026-11-10

## Scope completed in this iteration

- Four fresh tumor presets (onset/cold/hot/random): periodic boundary, 3× speed, nuclei/antigen/cycle visible, adversity + recruitment overlays, no Act/tracks. Ordinary reset/import keeps user preferences. Maze retains solid boundaries, immune Act, tracks and 1×.
- Tools occupy two rows. Three vertically paired columns (move/inspect, seed/remove, wall/erase), with one ordinary-size signal button in the first row's fourth column; no pan button. Middle-button/Alt-drag still pans.
- `src/signal-gesture.js`: finite single-click pulse, held/dragged continuous pulses, double-click persistent source. Cancels deferred writes on tool/scene/import/focus changes; browser timer callbacks use bound-safe wrappers. Repeated RPCs coalesce under load.
- Oxygen/glucose/acid are independent pulse/source categories; existing nutrient/hostile combinations stay import-compatible. Periodic source footprints and erasure work across seams. Worker and parameter validation recognize new channels.
- Tumors bias direction toward local oxygen/glucose gradients even before adversity. Existing chemotaxis control sets strength; no distant target coordinates, wall or contact bypass. This changes stochastic trajectories, not prescribed preset outcomes.
- Regression detail: old hot seed 77 no longer naturally escapes with the new taxis. The selection/inheritance test now explicitly conditions one rare-event draw after real recruitment exposure; it does not estimate default escape frequency. No biological preset settings were changed to preserve an old seed's ending.

- Adaptive presentation controller with device-local preferences, measured overload and recovery, mobile preview, hidden-panel culling and recording/manual-quality protection.
- Larger visible tumor nuclei and gradual G2/M enlargement, constrained to the owning body's occupancy; protected mechanical nuclear radius unchanged.
- Narrow mechanical fix for the reproducible staggered extracellular pore lock; mirrored in sequential JS and WASM, compiled artifact updated.
- Filterable full-course history with auto Y scale, exclusive state counts, single-population stacked count/percent view, sample inspection and bilingual mobile UI.
- Normal-cell support coupling for global oxygen/glucose supply and acid clearance. Empty custom scenes default to 0%; presets use 35/25/20%, random development 20–50%. Healthy-normal retention uses the running peak count, not the normal fraction of all cells.

## Boundaries to preserve

- Never reduce physics lattice resolution, omit MCS operations, remove contact/microenvironment checks or freeze growth to meet a performance target. Keep target and actual MCS/s separate.
- Adaptive mode is presentation-only. Backend comparison is still the existing startup measurement; do not silently switch biology numerical backends during a run.
- Only the maze enables immune Act by default. All scenes show antigen outlines by default. Cell nuclei, antigen outlines and cycle letters are independent toggles.
- Mobile records Arena only; recording dimensions override adaptive preview limits. Desktop combined capture uses actual sidebar layout.
- Population history spans time zero through current time. Display reduction is not export truncation; state categories must partition each total, including clearing bodies.
- Custom coupling is opt-in. Reading snapshots must never update the normal-cell reference. Parameter import starts a fresh run/reference while retaining explicitly chosen coupling. Persistent manual nutrient sources remain external inputs.
- The hosted product is a 2D CPM cross-section with bounded slice yielding, not the earlier 2.5D surface prototype or a fully physical 3D tumor.

## Navigation

- `src/adaptive-performance.js`: pure feedback logic, profile caps and display dimensions.
- `src/app.js`, `src/worker.js`: measurement, visibility, scheduling and acknowledgements.
- `src/display-fields.js`: nuclear contour, snapshot cache and colour-batched Path2D rendering.
- `src/section-mechanics.js`, `src/cpm-kernel.c`: identical four-face pore exception. Run `npm run build:wasm` when the C source changes.
- `src/history-chart.js`: pure plan/scale plus chart controls and rendering.
- `src/model.js`: flat history state counters and state-aware bounded drawing samples.
- `src/model.js`, `src/gpu-fields.js`: identical effective supply; `normalSupportReport()` is read-only. `tests/normal-support.test.mjs` and `scripts/check-support-nuclei.mjs` cover numerical and UI behaviour.
- `CHECK_RESULTS.md`: validation evidence and honest measurement limits. `MODEL.md` describes the model distinctions.

## Follow-up considerations

- Continue in this chat or use this note to resume a fresh chat; a long chat alone does not require restarting implementation.
- Browser mobile emulation is not real-device Safari validation. Low-end CPU and thermal throttling still limit sequential CPM throughput; adaptive presentation cannot guarantee 60 FPS or 8× simulation speed.
- A screenshot alone does not prove every serrated boundary is the same pore defect. If a different case persists, obtain an actual state checkpoint or reproducible setup before relaxing topology constraints more broadly.
- Preset outcome statistics may differ after the pore repair because it intentionally changes accepted physical proposals. Do not preserve old exact population/death counts by changing biology parameters.

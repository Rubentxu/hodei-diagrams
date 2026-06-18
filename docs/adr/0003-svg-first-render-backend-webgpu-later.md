# SVG First Render Backend, WebGPU Later

Hodei Diagrams will start with an SVG Render Backend and keep WebGPU as a later acceleration path rather than the initial delivery target. The decision is to prioritize behavior fidelity, text correctness, editing precision, exportability, and `.drawio` compatibility first, while designing the Diagram Engine so that a future WebGPU backend can consume the same scene semantics without redefining product behavior.

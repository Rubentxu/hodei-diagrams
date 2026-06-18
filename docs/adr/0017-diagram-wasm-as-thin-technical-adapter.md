# `diagram-wasm` as a Thin Technical Adapter

Hodei Diagrams will keep `diagram-wasm` as a thin technical adapter over the Diagram Engine rather than letting it absorb browser-specific interaction logic. The decision is to confine `diagram-wasm` to boundary concerns such as exported commands and events, shared buffer access, and type adaptation, while keeping interaction rules and editing behavior inside the engine itself.

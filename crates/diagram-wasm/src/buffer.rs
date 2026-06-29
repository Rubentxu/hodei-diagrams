//! Zero-copy buffer manager for the WASM bridge.
//!
//! Pre-allocates fixed-size slabs in WASM linear memory that JS can
//! read/write directly via `Uint8Array` views, avoiding JSON
//! string round-trips.
//!
//! ## Safety contract
//!
//! Buffers are allocated with `Vec::with_capacity(N)` and **never
//! shrink** during operation. If a buffer needs more space, it is
//! reallocated to a larger capacity and the caller must re-fetch the
//! pointer. JS must never hold a `Uint8Array` view across a WASM
//! call that might grow the buffer.
//!
//! ## Usage
//!
//! ```ignore
//! // Rust side: write scene bytes to buffer
//! let len = scene_buffer.write(&postcard_bytes);
//! // JS reads via ptr + len
//! ```
//!
//! ```ignore
//! // JS side
//! const len = wasm.write_scene_to_buffer(handle);
//! const ptr = wasm.get_scene_buffer_ptr(handle);
//! const bytes = new Uint8Array(wasm.memory.buffer, ptr, len);
//! ```

/// Default initial capacity for the scene output buffer (2 MB).
/// Grows on demand if a scene serialization exceeds this.
const SCENE_BUFFER_INITIAL: usize = 2 * 1024 * 1024;

/// Default initial capacity for the SVG output buffer (4 MB).
const SVG_BUFFER_INITIAL: usize = 4 * 1024 * 1024;

/// Default initial capacity for the command input buffer (1 MB).
const COMMAND_BUFFER_INITIAL: usize = 1 * 1024 * 1024;

/// A growable byte buffer that lives in WASM linear memory.
///
/// The buffer is allocated with an initial capacity and grows
/// geometrically when `write` is called with more bytes than
/// available. After growth, the pointer changes — callers must
/// re-fetch via `as_ptr()`.
pub struct BridgeBuffer {
    buf: Vec<u8>,
    len: usize,
}

impl BridgeBuffer {
    /// Create a new buffer with the given initial capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            buf: Vec::with_capacity(capacity),
            len: 0,
        }
    }

    /// Write bytes into the buffer, growing if necessary.
    /// Returns the number of bytes written (= data.len()).
    pub fn write(&mut self, data: &[u8]) -> usize {
        let needed = data.len();
        if self.buf.capacity() < needed {
            // Grow geometrically: at least double, or fit needed
            let new_cap = self.buf.capacity().max(needed).max(needed * 2);
            self.buf.reserve(new_cap - self.buf.len());
        }
        self.buf.clear();
        self.buf.extend_from_slice(data);
        self.len = data.len();
        self.len
    }

    /// Get the raw pointer to the buffer data (for JS to read via
    /// `Uint8Array` view).
    pub fn as_ptr(&self) -> *const u8 {
        self.buf.as_ptr()
    }

    /// Current data length (not capacity).
    pub fn len(&self) -> usize {
        self.len
    }

    /// Current capacity (max bytes before reallocation).
    pub fn capacity(&self) -> usize {
        self.buf.capacity()
    }

    /// Whether the buffer currently holds any data.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Get the buffer contents as a byte slice (for Rust-side reading,
    /// e.g. command buffer parsing).
    pub fn as_bytes(&self) -> &[u8] {
        &self.buf[..self.len]
    }

    /// Clear the buffer (set len to 0, keep capacity).
    pub fn clear(&mut self) {
        self.len = 0;
        self.buf.clear();
    }
}

/// Manages the three bridge buffers for a single WASM engine instance.
pub struct BufferManager {
    /// Scene output: Rust writes postcard-encoded Scene, JS reads.
    pub scene: BridgeBuffer,
    /// SVG output: Rust writes UTF-8 SVG bytes, JS reads.
    pub svg: BridgeBuffer,
    /// Command input: JS writes command bytes, Rust reads on flush.
    pub command: BridgeBuffer,
}

impl BufferManager {
    /// Create a new buffer manager with default capacities.
    pub fn new() -> Self {
        Self {
            scene: BridgeBuffer::new(SCENE_BUFFER_INITIAL),
            svg: BridgeBuffer::new(SVG_BUFFER_INITIAL),
            command: BridgeBuffer::new(COMMAND_BUFFER_INITIAL),
        }
    }
}

impl Default for BufferManager {
    fn default() -> Self {
        Self::new()
    }
}

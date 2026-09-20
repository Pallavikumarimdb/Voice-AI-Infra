/**
 * Fixed-size Ring Buffer on the main thread for audio frame staging.
 */
export class RingBuffer {
  private buffer: Int16Array;
  private head = 0;
  private tail = 0;
  private size = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Int16Array(capacity);
  }

  write(data: Int16Array): number {
    const toWrite = Math.min(data.length, this.capacity - this.size);
    for (let i = 0; i < toWrite; i++) {
      this.buffer[this.head] = data[i];
      this.head = (this.head + 1) % this.capacity;
    }
    this.size += toWrite;
    return toWrite;
  }

  read(out: Int16Array): number {
    const toRead = Math.min(out.length, this.size);
    for (let i = 0; i < toRead; i++) {
      out[i] = this.buffer[this.tail];
      this.tail = (this.tail + 1) % this.capacity;
    }
    this.size -= toRead;
    return toRead;
  }

  available(): number {
    return this.size;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

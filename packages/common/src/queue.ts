import {delay} from '@massbit/common/utils';

export class BlockedQueue<T> {
  private _queue: T[] = [];
  private readonly _maxSize: number;

  constructor(size: number) {
    this._maxSize = size;
  }

  get size(): number {
    return this._queue.length;
  }

  get freeSize(): number {
    return this._maxSize - this._queue.length;
  }

  async put(item: T): Promise<void> {
    while (this._queue.length >= this._maxSize) {
      await delay(0.1);
    }
    this._queue.push(item);
  }

  async putAll(items: T[]): Promise<void> {
    while (this._queue.length + items.length > this._maxSize) {
      await delay(0.1);
    }
    this._queue.push(...items);
  }

  async take(): Promise<T> {
    while (!this.size) {
      await delay(0.1);
    }
    return this._queue.shift();
  }

  async takeAll(max?: number): Promise<T[]> {
    while (!this.size) {
      await delay(0.1);
    }
    let result;
    if (max) {
      result = this._queue.slice(0, max);
      this._queue = this._queue.slice(max);
    } else {
      result = this._queue;
      this._queue = [];
    }
    return result;
  }
}

export class BufferWrapper {
   pos = 0;
   buffer: Buffer;
   constructor(buffer: Buffer) {
      this.buffer = buffer;
   }
   readUInt16(): number {
      const rs = this.buffer.readUInt16LE(this.pos);
      this.pos += 2;
      return rs;
   }
   readUInt32(): number {
      const rs = this.buffer.readUInt32LE(this.pos);
      this.pos += 4;
      return rs;
   }
   readRawASCII(length: number): string {
      const rs = this.buffer.subarray(this.pos, this.pos + length).toString('ascii');
      this.pos += length;
      return rs;
   }
   readByte(): number {
      const rs = this.buffer.readUInt8(this.pos);
      this.pos += 1;
      return rs;
   }
   writeRawASCII(str: string): void {
      const output = Buffer.from(str, 'ascii');
      if (this.pos + output.length > this.buffer.length)
         throw RangeError('write: Out of range');
      output.copy(this.buffer, this.pos);
      this.pos += output.length;
   }
   writeUInt32(value: number): void {
      if (this.pos + 4 > this.buffer.length)
         throw RangeError('write: Out of range');
      this.buffer.writeUInt32LE(value, this.pos);
      this.pos += 4;
   }
   writeUInt16(value: number): void {
      if (this.pos + 2 > this.buffer.length)
         throw RangeError('write: Out of range');
      this.buffer.writeUInt16LE(value, this.pos);
      this.pos += 2;
   }
   writeByte(value: number): void {
      if (this.pos + 1 > this.buffer.length)
         throw RangeError('write: Out of range');
      this.buffer.writeUInt8(value, this.pos);
      this.pos += 1;
   }
   writeBytes(bytes: Buffer): void {
      if (this.pos + bytes.length > this.buffer.length)
         throw RangeError('write: Out of range');
      bytes.copy(this.buffer, this.pos);
      this.pos += bytes.length;
   }
   subArray(count: number): Buffer {
      if (this.pos + count > this.buffer.length)
         throw RangeError('read: Out of range');
      const rs = this.buffer.subarray(this.pos, this.pos + count);
      this.pos += count;
      return rs;
   }
}
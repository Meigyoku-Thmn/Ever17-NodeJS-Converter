import { BufferTraverser } from '../utils/buffer-wrapper';

export function decompress(inp: Buffer, _uncompressedLength = 0): Buffer {
   const din = new BufferTraverser(inp);
   let uncompressedLength: number;
   if (_uncompressedLength === 0) {
      const magic = din.readRawASCII(4);
      if (magic !== 'lnd\0')
         throw Error(`Invalid magic code "${magic}", expected "lnd\\0".`);
      din.pos += 4;
      uncompressedLength = din.readUInt32();
      din.pos += 4;
   } else {
      uncompressedLength = _uncompressedLength;
   }
   const out = new BufferTraverser(Buffer.allocUnsafe(uncompressedLength));
   let w = 0;
   while (w < uncompressedLength) {
      let b = din.readByte();
      if ((b & 0x80) !== 0) {
         if ((b & 0x40) !== 0) {
            // Copy single byte k times
            let k = (b & 0x1f) + 2;
            if ((b & 0x20) !== 0) {
               k += din.readByte() << 5;
            }
            b = din.readByte();
            for (let n = 0; n < k && w < uncompressedLength; n++) {
               out.writeByte(b);
               w++;
            }
         } else {
            // Copy previously decompressed bytes to output
            const offset = ((b & 0x03) << 8) + din.readByte() + 1;
            const count = ((b >> 2) & 0x0f) + 2;
            const readIndex = w - offset;
            // Can't copy multiple bytes at a time, readIndex+count may be greater than the initial write pos
            for (let n = 0; n < count && w < uncompressedLength; n++) {
               const currentPos = out.pos;
               out.pos = readIndex + n;
               const val = out.readByte();
               out.pos = currentPos;
               out.writeByte(val);
               w++;
            }
         }
      } else {
         if ((b & 0x40) !== 0) {
            // Copy byte sequence k times
            const count = (b & 0x3f) + 2;
            const k = din.readByte() + 1;
            const temp = din.subArray(count);
            for (let n = 0; n < k && w < uncompressedLength; n++) {
               for (let x = 0; x < count && w < uncompressedLength; x++) {
                  out.writeByte(temp[x]);
                  w++;
               }
            }
         } else {
            // Copy byte sequence
            let count = (b & 0x1f) + 1;
            if ((b & 0x20) !== 0) {
               count += din.readByte() << 5;
            }
            for (let n = 0; n < count && w < uncompressedLength; n++) {
               out.writeByte(din.readByte());
               w++;
            }
         }
      }
   }
   if (out.atEOF())
      throw Error('Something wrong');
   return out.buffer;
}
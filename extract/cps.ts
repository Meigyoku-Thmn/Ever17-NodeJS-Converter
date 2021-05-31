import { BufferTraverser } from '../utils/buffer-wrapper';
import { iadd, imul, isub } from '../utils/integer-arithmetic';
import { decompress } from './decompress';

export function convertCps2Prt(inp: Buffer): Buffer {
   const inb = new BufferTraverser(inp);

   const magic = inb.readRawASCII(4);
   if (magic !== 'CPS\0')
      throw Error(`Invalid magic code "${magic}", expected "CPS\\0".`);

   const size_comp = inb.readUInt32();

   const version = inb.readUInt16();
   if (version !== 0x66)
      throw Error(`Unknown CPS file version 0x${version.toString(16)}`);

   const comprType = inb.readUInt16();
   const size_orig = inb.readUInt32();

   const outLen = size_comp - 16 - 4;
   const outStream = new BufferTraverser(Buffer.from(inb.subArray(outLen)));

   const offset = isub(inb.readUInt32(), 0x7534682) >>> 0;
   if (offset !== 0)
      decryptCPSInPlace(outStream.buffer, size_comp, offset);
   let output = outStream.buffer;
   if ((comprType & 1) !== 0)
      output = decompress(output, size_orig);

   return output;
}

function decryptCPSInPlace(input: Buffer, size_comp: number, offset: number): void {
   const inputStream = new BufferTraverser(input);
   const outputStream = new BufferTraverser(input);

   const realOffset = isub(offset, 16);
   inputStream.pos = realOffset;
   let key = iadd(iadd(inputStream.readUInt32(), offset), 0x3786425);

   inputStream.pos = 0;
   let allowWrite = false;
   while (inputStream.pos < inputStream.buffer.length) {
      const useKey = inputStream.pos !== realOffset;
      let value = inputStream.readUInt32();
      if (useKey) {
         value = isub(isub(value, size_comp), key);
      }
      if (allowWrite)
         outputStream.writeUInt32(value >>> 0);
      key = iadd(imul(key, 0x41C64E6D), 0x9B06);
      allowWrite = true;
   }

   outputStream.writeUInt32(0);
}
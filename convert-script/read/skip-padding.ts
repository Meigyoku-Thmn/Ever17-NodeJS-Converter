import { BufferTraverser } from '../../utils/buffer-wrapper';

export function skipPadding(reader: BufferTraverser, count: 1 | 2 | 4): void {
   const pos = reader.pos;
   let padding = 0;

   if (count === 1)
      padding = reader.readByte();
   else if (count === 2)
      padding = reader.readUInt16();
   else if (count === 4)
      padding = reader.readUInt32();
   else
      throw Error(`Unsupported padding count = ${count}.`);

   if (padding !== 0)
      throw Error(`Expected ${count}-byte zero padding at 0x${pos.toString(16)}, got 0x${padding.toString(16)}.`);
}

export function skipMarker(reader: BufferTraverser, count: 1 | 2 | 4, expectedValue: number): number {
   const pos = reader.pos;
   let marker = 0;

   if (count === 1)
      marker = reader.readByte();
   else if (count === 2)
      marker = reader.readUInt16();
   else
      throw Error(`Unsupported marker count = ${count}.`);

   if (marker !== expectedValue)
      throw Error(
         `Expected ${count}-byte marker 0x${expectedValue.toString(16)} at 0x${pos.toString(16)}, ` +
         `got 0x${marker.toString(16)}.`);

   return marker;
}
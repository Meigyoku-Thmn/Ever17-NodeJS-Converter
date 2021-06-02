import { BufferTraverser } from '../utils/buffer-wrapper';
import { ScriptError } from '../utils/error';

export function skipPadding(reader: BufferTraverser, count: number, location: string | (() => string)): void {
   let padding = 0;

   if (count === 1)
      padding = reader.readByte();
   else if (count === 2)
      padding = reader.readUInt16();
   else if (count === 4)
      padding = reader.readUInt32();
   else
      throw Error(`Unsupported padding count = ${count}.`);

   if (padding !== 0) {
      if (typeof (location) === 'function')
         location = location();
      throw Error(`Expected ${count}-byte zero padding ${location}, got 0x${padding.toString(16)}.`);
   }
}

export function skipMarker(reader: BufferTraverser,
   count: number, expectedValue: number, location: string | (() => string), asMessage = false): number {
   let marker = 0;

   if (count === 1)
      marker = reader.readByte();
   else if (count === 2)
      marker = reader.readUInt16();
   else
      throw Error(`Unsupported marker count = ${count}.`);

   if (marker !== expectedValue) {
      if (typeof (location) === 'function')
         location = location();
      throw Error(asMessage
         ? location
         : `Expected 0x${expectedValue.toString(16)} ${location}, got 0x${marker.toString(16)}.`);
   }

   return marker;
}
import { badd } from '../utils/integer-arithmetic';

export function decryptInPlace(record: Buffer, name: string): void {
   let startPos = -1;
   name = name.toLowerCase();

   if (name.endsWith('.wav'))
      startPos = 0;
   else if (name.endsWith('.jpg'))
      startPos = 4352;
   else if (name.endsWith('.scr'))
      startPos = 4096;

   if (startPos === -1)
      return;

   let key = 0;
   for (const chr of [...Buffer.from(name, 'ascii')])
      key = badd(key, chr);
   for (let i = 0; i < 256; i++) {
      record[startPos + i] -= key;
      key = (key * 0x6D - 0x25) & 0xFF;
   }
}
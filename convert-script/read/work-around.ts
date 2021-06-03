import { BufferTraverser } from '../../utils/buffer-wrapper';
import { readExpression } from './read-expression';

export function goAroundSpecialGotoIf(reader: BufferTraverser): boolean {
   const startPos = reader.pos;
   const a1 = reader.readByte();
   if (a1 !== 0x2d) {
      reader.pos = startPos;
      return false;
   }
   reader.pos += 10;
   readExpression(reader, 'unk1', true);
   readExpression(reader, 'unk2', true);
   return true;
}
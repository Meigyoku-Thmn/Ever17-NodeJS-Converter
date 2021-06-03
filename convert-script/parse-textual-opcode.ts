import { BufferTraverser } from '../utils/buffer-wrapper';

export class TextualOpcodeInfo {
   name: string;

   constructor(initialObj: Partial<TextualOpcodeInfo>) {
      return Object.assign(this, initialObj);
   }
}

export function parseTextualOpcodes(bytecodes: Buffer, pos: number): TextualOpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodes: TextualOpcodeInfo[] = [];

   return opcodes;
}
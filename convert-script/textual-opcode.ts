import { BufferTraverser } from '../utils/buffer-wrapper';

export type TextualOpcodeInfo = {
   name: string;
};

export function parseTextualOpcodes(bytecodes: Buffer, pos: number): TextualOpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodes: TextualOpcodeInfo[] = [];

   return opcodes;
}
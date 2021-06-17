import { Expression } from './expression';
import { FlowOpcode, MetaOpcode, Opcode, TextualOpcode } from './opcode';

export const enum InstructionType {
   Meta, Flow, Opcode,
}

export class Instruction {
   position: number;
   bytecodes: Buffer;
   type: InstructionType;
   code: MetaOpcode | FlowOpcode | Opcode;
   expressions: Expression[] = [];
   switches: [Expression[], Expression][] = [];
   textualInstructions: TextualInstruction[] = [];
   labeled = false;

   constructor(initialObj?: Partial<Instruction>) {
      return Object.assign(this, initialObj);
   }
}

export const enum TextualInstructionType {
   Text, Command,
}

export class TextualInstruction {
   position: number;
   bytecodes: Buffer;
   type: TextualInstructionType;
   code: TextualOpcode;
   expressions: Expression[] = [];
   choices: [Expression[], string][] = [];
   text = '';

   constructor(initialObj?: Partial<TextualInstruction>) {
      return Object.assign(this, initialObj);
   }
}
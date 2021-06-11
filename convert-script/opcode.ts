import { Expression } from './expression';

export class OpcodeInfo {
   position: number;
   bytecodes: Buffer;
   type: OpcodeType;
   code: MetaOpcode | Opcode;
   expressions: Expression[] = [];
   switches: [Expression, Expression][] = [];
   textualOpcodeInfos: TextualOpcodeInfo[] = [];

   constructor(initialObj?: Partial<OpcodeInfo>) {
      return Object.assign(this, initialObj);
   }
}

export class TextualOpcodeInfo {
   position: number;
   bytecodes: Buffer;
   type: TextualOpcodeType;
   code: TextualOpcode;
   expressions: Expression[] = [];
   choices: [Expression, string][] = [];
   text = '';

   constructor(initialObj?: Partial<TextualOpcodeInfo>) {
      return Object.assign(this, initialObj);
   }
}

export const enum OpcodeType {
   MetaOpcode, Opcode, UnknownGotoIf,
}

export const enum TextualOpcodeType {
   Text, Command,
}

export const enum MetaOpcode {
   // padding between opcodes, not a real opcode, not sure how it's used
   Pad = 0x00,
   Goto = 0x07,
   GotoIf = 0x0a,
   Switch = 0x26,
   CallText = 0xff,
   VarOp = 0xfe,
   Command = 0x10,
   Sleep = 0x05,
   MUnk28 = 0x28,
   MUnk19 = 0x19,
   MUnk12 = 0x12,
   MUnk13 = 0x13,
   MUnk06 = 0x06,
   MUnk0D = 0x0d,
   MUnk15 = 0x15,
}

const _MetaOpcode = eval('MetaOpcode');

export function MetaOpcodeName(value: MetaOpcode): string {
   return _MetaOpcode[value];
}

export const enum Opcode {
   ToFile = 0x01,
   PlayBGM = 0x03,
   StopBGM = 0x04,
   PlaySFX = 0x05,
   StopSFX = 0x06,
   WaitSFX = 0x07,
   PlayVoice = 0x08,
   WaitVoice = 0x09,
   LoadBG = 0x0c,
   RemoveBG = 0x0d,
   LoadFG = 0x0f,
   RemoveFG = 0x10,
   LoadFG2 = 0x12,
   RemoveFG3 = 0x13,
   SetFGOrder = 0x14,
   AffectFG = 0x15,
   LoadFG3 = 0x16,
   HideDialog = 0x18,
   ShowDialog = 0x19,
   MarkChoiceId = 0x1a,
   ShowChapter = 0x1d,
   Delay = 0x1e,
   ShowClock = 0x1f,
   StartAnim = 0x20,
   CloseAnim = 0x21,
   MarkLocationId = 0x24,
   LoadBGKeepFG = 0x27,
   Unk2B = 0x2b,
   UnlockImage = 0x37,
   PlayMovie = 0x39,
   Unk3B = 0x3B,
   Unk3C = 0x3C,
   LoadBGCrop = 0x40,
   TweenZoom = 0x41,
   Unk43 = 0x43,
   OverlayMono = 0x45,
   SetDialogColor = 0x46,
}

const _Opcode = eval('Opcode');

export function OpcodeName(value: Opcode): string {
   return _Opcode[value];
}

export const enum TextualOpcode {
   // Mark the end of textual segment, not a real opcode
   End = 0x00,
   // Yeah, you have to place the new line opcode manually, or the game will eventually crash
   NewLine = 0x01,
   Wait = 0x02,
   // Clear text, reset text state
   Clear = 0x03,
   Delay = 0x04,
   // No visual effect, potentially a command that can change text speed, but it's unused in the game  
   S = 0x05,
   Choice = 0x0b,
   WaitVoice = 0x0c,
   Voice = 0x0d,
   // Mark the last point that you can save
   Mark = 0x0e,
   // Turn on/off some text states, but has no visual effect, may be the devs had some ideas but couldn't make it?
   // Perhaps {State 4} is reset state, {State 0} is bold/italic/colored, or another font, and {State 1} revert to normal?
   // Think about it, a lot of text segments in game script have this, and all of them are important plot points. It makes more sense if they are visually emphasized somehow.
   State = 0x10,
   // Switch to big character state (param is always 0x03)
   Big = 0x11,
}

const _TextualOpcode = eval('TextualOpcode');

export function isTextualOpcode(byteCode: number): boolean {
   return byteCode !== TextualOpcode.NewLine && _TextualOpcode[byteCode] != null;
}

export function TextualOpcodeName(value: TextualOpcode): string {
   return _TextualOpcode[value];
}
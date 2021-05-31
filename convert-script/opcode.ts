import { BufferTraverser } from '../utils/buffer-wrapper';
import { Expression, ExpressionType, numberExpr, readExpression } from './expression';
import { MetaOpcode, Opcode, OpcodeType } from './opcode-map';
import { parseTextualOpcodes, TextualOpcodeInfo } from './textual-opcode';

export type OpcodeInfo = {
   position: number;
   bytecodes: Buffer;
   type: OpcodeType;
   code: MetaOpcode | Opcode;
   expressions: Expression[];
   switches: [Expression, number][];
   textualOpcodeInfos: TextualOpcodeInfo[];
};

type Params = {
   bytecodes: Buffer,
   pos: number,
   textualIndexes: number[],
   textualBytecodes: Buffer,
   backgroundNames: string[],
};

export function parseOpcodes(params: Params): OpcodeInfo[] {
   const reader = new BufferTraverser(params.bytecodes);
   const opcodeInfos: OpcodeInfo[] = [];

   let opcodePos = 0;
   let relOpcodePos = 0;

   try {
      const opcodeInfo = {} as OpcodeInfo;

      while (!reader.atEOF()) {
         relOpcodePos = reader.pos;
         opcodePos = params.pos + relOpcodePos;
         const byteCode = reader.readByte();

         switch (byteCode) {
            case MetaOpcode.NoOp:
               break;
            case MetaOpcode.VarOp: {
               opcodeInfo.expressions = [
                  readExpression(reader), // left operand
                  readExpression(reader), // assigment operator
                  readExpression(reader), // right operand
               ];
               if ((opcodeInfo.expressions[2] as Expression).type !== ExpressionType.Config) {
                  const padding = reader.readUInt16();
                  if (padding !== 0)
                     throw Error(`Expected 2-byte zero padding after VarOp, got 0x${padding.toString(16)}.`);
               }
               break;
            }
            case MetaOpcode.Command:
               parseCommand();
               break;
            case MetaOpcode.GotoIf: {
               let marker = reader.readByte();
               if (marker !== 0x01)
                  throw Error(`Expected 0x01 at the begining of GotoIf, got 0x${marker.toString(16)}.`);
               opcodeInfo.expressions = [
                  readExpression(reader), // left operand
                  readExpression(reader), // comparison operator
               ];
               marker = reader.readByte();
               if (marker !== 0x01)
                  throw Error(`Expected 0x01 after the operator of GotoIf, got 0x${marker.toString(16)}.`);
               opcodeInfo.expressions.push(readExpression(reader)); // right operand
               marker = reader.readByte();
               if (marker !== 0x01)
                  throw Error(`Expected 0x01 after the right expression of GotoIf, got 0x${marker.toString(16)}.`);
               marker = reader.readByte();
               if (marker !== 0x00)
                  throw Error(`Expected 0x00 after the comparison of GotoIf, got 0x${marker.toString(16)}.`);
               opcodeInfo.switches = [[null, reader.readUInt16()]]; // where to goto
               break;
            }
            case MetaOpcode.Sleep: {
               opcodeInfo.expressions = [readExpression(reader)]; // argument
               const padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(`Expected 2-byte zero padding after Sleep, got 0x${padding.toString(16)}.`);
               break;
            }
            case MetaOpcode.Switch: {
               opcodeInfo.expressions = [readExpression(reader)]; // expression to test
               let padding = reader.readByte();
               if (padding !== 0)
                  throw Error(
                     `Expected a zero padding after the first expression of Switch, got 0x${padding.toString(16)}.`);
               let marker = reader.readUInt16();
               if (marker !== 0x2700)
                  throw Error('Expected atleast a case in Switch statement.');
               opcodeInfo.switches = [];
               while (marker === 0x2700) {
                  const caseExpr = readExpression(reader);
                  padding = reader.readUInt16();
                  if (padding !== 0)
                     throw Error(
                        `Expected 2-byte zero padding after case expression of Switch, got 0x${padding.toString(16)}.`);
                  opcodeInfo.switches.push([caseExpr, reader.readUInt16()]); // [case expression, where to goto]
                  marker = reader.readUInt16();
               }
               reader.pos -= 2;
               break;
            }
            case MetaOpcode.CallText: {
               const ordinal = reader.readUInt16();
               opcodeInfo.switches = [[null, ordinal]]; // goto subroutine
               opcodeInfo.textualOpcodeInfos = parseTextualOpcodes(params.textualBytecodes.subarray(
                  params.textualIndexes[ordinal] - params.textualIndexes[0],
                  params.textualIndexes[ordinal + 1]
               ), params.textualIndexes[ordinal]);
               break;
            }
            case MetaOpcode.MUnk28:
            case MetaOpcode.MUnk06:
               break;
            case MetaOpcode.MUnk0D: {
               opcodeInfo.expressions = [readExpression(reader)];
               const padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after first expression of MUnk0D, got 0x${padding.toString(16)}.`);
               opcodeInfo.expressions.push(numberExpr(reader.readUInt16()));
               break;
            }
            case MetaOpcode.MUnk12:
            case MetaOpcode.MUnk13: {
               opcodeInfo.expressions = [readExpression(reader)];
               const padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after first expression of ${MetaOpcode[byteCode]}, got 0x${padding.toString(16)}.`);
               break;
            }
            case MetaOpcode.MUnk15: {
               opcodeInfo.expressions = [numberExpr(reader.readByte()), readExpression(reader)];
               let padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after second argument of ${MetaOpcode[byteCode]}, got 0x${padding.toString(16)}.`);
               opcodeInfo.expressions.push(readExpression(reader));
               padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after third argument of ${MetaOpcode[byteCode]}, got 0x${padding.toString(16)}.`);
               opcodeInfo.expressions.push(numberExpr(reader.readUInt16()));
               break;
            }
            case MetaOpcode.MUnk19: {
               opcodeInfo.expressions = [readExpression(reader)];
               let padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after first argument of ${MetaOpcode[byteCode]}, got 0x${padding.toString(16)}.`);
               opcodeInfo.expressions.push(readExpression(reader));
               padding = reader.readUInt16();
               if (padding !== 0)
                  throw Error(
                     `Expected 2-byte zero padding after second argument of ${MetaOpcode[byteCode]}, got 0x${padding.toString(16)}.`);
               break;
            }
            default:
               throw Error(
                  `Unknown meta opcode: 0x${byteCode.toString(16)}.`);
         }

         // eslint-disable-next-line no-inner-declarations
         function parseCommand(): void {
            const byteCode = reader.readByte();
            switch (byteCode) {
               case Opcode.ToFile:
               case Opcode.PlayBGM:
               case Opcode.StopBGM:
               case Opcode.PlaySFX:
               case Opcode.StopSFX:
               case Opcode.WaitSFX:
               case Opcode.PlayVoice:
               case Opcode.Unk09:
               case Opcode.LoadBG:
               case Opcode.RemoveBG:
               case Opcode.LoadFG:
               case Opcode.RemoveFG:
               case Opcode.LoadFG2:
               case Opcode.RemoveFG2:
               case Opcode.SetFGOrder:
               case Opcode.AffectFG:
               case Opcode.LoadFG3:
               case Opcode.HideDialog:
               case Opcode.ShowDialog:
               case Opcode.MarkChoiceId:
               case Opcode.ShowChapter:
               case Opcode.Delay:
               case Opcode.ShowClock:
               case Opcode.StartAnim:
               case Opcode.StopAnim:
               case Opcode.MarkLocationId:
               case Opcode.LoadBGKeepFG:
               case Opcode.Unk2B:
               case Opcode.UnlockImage:
               case Opcode.PlayMovie:
               case Opcode.Unk3A:
               case Opcode.Unk3B:
               case Opcode.Unk3C:
               case Opcode.LoadBGCrop:
               case Opcode.TweenZoom:
               case Opcode.Unk43:
               case Opcode.OverlayMono:
               case Opcode.SetDialogColor:
               default:
                  throw Error(
                     `Unknown opcode: 0x${byteCode.toString(16)}.`);
            }
         }

         opcodeInfo.type = (byteCode === MetaOpcode.Command) ? OpcodeType.Opcode : OpcodeType.MetaOpcode;
         opcodeInfo.code = byteCode;
         opcodeInfo.position = opcodePos;
         opcodeInfo.bytecodes = reader.buffer.subarray(relOpcodePos, reader.pos);
      }
   } catch (err) {
      console.error(`Error occured at 0x${opcodePos.toString(16)}:`);
      throw err;
   }

   return opcodeInfos;
}
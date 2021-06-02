import { BufferTraverser } from '../utils/buffer-wrapper';
import { Expression, ExpressionType, createRawExpr, readExpression } from './read-expression';
import { MetaOpcode, MetaOpcodeName, Opcode, OpcodeName, OpcodeType } from './opcode';
import { parseTextualOpcodes, TextualOpcodeInfo } from './parse-textual-opcode';
import { skipMarker, skipPadding } from './skip-padding';
import { addContext } from '../utils/error';

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
   imageNames: string[],
};

export function parseOpcodes({ bytecodes, pos, textualIndexes, textualBytecodes, imageNames }: Params): OpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodeInfos: OpcodeInfo[] = [];

   let opcodePos = 0;
   let relOpcodePos = 0;

   try {
      while (!reader.atEOF()) {
         const opcodeInfo = {} as OpcodeInfo;
         relOpcodePos = reader.pos;
         opcodePos = pos + relOpcodePos;
         let byteCode = reader.readByte();

         opcodeInfo.type = OpcodeType.MetaOpcode;
         switch (byteCode) {
            case MetaOpcode.NoOp:
               break;
            case MetaOpcode.VarOp:
               opcodeInfo.expressions = [
                  readExpression(reader), // left operand
                  readExpression(reader), // assigment operator
                  readExpression(reader), // right operand
               ];
               if ((opcodeInfo.expressions[2] as Expression).type !== ExpressionType.Config)
                  skipPadding(reader, 2, () => `after ${MetaOpcodeName(byteCode)}`);
               break;
            case MetaOpcode.Command:
               opcodeInfo.type = OpcodeType.Opcode;
               byteCode = parseCommand();
               break;
            case MetaOpcode.GotoIf:
               skipMarker(reader, 1, 0x01, () => `at the begining of ${MetaOpcodeName(byteCode)}`);
               opcodeInfo.expressions = [
                  readExpression(reader), // left operand
                  readExpression(reader), // comparison operator
               ];
               skipMarker(reader, 1, 0x01, () => `after the operator of ${MetaOpcodeName(byteCode)}`);
               opcodeInfo.expressions.push(
                  readExpression(reader), // right operand
               );
               skipMarker(reader, 1, 0x01, () => `after the right expression of ${MetaOpcodeName(byteCode)}`);
               skipMarker(reader, 1, 0x00, () => `after the comparison of ${MetaOpcodeName(byteCode)}`);
               opcodeInfo.switches = [[null, reader.readUInt16()]]; // where to goto
               break;
            case MetaOpcode.Sleep:
               opcodeInfo.expressions = [
                  readExpression(reader, () => `after ${MetaOpcodeName(byteCode)}`), // argument
               ];
               break;
            case MetaOpcode.Switch: {
               opcodeInfo.expressions = [readExpression(reader)]; // expression to test
               skipPadding(reader, 1, () => `after the 1st expression of ${MetaOpcodeName(byteCode)}`);
               let marker = skipMarker(reader, 2, 0x2700,
                  () => `Expected at least a case in ${MetaOpcodeName(byteCode)} statement`, true);
               opcodeInfo.switches = [];
               while (marker === 0x2700) {
                  opcodeInfo.switches.push([
                     readExpression(reader, () => `after case expression of ${MetaOpcodeName(byteCode)}`), // case expr
                     reader.readUInt16(), // where to goto
                  ]);
                  marker = reader.readUInt16();
               }
               reader.pos -= 2;
               break;
            }
            case MetaOpcode.CallText: {
               const ordinal = reader.readUInt16();
               opcodeInfo.switches = [[null, ordinal]]; // goto subroutine
               opcodeInfo.textualOpcodeInfos = parseTextualOpcodes(textualBytecodes.subarray(
                  textualIndexes[ordinal] - textualIndexes[0],
                  textualIndexes[ordinal + 1]
               ), textualIndexes[ordinal]);
               break;
            }
            case MetaOpcode.MUnk28:
            case MetaOpcode.MUnk06:
               break;
            case MetaOpcode.MUnk0D:
               opcodeInfo.expressions = [
                  readExpression(reader, () => `after the 1st expression of ${MetaOpcodeName(byteCode)}`),
                  createRawExpr(reader.readUInt16()),
               ];
               break;
            case MetaOpcode.MUnk12:
            case MetaOpcode.MUnk13:
               opcodeInfo.expressions = [
                  readExpression(reader, () => `after the 1st expression of ${MetaOpcodeName(byteCode)}`),
               ];
               break;
            case MetaOpcode.MUnk15:
               opcodeInfo.expressions = [
                  createRawExpr(reader.readByte()),
                  readExpression(reader, () => `after the 2nd argument of ${MetaOpcodeName(byteCode)}`),
                  readExpression(reader, () => `after the 3rd argument of ${MetaOpcodeName(byteCode)}`),
                  createRawExpr(reader.readUInt16()),
               ];
               break;
            case MetaOpcode.MUnk19:
               opcodeInfo.expressions = [
                  readExpression(reader, () => `after the 1st argument of ${MetaOpcodeName(byteCode)}`),
                  readExpression(reader, () => `after the 2nd argument of ${MetaOpcodeName(byteCode)}`),
               ];
               break;
            default:
               throw Error(`Unknown meta opcode: 0x${byteCode.toString(16)}.`);
         }

         // eslint-disable-next-line no-inner-declarations
         function parseCommand(): Opcode {
            const byteCode = reader.readByte();
            switch (byteCode) {
               case Opcode.ToFile:
                  opcodeInfo.expressions = [createRawExpr(reader.readCASCII())];
                  break;
               case Opcode.PlayBGM:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after ordinal argument of ${OpcodeName(byteCode)}`) // bgm name
                        .mapMusic(),
                     readExpression(reader, () => `after volume argument of ${OpcodeName(byteCode)}`), // bgm volume
                  ];
                  break;
               case Opcode.StopBGM:
                  break;
               case Opcode.PlaySFX:
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readCASCII()), // sfx name
                     readExpression(reader, () => `after the 2nd argument of ${OpcodeName(byteCode)}`), // unk
                     readExpression(reader, () => `after volume argument of ${OpcodeName(byteCode)}`), // sfx volume
                  ];
                  break;
               case Opcode.StopSFX:
               case Opcode.WaitSFX:
                  break;
               case Opcode.PlayVoice:
                  opcodeInfo.expressions = [createRawExpr(reader.readCASCII())]; // voice name
                  break;
               case Opcode.Unk09:
                  break;
               case Opcode.LoadBG:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image name
                     readExpression(reader, () => `after mode1 argument of ${OpcodeName(byteCode)}`), // mode1
                     readExpression(reader, () => `after mode2 argument of ${OpcodeName(byteCode)}`), // mode2
                  ];
                  break;
               case Opcode.RemoveBG:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after targetColor argument of ${OpcodeName(byteCode)}`), // target color
                     readExpression(reader, () => `after mode1 argument of ${OpcodeName(byteCode)}`), // mode 1
                     readExpression(reader, () => `after mode2 argument of ${OpcodeName(byteCode)}`), // mode 2
                  ];
                  break;
               case Opcode.LoadFG:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after id argument of ${OpcodeName(byteCode)}`), // fg id
                  ];
                  skipPadding(reader, 4, () => `after id argument of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions.push(
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image name
                     readExpression(reader, () => `after dx argument of ${OpcodeName(byteCode)}`), // horizontal position
                     readExpression(reader, () => `after mode argument of ${OpcodeName(byteCode)}`), // mode
                  );
                  break;
               case Opcode.RemoveFG:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after id argument of ${OpcodeName(byteCode)}`), // fg id
                     readExpression(reader, () => `after mode argument of ${OpcodeName(byteCode)}`), // mode
                  ];
                  break;
               case Opcode.LoadFG2:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after id1 argument of ${OpcodeName(byteCode)}`), // fg id1
                     readExpression(reader, () => `after id2 argument of ${OpcodeName(byteCode)}`), // fg id2
                  ];
                  skipPadding(reader, 4, () => `after id2 argument of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions.push(
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image1 name
                  );
                  skipPadding(reader, 4, () => `after fgname1 argument of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions.push(
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image2 name
                     readExpression(reader, () => `after dx1 argument of ${OpcodeName(byteCode)}`), // dx1
                     readExpression(reader, () => `after dx2 argument of ${OpcodeName(byteCode)}`), // dx2
                     readExpression(reader, () => `after mode argument of ${OpcodeName(byteCode)}`), // mode
                  );
                  break;
               case Opcode.RemoveFG2:
                  opcodeInfo.expressions = [
                     readExpression(reader), // sum of ids
                     createRawExpr(reader.readUInt16()), // unk
                     readExpression(reader, () => `after unk of ${OpcodeName(byteCode)}`), // mode
                  ];
                  break;
               case Opcode.SetFGOrder:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after id1Depth of ${OpcodeName(byteCode)}`), // fg id1 Depth
                     readExpression(reader, () => `after id2Depth of ${OpcodeName(byteCode)}`), // fg id2 Depth
                     readExpression(reader, () => `after id4Depth of ${OpcodeName(byteCode)}`), // fg id4 Depth
                  ];
                  break;
               case Opcode.AffectFG:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after id of ${OpcodeName(byteCode)}`), // fg id
                     readExpression(reader, () => `after effect of ${OpcodeName(byteCode)}`), // effect
                  ];
                  break;
               case Opcode.LoadFG3:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image1 name
                  ];
                  skipPadding(reader, 4, () => `after fgname1 argument of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions.push(
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image2 name
                  );
                  skipPadding(reader, 4, () => `after fgname2 argument of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions.push(
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image3 name
                     readExpression(reader, () => `after dx1 argument of ${OpcodeName(byteCode)}`), // dx1
                     readExpression(reader, () => `after dx2 argument of ${OpcodeName(byteCode)}`), // dx2
                     readExpression(reader, () => `after dx3 argument of ${OpcodeName(byteCode)}`), // dx3
                     readExpression(reader, () => `after mode argument of ${OpcodeName(byteCode)}`), // mode
                  );
                  break;
               case Opcode.HideDialog:
               case Opcode.ShowDialog:
                  break;
               case Opcode.MarkChoiceId:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after a1 argument of ${OpcodeName(byteCode)}`), // a1
                     readExpression(reader, () => `after a2 argument of ${OpcodeName(byteCode)}`), // a2
                  ];
                  break;
               case Opcode.ShowChapter:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image name
                  ];
                  break;
               case Opcode.Delay:
                  opcodeInfo.expressions.push(
                     readExpression(reader, () => `after nFrame argument of ${OpcodeName(byteCode)}`), // nFrame
                  );
                  break;
               case Opcode.ShowClock:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after hour argument of ${OpcodeName(byteCode)}`), // hour
                     readExpression(reader, () => `after minute argument of ${OpcodeName(byteCode)}`), // minute
                  ];
                  break;
               case Opcode.StartAnim:
               case Opcode.CloseAnim:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after animId argument of ${OpcodeName(byteCode)}`), // animId
                  ];
                  break;
               case Opcode.MarkLocationId:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after a1 argument of ${OpcodeName(byteCode)}`), // a1
                  ];
                  break;
               case Opcode.LoadBGKeepFG:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // bg name
                     readExpression(reader, () => `after mode1 argument of ${OpcodeName(byteCode)}`), // mode1
                     readExpression(reader, () => `after mode2 argument of ${OpcodeName(byteCode)}`), // mode2
                  ];
                  break;
               case Opcode.Unk2B:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after a1 argument of ${OpcodeName(byteCode)}`), // a1
                  ];
                  break;
               case Opcode.UnlockImage:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // image name
                  ];
                  break;
               case Opcode.PlayMovie:
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readCASCII()), // video name
                  ];
                  break;
               case Opcode.Unk3B:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after a1 argument of ${OpcodeName(byteCode)}`), // a1
                  ];
                  break;
               case Opcode.Unk3C:
                  break;
               case Opcode.LoadBGCrop:
                  skipPadding(reader, 4, () => `at the beginning of ${OpcodeName(byteCode)}`);
                  opcodeInfo.expressions = [
                     createRawExpr(reader.readUInt16()).mapImage(imageNames), // bg name
                     readExpression(reader, () => `after mode1 argument of ${OpcodeName(byteCode)}`), // mode1
                     readExpression(reader, () => `after mode2 argument of ${OpcodeName(byteCode)}`), // mode2
                     readExpression(reader, () => `after x argument of ${OpcodeName(byteCode)}`), // x
                     readExpression(reader, () => `after y argument of ${OpcodeName(byteCode)}`), // y
                     readExpression(reader, () => `after hx argument of ${OpcodeName(byteCode)}`), // hx
                     readExpression(reader, () => `after hy argument of ${OpcodeName(byteCode)}`), // hy
                  ];
                  break;
               case Opcode.TweenZoom:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after x argument of ${OpcodeName(byteCode)}`), // x
                     readExpression(reader, () => `after y argument of ${OpcodeName(byteCode)}`), // y
                     readExpression(reader, () => `after hx argument of ${OpcodeName(byteCode)}`), // hx
                     readExpression(reader, () => `after hy argument of ${OpcodeName(byteCode)}`), // hy
                     readExpression(reader, () => `after duration argument of ${OpcodeName(byteCode)}`), // duration
                  ];
                  break;
               case Opcode.Unk43:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after a1 argument of ${OpcodeName(byteCode)}`), // a1
                  ];
                  break;
               case Opcode.OverlayMono:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after nFrame argument of ${OpcodeName(byteCode)}`), // nFrame
                     readExpression(reader, () => `after colorCode argument of ${OpcodeName(byteCode)}`), // colorCode
                  ];
                  break;
               case Opcode.SetDialogColor:
                  opcodeInfo.expressions = [
                     readExpression(reader, () => `after colorCode argument of ${OpcodeName(byteCode)}`), // colorCode
                  ];
                  break;
               default:
                  throw Error(`Unknown opcode: 0x${byteCode.toString(16)}.`);
            }
            return byteCode;
         }

         opcodeInfo.code = byteCode;
         opcodeInfo.position = opcodePos;
         opcodeInfo.bytecodes = reader.buffer.subarray(relOpcodePos, reader.pos);

         opcodeInfos.push(opcodeInfo);
      }
   } catch (err) {
      addContext(err, `Error occured at 0x${opcodePos.toString(16)}:`);
      throw err;
   }

   return opcodeInfos;
}
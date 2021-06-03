import { BufferTraverser } from '../../utils/buffer-wrapper';
import { readCStringExpr, readExpression, readRawByteExpr, readRawInt16Expr } from './read-expression';
import { MetaOpcode, MetaOpcodeName, Opcode, OpcodeInfo, OpcodeName, OpcodeType } from '../opcode';
import { parseTextualOpcodes } from './parse-textual-opcode';
import { skipMarker, skipPadding } from './skip-padding';
import { addContext } from '../../utils/error';
import { goAroundSpecialGotoIf } from './work-around';
import { ExpressionType } from '../expression';

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

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: OpcodeType = -1;
   let curByteCode = 0;

   try {
      while (!reader.atEOF()) {
         const opcodeInfo = new OpcodeInfo();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;
         curByteCode = reader.readByte();

         opcodeInfo.type = curOpcodeType = OpcodeType.MetaOpcode;
         switch (curByteCode) {
            case MetaOpcode.NoOp:
               break;
            case MetaOpcode.VarOp:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'left operand'),
                  readExpression(reader, 'assigment operator', true, 1),
               );
               opcodeInfo.expressions.push(
                  readExpression(reader, 'right operand'),
               );
               if (opcodeInfo.expressions[2].type === ExpressionType.Variable)
                  skipPadding(reader, 1);
               else if (opcodeInfo.expressions[2].type !== ExpressionType.Config)
                  skipPadding(reader, 2);
               break;
            case MetaOpcode.Command:
               opcodeInfo.type = curOpcodeType = OpcodeType.Opcode;
               parseCommand();
               break;
            case MetaOpcode.Goto:
               opcodeInfo.expressions.push(
                  readRawInt16Expr(reader, 'jump target'),
               );
               break;
            case MetaOpcode.GotoIf:
               skipMarker(reader, 1, 0x01);
               if (goAroundSpecialGotoIf(reader)) {
                  opcodeInfo.type = OpcodeType.Unknown;
                  break;
               }
               opcodeInfo.expressions.push(
                  readExpression(reader, 'left operand'),
                  readExpression(reader, 'comparison operator'),
               );
               skipMarker(reader, 1, 0x01);
               opcodeInfo.expressions.push(
                  readExpression(reader, 'right operand'),
               );
               skipMarker(reader, 1, 0x01);
               skipMarker(reader, 1, 0x00);
               opcodeInfo.switches = [[null, readRawInt16Expr(reader, 'jump target')]];
               break;
            case MetaOpcode.Sleep:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'argument', true),
               );
               break;
            case MetaOpcode.Switch: {
               opcodeInfo.expressions.push(readExpression(reader, 'expression to test', true, 1));
               let marker = skipMarker(reader, 2, 0x2700);
               opcodeInfo.switches = [];
               while (marker === 0x2700) {
                  opcodeInfo.switches.push([
                     readExpression(reader, 'case expression', true),
                     readRawInt16Expr(reader, 'jump target'),
                  ]);
                  marker = reader.readUInt16();
               }
               reader.pos -= 2;
               break;
            }
            case MetaOpcode.CallText: {
               const ordinal = readRawInt16Expr(reader, 'subroutine ordinal');
               opcodeInfo.switches = [[null, ordinal]];
               opcodeInfo.textualOpcodeInfos = parseTextualOpcodes(textualBytecodes.subarray(
                  textualIndexes[ordinal.value as number] - textualIndexes[0],
                  textualIndexes[ordinal.value as number + 1] - textualIndexes[0]
               ), textualIndexes[ordinal.value as number]);
               break;
            }
            case MetaOpcode.MUnk28:
            case MetaOpcode.MUnk06:
               break;
            case MetaOpcode.MUnk0D:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'a1', true),
                  readRawInt16Expr(reader, 'a2'),
               );
               break;
            case MetaOpcode.MUnk12:
            case MetaOpcode.MUnk13:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'a1', true),
               );
               break;
            case MetaOpcode.MUnk15:
               opcodeInfo.expressions.push(
                  readRawByteExpr(reader, 'a1'),
                  readExpression(reader, 'a2', true),
                  readExpression(reader, 'a3', true),
                  readRawInt16Expr(reader, 'a4'),
               );
               break;
            case MetaOpcode.MUnk19:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'a1', true),
                  readExpression(reader, 'a2', true),
               );
               break;
            default:
               throw Error(`Unknown meta opcode: 0x${curByteCode.toString(16)}.`);
         }

         // eslint-disable-next-line no-inner-declarations
         function parseCommand(): void {
            curByteCode = reader.readByte();
            switch (curByteCode) {
               case Opcode.ToFile:
                  opcodeInfo.expressions.push(readCStringExpr(reader, 'script name'));
                  break;
               case Opcode.PlayBGM:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'bgm name', true).mapMusic(),
                     readExpression(reader, 'bgm volume', true),
                  );
                  break;
               case Opcode.StopBGM:
                  break;
               case Opcode.PlaySFX:
                  opcodeInfo.expressions.push(
                     readCStringExpr(reader, 'sfx name'),
                     readExpression(reader, 'unk', true),
                     readExpression(reader, 'sfx volume', true),
                  );
                  break;
               case Opcode.StopSFX:
               case Opcode.WaitSFX:
                  break;
               case Opcode.PlayVoice:
                  opcodeInfo.expressions.push(readCStringExpr(reader, 'voice name'));
                  break;
               case Opcode.Unk09:
                  break;
               case Opcode.LoadBG:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames),
                     readExpression(reader, 'mode1', true),
                     readExpression(reader, 'mode2', true),
                  );
                  break;
               case Opcode.RemoveBG:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'target color', true),
                     readExpression(reader, 'mode1', true),
                     readExpression(reader, 'mode2', true),
                  );
                  break;
               case Opcode.LoadFG:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'fg id', true),
                  );
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames),
                     readExpression(reader, 'horizontal position', true),
                     readExpression(reader, 'mode', true),
                  );
                  break;
               case Opcode.RemoveFG:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'fg id', true),
                     readExpression(reader, 'mode', true),
                  );
                  break;
               case Opcode.LoadFG2:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'fg id1', true),
                     readExpression(reader, 'fg id2', true),
                  );
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image1 name').mapImage(imageNames),
                  );
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image2 name').mapImage(imageNames),
                     readExpression(reader, 'dx1', true),
                     readExpression(reader, 'dx2', true),
                     readExpression(reader, 'mode', true),
                  );
                  break;
               case Opcode.RemoveFG2:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'sum of ids'),
                     readRawInt16Expr(reader, 'unk'),
                     readExpression(reader, 'mode', true),
                  );
                  break;
               case Opcode.SetFGOrder:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'fg id1 Depth', true),
                     readExpression(reader, 'fg id2 Depth', true),
                     readExpression(reader, 'fg id4 Depth', true),
                  );
                  break;
               case Opcode.AffectFG:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'fg id', true),
                     readExpression(reader, 'effect', true),
                  );
                  break;
               case Opcode.LoadFG3:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image1 name').mapImage(imageNames),
                  );
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image2 name').mapImage(imageNames),
                  );
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image3 name').mapImage(imageNames),
                     readExpression(reader, 'dx1', true),
                     readExpression(reader, 'dx2', true),
                     readExpression(reader, 'dx3', true),
                     readExpression(reader, 'mode', true),
                  );
                  break;
               case Opcode.HideDialog:
               case Opcode.ShowDialog:
                  break;
               case Opcode.MarkChoiceId:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                     readExpression(reader, 'a2', true),
                  );
                  break;
               case Opcode.ShowChapter:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames),
                  );
                  break;
               case Opcode.Delay:
                  // this can be actually a wait-interaction command 
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'nFrame', true),
                  );
                  break;
               case Opcode.ShowClock:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'hour', true),
                     readExpression(reader, 'minute', true),
                  );
                  break;
               case Opcode.StartAnim:
               case Opcode.CloseAnim:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'animId', true),
                  );
                  break;
               case Opcode.MarkLocationId:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                  );
                  break;
               case Opcode.LoadBGKeepFG:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'bg name').mapImage(imageNames),
                     readExpression(reader, 'mode1', true),
                     readExpression(reader, 'mode2', true),
                  );
                  break;
               case Opcode.Unk2B:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                  );
                  break;
               case Opcode.UnlockImage:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames),
                  );
                  break;
               case Opcode.PlayMovie:
                  opcodeInfo.expressions.push(
                     readCStringExpr(reader, 'video name'),
                  );
                  break;
               case Opcode.Unk3B:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                  );
                  break;
               case Opcode.Unk3C:
                  break;
               case Opcode.LoadBGCrop:
                  skipPadding(reader, 4);
                  opcodeInfo.expressions.push(
                     readRawInt16Expr(reader, 'bg name').mapImage(imageNames),
                     readExpression(reader, 'mode1', true),
                     readExpression(reader, 'mode2', true),
                     readExpression(reader, 'x', true),
                     readExpression(reader, 'y', true),
                     readExpression(reader, 'hx', true),
                     readExpression(reader, 'hy', true),
                  );
                  break;
               case Opcode.TweenZoom:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'x', true),
                     readExpression(reader, 'y', true),
                     readExpression(reader, 'hx', true),
                     readExpression(reader, 'hy', true),
                     readExpression(reader, 'duration', true),
                  );
                  break;
               case Opcode.Unk43:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                  );
                  break;
               case Opcode.OverlayMono:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'nFrame', true),
                     readExpression(reader, 'colorCode', true),
                  );
                  break;
               case Opcode.SetDialogColor:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'colorCode', true),
                  );
                  break;
               default:
                  throw Error(`Unknown opcode: 0x${curByteCode.toString(16)}.`);
            }
         }

         opcodeInfo.code = curByteCode;
         opcodeInfo.position = curOpcodePos;
         opcodeInfo.bytecodes = reader.buffer.subarray(curRelOpcodePos, reader.pos);

         opcodeInfos.push(opcodeInfo);

         curOpcodeType = -1;
      }
   } catch (err) {
      if (curOpcodeType === OpcodeType.MetaOpcode)
         addContext(err, ` at MetaOpcode.${MetaOpcodeName(curByteCode)}`);
      else if (curOpcodeType === OpcodeType.Opcode)
         addContext(err, ` at Opcode.${OpcodeName(curByteCode)}`);
      addContext(err, ` at position 0x${curOpcodePos.toString(16)}`);
      throw err;
   }

   return opcodeInfos;
}
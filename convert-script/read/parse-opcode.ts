/* eslint-disable no-inner-declarations */
import { BufferTraverser } from '../../utils/buffer-wrapper';
import { readCStringExpr, readExpression, readRawByteExpr, readRawInt16Expr } from './read-expression';
import { FlowOpcode, FlowOpcodeName, MetaOpcode, MetaOpcodeName, Opcode, OpcodeInfo, OpcodeName, OpcodeType } from '../opcode';
import { parseTextualOpcodes } from './parse-textual-opcode';
import { skipMarker, skipPadding } from './skip-padding';
import { addContext } from '../../utils/error';
import { goAroundSpecialGotoIf } from './work-around';
import { ExpressionType } from '../expression';
import { ENUM_MAP } from '../write/variable_map';

type Params = {
   bytecodes: Buffer,
   labels: number[],
   textualIndexes: number[],
   textualBytecodes: Buffer,
   imageNames: string[],
};

export function parseOpcodes({ bytecodes, labels, textualIndexes, textualBytecodes, imageNames }: Params): OpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodeInfos: OpcodeInfo[] = [];

   const pos = labels[0];

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: OpcodeType = -1;
   let curByteCode = 0;

   try {
      while (!reader.eof()) {
         const opcodeInfo = new OpcodeInfo();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;
         curByteCode = reader.readByte();

         opcodeInfo.type = curOpcodeType = OpcodeType.MetaOpcode;

         switch (curByteCode) {
            case MetaOpcode.Flow:
               opcodeInfo.type = curOpcodeType = OpcodeType.FlowOpcode;
               if (!reader.eof())
                  parseFlow();
               break;
            case MetaOpcode.Variable: {
               opcodeInfo.expressions.push(
                  readExpression(reader, 'left operand'),
                  readExpression(reader, 'assigment operator', true, 1),
               );
               opcodeInfo.expressions.push(
                  readExpression(reader, 'right operand'),
               );
               if (opcodeInfo.expressions[2].type === ExpressionType.Variable)
                  skipPadding(reader, 1);
               else if (opcodeInfo.expressions[2].type === ExpressionType.FunctionCall)
                  skipPadding(reader, 1);
               else if (opcodeInfo.expressions[2].type === ExpressionType.RGB) {
                  skipPadding(reader, 1);
                  skipPadding(reader, 2);
               }
               else if (opcodeInfo.expressions[2].type !== ExpressionType.Config)
                  skipPadding(reader, 2);

               const assignee = opcodeInfo.expressions[2];
               const variable = opcodeInfo.expressions[0];
               if (assignee.type === ExpressionType.Const)
                  assignee.name = ENUM_MAP[variable.name]?.[assignee.value as number] ?? assignee.name;
               break;
            }
            case MetaOpcode.Command:
               opcodeInfo.type = curOpcodeType = OpcodeType.Opcode;
               parseCommand();
               break;
            case MetaOpcode.Text: {
               const ordinal = readRawInt16Expr(reader, 'subroutine ordinal');
               opcodeInfo.switches = [[null, ordinal]];
               const pos = textualIndexes[ordinal.value as number];
               const begin = textualIndexes[ordinal.value as number] - textualIndexes[0];
               let end = textualIndexes[ordinal.value as number + 1] - textualIndexes[0];
               if (isNaN(end))
                  end = undefined;
               opcodeInfo.textualOpcodeInfos = parseTextualOpcodes(
                  textualBytecodes.subarray(begin, end),
                  pos
               );
               break;
            }
            default:
               throw Error(`Unknown meta opcode: 0x${curByteCode.toString(16)}.`);
         }

         function parseFlow(): void {
            curByteCode = reader.readByte();
            switch (curByteCode) {
               case FlowOpcode.End:
                  break;
               case FlowOpcode.Goto:
                  opcodeInfo.switches = [[null, readRawInt16Expr(reader, 'jump target').mapOffset(labels)]];
                  break;
               case FlowOpcode.GotoIf:
                  skipMarker(reader, 1, 0x01);
                  if (goAroundSpecialGotoIf(reader)) {
                     opcodeInfo.type = OpcodeType.UnknownGotoIf;
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
                  opcodeInfo.switches = [[null, readRawInt16Expr(reader, 'jump target').mapOffset(labels)]];
                  break;
               case FlowOpcode.Sleep:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'argument', true),
                  );
                  break;
               case FlowOpcode.Switch: {
                  opcodeInfo.expressions.push(readExpression(reader, 'expression to test', true, 1));
                  const expr = opcodeInfo.expressions[0];
                  const enumConfig = ENUM_MAP[expr.name] ?? {};
                  let marker = skipMarker(reader, 2, 0x2700);
                  opcodeInfo.switches = [];
                  while (marker === 0x2700) {
                     opcodeInfo.switches.push([
                        readExpression(reader, 'case expression', true),
                        readRawInt16Expr(reader, 'jump target').mapOffset(labels),
                     ]);
                     const cond = opcodeInfo.switches[opcodeInfo.switches.length - 1][0];
                     cond.name = enumConfig[cond.value as number] ?? cond.name;
                     marker = reader.readUInt16();
                  }
                  reader.pos -= 2;
                  break;
               }
               case FlowOpcode.MUnk28:
               case FlowOpcode.MUnk06:
                  break;
               case FlowOpcode.MUnk0D:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                     readRawInt16Expr(reader, 'a2'),
                  );
                  break;
               case FlowOpcode.MUnk12:
               case FlowOpcode.MUnk13:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                  );
                  break;
               case FlowOpcode.MUnk15:
                  opcodeInfo.expressions.push(
                     readRawByteExpr(reader, 'a1'),
                     readExpression(reader, 'a2', true),
                     readExpression(reader, 'a3', true),
                     readRawInt16Expr(reader, 'a4'),
                  );
                  break;
               case FlowOpcode.MUnk19:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'a1', true),
                     readExpression(reader, 'a2', true),
                  );
                  break;
               default:
                  throw Error(`Unknown flow opcode: 0x${curByteCode.toString(16)}.`);
            }
         }

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
               case Opcode.WaitVoice:
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
               case Opcode.RemoveFG3:
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'sum of ids').mapArgument(curByteCode, 0),
                  );
                  skipMarker(reader, 2, 0x0004);
                  opcodeInfo.expressions.push(
                     readExpression(reader, 'mode', true).mapArgument(curByteCode, 1),
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
                     readExpression(reader, 'fg id', true).mapArgument(curByteCode, 0),
                     readExpression(reader, 'effect', true).mapArgument(curByteCode, 1),
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
                     readExpression(reader, 'animId', true).mapArgument(curByteCode, 0),
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
                     readExpression(reader, 'colorCode', true).mapArgument(curByteCode, 0),
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
      else if (curOpcodeType === OpcodeType.FlowOpcode)
         addContext(err, ` at FlowOpcode.${FlowOpcodeName(curByteCode)}`);
      else if (curOpcodeType === OpcodeType.Opcode)
         addContext(err, ` at Opcode.${OpcodeName(curByteCode)}`);
      addContext(err, ` at position 0x${curOpcodePos.toString(16)}`);
      throw err;
   }

   return opcodeInfos;
}
/* eslint-disable no-inner-declarations */
import { BufferTraverser } from '../../utils/buffer-wrapper';
import { createRawExpr, readCStringExpr, readExpressions, readRawByteExpr, readRawInt16Expr } from './read-expression';
import { FlowOpcode, FlowOpcodeName, MetaOpcode, MetaOpcodeName, Opcode, OpcodeName } from '../opcode';
import { parseTextualInstructions } from './parse-textual-opcode';
import { skipMarker, skipPadding } from './skip-padding';
import { addContext } from '../../utils/error';
import { ExpressionType } from '../expression';
import { Instruction, InstructionType } from '../instruction';
import { makeHexPad2 } from '../../utils/string';
import { ENUM_MAP } from './variable_map';

type Params = {
   bytecodes: Buffer,
   labels: number[],
   textualIndexes: number[],
   textualBytecodes: Buffer,
   imageNames: string[],
};

export function parseInstructions(params: Params): Instruction[] {
   const { bytecodes, labels, textualIndexes, textualBytecodes, imageNames } = params;
   const reader = new BufferTraverser(bytecodes);
   const instructions: Instruction[] = [];

   const labelSet = new Set(labels);

   const pos = labels[0];

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: InstructionType = -1;
   let curByteCode = 0;

   try {
      while (!reader.eof()) {
         const instruction = new Instruction();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;
         curByteCode = reader.readByte();

         instruction.type = curOpcodeType = InstructionType.Meta;

         switch (curByteCode) {
            case MetaOpcode.Flow:
               instruction.type = curOpcodeType = InstructionType.Flow;
               if (!reader.eof())
                  parseFlow();
               break;
            case MetaOpcode.Variable: {
               instruction.expressions = readExpressions(reader, 'variable expression');
               const variable = instruction.expressions[0];
               if (variable.type !== ExpressionType.VariableRef)
                  throw Error(`Expected VariableRef expression but got 0x${makeHexPad2(variable.type)}.`);
               const assignee = instruction.expressions[2];
               if (assignee.type === ExpressionType.Const)
                  assignee.name = ENUM_MAP[variable.name]?.[assignee.value as number] ?? assignee.name;
               break;
            }
            case MetaOpcode.Command:
               instruction.type = curOpcodeType = InstructionType.Opcode;
               parseCommand();
               break;
            case MetaOpcode.Text: {
               const ordinal = readRawInt16Expr(reader, 'subroutine ordinal');
               instruction.switches = [[null, ordinal]];
               const pos = textualIndexes[ordinal.value as number];
               const begin = textualIndexes[ordinal.value as number] - textualIndexes[0];
               let end = textualIndexes[ordinal.value as number + 1] - textualIndexes[0];
               if (isNaN(end))
                  end = undefined;
               instruction.textualInstructions = parseTextualInstructions(textualBytecodes.subarray(begin, end), pos);
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
                  instruction.switches = [[
                     null, readRawInt16Expr(reader, 'jump target').mapOffset(labels, 'jump target')
                  ]];
                  break;
               case FlowOpcode.GotoIf:
                  skipMarker(reader, 1, 0x01);
                  instruction.expressions = readExpressions(reader, 'comparison');
                  instruction.switches = [[
                     null, readRawInt16Expr(reader, 'jump target').mapOffset(labels, 'jump target')
                  ]];
                  break;
               case FlowOpcode.Delay:
                  instruction.expressions = readExpressions(reader, 'duration');
                  break;
               case FlowOpcode.Switch: {
                  instruction.expressions = readExpressions(reader, 'expression to test');
                  const expr = instruction.expressions[0];
                  const enumConfig = ENUM_MAP[expr.name] ?? {};
                  let marker = skipMarker(reader, 2, 0x2700);
                  while (marker === 0x2700) {
                     instruction.switches.push([
                        readExpressions(reader, 'case expression'),
                        readRawInt16Expr(reader, 'jump target').mapOffset(labels, 'jump target'),
                     ]);
                     const cond = instruction.switches[instruction.switches.length - 1][0][0];
                     cond.name = enumConfig[cond.value as number] ?? cond.name;
                     marker = reader.readUInt16();
                  }
                  reader.pos -= 2;
                  break;
               }
               case FlowOpcode.Suspend:
                  break;
               case FlowOpcode.Call:
                  if (readExpressions(reader, 'scriptIndex')[0].value !== 1)
                     throw Error('Expected expression value 1 as argument 1.');
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'labelOrdinal'),
                  );
                  break;
               case FlowOpcode.TurnFlagOn:
               case FlowOpcode.TurnFlagOff:
                  instruction.expressions = readExpressions(reader, 'flagIndex');
                  break;
               case FlowOpcode.TurnFlag25On:
                  break;
               case FlowOpcode.GotoIfFlag:
                  instruction.expressions.push(
                     readRawByteExpr(reader, 'left operand'),
                     createRawExpr([
                        readExpressions(reader, 'bit mask')[0].value as number,
                        readExpressions(reader, 'mode')[0].value as number,
                     ]),
                  );
                  instruction.switches = [[
                     null, readRawInt16Expr(reader, 'jump target').mapOffset(labels, 'jump target')
                  ]];
                  break;
               case FlowOpcode.TurnMode:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'a1'),
                     ...readExpressions(reader, 'a2'),
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
                  instruction.expressions.push(readCStringExpr(reader, 'script name'));
                  break;
               case Opcode.PlayBGM:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'bgm name'),
                     ...readExpressions(reader, 'bgm volume'),
                  );
                  instruction.expressions[0].mapMusic();
                  break;
               case Opcode.StopBGM:
                  break;
               case Opcode.PlaySFX:
                  instruction.expressions.push(
                     readCStringExpr(reader, 'sfx name'),
                  );
                  readExpressions(reader, 'don\'t loop'); // useless param
                  instruction.expressions.push(
                     ...readExpressions(reader, 'sfx volume'),
                  );
                  break;
               case Opcode.StopSFX:
               case Opcode.WaitSFX:
                  break;
               case Opcode.PlayVoice:
                  instruction.expressions.push(readCStringExpr(reader, 'voice name'));
                  break;
               case Opcode.WaitVoice:
                  break;
               case Opcode.LoadBG:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames, 'image name'),
                     ...readExpressions(reader, 'mode1'),
                     ...readExpressions(reader, 'mode2'),
                  );
                  break;
               case Opcode.RemoveBG:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'target color'),
                     ...readExpressions(reader, 'mode1'),
                     ...readExpressions(reader, 'mode2'),
                  );
                  break;
               case Opcode.LoadFG:
                  instruction.expressions = readExpressions(reader, 'fg id');
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames, 'image name'),
                     ...readExpressions(reader, 'horizontal position'),
                     ...readExpressions(reader, 'mode'),
                  );
                  break;
               case Opcode.RemoveFG:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'fg id'),
                     ...readExpressions(reader, 'mode'),
                  );
                  break;
               case Opcode.LoadFG2:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'fg id1'),
                     ...readExpressions(reader, 'fg id2'),
                  );
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image1 name').mapImage(imageNames, 'image1 name'),
                  );
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image2 name').mapImage(imageNames, 'image2 name'),
                     ...readExpressions(reader, 'dx1'),
                     ...readExpressions(reader, 'dx2'),
                     ...readExpressions(reader, 'mode'),
                  );
                  break;
               case Opcode.RemoveFG3:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'sum of ids'),
                     ...readExpressions(reader, 'mode'),
                  );
                  break;
               case Opcode.SetFGOrder:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'fg id1 Depth'),
                     ...readExpressions(reader, 'fg id2 Depth'),
                     ...readExpressions(reader, 'fg id4 Depth'),
                  );
                  break;
               case Opcode.AffectFG:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'fg id'),
                     ...readExpressions(reader, 'effect'),
                  );
                  break;
               case Opcode.LoadFG3:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image1 name').mapImage(imageNames, 'image1 name'),
                  );
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image2 name').mapImage(imageNames, 'image2 name'),
                  );
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image3 name').mapImage(imageNames, 'image3 name'),
                     ...readExpressions(reader, 'dx1'),
                     ...readExpressions(reader, 'dx2'),
                     ...readExpressions(reader, 'dx3'),
                     ...readExpressions(reader, 'mode'),
                  );
                  break;
               case Opcode.HideDialog:
               case Opcode.ShowDialog:
                  break;
               case Opcode.MarkChoiceId:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'a1'),
                     ...readExpressions(reader, 'a2'),
                  );
                  break;
               case Opcode.ShowChapter:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames, 'image name'),
                  );
                  break;
               case Opcode.Delay:
                  // this can be actually a wait-interaction command 
                  instruction.expressions = readExpressions(reader, 'nFrame');
                  break;
               case Opcode.ShowClock:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'hour'),
                     ...readExpressions(reader, 'minute'),
                  );
                  break;
               case Opcode.StartAnim:
               case Opcode.CloseAnim:
                  instruction.expressions = readExpressions(reader, 'animId');
                  break;
               case Opcode.MarkLocationId:
                  instruction.expressions = readExpressions(reader, 'a1');
                  break;
               case Opcode.LoadBGKeepFG:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'bg name').mapImage(imageNames, 'bg name'),
                     ...readExpressions(reader, 'mode1'),
                     ...readExpressions(reader, 'mode2'),
                  );
                  break;
               case Opcode.Unk2B:
                  instruction.expressions = readExpressions(reader, 'a1');
                  break;
               case Opcode.UnlockImage:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'image name').mapImage(imageNames, 'image name'),
                  );
                  break;
               case Opcode.OpenMovie:
                  instruction.expressions.push(
                     readCStringExpr(reader, 'video name'),
                  );
                  break;
               case Opcode.StopMovie:
                  break;
               case Opcode.SetMovieRect:
                  instruction.expressions = readExpressions(reader, 'a1');
                  break;
               case Opcode.PlayMovie:
                  break;
               case Opcode.LoadBGCrop:
                  skipPadding(reader, 4);
                  instruction.expressions.push(
                     readRawInt16Expr(reader, 'bg name').mapImage(imageNames, 'bg name'),
                     ...readExpressions(reader, 'mode1'),
                     ...readExpressions(reader, 'mode2'),
                     ...readExpressions(reader, 'x'),
                     ...readExpressions(reader, 'y'),
                     ...readExpressions(reader, 'hx'),
                     ...readExpressions(reader, 'hy'),
                  );
                  break;
               case Opcode.ChangeBGCrop:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'x'),
                     ...readExpressions(reader, 'y'),
                     ...readExpressions(reader, 'hx'),
                     ...readExpressions(reader, 'hy'),
                     ...readExpressions(reader, 'duration'),
                  );
                  break;
               case Opcode.SetVolume:
                  instruction.expressions = readExpressions(reader, 'a1');
                  break;
               case Opcode.OverlayMono:
                  instruction.expressions.push(
                     ...readExpressions(reader, 'nFrame'),
                     ...readExpressions(reader, 'colorCode'),
                  );
                  break;
               case Opcode.SetDialogColor:
                  instruction.expressions = readExpressions(reader, 'colorCode');
                  break;
               default:
                  throw Error(`Unknown opcode: 0x${curByteCode.toString(16)}.`);
            }
         }

         instruction.code = curByteCode;
         instruction.position = curOpcodePos;
         instruction.bytecodes = reader.buffer.subarray(curRelOpcodePos, reader.pos);
         instruction.labeled = labelSet.has(instruction.position);

         if (curOpcodeType === InstructionType.Flow) {
            for (let i = 0; i < instruction.expressions.length; i++)
               instruction.expressions[i].mapFlowArgument(curByteCode as never, i);
         }
         else if (curOpcodeType === InstructionType.Opcode) {
            for (let i = 0; i < instruction.expressions.length; i++)
               instruction.expressions[i].mapArgument(curByteCode as never, i);
         }

         instructions.push(instruction);

         curOpcodeType = -1;
      }
   } catch (err) {
      if (curOpcodeType === InstructionType.Meta)
         addContext(err, ` at MetaOpcode.${MetaOpcodeName(curByteCode)}`);
      else if (curOpcodeType === InstructionType.Flow)
         addContext(err, ` at FlowOpcode.${FlowOpcodeName(curByteCode)}`);
      else if (curOpcodeType === InstructionType.Opcode)
         addContext(err, ` at Opcode.${OpcodeName(curByteCode)}`);
      addContext(err, ` at position 0x${curOpcodePos.toString(16)}`);
      throw err;
   }

   return instructions;
}
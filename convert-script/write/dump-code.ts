import fs from 'fs';
import { File, BinaryWriter } from 'csbinary';
import { makeHexPad16, makeHexPad2 } from '../../utils/string';
import { Expression, ExpressionType } from '../expression';
import { Instruction, InstructionType, TextualInstructionType } from '../instruction';
import { FlowOpcode, MetaOpcode, Opcode, OpcodeName, TextualOpcode, TextualOpcodeName } from '../opcode';
import { OPERATOR_MAP } from './operator-map';

function generateExprStr(exprs: Expression[], separator = ' '): string {
   const exprStrArr: string[] = [];
   for (const expr of exprs) {
      switch (expr.type) {
         case ExpressionType.VariableRef:
         case ExpressionType.VariableRef2:
            exprStrArr.push(expr.name);
            break;
         case ExpressionType.Operator:
            exprStrArr.push(OPERATOR_MAP[expr.operator]);
            break;
         case ExpressionType.Const:
            if (expr.name != null)
               exprStrArr.push(expr.name);
            else if (Array.isArray(expr.value))
               exprStrArr.push(`(${expr.value})`);
            else
               exprStrArr.push(`${expr.value}`);
            break;
         case ExpressionType.FunctionCall:
            exprStrArr.push(`${expr.name}(${generateExprStr(expr.args, ',')})`);
            break;
         case ExpressionType.RGBA:
            exprStrArr.push(`rgba(${expr.value})`);
            break;
         case ExpressionType.Config: {
            exprStrArr.push(`config(${expr.value})`);
            break;
         }
      }
   }
   return exprStrArr.join(separator);
}

function createFileForWriting(path: string): BinaryWriter {
   return new BinaryWriter(File(fs.openSync(path, 'w')), 'utf8');
}

function writeString(hdl: BinaryWriter, str: string): void {
   hdl.writeRawString(str);
}

function closeFile(hdl: BinaryWriter): void {
   hdl.close();
}

export function dumpCode(instructions: Instruction[], outputPath: string): void {
   const hdl = createFileForWriting(outputPath);

   for (const instruction of instructions) {
      // offset tag and hex dump
      writeString(hdl, '[');
      if (instruction.labeled)
         writeString(hdl, 'labeled:');
      writeString(hdl, `${makeHexPad16(instruction.position)}]`);
      writeString(hdl, [...instruction.bytecodes].map(b => makeHexPad2(b)).join(' '));
      writeString(hdl, ': ');

      // pseudo-code
      if (instruction.type === InstructionType.Meta) {
         switch (instruction.code) {
            case MetaOpcode.Variable:
               writeString(hdl, `${generateExprStr(instruction.expressions)}`);
               break;
            case MetaOpcode.Text:
               writeString(hdl, 'text\n');
               writeString(hdl, `__[${makeHexPad16(instruction.textualInstructions[0].position)}]`);
               for (const textInstruction of instruction.textualInstructions) {
                  if (textInstruction.type === TextualInstructionType.Text)
                     writeString(hdl, textInstruction.text);
                  else switch (textInstruction.code) {
                     case TextualOpcode.Style:
                        switch (textInstruction.expressions[0].value) {
                           case 0:
                              writeString(hdl, '{Emphasized}');
                              break;
                           case 1:
                              writeString(hdl, '{Normal}');
                              break;
                           case 4:
                              writeString(hdl, '{ResetStyle}');
                              break;
                           default:
                              writeString(hdl, '{StyleError}');
                        }
                        break;
                     case TextualOpcode.Choice:
                        writeString(hdl, `{${TextualOpcodeName(textInstruction.code)} ${textInstruction.expressions[0].value}\n`);
                        for (const [cond, text] of textInstruction.choices) {
                           if (cond != null)
                              writeString(hdl, `<${generateExprStr(cond)}>`);
                           writeString(hdl, text);
                        }
                        writeString(hdl, '}');
                        break;
                     default:
                        writeString(hdl, `{${TextualOpcodeName(textInstruction.code)}`);
                        if (textInstruction.expressions.length > 0)
                           writeString(hdl, ` ${generateExprStr(textInstruction.expressions)}`);
                        writeString(hdl, '}');
                        break;
                  }
               }
               writeString(hdl, '\n');
               break;
         }
      }
      else if (instruction.type === InstructionType.Flow) {
         switch (instruction.code) {
            case FlowOpcode.End:
               break;
            case FlowOpcode.Goto:
               writeString(hdl, `goto ${makeHexPad16(instruction.switches[0][1].target)}`);
               break;
            case FlowOpcode.GotoIf:
               writeString(hdl, `if ${generateExprStr(instruction.expressions)} `);
               writeString(hdl, `goto ${makeHexPad16(instruction.switches[0][1].target)}`);
               break;
            case FlowOpcode.Switch: {
               writeString(hdl, `switch ${generateExprStr(instruction.expressions)}\n`);
               for (const [[{ value, name }], { target }] of instruction.switches)
                  writeString(hdl, `case ${name ?? value} goto ${makeHexPad16(target)}\n`);
               break;
            }
            case FlowOpcode.Delay:
               writeString(hdl, `delay ${instruction.expressions[0].value}`);
               break;
            case FlowOpcode.Suspend:
               writeString(hdl, 'suspend');
               break;
            case FlowOpcode.Call:
               writeString(hdl, `call_system ${generateExprStr(instruction.expressions)}`);
               break;
            case FlowOpcode.TurnFlagOff:
               writeString(hdl, `turn_off ${generateExprStr(instruction.expressions)}`);
               break;
            case FlowOpcode.TurnFlagOn:
               writeString(hdl, `turn_on ${generateExprStr(instruction.expressions)}`);
               break;
            case FlowOpcode.TurnFlag25On:
               writeString(hdl, 'turn_on 37');
               break;
            case FlowOpcode.TurnMode:
               writeString(hdl, `turn_mode ${generateExprStr(instruction.expressions)}`);
               break;
            case FlowOpcode.GotoIfFlag:
               writeString(hdl, 'if_flag ');
               writeString(hdl, generateExprStr([instruction.expressions[1]]));
               writeString(hdl, ` = ${generateExprStr([instruction.expressions[0]])} `);
               writeString(hdl, `goto ${makeHexPad16(instruction.switches[0][1].target)}`);
               break;
            default:
               writeString(hdl, `flow_unk_${makeHexPad2(instruction.code)}`);
               if (instruction.expressions.length > 0)
                  writeString(hdl, ` ${generateExprStr(instruction.expressions)}`);
         }
      }
      else if (instruction.type === InstructionType.Opcode) {
         writeString(hdl, OpcodeName(instruction.code as Opcode));
         if (instruction.expressions.length > 0)
            writeString(hdl, ` ${generateExprStr(instruction.expressions)}`);
      }
      writeString(hdl, '\n');
   }

   closeFile(hdl);
}
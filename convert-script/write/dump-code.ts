import fs from 'fs';
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
            exprStrArr.push(expr.name ?? expr.value.toString());
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

export function dumpCode(instructions: Instruction[], outputPath: string): void {
   const fd = fs.openSync(outputPath, 'w');

   for (const instruction of instructions) {
      // offset tag and hex dump
      fs.writeSync(fd, '[');
      if (instruction.labeled)
         fs.writeSync(fd, 'labeled:');
      fs.writeSync(fd, `${makeHexPad16(instruction.position)}]`);
      fs.writeSync(fd, [...instruction.bytecodes].map(b => makeHexPad2(b)).join(' '));
      fs.writeSync(fd, ': ');

      // pseudo-code
      if (instruction.type === InstructionType.Meta) {
         switch (instruction.code) {
            case MetaOpcode.Variable:
               fs.writeSync(fd, `${generateExprStr(instruction.expressions)}`);
               break;
            case MetaOpcode.Text:
               fs.writeSync(fd, 'text\n');
               fs.writeSync(fd, `__[${makeHexPad16(instruction.textualInstructions[0].position)}]`);
               for (const textInstruction of instruction.textualInstructions) {
                  if (textInstruction.type === TextualInstructionType.Text)
                     fs.writeSync(fd, textInstruction.text);
                  else switch (textInstruction.code) {
                     case TextualOpcode.Style:
                        switch (textInstruction.expressions[0].value) {
                           case 0:
                              fs.writeSync(fd, '{Emphasized}');
                              break;
                           case 1:
                              fs.writeSync(fd, '{Normal}');
                              break;
                           case 4:
                              fs.writeSync(fd, '{ResetStyle}');
                              break;
                           default:
                              fs.writeSync(fd, '{StyleError}');
                        }
                        break;
                     case TextualOpcode.Choice:
                        fs.writeSync(fd, `{${TextualOpcodeName(textInstruction.code)} ${textInstruction.expressions[0].value}\n`);
                        for (const [cond, text] of textInstruction.choices) {
                           if (cond != null)
                              fs.writeSync(fd, `<${generateExprStr(cond)}>`);
                           fs.writeSync(fd, text);
                        }
                        fs.writeSync(fd, '}');
                        break;
                     default:
                        fs.writeSync(fd, `{${TextualOpcodeName(textInstruction.code)}`);
                        if (textInstruction.expressions.length > 0)
                           fs.writeSync(fd, ` ${generateExprStr(textInstruction.expressions)}`);
                        fs.writeSync(fd, '}');
                        break;
                  }
               }
               fs.writeSync(fd, '\n');
               break;
         }
      }
      else if (instruction.type === InstructionType.Flow) {
         switch (instruction.code) {
            case FlowOpcode.End:
               break;
            case FlowOpcode.Goto:
               fs.writeSync(fd, `goto ${makeHexPad16(instruction.switches[0][1].target)}`);
               break;
            case FlowOpcode.GotoIf:
               fs.writeSync(fd, `if ${generateExprStr(instruction.expressions)} `);
               fs.writeSync(fd, `goto ${makeHexPad16(instruction.switches[0][1].target)}`);
               break;
            case FlowOpcode.Switch: {
               fs.writeSync(fd, `switch ${generateExprStr(instruction.expressions)}\n`);
               for (const [[{ value, name }], { target }] of instruction.switches)
                  fs.writeSync(fd, `case ${name ?? value} goto ${makeHexPad16(target)}\n`);
               break;
            }
            case FlowOpcode.Sleep:
               fs.writeSync(fd, `sleep ${instruction.expressions[0].value}`);
               break;
            default:
               fs.writeSync(fd, `flow_unk_${makeHexPad2(instruction.code)}`);
               if (instruction.expressions.length > 0)
                  fs.writeSync(fd, ` ${generateExprStr(instruction.expressions)}`);
         }
      }
      else if (instruction.type === InstructionType.Opcode) {
         switch (instruction.code) {
            case Opcode.SetFGOrder: {
               fs.writeSync(fd, OpcodeName(instruction.code as Opcode));
               fs.writeSync(fd, ' ');
               const code = instruction.expressions.map(e => e.value as number).toString();
               switch (code) {
                  // every values used in script 
                  case '0,1,2':
                     fs.writeSync(fd, '4 2 1');
                     break;
                  case '0,2,1':
                     fs.writeSync(fd, '2 4 1');
                     break;
                  case '1,0,2':
                     fs.writeSync(fd, '4 1 2');
                     break;
                  case '1,2,0':
                     fs.writeSync(fd, '1 4 2');
                     break;
                  case '2,0,1':
                     fs.writeSync(fd, '2 1 4');
                     break;
                  case '2,1,0':
                     fs.writeSync(fd, '1 2 4');
                     break;
                  case '0,1,255':
                     fs.writeSync(fd, '4 2 1');
                     break;
                  case '1,0,255':
                     fs.writeSync(fd, '4 1 2');
                     break;
               }
               break;
            }
            default:
               fs.writeSync(fd, OpcodeName(instruction.code as Opcode));
               if (instruction.expressions.length > 0)
                  fs.writeSync(fd, ` ${generateExprStr(instruction.expressions)}`);
               break;
         }
      }
      fs.writeSync(fd, '\n');
   }

   fs.closeSync(fd);
}
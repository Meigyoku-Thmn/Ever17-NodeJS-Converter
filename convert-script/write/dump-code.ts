import fs from 'fs';
import { makeHexPad16, makeHexPad2 } from '../../utils/string';
import { Expression, ExpressionType } from '../expression';
import {
   FlowOpcode, MetaOpcode, Opcode, OpcodeInfo, OpcodeName, OpcodeType, TextualOpcode, TextualOpcodeName, TextualOpcodeType
} from '../opcode';
import { OPERATOR_MAP } from './operator-map';

function generateExprStr(exprs: Expression[], separator = ' '): string {
   const exprStrArr: string[] = [];
   for (const expr of exprs) {
      switch (expr.type) {
         case ExpressionType.Variable:
            exprStrArr.push(expr.name);
            break;
         case ExpressionType.Operator:
            exprStrArr.push(OPERATOR_MAP[expr.operator]);
            break;
         case ExpressionType.Const:
            exprStrArr.push(expr.name ?? expr.value.toString());
            break;
         case ExpressionType.FunctionCall:
            exprStrArr.push(`${expr.name}(${generateExprStr(expr.funcArgs, ',')})`);
            break;
         case ExpressionType.RGB:
            exprStrArr.push(`rgb(${expr.value})`);
            break;
         case ExpressionType.Config: {
            exprStrArr.push(`config(${expr.value})`);
            break;
         }
      }
   }
   return exprStrArr.join(separator);
}

export function dumpCode(opcodeInfos: OpcodeInfo[], outputPath: string): void {
   const fd = fs.openSync(outputPath, 'w');

   for (const opcodeInfo of opcodeInfos) {
      // offset tag and hex dump
      fs.writeSync(fd, '[');
      if (opcodeInfo.labeled)
         fs.writeSync(fd, 'labeled:');
      fs.writeSync(fd, `${makeHexPad16(opcodeInfo.position)}]`);
      fs.writeSync(fd, [...opcodeInfo.bytecodes].map(b => makeHexPad2(b)).join(' '));
      fs.writeSync(fd, ': ');

      // pseudo-code
      if (opcodeInfo.type === OpcodeType.MetaOpcode) {
         switch (opcodeInfo.code) {
            case MetaOpcode.Variable:
               fs.writeSync(fd, `${generateExprStr(opcodeInfo.expressions)}`);
               break;
            case MetaOpcode.Text:
               fs.writeSync(fd, 'text\n');
               fs.writeSync(fd, `__[${makeHexPad16(opcodeInfo.textualOpcodeInfos[0].position)}]`);
               for (const textOpInfo of opcodeInfo.textualOpcodeInfos) {
                  if (textOpInfo.type === TextualOpcodeType.Text)
                     fs.writeSync(fd, textOpInfo.text);
                  else switch (textOpInfo.code) {
                     case TextualOpcode.Style:
                        switch (textOpInfo.expressions[0].value) {
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
                        fs.writeSync(fd, `{${TextualOpcodeName(textOpInfo.code)} ${textOpInfo.expressions[0].value}\n`);
                        for (const [cond, text] of textOpInfo.choices) {
                           if (cond != null)
                              fs.writeSync(fd, `<${generateExprStr([cond])}>`);
                           fs.writeSync(fd, text);
                        }
                        fs.writeSync(fd, '}');
                        break;
                     default:
                        fs.writeSync(fd, `{${TextualOpcodeName(textOpInfo.code)}`);
                        if (textOpInfo.expressions.length > 0)
                           fs.writeSync(fd, ` ${generateExprStr(textOpInfo.expressions)}`);
                        fs.writeSync(fd, '}');
                        break;
                  }
               }
               fs.writeSync(fd, '\n');
               break;
         }
      }
      else if (opcodeInfo.type === OpcodeType.FlowOpcode) {
         switch (opcodeInfo.code) {
            case FlowOpcode.End:
               break;
            case FlowOpcode.Goto:
               fs.writeSync(fd, `goto ${makeHexPad16(opcodeInfo.switches[0][1].target)}`);
               break;
            case FlowOpcode.GotoIf:
               fs.writeSync(fd, `if ${generateExprStr(opcodeInfo.expressions)} `);
               fs.writeSync(fd, `goto ${makeHexPad16(opcodeInfo.switches[0][1].target)}`);
               break;
            case FlowOpcode.Switch: {
               fs.writeSync(fd, `switch ${generateExprStr(opcodeInfo.expressions)}\n`);
               for (const [{ value, name }, { target }] of opcodeInfo.switches)
                  fs.writeSync(fd, `case ${name ?? value} goto ${makeHexPad16(target)}\n`);
               break;
            }
            case FlowOpcode.Sleep:
               fs.writeSync(fd, `sleep ${opcodeInfo.expressions[0].value}`);
               break;
            default:
               fs.writeSync(fd, `flow_unk_${makeHexPad2(opcodeInfo.code)}`);
               if (opcodeInfo.expressions.length > 0)
                  fs.writeSync(fd, ` ${generateExprStr(opcodeInfo.expressions)}`);
         }
      }
      else if (opcodeInfo.type === OpcodeType.Opcode) {
         switch (opcodeInfo.code) {
            case Opcode.SetFGOrder: {
               fs.writeSync(fd, OpcodeName(opcodeInfo.code as Opcode));
               fs.writeSync(fd, ' ');
               const code = opcodeInfo.expressions.map(e => e.value as number).toString();
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
               fs.writeSync(fd, OpcodeName(opcodeInfo.code as Opcode));
               if (opcodeInfo.expressions.length > 0)
                  fs.writeSync(fd, ` ${generateExprStr(opcodeInfo.expressions)}`);
               break;
         }
      }
      fs.writeSync(fd, '\n');
   }

   fs.closeSync(fd);
}
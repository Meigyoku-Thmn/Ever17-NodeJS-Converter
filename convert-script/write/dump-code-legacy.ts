import fs from 'fs';
import { Expression, ExpressionType, Operator } from '../expression';
import {
   MetaOpcode, Opcode, OpcodeInfo, OpcodeType, TextualOpcode, TextualOpcodeInfo, TextualOpcodeType
} from '../opcode';
import { seekSync, constants } from 'fs-ext';

const OperatorMap = {
   [Operator.Assign]: ':=',
   [Operator.AddAssign]: '+=',
   [Operator.Equal]: '==',
   [Operator.NotEqual]: '!=',
   [Operator.LessThanOrEqual]: '<=',
   [Operator.GreaterThanOrEqual]: '>=',
   [Operator.LessThan]: '<',
   [Operator.GreaterThan]: '>',
};

const OpcodeMap = {
   [Opcode.ToFile]: 'jump',
   [Opcode.PlayBGM]: 'playBGM',
   [Opcode.StopBGM]: 'stopBGM',
   [Opcode.PlaySFX]: 'playSFX',
   [Opcode.StopSFX]: 'stopSFX',
   [Opcode.WaitSFX]: 'waitForSFX',
   [Opcode.PlayVoice]: 'playVoice',
   [Opcode.Unk09]: 'unknown09',
   [Opcode.LoadBG]: 'bgload',
   [Opcode.RemoveBG]: 'removeBG',
   [Opcode.LoadFG]: 'fgload',
   [Opcode.RemoveFG]: 'removeFG',
   [Opcode.LoadFG2]: 'multifgload2',
   [Opcode.RemoveFG3]: 'multiremoveFG',
   [Opcode.SetFGOrder]: 'setFGOrder',
   [Opcode.AffectFG]: 'makeFGSomething',
   [Opcode.LoadFG3]: 'multifgload3',
   [Opcode.HideDialog]: 'hideTextbox',
   [Opcode.ShowDialog]: 'showTextbox',
   [Opcode.MarkChoiceId]: 'choiceId',
   [Opcode.ShowChapter]: 'chapterCutin',
   [Opcode.Delay]: 'delay',
   [Opcode.ShowClock]: 'clock',
   [Opcode.StartAnim]: 'openAnim',
   [Opcode.CloseAnim]: 'closeAnim',
   [Opcode.MarkLocationId]: 'scriptLocationId',
   [Opcode.LoadBGKeepFG]: 'bgload_keepFg',
   [Opcode.Unk2B]: 'unknown2b',
   [Opcode.UnlockImage]: 'unlockCG',
   [Opcode.PlayMovie]: 'playMovie',
   [Opcode.Unk3B]: 'unknown3b',
   [Opcode.Unk3C]: 'unknown3c',
   [Opcode.LoadBGCrop]: 'bgloadCrop',
   [Opcode.TweenZoom]: 'tweenZoom',
   [Opcode.Unk43]: 'unknown43',
   [Opcode.OverlayMono]: 'monoColorOverlay',
   [Opcode.SetDialogColor]: 'setDialogBoxColor',
};

const TextualOpcodeMap = {
   [TextualOpcode.WaitInteraction]: 'waitForClick',
   [TextualOpcode.ClearText]: 'clearText',
   [TextualOpcode.Delay]: 'delay',
   [TextualOpcode.AppendText]: 'appendText',
   [TextualOpcode.OpenChoiceBox]: 'choice',
   [TextualOpcode.WaitVoice]: 'waitForSound',
   [TextualOpcode.PlayVoice]: 'sound',
   [TextualOpcode.Mark]: 'marker',
   [TextualOpcode.ToNextPage]: 'nextPage',
   [TextualOpcode.MarkBigChar]: 'bigChar',
};

function generateExprStr(exprs: Expression[]): string {
   let exprStr = '';
   for (const expr of exprs) {
      switch (expr.type) {
         case ExpressionType.Variable:
            exprStr += '(28 0a ';
            if (expr.name.startsWith('dim_'))
               exprStr += 'a0) ';
            else if (expr.name.startsWith('eff_'))
               exprStr += 'a2) ';
            else if (expr.name.startsWith('sys_'))
               exprStr += 'a3) ';
            else
               exprStr += 'a4) ';
            exprStr += `${expr.name.substr(expr.name.indexOf('_') + 1)} `;
            break;
         case ExpressionType.Operator:
            exprStr += OperatorMap[expr.operator] + ' (00) ';
            break;
         case ExpressionType.Const:
            exprStr += expr.value + ' ';
            break;
         case ExpressionType.FunctionCall:
            exprStr += `${expr.name}(${generateExprStr(expr.funcArgs)}) `;
            break;
         case ExpressionType.RGB:
            exprStr += `rgb(${expr.value}) `;
            break;
         case ExpressionType.Config: {
            const arr = expr.value as number[];
            exprStr += `VAR_c${arr[0].toString(16)}_${arr[1] + arr[2] * 10}_${arr[3] + arr[4] * 10}`;
            break;
         }
      }
   }
   return exprStr.trimRight();
}

export function dumpCodeLegacy(opcodeInfos: OpcodeInfo[], outputPath: string): void {
   const fd = fs.openSync(outputPath, 'w');

   for (const opcodeInfo of opcodeInfos) {
      // offset tag and hex dump
      fs.writeSync(fd, `[${opcodeInfo.position.toString(16).padStart(8, '0')}]`);
      if (opcodeInfo.type === OpcodeType.Opcode) {
         fs.writeSync(fd, '10: \r\n');
         fs.writeSync(fd, `[${(opcodeInfo.position + 1).toString(16).padStart(8, '0')}]`);
         fs.writeSync(fd, [...opcodeInfo.bytecodes.subarray(1)]
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' '));
      }
      else
         fs.writeSync(fd, [...opcodeInfo.bytecodes]
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' '));
      fs.writeSync(fd, ': ');

      // pseudo-code
      if (opcodeInfo.type === OpcodeType.MetaOpcode) {
         switch (opcodeInfo.code) {
            case MetaOpcode.VarOp:
               if (tryPrintPrettierVarOp(fd, opcodeInfo))
                  break;
               fs.writeSync(fd, 'varop ');
               fs.writeSync(fd, generateExprStr(opcodeInfo.expressions));
               fs.writeSync(fd, '\r\n');
               break;
            case MetaOpcode.Goto:
               fs.writeSync(fd, `goto ${opcodeInfo.switches[0][1].target.toString(16).padStart(8, '0')} `);
               fs.writeSync(fd, `(${opcodeInfo.switches[0][1].value.toString(16).padStart(8, '0')})\r\n`);
               break;
            case MetaOpcode.GotoIf:
               fs.writeSync(fd, `gotoif 1 ${generateExprStr(opcodeInfo.expressions).replace('(00)', '(01)')} `);
               fs.writeSync(fd, `(0001) -> ${opcodeInfo.switches[0][1].target.toString(16).padStart(8, '0')} `);
               fs.writeSync(fd, `(${opcodeInfo.switches[0][1].value.toString(16).padStart(8, '0')})\r\n`);
               break;
            case MetaOpcode.Switch:
               fs.writeSync(fd, '_switch\r\n');
               fs.writeSync(fd, `switch_varop ${generateExprStr(opcodeInfo.expressions)} 0014 (00)\r\n`);
               for (const [_case, target] of opcodeInfo.switches) {
                  fs.writeSync(fd, `27 -> ${generateExprStr([_case])} `);
                  fs.writeSync(fd, `${target.target.toString(16).padStart(8, '0')} `);
                  fs.writeSync(fd, `(${target.value.toString(16).padStart(8, '0')})\r\n`);
               }
               fs.writeSync(fd, '\r\n');
               break;
            case MetaOpcode.Sleep:
               fs.writeSync(fd, `unSkippableDelay ${generateExprStr(opcodeInfo.expressions)}\r\n`);
               break;
            case MetaOpcode.MUnk28:
            case MetaOpcode.MUnk19:
            case MetaOpcode.MUnk12:
            case MetaOpcode.MUnk13:
            case MetaOpcode.MUnk06:
            case MetaOpcode.MUnk0D:
            case MetaOpcode.MUnk15: {
               let code = `l_unk${opcodeInfo.code.toString(16).padStart(2, '0')} `;
               code += generateExprStr(opcodeInfo.expressions);
               fs.writeSync(fd, code.trimRight());
               fs.writeSync(fd, '\r\n');
               break;
            }
            case MetaOpcode.CallText:
               fs.writeSync(fd, `text ${opcodeInfo.switches[0][1].value.toString(16).padStart(2, '0')}\r\n`);
               printTextualCode(fd, opcodeInfo.textualOpcodeInfos);
               fs.writeSync(fd, '\r\n');
               break;
            case MetaOpcode.NoOp:
               fs.writeSync(fd, '\r\n');
               break;
            default:
               fs.writeSync(fd, ' \r\n');
         }
      } else if (opcodeInfo.type === OpcodeType.Opcode) {
         switch (opcodeInfo.code) {
            case Opcode.ShowClock:
               fs.writeSync(fd, `clock ${opcodeInfo.expressions[0].value}:${opcodeInfo.expressions[1].value}\r\n`);
               break;
            case Opcode.PlayBGM: {
               const str = generateExprStr(opcodeInfo.expressions).replace('bgm0', '').replace('bgm', '');
               fs.writeSync(fd, `${OpcodeMap[opcodeInfo.code]} ${str}`.trimRight());
               fs.writeSync(fd, '\r\n');
               break;
            }
            case Opcode.LoadFG: {
               let str = generateExprStr(opcodeInfo.expressions);
               const midI = str.indexOf(' ');
               str = str.substring(0, midI) + ' 00000000' + str.substr(midI);
               fs.writeSync(fd, `${OpcodeMap[opcodeInfo.code]} ${str}`.trimRight());
               fs.writeSync(fd, '\r\n');
               break;
            }
            case Opcode.LoadFG2: {
               const values = opcodeInfo.expressions.map(e => e.value);
               values.splice(3, 0, '00000000');
               values.splice(2, 0, '00000000');
               fs.writeSync(fd, `${OpcodeMap[opcodeInfo.code]} ${values.join(' ')}`);
               fs.writeSync(fd, '\r\n');
               break;
            }
            case Opcode.ShowChapter:
            case Opcode.LoadBGCrop:
            case Opcode.LoadBGKeepFG:
            case Opcode.LoadBG:
               fs.writeSync(fd, `${OpcodeMap[opcodeInfo.code]} 00000000 `);
               fs.writeSync(fd, `${generateExprStr(opcodeInfo.expressions)}`.trimRight());
               fs.writeSync(fd, '\r\n');
               break;
            case Opcode.SetDialogColor: {
               const color = { 0: 'blue', 1: 'green', 2: 'gray' }[opcodeInfo.expressions[0].value as number];
               fs.writeSync(fd, `setDialogBoxColor ${color ?? 'error'}\r\n`);
               break;
            }
            case Opcode.StartAnim:
               switch (opcodeInfo.expressions[0].value) {
                  case 4:
                     fs.writeSync(fd, 'shakeScreenHard');
                     break;
                  case 5:
                     fs.writeSync(fd, 'shakeScreen');
                     break;
                  case 12:
                     fs.writeSync(fd, 'openShakeScreenAnim');
                     break;
                  case 19:
                     fs.writeSync(fd, 'showFog2');
                     break;
                  case 27:
                     fs.writeSync(fd, 'showKomoreAnim');
                     break;
                  case 32:
                     fs.writeSync(fd, 'showFilter2');
                     break;
                  case 41:
                     fs.writeSync(fd, 'openSnowFallingAnim');
                     break;
                  case 44:
                     fs.writeSync(fd, 'showDimOverlay');
                     break;
                  case 45:
                     fs.writeSync(fd, 'showDimInAndOutAnim');
                     break;
                  case 46:
                     fs.writeSync(fd, 'triggerFlash');
                     break;
                  case 47:
                     fs.writeSync(fd, 'triggerChangePerspectiveAnim');
                     break;
                  case 48:
                     fs.writeSync(fd, 'openMapCommentAnim');
                     break;
                  case 49:
                     fs.writeSync(fd, 'show_map_root_image_blinking_Anim');
                     break;
                  case 18:
                     fs.writeSync(fd, 'openCherryBlossomAnim');
                     break;
                  default:
                     fs.writeSync(fd, 'InvalidAnimation');
               }
               fs.writeSync(fd, '\r\n');
               break;
            case Opcode.CloseAnim:
               switch (opcodeInfo.expressions[0].value) {
                  case 0:
                     fs.writeSync(fd, 'closeFog2');
                     break;
                  case 7:
                     fs.writeSync(fd, 'closeKomoreAnim');
                     break;
                  case 11:
                     fs.writeSync(fd, 'closeShakeScreenAnim');
                     break;
                  case 12:
                     fs.writeSync(fd, 'closeCherryBlossomAnim');
                     break;
                  case 13:
                     fs.writeSync(fd, 'closeDimInAndOutAndFilterAnim');
                     break;
                  case 14:
                     fs.writeSync(fd, 'closeSnowFallingAnim');
                     break;
                  case 15:
                     fs.writeSync(fd, 'closeMapIndicatorAnim');
                     break;
                  case 16:
                     fs.writeSync(fd, 'closeDimOverlay');
                     break;
                  default:
                     fs.writeSync(fd, 'InvalidAnimation');
               }
               fs.writeSync(fd, '\r\n');
               break;
            case Opcode.RemoveFG3: {
               fs.writeSync(fd, opcodeInfo.expressions[2].value === 3 ? 'multiremoveFG_Anim ' : 'multiremoveFG_Sta ');
               switch (opcodeInfo.expressions[0].value) {
                  case 7:
                     fs.writeSync(fd, '1 2 4');
                     break;
                  case 3:
                     fs.writeSync(fd, '1 2 0');
                     break;
                  case 5:
                     fs.writeSync(fd, '1 4 0');
                     break;
                  case 6:
                     fs.writeSync(fd, '2 4 0');
                     break;
                  default:
                     fs.writeSync(fd, 'error');
               }
               fs.writeSync(fd, '\r\n');
               break;
            }
            default:
               fs.writeSync(fd, `${OpcodeMap[opcodeInfo.code]} ${generateExprStr(opcodeInfo.expressions)}`.trimRight());
               fs.writeSync(fd, '\r\n');
         }
      } else {
         fs.writeSync(fd, '\r\n');
      }
   }

   fs.closeSync(fd);
}

function tryPrintPrettierVarOp(fd: number, opcodeInfo: OpcodeInfo): boolean {
   const lastExpr = opcodeInfo.expressions[opcodeInfo.expressions.length - 1];
   switch (opcodeInfo.expressions[0].name) {
      case 'dim_ab': {
         const arr = lastExpr.value as number[];
         seekSync(fd, -11, constants.SEEK_CUR);
         fs.writeSync(fd, ': ');
         fs.writeSync(fd, `setMonoColorOverlayFadeOutDuration VAR_c0_${arr[1]}\r\n`);
         fs.writeSync(fd, `[${(opcodeInfo.position + 10).toString(16).padStart(8, '0')}]`);
         fs.writeSync(fd, [arr[2], arr[3], arr[4]].map(e => e.toString(16).padStart(2, '0')).join(' '));
         fs.writeSync(fd, ': fadeOutMonoColorOverlay\r\n');
         break;
      }
      case 'eff_38':
         fs.writeSync(fd, `setKomoreType ${lastExpr.value}\r\n`);
         break;
      case 'eff_3a':
         fs.writeSync(fd, `setChangePerspectiveDirection ${lastExpr.value}\r\n`);
         break;
      case 'eff_44':
         fs.writeSync(fd, `setNumberOfFlash ${lastExpr.value}\r\n`);
         break;
      case 'eff_43':
         fs.writeSync(fd, `setFlashBrightness ${lastExpr.value}\r\n`);
         break;
      case 'eff_13':
         if (lastExpr.value === 1)
            fs.writeSync(fd, 'turnOnFullscreenTextMode\r\n');
         else if (lastExpr.value === 0)
            fs.writeSync(fd, 'turnOffFullscreenTextMode\r\n');
         else return false;
         break;
      case 'eff_45':
         fs.writeSync(fd, `setMapCommentSlotToDisplay ${lastExpr.value}\r\n`);
         break;
      case 'eff_46':
         fs.writeSync(fd, `pickMapCommentByIndex ${lastExpr.value}\r\n`);
         break;
      case 'eff_4a':
         fs.writeSync(fd, `pickMapCommentByIndex2 ${lastExpr.value}\r\n`);
         break;
      case 'l_fa':
         fs.writeSync(fd, `setSceneTitleByIndex ${lastExpr.value}\r\n`);
         break;
      default:
         return false;
   }
   return true;
}

function printTextualCode(fd: number, opcodeInfos: TextualOpcodeInfo[]): void {
   for (const opcodeInfo of opcodeInfos) {
      switch (opcodeInfo.type) {
         case TextualOpcodeType.Command:
            if (opcodeInfo.code === TextualOpcode.End)
               break;
            else if (opcodeInfo.code === TextualOpcode.OpenChoiceBox) {
               fs.writeSync(fd, `{choice 00 ${opcodeInfo.expressions[0].value.toString(16).padStart(4, '0')} `);
               for (const [cond, str] of opcodeInfo.choices) {
                  const prefix = !cond ? '' : `[cond ${generateExprStr([cond])}]`;
                  fs.writeSync(fd, `|${prefix}${str.replace('\n', '')}`);
               }
               fs.writeSync(fd, '}');
            }
            else if (opcodeInfo.code === TextualOpcode.ToNextPage) {
               fs.writeSync(fd, `{nextPage ${opcodeInfo.expressions[0].value.toString(16).padStart(2, '0')}}`);
            }
            else {
               const code = `${TextualOpcodeMap[opcodeInfo.code]} ${generateExprStr(opcodeInfo.expressions)}`;
               fs.writeSync(fd, `{${code.trimRight()}}`);
            }
            break;
         case TextualOpcodeType.Text:
            fs.writeSync(fd, opcodeInfo.text);
            break;
      }
   }
   fs.writeSync(fd, '\r\n');
}
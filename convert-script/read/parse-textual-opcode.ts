import iconv from 'iconv-lite';
import { BufferTraverser } from '../../utils/buffer-wrapper';
import { addContext } from '../../utils/error';
import { isTextualOpcode, TextualOpcode, TextualOpcodeInfo, TextualOpcodeName, TextualOpcodeType } from '../opcode';
import { readCStringExpr, readExpression, readRawByteExpr, readRawInt16Expr } from './read-expression';
import { skipMarker, skipPadding } from './skip-padding';

const CP1252 = iconv.getDecoder('CP1258');
const CP932 = iconv.getDecoder('CP932');

function decodeCP932(...bytes: number[]): string {
   const rs = CP932.write(Buffer.from(bytes));
   CP932.end();
   return rs;
}

function decodeCP1252(...bytes: number[]): string {
   const rs = CP1252.write(Buffer.from(bytes));
   CP932.end();
   return rs;
}

export function parseTextualOpcodes(bytecodes: Buffer, pos: number): TextualOpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodeInfos: TextualOpcodeInfo[] = [];

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: TextualOpcodeType = -1;
   let curByteCode = 0;

   try {
      while (!reader.eof()) {
         const opcodeInfo = new TextualOpcodeInfo();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;
         curByteCode = reader.readByte();

         opcodeInfo.type = curOpcodeType = TextualOpcodeType.Command;
         switch (curByteCode) {
            case TextualOpcode.End:
            case TextualOpcode.WaitInteraction:
            case TextualOpcode.ClearText:
               break;
            case TextualOpcode.Delay:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'duration', true),
               );
               break;
            case TextualOpcode.AppendText: {
               const expr = readExpression(reader, 'unk', true); // always zero
               if (expr.value !== 0)
                  throw Error(`Expected a zero-value expression, got value ${expr.value}.`);
               break;
            }
            case TextualOpcode.OpenChoiceBox: {
               skipPadding(reader, 1);
               opcodeInfo.expressions.push(
                  readRawInt16Expr(reader, 'id'),
               );
               let marker = skipMarker(reader, 1, TextualOpcode.OpenChoiceBox);
               while (marker === TextualOpcode.OpenChoiceBox) {
                  const type = reader.readByte();
                  if (type === 1)
                     opcodeInfo.choices.push([
                        null,
                        parseText(reader.readByte(), true),
                     ]);
                  else if (type === 2)
                     opcodeInfo.choices.push([
                        readExpression(reader, 'choiceCond', true, 1),
                        parseText(reader.readByte(), true),
                     ]);
                  else
                     throw Error(`Unknown type ${type} of this choice.`);
                  marker = reader.readByte();
               }
               if (marker !== TextualOpcode.End)
                  throw Error(`Expected zero byte after choices, got ${marker}.`);
               break;
            }
            case TextualOpcode.WaitVoice:
               break;
            case TextualOpcode.PlayVoice:
               opcodeInfo.expressions.push(
                  readCStringExpr(reader, 'voice name'),
               );
               break;
            case TextualOpcode.Mark:
               break;
            case TextualOpcode.ToNextPage:
               opcodeInfo.expressions.push(
                  readRawByteExpr(reader, 'unk'),
               );
               break;
            case TextualOpcode.MarkBigChar:
               break;
            default:
               opcodeInfo.type = curOpcodeType = TextualOpcodeType.Text;
               parseText(curByteCode);
         }

         // eslint-disable-next-line no-inner-declarations
         function parseText(initialChr: number, local = false): string {
            let text = '';
            let c1 = initialChr;
            let shouldBackwardOne = true;
            do {
               if (c1 === TextualOpcode.End) {
                  throw Error('Unexpected zero byte when reading text.');
               }
               if (c1 === TextualOpcode.PutNewLine) {
                  text += '\n';
                  shouldBackwardOne = false;
                  break;
               }
               let c2: number;
               if ((c1 >= 0x80 && c1 <= 0xa0) || (c1 >= 0xe0 && c1 <= 0xef))
                  c2 = reader.readByte();

               let emoji: string;
               if (c2 != null)
                  emoji = decodeCP932(c1, c2);

               // the japanese version has emojis in script
               switch (emoji) {
                  case '①': // CIRCLED DIGIT ONE
                     emoji = '💧'; // it was a Double Droplet 💧💧 in the japanese version
                     break;
                  case '②': // CIRCLED DIGIT TWO
                     emoji = '❤️';
                     break;
                  case '③': // CIRCLED DIGIT THREE
                     emoji = '💢';
                     break;
                  case '④': // CIRCLED DIGIT FOUR
                     emoji = '💦';
                     break;
                  case '⑤': // CIRCLED DIGIT FIVE
                     emoji = '⭐';
                     break;
                  case '⑩': // CIRCLED NUMBER TEN
                     emoji = 'ä';
                     break;
                  case '⑪': // CIRCLED NUMBER ELEVEN
                     emoji = 'ö';
                     break;
                  case '⑫': // CIRCLED NUMBER TWELVE
                     emoji = 'ü';
                     break;
                  case '⑬': // CIRCLED NUMBER THIRTEEN
                     emoji = '—'; // EM DASH
                     break;
                  // fallback cases for English language
                  // TODO: make a separate mode for Japanese language
                  case '．': // FULLWIDTH FULL STOP
                     emoji = '.';
                     break;
                  case '　': // IDEOGRAPHIC SPACE
                     emoji = ' ';
                     break;
                  case '！': // FULLWIDTH EXCLAMATION MARK
                     emoji = '!';
                     break;
                  default:
                     emoji = null;
               }
               if (emoji != null)
                  text += emoji;
               else if (c2 != null)
                  text += decodeCP1252(c1, c2);
               else
                  text += decodeCP1252(c1);

               c1 = reader.readByte();
            } while (!isTextualOpcode(c1));

            if (shouldBackwardOne)
               reader.pos--;

            if (local === false)
               opcodeInfo.text = text;

            return text;
         }

         opcodeInfo.code = curByteCode;
         opcodeInfo.position = curOpcodePos;
         opcodeInfo.bytecodes = reader.buffer.subarray(curRelOpcodePos, reader.pos);

         opcodeInfos.push(opcodeInfo);

         curOpcodeType = -1;
      }
   } catch (err) {
      if (curOpcodeType === TextualOpcodeType.Command)
         addContext(err, ` at MetaOpcode.${TextualOpcodeName(curByteCode)}`);
      else if (curOpcodeType === TextualOpcodeType.Text)
         addContext(err, ' in text');
      addContext(err, ` at position 0x${curOpcodePos.toString(16)}`);
      throw err;
   }

   return opcodeInfos;
}
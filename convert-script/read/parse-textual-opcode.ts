import { BufferTraverser } from '../../utils/buffer-wrapper';
import { addContext } from '../../utils/error';
import { isTextualOpcode, TextualOpcode, TextualOpcodeInfo, TextualOpcodeName, TextualOpcodeType } from '../opcode';
import { readCStringExpr, readExpression, readRawByteExpr, readRawInt16Expr } from './read-expression';
import iconv from 'iconv-lite';
import { skipMarker, skipPadding } from './skip-padding';

export function parseTextualOpcodes(bytecodes: Buffer, pos: number): TextualOpcodeInfo[] {
   const reader = new BufferTraverser(bytecodes);
   const opcodeInfos: TextualOpcodeInfo[] = [];

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: TextualOpcodeType = -1;
   let curByteCode = 0;

   try {
      while (!reader.atEOF()) {
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
            let c = initialChr;
            let shouldBackwardOne = true;
            do {
               if (c === TextualOpcode.End) {
                  throw Error('Unexpected zero byte when reading text.');
               }
               if (c === TextualOpcode.PutNewLine) {
                  text += '\n';
                  shouldBackwardOne = false;
                  break;
               }
               let chr: string;
               if ((c >= 0x80 && c <= 0xa0) || (c >= 0xe0 && c <= 0xef))
                  chr = iconv.decode(Buffer.from([c, reader.readByte()]), 'CP932');
               else
                  chr = String.fromCharCode(c);

               // the japanese version has emojis in script
               switch (chr) {
                  case '①': // CIRCLED DIGIT ONE
                     chr = '💧'; // it was a Double Droplet 💧💧 in the japanese version
                     break;
                  case '②': // CIRCLED DIGIT TWO
                     chr = '❤️';
                     break;
                  case '③': // CIRCLED DIGIT THREE
                     chr = '💢';
                     break;
                  case '④': // CIRCLED DIGIT FOUR
                     chr = '💦';
                     break;
                  case '⑤': // CIRCLED DIGIT FIVE
                     chr = '⭐';
                     break;
                  case '⑩': // CIRCLED NUMBER TEN
                     chr = 'ä';
                     break;
                  case '⑪': // CIRCLED NUMBER ELEVEN
                     chr = 'ö';
                     break;
                  case '⑫': // CIRCLED NUMBER TWELVE
                     chr = 'ü';
                     break;
                  case '⑬': // CIRCLED NUMBER THIRTEEN
                     chr = '—'; // EM DASH
                     break;
                  // fallback cases for English language
                  // TODO: make a separate mode for Japanese language
                  case '．': // FULLWIDTH FULL STOP
                     chr = '.';
                     break;
                  case '　': // IDEOGRAPHIC SPACE
                     chr = ' ';
                     break;
                  case '！': // FULLWIDTH EXCLAMATION MARK
                     chr = '!';
                     break;
               }
               text += chr;

               c = reader.readByte();
            } while (!isTextualOpcode(c));

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
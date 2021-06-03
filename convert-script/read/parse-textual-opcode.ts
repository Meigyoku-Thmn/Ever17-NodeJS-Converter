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
      curByteCode = reader.readByte();
      while (!reader.atEOF()) {
         const opcodeInfo = new TextualOpcodeInfo();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;

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
            case TextualOpcode.AppendText:
               opcodeInfo.expressions.push(
                  readExpression(reader, 'unk', true),
               );
               break;
            case TextualOpcode.OpenChoiceBox: {
               skipPadding(reader, 1);
               opcodeInfo.expressions.push(
                  readRawInt16Expr(reader, 'id'),
               );
               let marker = skipMarker(reader, 1, TextualOpcode.OpenChoiceBox);
               const choices: TextualOpcodeInfo['choices'] = [];
               while (marker === TextualOpcode.OpenChoiceBox) {
                  const type = reader.readByte();
                  if (type === 1) 
                     choices.push([
                        null,
                        parseText(true, reader.readByte()),
                     ]);
                  else if (type === 2)
                     choices.push([
                        readExpression(reader, 'choiceCond', true, 1),
                        parseText(true, reader.readByte()),
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
               curOpcodeType = TextualOpcodeType.Text;
               parseText();
         }

         // eslint-disable-next-line no-inner-declarations
         function parseText(local = false, initialChr = TextualOpcode.End): string {
            let text = '';
            let c = initialChr !== TextualOpcode.End ? curByteCode : initialChr;
            do {
               if (c === TextualOpcode.End) {
                  throw Error('Unexpected zero byte when reading text.');
               }
               if (c === TextualOpcode.PutNewLine) {
                  text += '\n';
                  break;
               }
               let chr: string;
               if ((c >= 0x80 && c <= 0xa0) || (c >= 0xe0 && c <= 0xef))
                  chr = iconv.decode(Buffer.from([]), 'CP932');
               else
                  chr = String.fromCharCode(c);

               switch (chr) {
                  case '①': // Circled Number 1
                     chr = '{💧💧}';
                     break;
                  case '②': // Circled Number 2
                     chr = '❤️';
                     break;
                  case '③': // Circled Number 3
                     chr = '💢';
                     break;
                  case '④': // Circled Number 4
                     chr = '💦';
                     break;
                  case '⑤': // Circled Number 5
                     chr = '★';
                     break;
                  case '⑩': // Circled Number 10
                  case '‡I':
                     chr = 'ä';
                     break;
                  case '⑪': // Circled Number 11
                  case '‡J':
                     chr = 'ö';
                     break;
                  case '⑫': // Circled Number 12
                  case '‡K':
                     chr = 'ü';
                     break;
                  case '⑬': // Circled Number 13
                  case '‡L':
                     chr = '—'; // long dash
                     break;
                  // fallback cases, the English version do this too
                  // TODO: verify this
                  case '\x81D':
                     chr = '.';
                     break;
                  case '\x81@':
                     chr = ' ';
                     break;
                  case '\x81I':
                     chr = '!';
                     break;
               }

               c = reader.readByte();
            } while (!isTextualOpcode(c));

            if (local === false)
               opcodeInfo.text = text;

            return text;
         }

         opcodeInfo.code = curByteCode;
         opcodeInfo.position = curOpcodePos;
         opcodeInfo.bytecodes = reader.buffer.subarray(curRelOpcodePos, reader.pos);

         opcodeInfos.push(opcodeInfo);

         if (curOpcodeType !== TextualOpcodeType.Text)
            curByteCode = reader.readByte();

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
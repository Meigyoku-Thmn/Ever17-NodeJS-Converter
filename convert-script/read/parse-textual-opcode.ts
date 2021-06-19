import iconv from 'iconv-lite';
import { BufferTraverser } from '../../utils/buffer-wrapper';
import { addContext } from '../../utils/error';
import { TextualInstruction, TextualInstructionType } from '../instruction';
import { isTextualOpcode, TextualOpcode, TextualOpcodeName } from '../opcode';
import { readCStringExpr, readExpressions, readRawByteExpr, readRawInt16Expr } from './read-expression';
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

export function parseTextualInstructions(bytecodes: Buffer, pos: number): TextualInstruction[] {
   const reader = new BufferTraverser(bytecodes);
   const instructions: TextualInstruction[] = [];

   let curOpcodePos = 0;
   let curRelOpcodePos = 0;
   let curOpcodeType: TextualInstructionType = -1;
   let curByteCode = 0;

   try {
      while (!reader.eof()) {
         const opcodeInfo = new TextualInstruction();
         curRelOpcodePos = reader.pos;
         curOpcodePos = pos + curRelOpcodePos;
         curByteCode = reader.readByte();

         opcodeInfo.type = curOpcodeType = TextualInstructionType.Command;
         switch (curByteCode) {
            case TextualOpcode.End:
            case TextualOpcode.Wait:
            case TextualOpcode.Clear:
               break;
            case TextualOpcode.Sleep:
               opcodeInfo.expressions = readExpressions(reader, 'duration');
               break;
            case TextualOpcode.MarkLog: {
               const expr = readExpressions(reader, 'unk'); // always zero
               if (expr[0].value !== 0)
                  throw Error(`Expected a zero-value expression, got value ${expr[0].value}.`);
               break;
            }
            case TextualOpcode.Choice: {
               skipPadding(reader, 1);
               opcodeInfo.expressions.push(
                  readRawInt16Expr(reader, 'id'),
               );
               let marker = skipMarker(reader, 1, TextualOpcode.Choice);
               while (marker === TextualOpcode.Choice) {
                  const type = reader.readByte();
                  if (type === 1)
                     opcodeInfo.choices.push([
                        null,
                        parseText(reader.readByte(), true),
                     ]);
                  else if (type === 2)
                     opcodeInfo.choices.push([
                        readExpressions(reader, 'choiceCond'),
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
            case TextualOpcode.Voice:
               opcodeInfo.expressions.push(
                  readCStringExpr(reader, 'voice name'),
               );
               break;
            case TextualOpcode.Mark:
               break;
            case TextualOpcode.Style:
               opcodeInfo.expressions.push(
                  readRawByteExpr(reader, 'unk'),
               );
               break;
            case TextualOpcode.Big: {
               // this param decide which size the text should be (not the exact font size)
               // only 0x03 is usable (the text size is big), other values make the text buggy or just crash the game
               skipMarker(reader, 1, 0x03);
               break;
            }
            default:
               opcodeInfo.type = curOpcodeType = TextualInstructionType.Text;
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
               if (c1 === TextualOpcode.NewLine) {
                  text += '\n';
                  shouldBackwardOne = false;
                  break;
               }
               let c2: number;
               if ((c1 >= 0x80 && c1 <= 0xa0) || (c1 >= 0xe0 && c1 <= 0xef))
                  c2 = reader.readByte();

               let jpChar: string;
               if (c2 != null)
                  jpChar = decodeCP932(c1, c2);

               // the japanese version has emojis in script
               switch (jpChar) {
                  // emoji
                  case '①': // CIRCLED DIGIT ONE
                     jpChar = '💧'; // it was a Double Droplet 💧💧 in the japanese version
                     break;
                  case '②': // CIRCLED DIGIT TWO
                     jpChar = '❤️';
                     break;
                  case '③': // CIRCLED DIGIT THREE
                     jpChar = '💢';
                     break;
                  case '④': // CIRCLED DIGIT FOUR
                     jpChar = '💦';
                     break;
                  case '⑤': // CIRCLED DIGIT FIVE
                     jpChar = '⭐';
                     break;
                  case '⑩': // CIRCLED NUMBER TEN
                     jpChar = 'ä';
                     break;
                  // German character
                  case '⑪': // CIRCLED NUMBER ELEVEN
                     jpChar = 'ö';
                     break;
                  case '⑫': // CIRCLED NUMBER TWELVE
                     jpChar = 'ü';
                     break;
                  case '⑬': // CIRCLED NUMBER THIRTEEN
                     jpChar = '—'; // EM DASH
                     break;
                  // fallback cases for English language
                  // TODO: make a separate mode for Japanese language
                  case '舅':
                     jpChar = 'än';
                     break;
                  case '　': // IDEOGRAPHIC SPACE
                     jpChar = ' ';
                     break;
                  case '，': // FULLWIDTH COMMA
                     jpChar = ',';
                     break;
                  case '．': // FULLWIDTH FULL STOP
                     jpChar = '.';
                     break;
                  case '？': // FULLWIDTH QUESTION MARK
                     jpChar = '?';
                     break;
                  case '！': // FULLWIDTH EXCLAMATION MARK
                     jpChar = '!';
                     break;
                  case '／': // FULLWIDTH SOLIDUS
                     jpChar = '/';
                     break;
                  case '’': // RIGHT SINGLE QUOTATION MARK
                     jpChar = '\\';
                     break;
                  case '（': // FULLWIDTH LEFT PARENTHESIS
                     jpChar = '(';
                     break;
                  case '）': // FULLWIDTH RIGHT PARENTHESIS
                     jpChar = ')';
                     break;
                  case '－': // FULLWIDTH HYPHEN-MINUS
                     jpChar = '-';
                     break;
                  case '＜': // FULLWIDTH LESS-THAN SIGN
                     jpChar = '<';
                     break;
                  case '＞': // FULLWIDTH GREATER-THAN SIGN
                     jpChar = '>';
                     break;
               }
               if (jpChar != null)
                  text += jpChar;
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

         instructions.push(opcodeInfo);

         curOpcodeType = -1;
      }
   } catch (err) {
      if (curOpcodeType === TextualInstructionType.Command)
         addContext(err, ` at MetaOpcode.${TextualOpcodeName(curByteCode)}`);
      else if (curOpcodeType === TextualInstructionType.Text)
         addContext(err, ' in text');
      addContext(err, ` at position 0x${curOpcodePos.toString(16)}`);
      throw err;
   }

   return instructions;
}
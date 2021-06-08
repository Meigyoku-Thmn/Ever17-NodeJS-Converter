import yargs from 'yargs';
import path from 'path';
import fs from 'fs';
import { File, BinaryReader, SeekOrigin } from 'csbinary';
import { parseOpcodes } from './read/parse-opcode';
import { dumpRenPyScript, dumpScript } from './write/dump-script';
import { printError } from '../utils/error';
import { DEBUG_SCR_FILES } from '../debug/';
import { dumpCode } from './write/dump-code';

let _DEBUG_SCR_FILES = DEBUG_SCR_FILES ?? [];
if (_DEBUG_SCR_FILES.length === 0)
   _DEBUG_SCR_FILES = null;

const MyName = path.basename(__filename, '.ts');

const INGORED_FILES = new Set([
   'startup.scr',
   'system.scr',
]);

const IGNORED_DEBUG_PREFIX = 'debug';

const SC3_HEADER_SIZE = 12;

const argv = yargs
   .scriptName(MyName)
   .alias('h', 'help')
   .hide('version')
   .usage('Usage: $0 -i <input_dir> -o <output_dir>')
   .option('i', {
      alias: 'input',
      describe: 'The script "*.scr" folder extracted by the "extract" command.',
      demandOption: 'You must specify an input directory path.',
      type: 'string',
      nargs: 1,
   })
   .option('o', {
      alias: 'output',
      describe: 'The desired output directory path to extract into.',
      demandOption: 'You must specify an output directory path.',
      type: 'string',
      nargs: 1,
   })
   .example('$0 -i "C:/Ever17/script" -o "C:/ExtractedData"', '')
   .argv;

const inputDir = argv.i;
const outputDir = argv.o;

let currentFileName: string;

(async function () {
   try {
      console.time(MyName);
      const fileNames = _DEBUG_SCR_FILES ?? fs.readdirSync(inputDir).filter(e => e.endsWith('.scr'));
      for (const fileName of fileNames) {
         console.log(`Converting ${fileName}`);
         currentFileName = fileName;
         if (INGORED_FILES.has(fileName) || fileName.startsWith(IGNORED_DEBUG_PREFIX))
            continue;

         const inputPath = path.join(inputDir, fileName);
         const input = new BinaryReader(File(fs.openSync(inputPath, 'r')), 'ascii');

         input.file.seek(0, SeekOrigin.End);
         const fileSize = input.file.tell();
         input.file.seek(0, SeekOrigin.Begin);

         const magic = input.readRawString(4);
         if (magic !== 'SC3\0')
            throw Error(`Invalid magic code "${magic}", expected "SC3\\0".`);

         const textualScriptOffset = input.readUInt32();
         const imageOffset = input.readUInt32();

         const [nLabel, firstLabel] = (() => {
            const startOffset = input.readUInt32();
            const startPos = startOffset - (startOffset % 4);
            return [(startPos - SC3_HEADER_SIZE) / 4, startOffset];
         })();
         const labels = [firstLabel];
         for (let i = 1; i < nLabel; i++)
            labels.push(input.readUInt32());

         input.file.seek(firstLabel, SeekOrigin.Begin);
         const bytecodes = input.readBytes(textualScriptOffset - firstLabel);

         if (textualScriptOffset >= fileSize)
            continue;

         const nTextualIndex = (imageOffset - textualScriptOffset) / 4;
         const textualIndexes: number[] = [];
         for (let i = 0; i < nTextualIndex; i++)
            textualIndexes.push(input.readUInt32());

         const nImageIndex = (textualIndexes[0] - imageOffset) / 4;
         const imageIndexes = [];
         for (let i = 0; i < nImageIndex; i++)
            imageIndexes.push(input.readUInt32());

         const textualBytecodes = input.readBytes(imageIndexes[0] - textualIndexes[0]);

         const imageNames = input.readRawString(fileSize - imageIndexes[0])
            .split('\0')
            .filter(e => e.length > 0);

         const opcodeInfos = parseOpcodes({
            bytecodes, labels, textualIndexes, textualBytecodes, imageNames
         });

         fs.mkdirSync(outputDir, { recursive: true });
         const basename = path.join(outputDir, path.basename(fileName, '.scr'));
         // dumpCodeLegacy(opcodeInfos, basename + '.dec');
         dumpCode(opcodeInfos, basename + '.txt');
         dumpScript(opcodeInfos, basename + '.txt');
         dumpRenPyScript(opcodeInfos, basename + '.txt');
      }
      console.timeEnd(MyName);
   } catch (err) {
      console.error(`Error occured in file ${currentFileName}:`);
      printError(err);
   }
})();
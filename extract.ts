import yargs from 'yargs';
import path from 'path';
import fs from 'fs';
import { File, BinaryReader, SeekOrigin } from 'csbinary';
import { decryptInPlace } from './internal/decrypt';
import { decompress } from './internal/decompress';
import { convertWaf2Wav } from './internal/waf';
import { convertCps2Prt } from './internal/cps';
import { writePrt2PngFile } from './internal/ffmpeg';

const MyName = path.basename(__filename, '.ts');

const SCRIPT_DAT = 'script.dat';

const DAT_FILES = [
   'bg.dat',
   'bgm.dat',
   'chara.dat',
   'saver.dat',
   'script.dat',
   'se.dat',
   'system.dat',
   'sysvoice.dat',
   'voice.dat',
   'wallpaper.dat'
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DEBUG_RECORD_NAME: string = null;

const LNK_HEADER_SIZE = 16;
const LNK_INDEX_SIZE = 32;
type LNK_Index = {
   relOffset: number;
   attributes: number;
   name: string;
};

const argv = yargs
   .scriptName(MyName)
   .alias('h', 'help')
   .hide('version')
   .usage('Usage: $0 -i <input_dir> -o <output_dir>')
   .option('i', {
      alias: 'input',
      describe: 'The Ever17\'s installation directory path.',
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
   .example('$0 -i "C:/Program Files/Ever17" -o "C:/ExtractedData"', '')
   .argv;

const inputDir = argv.i;
const outputDir = argv.o;

let currentIndex: LNK_Index;
let currentFileName: string;

(async function () {
   try {
      console.time(MyName);
      for (const datFileName of DAT_FILES) {
         currentFileName = datFileName;

         const inputPath = path.join(inputDir, datFileName);
         const input = new BinaryReader(File(fs.openSync(inputPath, 'r')), 'ascii');

         const magic = input.readRawString(4);
         if (magic !== 'LNK\0')
            throw Error(`Invalid magic code "${magic}", expected "LNK\\0".`);

         const nRecord = input.readUInt32();
         input.file.seek(8, SeekOrigin.Current); // skip padding

         const indexes: LNK_Index[] = [];

         for (let i = 0; i < nRecord; i++) {
            const relOffset = input.readUInt32();
            const attributes = input.readUInt32();
            const name = input.readRawString(24).replace(/\0/g, '');
            indexes.push({ relOffset, attributes, name });
         }

         const sizeOfIndexTable = nRecord * LNK_INDEX_SIZE;

         const localOutputDir = path.join(outputDir, path.basename(datFileName, '.dat'));
         const metaOutputDir = path.join(localOutputDir, 'meta');
         fs.mkdirSync(localOutputDir, { recursive: true });

         console.log(`Extracting ${datFileName}:`);
         let metaDirCreated = false;
         for (const index of indexes) {
            if (DEBUG_RECORD_NAME && DEBUG_RECORD_NAME !== index.name)
               continue;
            currentIndex = index;
            console.log(`- ${index.name}`);
            input.file.seek(LNK_HEADER_SIZE + sizeOfIndexTable + index.relOffset, SeekOrigin.Begin);
            const recordSize = index.attributes >>> 1;
            const compressed = (index.attributes & 1) === 1;
            let data = input.readBytes(recordSize);
            if (datFileName !== SCRIPT_DAT) {
               decryptInPlace(data, index.name);
               if (compressed)
                  data = decompress(data);
            }
            const ext = path.extname(index.name).toLowerCase();
            if (ext === '.waf') {
               data = convertWaf2Wav(data);
               const outputName = path.basename(index.name, '.waf') + '.wav';
               const outputPath = path.join(localOutputDir, outputName);
               fs.writeFileSync(outputPath, data);
            }
            else if (ext === '.cps') {
               data = convertCps2Prt(data);
               const outputName = path.basename(index.name, '.cps') + '.png';
               const outputPath = path.join(localOutputDir, outputName);
               const meta = await writePrt2PngFile(outputPath, data);
               if (meta != null) {
                  if (!metaDirCreated) {
                     fs.mkdirSync(metaOutputDir, { recursive: true });
                     metaDirCreated = true;
                  }
                  const metaOutputName = path.basename(index.name, '.cps') + '.json';
                  const metaOutputPath = path.join(metaOutputDir, metaOutputName);
                  fs.writeFileSync(metaOutputPath, JSON.stringify(meta, null, 2));
               }
            }
            else {
               const outputPath = path.join(localOutputDir, index.name);
               fs.writeFileSync(outputPath, data);
            }
         }

         input.close();
      }

      console.timeEnd(MyName);
   } catch (err) {
      console.error(`Error occured in file ${currentFileName}->${currentIndex.name}:`);
      console.error(err);
   }
})();

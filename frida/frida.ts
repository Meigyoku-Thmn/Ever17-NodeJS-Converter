import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as frida from 'frida';
import { Session, ScriptMessageHandler, Script, ScriptRuntime, Message, MessageType } from 'frida';
import { File, BinaryReader, SeekOrigin } from 'csbinary';
import { BufferTraverser } from '../utils/buffer-wrapper';
import { getNewestStats, nameof } from '../utils/file-system';
import ShellCodeConfig from './shellcode/tsconfig.json';

type Metadata = Record<number, { fileSize: number, fileName: string }>;

const TargetPath = process.argv[2];
const ScriptPath = path.join(path.dirname(TargetPath), 'script.dat');
const ShellCodeDir = path.join(__dirname, 'shellcode');
const ShellCodePath = path.join(ShellCodeDir, ShellCodeConfig.compilerOptions.outDir, 'shellcode.js');
const ShellCodeConfigPath = path.join(ShellCodeDir, 'tsconfig.json');

(async function main() {
   try {
      const metadata = loadScriptMetadata();
      const pid = await frida.spawn(TargetPath);
      const session = await frida.attach(pid);

      let script: Script;
      try {
         script = await loadScript(session, (message) => onMessageReceived(script, metadata, message));
      } catch (err) {
         console.error(err);
         await frida.kill(pid);
         console.log('Target process was terminated.');
         process.exit();
      }
      await script.load();
      await frida.resume(pid);

      process.on('SIGINT', () => {
         frida.kill(pid);
         console.log('Target process was terminated.');
      });

      session.detached.connect(() => console.log('Session detached.'));
   } catch (err) {
      console.error('Unexpected error occured:');
      console.error(err);
   }
})();

function onMessageReceived(script: Script, metadata: Metadata, message: Message) {
   if (message.type === MessageType.Error) {
      console.error(message.stack);
      return;
   }
   if (message.type !== MessageType.Send)
      return;
   const requestCmd = message.payload.command as string;
   const responseCmd = requestCmd.replace('Get', '');
   console.log(`Received ${requestCmd} request.`);
   switch (requestCmd) {
      case 'GetScriptMetadata':
         script.post({ type: responseCmd, message: metadata });
         break;
      case 'GetScriptData':
         try {
            const scriptData = fs.readFileSync('base_script/en/' + message.payload.recordName);
            patchScriptByConfig(scriptData, message.payload.recordName);
            script.post({ type: responseCmd }, scriptData);
         }
         catch (e) {
            script.post({ type: responseCmd }, null);
            throw e;
         }
         break;
      default:
         console.log('Unknown request.');
   }
}

function loadScriptMetadata(): Metadata {
   const metadata: Metadata = {};
   const input = new BinaryReader(File(fs.openSync(ScriptPath, 'r')), 'ascii');

   input.file.seek(4, SeekOrigin.Begin);
   const fileCount = input.readUInt32();
   const metadataSize = 32 * fileCount;

   input.file.seek(16, SeekOrigin.Begin);
   const fileInfoBuf = new BufferTraverser(input.readBytes(metadataSize));

   input.close();

   do {
      const fileOffset = fileInfoBuf.readUInt32() + + 16 + metadataSize;
      const fileSize = fileInfoBuf.readUInt32() >>> 1;
      const fileName = fileInfoBuf.readRawASCII(24).replace(/\0/g, '');
      metadata[fileOffset] = { fileSize, fileName };
   } while (!fileInfoBuf.eof());

   return metadata;
}

async function loadScript(session: Session, event: ScriptMessageHandler): Promise<Script> {
   console.time(nameof({ loadScript }));
   if (fs.statSync(ShellCodePath).mtimeMs < (await getNewestStats(ShellCodeDir, '.ts')).mtimeMs) {
      console.log('Start building shellcode.');
      const processRs = spawnSync('npx', [
         'tsc-bundle',
         `"${ShellCodeConfigPath}"`,
         `--outFile "${ShellCodePath}"`,
      ], {
         shell: true,
         stdio: ['inherit', 'inherit', 'inherit'],
         windowsVerbatimArguments: true,
      });
      if (processRs.error)
         throw processRs.error;
   }
   const scriptContent = fs.readFileSync(ShellCodePath, 'utf8');
   const script = await session.createScript(scriptContent, {
      name: ShellCodePath.replace(/\.[^/.]+$/, ''),
      runtime: ScriptRuntime.Default
   });
   script.message.connect(event);
   console.timeEnd(nameof({ loadScript }));
   return script;
}

function patchScriptByConfig(scriptData: Buffer, name: string): void {
   const buf = new BufferTraverser(scriptData);
   const config = JSON.parse(fs.readFileSync('./scr_mod.json', 'utf8'));
   buf.pos += 12;
   const entryPoint = buf.readUInt32();
   let hookName = (config.fileRedirect[name] as string)?.toString().trim();
   if (hookName?.length === 0) {
      // write to entrypoint a command that jumps to hookName file
      hookName = path.basename(hookName, '.scr').toUpperCase();
      buf.pos = entryPoint;
      buf.writeByte(0x10); // MetaOpcode.Command
      buf.writeByte(0x01); // Opcode.ToFile
      buf.writeRawASCII(hookName); // null-terminated string
      buf.writeByte(0x00);
   }
   const newEntryPoint = parseInt(config.entryPointRedirect[name]);
   // change entrypoint to another point in the file
   buf.pos = 12;
   buf.writeUInt32(newEntryPoint);

   const overwriteArr = config.overwrite[name] as {
      offset: string;
      shift: string;
      content: string;
   }[];
   if (Array.isArray(overwriteArr)) {
      // patch some bytecodes
      for (const item of overwriteArr) {
         const offset = parseInt(item.offset) + parseInt(item.shift);
         buf.pos = offset;
         const byteArr = item.content.split(' ').filter(e => e.trim().length > 0).map(e => parseInt(e, 16));
         byteArr.forEach(e => buf.writeByte(e));
      }
   }
}

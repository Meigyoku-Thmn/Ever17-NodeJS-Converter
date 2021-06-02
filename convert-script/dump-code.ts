import fs from 'fs';
import { OpcodeInfo } from './parse-opcode';

export function dumpCode(opcodes: OpcodeInfo[], outputPath: string): void {
   const outputFd = fs.openSync(outputPath, 'w');


   fs.closeSync(outputFd);
}
import { spawn } from 'child_process';
import { Writable } from 'stream';
import { BufferTraverser } from '../utils/buffer-wrapper';
import { idiv } from '../utils/integer-arithmetic';

type Metadata = { xCoord: number; yCoord: number; };

export async function writePrt2PngFile(outputPath: string, buf: Buffer): Promise<Metadata> {
   const input = new BufferTraverser(buf);

   const magic = input.readRawASCII(4);
   if (magic !== 'PRT\0')
      throw Error(`Invalid magic code "${magic}", expected "PRT\\0".`);

   const version = input.readUInt16();
   if (version !== 0x66 && version !== 0x65)
      throw Error(`Unsupported version 0x${version.toString(16)} of PRT.`);

   let bitDepth = input.readUInt16();
   const paletteOffset = input.readUInt16();
   const dataOffset = input.readUInt16();
   let width = input.readUInt16();
   let height = input.readUInt16();
   const hasAlpha = input.readUInt32() !== 0;

   let metadata: Metadata;
   if (version === 0x66) {
      const xCoord = input.readUInt32();
      const yCoord = input.readUInt32();
      const width2 = input.readUInt32();
      const height2 = input.readUInt32();
      if (xCoord !== 0 || yCoord !== 0)
         metadata = { xCoord, yCoord };
      if (width2 !== 0) width = width2;
      if (height2 !== 0) height = height2;
   }

   let widthByte: number;
   let stride: number;
   function calculateStride() {
      widthByte = width * bitDepth / 8;
      stride = idiv((widthByte + 3), 4) * 4;
   }
   calculateStride();

   let palette: Buffer;
   if (bitDepth === 8) {
      input.pos = paletteOffset;
      palette = input.subArray(256 * 4);
   }

   input.pos = dataOffset;
   let data = input.subArray(stride * height);

   let alpha: Buffer;
   if (hasAlpha)
      alpha = input.subArray(width * height);

   if (bitDepth === 8) {
      const flattenData = new BufferTraverser(Buffer.allocUnsafe(width * height * 3));
      for (const idx of data)
         flattenData.writeBytes(palette.subarray(idx * 4, idx * 4 + 3));
      data = flattenData.buffer;
      bitDepth = 24;
      calculateStride();
   }

   const format =
      bitDepth === 8 ? 'bgr' :
         bitDepth === 24 ? 'bgr' :
            bitDepth === 32 ? 'bgra' : 'invalid';

   await new Promise((resolve, reject) => {
      const ffmpeg = spawn('magick', [
         `-size ${width}x${height} -depth 8`,
         `${format}:fd:0`, // input from stdin
         ...(hasAlpha ? [
            `-size ${width}x${height} -depth 8`,
            'gray:fd:3', // additional pipe input for alpha mask
            '-compose copy-opacity -composite'
         ] : []),
         `"${outputPath}"`,
      ], {
         stdio: ['pipe', 'inherit', 'inherit', hasAlpha ? 'pipe' : null],
         windowsVerbatimArguments: true
      });

      ffmpeg.on('exit', code => code !== 0
         ? reject(Error(`magick has exited with code ${code}`)) : resolve(null));
      ffmpeg.on('error', error => reject(error));
      for (let i = height - 1; i >= 0; i--)
         ffmpeg.stdin.write(data.subarray(stride * i, stride * i + widthByte));
      ffmpeg.stdin.end();
      if (hasAlpha)
         (ffmpeg.stdio[3] as Writable).end(alpha);
   });

   return metadata;
}
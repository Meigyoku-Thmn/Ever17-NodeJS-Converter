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

   const bitDepth = input.readUInt16();
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
   const widthByte = width * bitDepth / 8;
   const stride = idiv((widthByte + 3), 4) * 4;

   let palette: Buffer;
   if (bitDepth === 8) {
      input.pos = paletteOffset;
      palette = Buffer.from(input.subArray(256 * 4));
      for (let i = 0; i < 256; i++)
         palette[i * 4 + 3] = 0xFF;
   }

   input.pos = dataOffset;
   const data = input.subArray(stride * height);

   let alpha: Buffer;
   if (hasAlpha)
      alpha = input.subArray(width * height);

   const pix_fmt =
      bitDepth === 8 ? 'pal8' :
         bitDepth === 24 ? 'bgr24' :
            bitDepth === 32 ? 'bgra24' : 'invalid';

   await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
         '-hide_banner -loglevel error -y',
         '-f rawvideo',
         `-video_size ${width}x${height} -pix_fmt ${pix_fmt}`,
         '-i pipe:0', // input from stdin
         ...(hasAlpha ? [
            '-f rawvideo',
            `-video_size ${width}x${height} -pix_fmt gray`,
            '-i pipe:3', // additional pipe input for alpha mask
            '-filter_complex "[0][1] alphamerge"'
         ] : []),
         `"${outputPath}"`,
      ], {
         stdio: ['pipe', 'inherit', 'inherit', hasAlpha ? 'pipe' : null],
         windowsVerbatimArguments: true
      });

      ffmpeg.on('exit', code => code !== 0
         ? reject(Error(`ffmpeg has exited with code ${code}`)) : resolve(null));
      ffmpeg.on('error', error => reject(error));
      for (let i = height - 1; i >= 0; i--)
         ffmpeg.stdin.write(data.subarray(stride * i, stride * i + widthByte));
      ffmpeg.stdin.end(palette);
      if (hasAlpha)
         (ffmpeg.stdio[3] as Writable).end(alpha);
   });

   return metadata;
}
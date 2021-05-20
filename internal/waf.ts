import { BufferTraverser } from '../utils/buffer-wrapper';

export function convertWaf2Wav(inp: Buffer): Buffer {
   const inb = new BufferTraverser(inp);
   const magic = inb.readRawASCII(4);
   if (magic !== 'WAF\0')
      throw Error(`Invalid magic code "${magic}", expected "WAF\\0".`);
   const paddingMagic = inb.readUInt16();
   if (paddingMagic !== 0)
      throw Error(`Invalid padding magic value "0x${paddingMagic.toString(16)}", expected zero.`);

   const codecId = 2; // Microsoft ADPCM Format
   const channelCount = inb.readUInt16();
   const sampleRate = inb.readUInt32();
   const byteRate = inb.readUInt32();
   const blockAlign = inb.readUInt16();
   const bitsPerSample = inb.readUInt16();
   const extraCodecHeaders = inb.subArray(32);
   const samplesSize = inb.readUInt32();
   const samples = inb.subArray(samplesSize);

   const riffMagic = 'RIFF';
   let riffSize = 0;
   const waveMagic = 'WAVE';
   const fmt_Magic = 'fmt ';
   const dataMagic = 'data';

   const outLen = 78 + samplesSize;

   const outB = new BufferTraverser(Buffer.allocUnsafe(outLen));
   riffSize = outLen - 8;

   outB.writeRawASCII(riffMagic);
   outB.writeUInt32(riffSize);
   outB.writeRawASCII(waveMagic);
   outB.writeRawASCII(fmt_Magic);
   outB.writeUInt32(18 + extraCodecHeaders.length);
   outB.writeUInt16(codecId);
   outB.writeUInt16(channelCount);
   outB.writeUInt32(sampleRate);
   outB.writeUInt32(byteRate);
   outB.writeUInt16(blockAlign);
   outB.writeUInt16(bitsPerSample);
   outB.writeUInt16(extraCodecHeaders.length);
   outB.writeBytes(extraCodecHeaders);
   outB.writeRawASCII(dataMagic);
   outB.writeUInt32(samples.length);
   outB.writeBytes(samples);

   return outB.buffer;
}
# About the WAF file format
This is the format for audio in Ever17.

Like the CPS format, I don't know much about this format. My code is adapted from https://github.com/vn-tools/arc_unpacker (thanks!).

This format seems to be just a variant of the wav format. The codec is "Microsoft ADPCM Format" (WAVE_FORMAT_ADPCM).

Reference:
* https://github.com/vn-tools/arc_unpacker/blob/master/src/dec/kid/waf_audio_decoder.cc
* https://www.iana.org/assignments/wave-avi-codec-registry/wave-avi-codec-registry.xhtml

# Decode the WAF file format
To decompress this type of record, use this algorithm with a record byte array passed to the `record` parameter.

This is not much a decoding process, the content is copied as-is.

```csharp
// C#
using static System.Runtime.InteropServices.Marshal;
static byte[] DecodeToWAV(byte[] record)
{
    var reader = new BinaryReader(new MemoryStream(record));

    var magic = Encoding.ASCII.GetString(reader.ReadBytes(4));
    if (magic != "WAF\0")
        throw new IOException($"Unknown archive format (Magic code: {magic:x8})");

    var paddingMagic = reader.ReadUInt16();
    if (paddingMagic != 0)
        throw new IOException($"Expected 2 zero-bytes after magic code.");

    ushort codecId = 2; // MS ADPCM
    var channelCount = reader.ReadUInt16();
    var sampleRate = reader.ReadUInt32();
    var byteRate = reader.ReadUInt32();
    var blockAlign = reader.ReadUInt16();
    var bitsPerSample = reader.ReadUInt16();
    var extraCodecHeaders = reader.ReadBytes(32);
    var samplesSize = reader.ReadUInt32();
    var samples = reader.ReadBytes((int)samplesSize);

    var riffMagic = Encoding.ASCII.GetBytes("RIFF");
    var riffSize = (uint)0;
    var waveMagic = Encoding.ASCII.GetBytes("WAVE");
    var fmt_Magic = Encoding.ASCII.GetBytes("fmt ");
    var dataMagic = Encoding.ASCII.GetBytes("data");

    var outputLen = riffMagic.Length +
       SizeOf(riffSize) +
       waveMagic.Length +
       fmt_Magic.Length +
       SizeOf(extraCodecHeaders.Length) +
       SizeOf(codecId) +
       SizeOf(channelCount) +
       SizeOf(sampleRate) +
       SizeOf(byteRate) +
       SizeOf(blockAlign) +
       SizeOf(bitsPerSample) +
       SizeOf((short)extraCodecHeaders.Length) +
       extraCodecHeaders.Length +
       dataMagic.Length +
       SizeOf(samples.Length) +
       samples.Length;

    var outputStream = new MemoryStream(
        buffer: new byte[outputLen],
        index: 0,
        count: outputLen,
        writable: true,
        publiclyVisible: true
    );
    var writer = new BinaryWriter(outputStream);

    riffSize = (uint)(outputLen - riffMagic.Length - SizeOf(riffSize));

    writer.Write(riffMagic);
    writer.Write(riffSize);
    writer.Write(waveMagic);
    writer.Write(fmt_Magic);
    writer.Write(18 + extraCodecHeaders.Length);
    writer.Write(codecId);
    writer.Write(channelCount);
    writer.Write(sampleRate);
    writer.Write(byteRate);
    writer.Write(blockAlign);
    writer.Write(bitsPerSample);
    writer.Write((ushort)extraCodecHeaders.Length);
    writer.Write(extraCodecHeaders);
    writer.Write(dataMagic);
    writer.Write(samples.Length);
    writer.Write(samples);

    return outputStream.GetBuffer();
}
```

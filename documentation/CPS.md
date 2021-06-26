# About CPS file format
This is the format for graphics in Ever17.

Unfortunately, I still don't know much about this format, except some code I adapted from https://weeaboo.nl/ (thanks!).

The final PRT image format has an interesting thing: the [strides](https://docs.microsoft.com/en-us/windows/win32/medfound/image-stride). I think the format was made like that, so it can be copied directly to the graphics memory.

# How to decode CPS format
To decode this, pass the byte array to the `record` parameter of `ToPRT` method to get the PRT byte array result.

```csharp
// C#
// this decoding method relies on the integer overflow behavior of C#
static byte[] RecordToPRT(byte[] record)
{
    var reader = new BinaryReader(new MemoryStream(record));

    var magic = Encoding.ASCII.GetString(reader.ReadBytes(4));
    if (magic != "CPS\0")
        throw new IOException($"Unknown archive format (Magic code: {magic:x8})");

    var comprSize = reader.ReadUInt32();

    var version = reader.ReadUInt16();
    if (version != 0x66)
        throw new IOException($"Unknown CPS file version (0x{version:X})");

    var comprType = reader.ReadUInt16();
    var origSize = reader.ReadUInt32();

    var outputLen = comprSize - 16 - 4;

    var data = reader.ReadBytes((int)outputLen);

    var offset = reader.ReadUInt32() - 0x7534682;
    if (offset != 0)
        DecryptInPlace(data, comprSize, offset);

    if ((comprType & 1) != 0)
        data = DecompressLND(data, origSize);

    return data;
}

// this decrypting method relies on the integer overflow behavior of C#
static void DecryptInPlace(byte[] input, uint comprSize, uint offset)
{
    var inputStream = new BinaryReader(new MemoryStream(input));
    var outputStream = new BinaryWriter(new MemoryStream(input, true));

    var realOffset = offset - 16;
    inputStream.BaseStream.Position = realOffset;
    var key = inputStream.ReadUInt32() + offset + 0x3786425;

    inputStream.BaseStream.Position = 0;
    var allowWrite = false;
    while (inputStream.BaseStream.Position < inputStream.BaseStream.Length)
    {
        bool useKey = inputStream.BaseStream.Position != realOffset;
        var value = inputStream.ReadUInt32();
        if (useKey)
        {
            value -= comprSize;
            value -= key;
        }
        if (allowWrite) outputStream.Write(value);
        key = key * 0x41C64E6D + 0x9B06;
        allowWrite = true;
    }
    outputStream.Write((uint)0);
}

static byte[] DecompressLND(byte[] lndRecord, uint uncompressedLen = 0)
{
    var reader = new BinaryReader(new MemoryStream(lndRecord));

    var outputStream = new MemoryStream(
        buffer: new byte[uncompressedLen],
        index: 0,
        count: (int)uncompressedLen,
        writable: true,
        publiclyVisible: true
    );

    var currentLen = 0;
    var temp = new byte[16 << 10];
    while (currentLen < uncompressedLen)
    {
        var b = reader.ReadByte();
        if ((b & 0x80) != 0)
        {
            if ((b & 0x40) != 0)
            {
                // Copy single byte k times
                var k = (b & 0x1f) + 2;
                if ((b & 0x20) != 0)
                    k += reader.ReadByte() << 5;

                b = reader.ReadByte();

                for (var n = 0; n < k && currentLen < uncompressedLen; n++)
                {
                    outputStream.WriteByte(b);
                    currentLen++;
                }
            }
            else
            {
                // Copy previously decompressed bytes to output
                var offset = ((b & 0x03) << 8) + reader.ReadByte() + 1;
                var count = ((b >> 2) & 0x0f) + 2;
                var readIndex = currentLen - offset;
                // Can't copy multiple bytes at a time,
                // readIndex + count may be greater than the initial write pos
                for (int n = 0; n < count && currentLen < uncompressedLen; n++)
                {
                    var currentPos = outputStream.Position;
                    outputStream.Position = readIndex + n;
                    var val = outputStream.ReadByte();
                    outputStream.Position = currentPos;
                    outputStream.WriteByte((byte)val);
                    currentLen++;
                }
            }
        }
        else
        {
            if ((b & 0x40) != 0)
            {
                // Copy byte sequence k times
                var count = (b & 0x3f) + 2;
                var k = reader.ReadByte() + 1;
                reader.Read(temp, 0, count);
                for (var n = 0; n < k && currentLen < uncompressedLen; n++)
                {
                    for (var x = 0; x < count && currentLen < uncompressedLen; x++)
                    {
                        outputStream.WriteByte(temp[x]);
                        currentLen++;
                    }
                }
            }
            else
            {
                // Copy byte sequence
                var count = (b & 0x1f) + 1;
                if ((b & 0x20) != 0)
                    count += reader.ReadByte() << 5;

                for (var n = 0; n < count && currentLen < uncompressedLen; n++)
                {
                    outputStream.WriteByte(reader.ReadByte());
                    currentLen++;
                }
            }
        }
    }

    return outputStream.GetBuffer();
}
```
After that, pass the result to the `ToImage` method, this creates a Bitmap object and an `metadata ini` string.

```csharp
static (DirectBitmap image, string ini) ToImage(byte[] prtArr)
{
    var reader = new BinaryReader(new MemoryStream(prtArr));

    var magic = Encoding.ASCII.GetString(reader.ReadBytes(4));
    if (magic != "PRT\0")
        throw new IOException($"Unknown archive format (Magic code: {magic:x8})");

    var version = reader.ReadUInt16();
    if (version != 0x66 && version != 0x65)
        throw new IOException($"Unsupported version of PRT (Version: 0x{version:X})");

    var bitDepth = reader.ReadUInt16();
    var paletteOffset = reader.ReadUInt16();
    var dataOffset = reader.ReadUInt16();
    uint width = reader.ReadUInt16();
    uint height = reader.ReadUInt16();
    var hasAlpha = reader.ReadUInt32() != 0;

    string ini = null;

    if (version == 0x66)
    {
        var xCoord = reader.ReadUInt32();
        var yCoord = reader.ReadUInt32();
        var width2 = reader.ReadUInt32();
        var height2 = reader.ReadUInt32();
        if (xCoord != 0 || yCoord != 0)
        {
            var iniContent = new[] {
                "[Coord]",
                $"X={xCoord}",
                $"Y={yCoord}",
            };
            ini = string.Join(Environment.NewLine, iniContent);
        }
        if (width2 != 0) width = width2;
        if (height2 != 0) height = height2;
    }

    var stride = (((width * bitDepth / 8) + 3) / 4) * 4;

    reader.BaseStream.Position = paletteOffset;
    Color[] palette = null;

    if (bitDepth == 8)
    {
        palette = new Color[256];
        for (int i = 0; i < 256; i++)
        {
            var channelArr = reader.ReadBytes(4);
            var B = channelArr[0];
            var G = channelArr[1];
            var R = channelArr[2];
            var A = 0xFF | channelArr[3];
            palette[i] = Color.FromArgb(A, R, G, B);
        }
    }

    var image = new DirectBitmap((int)width, (int)height);
    void ReadSetPixel_8bppIndexed(int x, int y)
    {
        image.SetPixel(x, y, palette[reader.ReadByte()]);
    }

    void ReadSetPixel_24bpp(int x, int y)
    {
        var channelArr = reader.ReadBytes(3);
        var B = channelArr[0];
        var G = channelArr[1];
        var R = channelArr[2];
        image.SetPixel(x, y, Color.FromArgb(0xFF, R, G, B));
    }

    void ReadSetPixel_32bpp(int x, int y)
    {
        var channelArr = reader.ReadBytes(4);
        var B = channelArr[0];
        var G = channelArr[1];
        var R = channelArr[2];
        var A = channelArr[3];
        image.SetPixel(x, y, Color.FromArgb(A, R, G, B));
    }

    Action<int, int> ReadSetPixel;
    if (bitDepth == 8) ReadSetPixel = ReadSetPixel_8bppIndexed;
    else if (bitDepth == 24) ReadSetPixel = ReadSetPixel_24bpp;
    else if (bitDepth == 32) ReadSetPixel = ReadSetPixel_32bpp;
    else throw new IOException($"Unsupported bit depth: {bitDepth}");

    for (var y = 0; y < height; y++)
    {
        var rowOffset = dataOffset + y * stride;
        reader.BaseStream.Position = rowOffset;
        for (var x = 0; x < width; x++)
            ReadSetPixel(x, (int)height - 1 - y);
    }

    if (hasAlpha)
    {
        reader.BaseStream.Position = dataOffset + height * stride;
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var c = image.GetPixel(x, y);
                c = Color.FromArgb(reader.ReadByte(), c);
                image.SetPixel(x, y, c);
            }
        }
    }

    return (image, ini);
}

// https://stackoverflow.com/a/34801225/5404503
public class DirectBitmap : IDisposable
{
    public Bitmap Bitmap { get; private set; }
    public int[] Bits { get; private set; }
    public bool Disposed { get; private set; }
    public int Height { get; private set; }
    public int Width { get; private set; }

    protected GCHandle BitsHandle { get; private set; }

    public DirectBitmap(int width, int height)
    {
        Width = width;
        Height = height;
        Bits = new int[width * height];
        BitsHandle = GCHandle.Alloc(Bits, GCHandleType.Pinned);
        Bitmap = new Bitmap(width, height, width * 4, PixelFormat.Format32bppArgb, BitsHandle.AddrOfPinnedObject());
    }

    public void SetPixel(int x, int y, Color colour)
    {
        int index = x + (y * Width);
        var col = (uint)colour.ToArgb();

        if (!BitConverter.IsLittleEndian)
            col = (col & 0x000000FFU) << 24 | (col & 0x0000FF00U) << 8 | (col & 0x00FF0000U) >> 8 | (col & 0xFF000000U) >> 24;
        Bits[index] = (int)col;
    }

    public Color GetPixel(int x, int y)
    {
        int index = x + (y * Width);
        var col = (uint)Bits[index];

        if (!BitConverter.IsLittleEndian)
            col = (col & 0x000000FFU) << 24 | (col & 0x0000FF00U) << 8 | (col & 0x00FF0000U) >> 8 | (col & 0xFF000000U) >> 24;

        Color result = Color.FromArgb((int)col);
        return result;
    }

    public void Dispose()
    {
        if (Disposed) return;
        Disposed = true;
        Bitmap.Dispose();
        BitsHandle.Free();
    }
}
```

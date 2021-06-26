# About the LNK file format
LNK is the main archive format in Ever17.

The following files use the LNK file format:

- `bg.dat` (contains background images);
- `bgm.dat` (contains background musics);
- `chara.dat` (contains standing character sprites, aka tachi-e);
- `saver.dat` (contains bonus screensavers, in the days of LCD screen, this is pretty outdated);
- `script.dat` (contains in-game scripts);
- `se.dat` (contains sound effects);
- `system.dat` (contains sprites for GUI);
- `sysvoice.dat` (contains bonus voice clips);
- `voice.dat` (contains voices for every dialogues);
- `wallpaper.dat` (contains bonus wallpapers).

The LNK format stores multiple records, each record correctsponds to a file, there is no folder.

The records in `saver.dat`, `sysvoice.dat`, `wallpaper.dat` files are encrypted.

Some records are compressed.

# Sequential Layout
| Name of segment  | Note |
| -                | - |
| **Header**       | Retrieve `nRecord` from here |
| **Index** table  | Has `nRecord` **Index** elements  |
| **Record** table | Has `nRecord` **Record** elements |

# File format

The archive begins by a header with this structure:
```c
struct Header {
   char magic[4];
   uint32_t nRecords;
   char padding[8];
}
```
- `magic` must be `"LNK\0"`;
- `nRecord` is the number of records in archive;
- `padding` is just padding, value doesn't matter.

Right after that, there is an array that has `nRecords` pieces of record information (`Index indexes[nRecord]`), corresponding to each records. Each piece of information has this structure:
```c
struct Index {
   uint32_t relOffset;
   uint32_t attributes;
   char name[24];
}
```
- `relOffset` is the relative offset of the corresponding record in the archive.<br>Absolute offset is `sizeof(Header) + nRecords * sizeof(Index) + relOffset`;
- `attributes` is the attributes of the corresponding record in the archive, contains the record's size and a compression flag;
- `name` is the __file name__ of the corresponding record. This is a __null-terminated__ string, the length of this string doesn't exceed 24 bytes, including the terminating NULL.

## About the attributes of record
- If the least significant bit of it is set, then the corresponding record is __compressed__;
- Take the `attributes` and shift it right (discard the least significant bit), then you will get the size of the record: `attributes >> 1`.

## How to know which record is encrypted
- You check the __file name__, if the file name ends with `".wav"`, `".jpg"` or `".scr"` (by case-insensitive manner), then that record is encrypted;
- Except records in script.dat which are non-encrypted.

## Algorithm to decrypt records
```csharp
// this decrypting method relies on the integer overflow behavior of C#
static void DecryptInPlace(byte[] record, string name) {
   var startPos = -1;
   if (name.ToLower().EndsWith(".wav"))
      startPos = 0;
   else if (name.ToLower().EndsWith(".jpg"))
      startPos = 4352;
   else if (name.ToLower().EndsWith(".scr"))
      startPos = 4096;
   if (startPos == -1)
      return;
   byte key = 0;
   foreach (var chr in Encoding.ASCII.GetBytes(name)) {
      key += chr;
   }
   for (int i = 0; i < 256; i++) {
      record[startPos + i] -= key;
      key = (byte)(key * 0x6D - 0x25);
   }
}
```

## Algorithm to decompress records
To decompress record, use this algorithm with a record byte array passed to the `record` parameter.
```csharp
// C#
static byte[] DecompressRecord(byte[] record)
{
    var reader = new BinaryReader(new MemoryStream(record));

    var magic = Encoding.ASCII.GetString(reader.ReadBytes(4));
    if (magic != "lnd\0")
        throw new IOException($"This is not a LND file! (Magic code: {magic:x8})");
    reader.BaseStream.Position += 4;

    var uncompressedLen = reader.ReadUInt32();
    reader.BaseStream.Position += 4;

 	var outputStream = new MemoryStream(
        buffer:          new byte[uncompressedLen],
        index:           0,
        count:           (int)uncompressedLen,
        writable:        true,
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
                for (var n = 0; n < count && currentLen < uncompressedLen; n++)
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

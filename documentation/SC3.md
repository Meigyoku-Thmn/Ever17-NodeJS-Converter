# About the SC3 file format
The file format of all [script](https://en.wikipedia.org/wiki/Scripting_language) files extracted from `script.dat`.

This is a fairly complicated format. It specifies pretty much the entire content of Ever17, even the behavior of menu screens.

The visual novel engine of Ever17 is essentially a [virtual machine](https://en.wikipedia.org/wiki/Virtual_machine), similar to the [Javascript virtual machines](https://en.wikipedia.org/wiki/JavaScript_engine) in every web browsers. The engine parses [instruction](https://en.wikipedia.org/wiki/Instruction_set_architecture) in script files, then reacts accordingly.

An **instruction** is the composition of an [opcode](https://en.wikipedia.org/wiki/Opcode) and/or several arguments.

For example, a script file can have instructions like this (pseudocode as example, not the actual code in the game):

```js
/* 1 */ yield ShowBackground('bg.bmp');
/* 2 */ yield Pause(60);
/* 3 */ yield ShowMessageBox();
/* 4 */ yield AppendText('Hello world! ');
/* 5 */ yield Pause(60);
/* 6 */ yield AppendText('Welcome to the basic of scripting programming!');
/* 7 */ yield WaitForInteraction();
/* 8 */ yield Exit();
```

The engine can parse these instructions and does exactly:
1. Load the background image from `bg.bmp`;
2. Spend 60 video frames doing nothing;
3. Show a typical visual novel text box;
4. Append a text string into the text box;
5. Spend 60 video frames doing nothing;
6. Append another text string into the text box;
7. Wait for an interaction from the reader/player;
8. Exit the game.

Pretty much a kind of [coroutine](https://en.wikipedia.org/wiki/Coroutine).

There are 4 types of instructions: meta instruction, flow instruction, command instruction, and textual instruction.

The textual instructions together make subroutines that the meta instructions can call into.

This page will document about how instructions are stored in this file format, and how this file format is supposed to be read.

How the instructions works is documented separately in [SC3.MainInstructions.md](./SC3.MainInstructions.md).

In this file, if I mention "main instruction", I means the meta instruction, the flow instruction and the command instruction together.

# Sequential Layout
| No. | Name of segment            | Note |
| -   | -                          | - |
| 1   | Header                     | |
| 2   | Main script index table    | The first index is the entry point of a script file |
| 3   | Main script                | A sequence of main instructions, indexed by No. 2 |
| 4   | Textual script index table | |
| 5   | Image index table          | |
| 6   | Textual script             | A sequence of textual instructions, indexed by No. 4 |
| 7   | Image names                | A sequence of null-terminated image file names, pointed by No. 5 |

# File format

## Header
The file format begins by a header with this structure:
```c
struct Header {
   char magic[4];
   uint32_t textualScriptOffset;
   uint32_t backgroundOffset;
}
```
- `magic` must be `"SC3\0"`;
- `textualScriptOffset` is the absolute offset that points to the textual instruction index table;
- `backgroundOffset` is the absolute offset that points to the image index table.

`textualScriptOffset` and `backgroundOffset` can point to [EOF](https://en.wikipedia.org/wiki/End-of-file) (equal to the size of script file, not -1), that means (No. 4) with (No. 6) and (No. 5) with (No. 7) are zero-lengthed respectively. There are only 3 files that have this case which both offsets point to EOF.

I believe the game doesn't even try to validate this, or anything, because this file format is meant to be interpreted for script execution, and it's the job of a certain compiler (which the devs used to generate script files) to validate.

## Main script index table
(No. 2) is the main script index table, this is an array of 4-byte offsets. Each offset points to certain instruction in (No. 3). Read the [last section](#understanding-about-the-idea-of-this-file-format) to understand more about this.

When jumping into a script, the game take the first offset to find the starting place for execution.

The last index in this segment doesn't point to anywhere usable. It is not even a valid offset. Still don't understand what it is.

## Main script
(No. 3) is a sequence of main instructions. Click for [More info](#understanding-about-the-idea-of-this-file-format).

This segment's size is a multiple of 4. Otherwise, zero byte is padded to the left of it to fulfil the size. I don't know is this required or not.

Indexes in (No. 2) never point to padded bytes.

So a script file can have (No. 3) begining like this:
```
00 00|fe 28 0a a4 b0 14 ...
^  ^ |^
(pad)|first instruction 
```

## Textual script index table
(No. 4) is an array of 4-byte offsets. Each offset points to certain textual subroutine in (No. 6). Click for [More info](#understanding-about-the-idea-of-this-file-format).

## Image index table
(No. 5) is a array of 4-byte offsets. Each offset points to certain null-terminated string in (No. 7). Click for [More info](#understanding-about-the-idea-of-this-file-format).

## Textual script
(No. 6) is a sequence of textual subroutines. Each subroutine is a sequence of textual instructions. Click for [More info](#understanding-about-the-idea-of-this-file-format).

## Image names
(No. 7) A sequence of null-terminated image file names. Click for [More info](#understanding-about-the-idea-of-this-file-format).

# Understanding about the idea of this file format
*(I don't know how to do this properly, so I just leave critical points)*

The virtual machine of this game is a stackless machine and the script itself is [non-structured](https://en.wikipedia.org/wiki/Non-structured_programming), it just execute instructions.

I will not discuss about some system scripts (`startup.scr` and `system.scr`) that control the menus and the system in the game. They are not necessary to be understood to re-implement this (which is the end goal).

`op00.scr` is the entry script that is executed when you start a new game.

When execution bumps into a cross-script jump instruction, it can switch to another script file and continues to execute at the entry point of that script file.

When you load a save, the game will resume the execution at a position last time you save, with every flags/variables last time it accumulated.

This game has 4 sets of instruction: the **meta instructions**, the **flow instructions**, the **command instructions** and the **textual instructions**.

* The **meta instructions** wrap and categorize the 3 remaining instruction kinds, also has an instruction that calls into textual subroutine, and an instruction that sets variables;
* The **flow instructions** control the flow of script (branch, loop, call), as well as control the state of the game engine;
* The **command instructions** control almost everything visually except text box displaying;
* The **textual instructions** control how text is displayed, play associated voice clip,... (anything related to displaying on text box).

The textual instructions have to be inside subroutines that are called into by a meta instruction. When subroutine ends, the execution returns to the next main instruction.

The main script segment (No. 3) is really a sequence of main instructions, while the main script index table (No. 2) serves as a "[label](https://en.wikipedia.org/wiki/Label_(computer_science))" table, each offset of it is a label that points to a specific instruction on the main script.

A few instructions of main script have the same effect as a "[goto](https://en.wikipedia.org/wiki/Goto)" statment that can jump to other instructions on the main script. They accept an ordinal number that point to a label, the game can read the label to know where to jump to (relative jump by [jump table](https://en.wikipedia.org/wiki/Branch_table));

This game also uses an image segment (No. 7), it's a sequence of [null-terminated strings](https://en.wikipedia.org/wiki/Null-terminated_string), each string is an image file name pointed by a corresponding index in (No. 5).

Somewhat similar to label, some instructions access and load image by accepting an ordinal number that points to a index that points to an image name. You can say that (No. 7) is a [string pool](https://en.wikipedia.org/wiki/String_interning), it exists because images are reused a lot in scripts (Although it was done poorly as there are some duplicated image names in several script files).

The textual script segment (No. 6) is a sequence of subroutines, each subroutine is a sequence of textual instructions. Each subroutine is indexed by the textual script index table (No. 4). The main script calls into a particular subroutine by looking it up on the index table, the same way as label in main script.

Some script files don't have (No. 4) with (No. 6) or (No. 5) with (No. 7). Those segments are zero-lengthed in that case. The hint is that `textualScriptOffset` and/or `backgroundOffset` point to EOF of file. 

There is no specified length for any segments nor any subroutines, but you can easily calculate it for each segment and each subroutine.

# How to calculate the size of each segment
## Size of main script index table segment
The first offset of (No. 2) always point to the first instruction in (No. 3). So, at first glance, the size can be calculated like this:
```c
int sizeOfNo2 = getFirstOffset() - sizeof(Header); // 12 byte Header
```
But in some script file, (No. 3) is padded, so you have to calculate it like this:
```c
int startOffset = getFirstOffset();
int no3StartPos = startOffset - (startOffset % 4);
int sizeOfNo2 = no3StartPos - sizeof(Header);
```
## Size of main script segment
```c
int sizeOfNo3 = textualScriptOffset - no3StartPos;
```
## Size of textual script index table segment
```c
int sizeOfNo4 = backgroundOffset - textualScriptOffset;
```
## Size of image index table segment
The first offset of (No. 4) always point to the first subroutine in (No. 6). So:
```c
int sizeOfNo5 = getFirstSubroutineOffset() - backgroundOffset;
```
## Size of textual script segment
The first offset of (No. 5) always point to the first null-terminated string in (No. 7). So:
```c
int sizeOfNo6 = getFirstStringOffset() - getFirstSubroutineOffset();
```
## Size of image names segment
```c
int sizeOfNo7 = getFileSize() - getFirstStringOffset();
```
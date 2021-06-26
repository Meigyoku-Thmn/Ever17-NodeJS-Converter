# The anatomy of a main instruction

The anatomy is like this:

```
<Meta Opcode>[Opcode][Arguments]
```

* Meta Opcode: a byte corresponding to a meta instruction;
* Opcode: a byte corresponding to a flow instruction or a command instruction;
* Arguments: for meta instruction or for flow/command instruction.

A script interpreter is supposed to read the meta opcode, and base on that, figure out what kind of data/opcode after that.

For example, let's consider the following sequence of bytes (hex):

```
10 46 82 00 00
```

Analyze it and we have:

* Meta Opcode: `10` → following it is a command instruction;
* Command Opcode:  `46` → this is the "SetDialogColor" instruction that take one argument;
* Argument: `82 00 00` → represents the number value 2;

# The anatomy of a textual instruction

```
<Opcode>[Arguments]
```

* Opcode: a byte corresponding to a textual instruction;
* Arguments: depend on the textual instruction.

If opcode is not corresponding to any textual instruction, then it's not a textual instruction but the begining of a text stream.

The end byte of a text stream has to be a valid textual opcode.

The encoding of a text stream is [Code Page 932](https://en.wikipedia.org/wiki/Code_page_932_(Microsoft_Windows)) even in the English version of Ever17.

# The anatomy of an expression chain

Many number arguments, variable assigment and boolean arguments in the script are represented by "expression chain".

An expression chain is composed from one or many small expressions chaining together.

The anatomy of an expression chain in the case of a single expression is:

```
<Expression><Trash byte><00>
```

Or in the case of many expressions chaining together:

```
<Expression><Trash byte><Expression><Trash byte>...<Expression><Trash byte><00>
```

To read an expression chain, one can follow this pseudo-code:

1. Scan an expression;
2. Skip a trash byte;
3. Check the current byte, if it's a non-zero value, then goto step 1;
4. We got a chain of expressions.

For example, a variable assignment instruction (hex):

```
fe 28 [0a] a4 b0 [14] 14 [00] 85 [00] 00
```

The bytes inside square brackets are considered "trash byte", analyze this and we have:

* Meta Opcode: `fe` → variable operation meta instruction;
* A chain of expressions:
  * `28 [0a]`: get a variable reference based on the next value address (**ref**);
  * `a4 b0 [14]`: a number value expression representing the number **0x4b0**;
  * `14 [00]`: an operator expression representing an assignment operator (**=**);
  * `85 [00] 00`: a number value expression representing the number **5**, the zero byte at the end indicates that this is the final expression;

We can translate this in a more human-readable form:

```
var_op: ref(0x4b0) = 5
```

# Expressions

## Number value

## RGBA value

## Operators

## Variable reference

## Function call

# Meta Instructions

## Flow control (`0x00`)

## Command (`0x10`)

## Variable operation (`0xff`)

## Textual routine call (`0xfe`)

# Flow Instructions

## End (`0x00`)
## Delay (`0x05`)
## Suspend (`0x06`)
## Goto (`0x07`)
## GotoIf (`0x0a`)
## Call (`0x0d`)
## TurnFlagOn (`0x12`)
## TurnFlagOff (`0x13`)
## GotoIfFlag (`0x15`)
## TurnMode (`0x19`)
## Switch (`0x26`)
## TurnFlag25On (`0x28`)

# Command Instructions

## ToFile (`0x01`)
## PlayBGM (`0x03`)
## StopBGM (`0x04`)
## PlaySFX (`0x05`)
## StopSFX (`0x06`)
## WaitSFX (`0x07`)
## PlayVoice (`0x08`)
## WaitVoice (`0x09`)
## LoadBG (`0x0c`)
## RemoveBG (`0x0d`)
## LoadFG (`0x0f`)
## RemoveFG (`0x10`)
## LoadFG2 (`0x12`)
## RemoveFG3 (`0x13`)
## SetFGOrder (`0x14`)
## AffectFG (`0x15`)
## LoadFG3 (`0x16`)
## HideDialog (`0x18`)
## ShowDialog (`0x19`)
## MarkChoiceId (`0x1a`)
## ShowChapter (`0x1d`)
## Delay (`0x1e`)
## ShowClock (`0x1f`)
## StartAnim (`0x20`)
## CloseAnim (`0x21`)
## MarkLocationId (`0x24`)
## LoadBGKeepFG (`0x27`)
## Unk2B (`0x2b`)
## UnlockImage (`0x37`)
## OpenMovie (`0x39`)
## StopMovie (`0x3A`)
## SetMovieRect (`0x3B`)
## PlayMovie (`0x3C`)
## LoadBGCrop (`0x40`)
## TweenZoom (`0x41`)
## SetVolume (`0x43`)
## OverlayMono (`0x45`)
## SetDialogColor (`0x46`)

# Textual Instructions

## End (`0x00`)
## NewLine (`0x01`)
## Wait (`0x02`)
## Clear (`0x03`)
## Sleep (`0x04`)
## MarkLog (`0x05`)
## Choice (`0x0b`)
## WaitVoice (`0x0c`)
## Voice (`0x0d`)
## Mark (`0x0e`)
## Style (`0x10`)
## Big (`0x11`)

# Text stream fallback cases

